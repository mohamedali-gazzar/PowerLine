import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

/** Roles, most privileged last. */
export const ROLES = ["USER", "PRICE_ADMIN", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

/** Read the caller's role FROM THE DATABASE (never from the JWT, which lives for
 *  30 days in localStorage — so revoking someone takes effect immediately). */
export async function roleOf(userId: string | undefined): Promise<Role> {
  if (!userId) return "USER";
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const r = (u?.role ?? "USER") as Role;
  return ROLES.includes(r) ? r : "USER";
}

/** May change prices (PRICE_ADMIN or OWNER). Fails closed. */
export async function requirePriceAdmin(req: Request, res: Response, next: NextFunction) {
  const role = await roleOf(req.userId);
  if (role !== "PRICE_ADMIN" && role !== "OWNER") {
    return res.status(403).json({ error: "You do not have access to price editing." });
  }
  next();
}

/** May change prices AND grant access to others. */
export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  if ((await roleOf(req.userId)) !== "OWNER") {
    return res.status(403).json({ error: "Owner access required." });
  }
  next();
}
