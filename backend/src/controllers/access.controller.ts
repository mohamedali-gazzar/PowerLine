// Access Center — the single place roles and permissions are managed.
//
// Every change is written to PriceChange (the existing audit table) with
// entity "User", one row per changed field, so the access history sits alongside
// the price history rather than in a parallel system.
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";
import {
  accessOf, PERMS, PERM_LABEL, TIERS, type Perm, type Tier,
} from "../middleware/roles";

/** GET /api/access/me — what the signed-in user may do. Drives UI gating.
 *  Deliberately server-computed: the JWT lives for 30 days, so the client must
 *  never decide this for itself. */
export async function myAccess(req: Request, res: Response) {
  try {
    const acc = await accessOf(req.userId);
    res.json({ tier: acc.tier, perms: [...acc.perms], role: acc.role });
  } catch (e) {
    fail(res, e);
  }
}

/** The permission catalogue, so the UI never hardcodes the list. */
export async function permCatalogue(_req: Request, res: Response) {
  res.json({
    tiers: TIERS,
    perms: PERMS.map((key) => ({ key, label: PERM_LABEL[key] })),
  });
}

/** GET /api/access/users */
export async function listAccessUsers(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, email: true, name: true, role: true, tier: true,
        perms: true, notifyByEmail: true, createdAt: true,
      },
    });
    res.json({
      users: users.map((u) => {
        // Show what the user EFFECTIVELY has, not the raw column: an unmigrated
        // user's power comes from `role`, and showing an empty list would be a lie.
        let perms: string[] = [];
        try {
          perms = JSON.parse(u.perms || "[]");
        } catch {
          perms = [];
        }
        return {
          ...u,
          perms: Array.isArray(perms) ? perms : [],
          tier: u.tier ?? (u.role === "OWNER" ? "ADMIN" : "ENGINEER"),
          migrated: Boolean(u.tier),
        };
      }),
    });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/access/users/:id  { tier?, perms? } */
export async function setAccess(req: Request, res: Response) {
  try {
    const actorId = req.userId as string;
    const actorEmail = req.userEmail ?? "";
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, role: true, tier: true, perms: true },
    });
    if (!target) return res.status(404).json({ error: "User not found." });

    const nextTier = req.body?.tier as Tier | undefined;
    const nextPermsRaw = req.body?.perms as string[] | undefined;

    if (nextTier && !(TIERS as readonly string[]).includes(nextTier)) {
      return res.status(400).json({ error: "Unknown access level." });
    }
    // Locking yourself out is the one mistake with no in-app recovery.
    if (target.id === actorId && nextTier && nextTier !== "ADMIN") {
      return res.status(400).json({
        error: "You cannot remove your own admin access — ask another admin to do it.",
      });
    }

    const nextPerms = Array.isArray(nextPermsRaw)
      ? nextPermsRaw.filter((p): p is Perm => (PERMS as readonly string[]).includes(p))
      : undefined;

    const data: { tier?: string; perms?: string } = {};
    if (nextTier) data.tier = nextTier;
    if (nextPerms) data.perms = JSON.stringify(nextPerms);
    if (!Object.keys(data).length) return res.json({ ok: true });

    const prevTier = target.tier ?? (target.role === "OWNER" ? "ADMIN" : "ENGINEER");
    await prisma.user.update({ where: { id: target.id }, data });

    // One audit row per changed field, matching how role changes are already logged.
    const changes: { field: string; oldValue: string; newValue: string }[] = [];
    if (data.tier && data.tier !== prevTier) {
      changes.push({ field: "tier", oldValue: prevTier, newValue: data.tier });
    }
    if (data.perms && data.perms !== target.perms) {
      changes.push({ field: "perms", oldValue: target.perms || "[]", newValue: data.perms });
    }
    for (const c of changes) {
      await prisma.priceChange.create({
        data: {
          domain: "LV", entity: "User", entityId: target.id,
          label: target.email, field: c.field,
          oldValue: c.oldValue, newValue: c.newValue,
          actorId, actorEmail,
        },
      });
    }

    // Tell the person whose access changed.
    if (changes.length) {
      try {
        const { notify } = await import("../services/notify.service");
        await notify({
          userId: target.id,
          kind: "ACCESS_CHANGED",
          title: "Your access has been updated",
          body: `${actorEmail} updated your access in the PowerLine Access Center.`,
          link: "/",
          details: changes.map((c) => [c.field === "tier" ? "Access level" : "Permissions", c.newValue] as [string, string]),
        });
      } catch (e) {
        console.error("[access] notification failed", e);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/access/history — access changes only. */
export async function accessHistory(_req: Request, res: Response) {
  try {
    const rows = await prisma.priceChange.findMany({
      where: { entity: "User" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ items: rows });
  } catch (e) {
    fail(res, e);
  }
}
