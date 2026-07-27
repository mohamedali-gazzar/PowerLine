import type { Response } from "express";
import { ZodError } from "zod";

/** Public-safe user projection returned to clients (omits passwordHash etc.).
 *  `role` drives which screens the UI offers; the server still re-checks it from
 *  the database on every protected request. */
export function pub(u: {
  id: string;
  email: string;
  name: string;
  photo: string | null;
  role?: string;
}) {
  return { id: u.id, email: u.email, name: u.name, photo: u.photo, role: u.role ?? "USER" };
}

/** Uniform error responder: 400 for Zod validation issues, 500 otherwise. */
export function fail(res: Response, err: unknown) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message || "Invalid input." });
  }
  console.error(err);
  return res.status(500).json({ error: "Server error." });
}
