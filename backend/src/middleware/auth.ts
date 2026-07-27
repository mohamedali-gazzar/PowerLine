import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

function readToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7);
  // PDF links are plain browser navigations (<a href> / anchor download), which
  // cannot carry an Authorization header — so a token may also travel as ?t=.
  // Restricted to GET/HEAD: a URL can then only ever read, never change state.
  if ((req.method === "GET" || req.method === "HEAD") && typeof req.query.t === "string") {
    return req.query.t || null;
  }
  return null;
}

/** Requires a valid JWT; responds 401 otherwise. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  req.userId = payload.sub;
  req.userEmail = payload.email;
  next();
}

/** Populates req.userId when a valid token is present, but never rejects —
 *  used on routes that work signed-out yet should attribute ownership when in. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  const payload = token ? verifyToken(token) : null;
  if (payload) {
    req.userId = payload.sub;
    req.userEmail = payload.email;
  }
  next();
}
