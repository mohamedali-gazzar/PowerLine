import type { Request, Response } from "express";
import { ZodError } from "zod";
import { timingSafeEqual } from "crypto";
import { prisma } from "../lib/prisma";
import {
  hashPassword,
  comparePassword,
  signToken,
  genCode,
} from "../lib/auth";
import { sendMail, emailConfigured } from "../services/email.service";
import {
  registerSchema,
  verifySchema,
  completeSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
} from "../validation/auth.schema";

const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 6;
// The code is only echoed back in the response when there's no real email AND we
// aren't in production — so production never leaks codes even if misconfigured.
const DEV = process.env.NODE_ENV !== "production";

function pub(u: { id: string; email: string; name: string; photo: string | null }) {
  return { id: u.id, email: u.email, name: u.name, photo: u.photo };
}

function fail(res: Response, err: unknown) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message || "Invalid input." });
  }
  console.error(err);
  return res.status(500).json({ error: "Server error." });
}

/** Create + "send" a fresh code, replacing any prior one for this email+purpose. */
async function issueCode(email: string, purpose: "signup" | "reset"): Promise<string> {
  await prisma.emailCode.deleteMany({ where: { email, purpose } });
  const code = genCode();
  await prisma.emailCode.create({
    data: {
      email,
      code,
      purpose,
      expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    },
  });
  const subject =
    purpose === "signup"
      ? "Your PowerLine verification code"
      : "Your PowerLine password-reset code";
  await sendMail({
    to: email,
    subject,
    text: `Your PowerLine code is ${code}. It expires in ${CODE_TTL_MIN} minutes. If you didn't request this, you can ignore this email.`,
  });
  return code;
}

/** Validate a code without consuming it. Tracks attempts; expires + caps tries. */
async function checkCode(
  email: string,
  purpose: string,
  code: string
): Promise<{ ok: boolean; reason?: string }> {
  const rec = await prisma.emailCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!rec) return { ok: false, reason: "No code found — request a new one." };
  if (rec.expiresAt < new Date()) {
    await prisma.emailCode.delete({ where: { id: rec.id } });
    return { ok: false, reason: "Code expired — request a new one." };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await prisma.emailCode.delete({ where: { id: rec.id } });
    return { ok: false, reason: "Too many attempts — request a new code." };
  }
  const expected = Buffer.from(rec.code);
  const given = Buffer.from(code);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await prisma.emailCode.update({
      where: { id: rec.id },
      data: { attempts: rec.attempts + 1 },
    });
    return { ok: false, reason: "Incorrect code." };
  }
  return { ok: true };
}

// POST /api/auth/register  { email } → emails a sign-up code
export async function register(req: Request, res: Response) {
  try {
    const { email } = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists. Please sign in." });
    }
    // No email provider configured yet: echo the code on-screen for every sign-up
    // so accounts can be created without SMTP. This stops automatically the moment
    // SMTP_HOST/SMTP_USER are set (emailConfigured), after which codes require email.
    const code = await issueCode(email, "signup");
    res.json({ ok: true, ...(!emailConfigured ? { devCode: code } : {}) });
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/auth/verify  { email, code } → checks the code (does not consume it)
export async function verify(req: Request, res: Response) {
  try {
    const { email, code } = verifySchema.parse(req.body);
    const r = await checkCode(email, "signup", code);
    if (!r.ok) return res.status(400).json({ error: r.reason });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/auth/complete  { email, code, password, name } → creates the account
export async function complete(req: Request, res: Response) {
  try {
    const { email, code, password, name } = completeSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    const r = await checkCode(email, "signup", code);
    if (!r.ok) return res.status(400).json({ error: r.reason });
    const user = await prisma.user.create({
      data: {
        email,
        name: name || "",
        passwordHash: await hashPassword(password),
        emailVerified: true,
      },
    });
    await prisma.emailCode.deleteMany({ where: { email, purpose: "signup" } });
    res.json({ token: signToken({ sub: user.id, email: user.email }), user: pub(user) });
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/auth/login  { email, password }
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    res.json({ token: signToken({ sub: user.id, email: user.email }), user: pub(user) });
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/auth/forgot  { email } → emails a reset code (always 200, no enumeration)
export async function forgot(req: Request, res: Response) {
  try {
    const { email } = forgotSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    let devCode: string | undefined;
    if (user) devCode = await issueCode(email, "reset");
    res.json({ ok: true, ...(!emailConfigured && DEV && devCode ? { devCode } : {}) });
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/auth/reset  { email, code, password }
export async function reset(req: Request, res: Response) {
  try {
    const { email, code, password } = resetSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "No account for this email." });
    const r = await checkCode(email, "reset", code);
    if (!r.ok) return res.status(400).json({ error: r.reason });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
    await prisma.emailCode.deleteMany({ where: { email, purpose: "reset" } });
    res.json({ token: signToken({ sub: user.id, email: user.email }), user: pub(user) });
  } catch (e) {
    fail(res, e);
  }
}

// GET /api/auth/me  (requireAuth)
export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: "Not signed in." });
  res.json({ user: pub(user) });
}
