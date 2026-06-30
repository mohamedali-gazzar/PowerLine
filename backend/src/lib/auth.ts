// Auth primitives: password hashing (bcryptjs — pure JS, serverless-safe), JWT
// signing/verifying, and one-time numeric codes for email verification.
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

// Fail fast in production if the secret isn't configured (a hardcoded fallback
// would let anyone forge tokens); allow a dev default locally only.
const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("JWT_SECRET is not set — configure a long random secret in production.");
  return "powerline-dev-secret-change-me"; // dev / local only
})();
const JWT_EXPIRES = "30d";

export interface TokenPayload {
  sub: string; // user id
  email: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const d = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return { sub: d.sub, email: d.email };
  } catch {
    return null;
  }
}

/** A 6-digit one-time code for sign-up verification / password reset. */
export function genCode(): string {
  return String(randomInt(100000, 1000000));
}
