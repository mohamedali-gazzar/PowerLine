import type { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { prisma } from "../lib/prisma";
import { pub, fail } from "../lib/http";
import {
  hashPassword,
  comparePassword,
  signToken,
  genCode,
} from "../lib/auth";
import {
  sendMail,
  emailConfigured,
  emailShell,
  emailCodeBlock,
} from "../services/email.service";
import {
  registerSchema,
  verifySchema,
  completeSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
} from "../validation/auth.schema";

/** How long a one-time code stays valid. Configurable so it can be tuned without
 *  a code change; 10 minutes is the default. */
const CODE_TTL_MIN = Math.max(1, parseInt(process.env.OTP_TTL_MINUTES || "10", 10) || 10);
const MAX_ATTEMPTS = 6;
// The code is only echoed back in the response when there's no real email AND we
// aren't in production — so production never leaks codes even if misconfigured.
const DEV = process.env.NODE_ENV !== "production";

// ── Rate limiting ───────────────────────────────────────────────────────────
// Without this, /forgot and /register are free code-generation endpoints: each call
// deletes the previous code and mails a new one, so anyone could spam a colleague's
// inbox or grind the 6-digit space by requesting fresh codes.
//
// Deliberately in-process. A shared store would be better, but this runs on
// serverless where each instance is short-lived, and an imperfect limit applied
// everywhere beats a perfect one that needs infrastructure we do not have. It
// blunts the obvious abuse; it is not a defence against a distributed attacker.
const RATE_MAX = 5; // requests per key per window
const RATE_WINDOW_MS = 15 * 60_000;
const rateHits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateHits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rateHits.set(key, hits);
  // Bound the map so a long-lived process can't grow it without limit.
  if (rateHits.size > 5000) {
    for (const [k, v] of rateHits) {
      if (!v.some((t) => now - t < RATE_WINDOW_MS)) rateHits.delete(k);
    }
  }
  return hits.length > RATE_MAX;
}

/** Same limit keyed by both the address and the caller, so one noisy client cannot
 *  lock out an address and one address cannot be hammered from many clients. */
function tooManyRequests(req: Request, email: string): boolean {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
  return rateLimited(`email:${email}`) || (ip ? rateLimited(`ip:${ip}`) : false);
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
  const heading =
    purpose === "signup" ? "Confirm your e-mail" : "Reset your password";
  await sendMail({
    to: email,
    subject,
    text: `Your PowerLine code is ${code}. It expires in ${CODE_TTL_MIN} minutes. If you didn't request this, you can ignore this email.`,
    html: emailShell(
      heading,
      emailCodeBlock(code) +
        `<p style="margin:0;font-size:13px;line-height:1.55;color:#8b8f98">This code expires in ${CODE_TTL_MIN} minutes. If you didn't request it, you can ignore this e-mail.</p>`
    ),
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
    if (tooManyRequests(req, email)) {
      return res.status(429).json({
        error: "Too many verification requests. Please wait a few minutes and try again.",
      });
    }
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
    // DEV guard matches forgot() below: never return the code from production,
    // even if SMTP is unconfigured — otherwise anyone could self-register an
    // address, read the verification code straight out of the HTTP response and
    // sign in as a member of staff.
    res.json({ ok: true, ...(!emailConfigured && DEV ? { devCode: code } : {}) });
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

// POST /api/auth/dev-login  — DEV ONLY. Skips the login wall by minting a token for the
// first (oldest) account, creating a throwaway dev user if the DB is empty. Returns 404 in
// production (NODE_ENV=production → DEV=false), so it can never bypass auth on the deploy.
export async function devLogin(_req: Request, res: Response) {
  if (!DEV) return res.status(404).json({ error: "Not found." });
  try {
    let user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "dev@powerline.local",
          name: "Dev User",
          passwordHash: await hashPassword("dev-skip-login"),
          emailVerified: true,
        },
      });
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
    if (tooManyRequests(req, email)) {
      console.warn("[forgot] rate limited for %s", email);
      return res.status(429).json({
        error: "Too many reset requests. Please wait a few minutes and try again.",
      });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    let devCode: string | undefined;
    if (user) {
      // Security log: who asked for a reset and when.
      console.info("[forgot] reset code issued for %s at %s", email, new Date().toISOString());
      devCode = await issueCode(email, "reset");
    } else {
      // Still answer 200 so the endpoint can't be used to enumerate accounts, but
      // say so in the log — otherwise "no such account" and "mail never sent" are
      // indistinguishable from the outside, which is exactly the confusion that
      // made this look broken.
      console.warn("[forgot] no account for %s — no code issued", email);
    }
    if (!emailConfigured) {
      console.warn(
        "[forgot] SMTP is not configured — no e-mail was sent. Set SMTP_HOST, SMTP_USER and SMTP_PASS."
      );
    }
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
    // Security log: a password actually changed. Kept separate from the request log
    // above so "someone asked" and "someone succeeded" are distinguishable.
    console.info("[reset] password changed for %s at %s", email, new Date().toISOString());
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
