// Auth primitives: password hashing (bcryptjs — pure JS, serverless-safe), JWT
// signing/verifying, and one-time numeric codes for email verification.
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "powerline-dev-secret-change-me";
const JWT_EXPIRES = "30d";

export interface TokenPayload {
  sub: string; // user id
  email: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
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
