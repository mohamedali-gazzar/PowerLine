import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";

/** Legacy roles, most privileged last. Never dropped: `role` is still the source of
 *  truth for any user the Access Center has not touched yet. */
export const ROLES = ["USER", "PRICE_ADMIN", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

/** The access model users are managed by now. */
export const TIERS = ["ADMIN", "ENGINEER"] as const;
export type Tier = (typeof TIERS)[number];

/** Individually grantable permissions. */
export const PERMS = [
  "prices.view",
  "prices.edit",
  "access.manage",
  "qtn.viewAll",
  "qtn.approve",
  "qtn.return",
  "qtn.editWaiting",
  "qtn.submitApproved",
  "qtn.reopen",
  "qtn.reassign",
  "qtn.amendOwn",
  "qtn.amendAll",
  "qtn.audit",
  "qtn.approveOwn",
] as const;
export type Perm = (typeof PERMS)[number];

export const PERM_LABEL: Record<Perm, string> = {
  "prices.view": "View price list",
  "prices.edit": "Edit price list",
  "access.manage": "Manage access",
  "qtn.viewAll": "View all QTNs",
  "qtn.approve": "Approve QTNs",
  "qtn.return": "Return QTNs for revision",
  "qtn.editWaiting": "Edit QTNs waiting for approval",
  "qtn.submitApproved": "Submit approved QTNs",
  "qtn.reopen": "Reopen submitted QTNs",
  "qtn.reassign": "Hand over / reassign QTNs to another user",
  "qtn.amendOwn": "Amend own QTNs",
  "qtn.amendAll": "Amend all QTNs",
  "qtn.audit": "View audit trail",
  "qtn.approveOwn": "Approve their own QTNs",
};

/** Admins hold everything except the deliberate self-approval exception, which stays
 *  an explicit grant so it is always a conscious decision. */
const ADMIN_PERMS: Perm[] = PERMS.filter((p) => p !== "qtn.approveOwn");

/** What a not-yet-migrated user gets, derived from their legacy role. Chosen so the
 *  deploy that adds `tier`/`perms` changes nobody's access. */
const DERIVED: Record<Role, Perm[]> = {
  OWNER: ADMIN_PERMS,
  PRICE_ADMIN: ["prices.view", "prices.edit"],
  USER: [],
};

/** Named access roles managed in the Access Center — the single setting an admin
 *  picks; it drives tier + perms on save. Admin & Section Head hold everything (Admin
 *  tier); the rest are engineers with a fixed set. */
export const ROLE_PRESETS: { name: string; tier: Tier; perms: Perm[] }[] = [
  { name: "Admin", tier: "ADMIN", perms: [] },
  { name: "Section Head", tier: "ADMIN", perms: [] },
  { name: "Team Leader", tier: "ENGINEER", perms: ["prices.view", "qtn.viewAll", "qtn.reassign", "qtn.approve", "qtn.return", "qtn.amendOwn", "qtn.amendAll"] },
  { name: "Tendering", tier: "ENGINEER", perms: ["prices.view", "qtn.viewAll", "qtn.editWaiting", "qtn.amendOwn", "qtn.amendAll"] },
  { name: "Powerline", tier: "ENGINEER", perms: ["qtn.viewAll"] },
];
export const ROLE_NAMES = ROLE_PRESETS.map((r) => r.name);

/** Best-guess role for a user with tier/perms but no stored accessRole yet (legacy
 *  rows) so the UI shows a sensible role rather than blank. */
export function inferRole(tier: Tier, perms: Perm[]): string {
  if (tier === "ADMIN") return "Admin";
  const set = new Set(perms);
  for (const r of ROLE_PRESETS) {
    if (r.tier !== "ENGINEER") continue;
    if (r.perms.length === perms.length && r.perms.every((p) => set.has(p))) return r.name;
  }
  return "Custom";
}

function safeParsePerms(raw: string): Perm[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr.filter((p): p is Perm => (PERMS as readonly string[]).includes(p));
  } catch {
    return []; // a corrupt row must fail closed, never throw mid-request
  }
}

export interface Access {
  tier: Tier;
  perms: Set<Perm>;
  role: Role;
}

/**
 * The caller's effective access, read FROM THE DATABASE on every request — never
 * from the 30-day JWT — so a revocation takes effect immediately.
 */
export async function accessOf(userId: string | undefined): Promise<Access> {
  const none: Access = { tier: "ENGINEER", perms: new Set(), role: "USER" };
  if (!userId) return none;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, tier: true, perms: true },
  });
  if (!u) return none;
  const role = ((ROLES as readonly string[]).includes(u.role) ? u.role : "USER") as Role;
  // Not migrated yet → behave exactly as the legacy role did.
  if (!u.tier || !(TIERS as readonly string[]).includes(u.tier)) {
    return { tier: role === "OWNER" ? "ADMIN" : "ENGINEER", perms: new Set(DERIVED[role]), role };
  }
  const tier = u.tier as Tier;
  const granted = safeParsePerms(u.perms);
  if (tier === "ADMIN") {
    // Admin implies everything EXCEPT the self-approval exception, which stays a
    // deliberate, separately-ticked grant. The explicit grants must be merged in
    // rather than replaced: returning ADMIN_PERMS alone silently discarded
    // qtn.approveOwn, so ticking it for an admin could never take effect.
    return { tier, perms: new Set([...ADMIN_PERMS, ...granted]), role };
  }
  return { tier, perms: new Set(granted), role };
}

/** Convenience for call sites that only need a yes/no. */
export async function hasPerm(userId: string | undefined, perm: Perm): Promise<boolean> {
  return (await accessOf(userId)).perms.has(perm);
}

/** Legacy helper, still used by the pricing controller. */
export async function roleOf(userId: string | undefined): Promise<Role> {
  return (await accessOf(userId)).role;
}

const DENY: Partial<Record<Perm, string>> = {
  // Preserved verbatim — existing UI copy and tests depend on these strings.
  "prices.edit": "You do not have access to price editing.",
  "access.manage": "Owner access required.",
};

/**
 * Gate a route on a permission.
 *
 * The try/catch is load-bearing: under Express 4 a rejected promise in async
 * middleware is an unhandled rejection and the request hangs forever rather than
 * erroring. The two role guards this replaces both had that bug.
 */
export function requirePerm(perm: Perm) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await hasPerm(req.userId, perm))) {
        return res.status(403).json({ error: DENY[perm] ?? "You do not have access to this." });
      }
      next();
    } catch (e) {
      fail(res, e);
    }
  };
}

/** Gate on ANY of several permissions — used where a read is allowed both to
 *  people who may only look and to people who may also change things. */
export function requireAnyPerm(...perms: Perm[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const acc = await accessOf(req.userId);
      if (!perms.some((p) => acc.perms.has(p))) {
        return res.status(403).json({ error: DENY[perms[0]] ?? "You do not have access to this." });
      }
      next();
    } catch (e) {
      fail(res, e);
    }
  };
}

/** Being allowed to CHANGE prices implies being allowed to SEE them. */
export const canViewPrices = (acc: Access) =>
  acc.perms.has("prices.view") || acc.perms.has("prices.edit");

/** Read-only access to the price list. */
export const requirePriceViewer = requireAnyPerm("prices.view", "prices.edit");

// Back-compat aliases so every existing wiring site in app.ts stays untouched.
export const requirePriceAdmin = requirePerm("prices.edit");
export const requireOwner = requirePerm("access.manage");
