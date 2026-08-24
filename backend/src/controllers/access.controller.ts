// Access Center — the single place roles and permissions are managed.
//
// Every change is written to PriceChange (the existing audit table) with
// entity "User", one row per changed field, so the access history sits alongside
// the price history rather than in a parallel system.
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { isProtectedOwner } from "../config";
import { fail } from "../lib/http";
import {
  accessOf, PERMS, PERM_LABEL, TIERS, ROLE_PRESETS, inferRole, type Perm, type Tier,
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
    roles: ROLE_PRESETS.map((r) => ({ name: r.name, tier: r.tier, perms: r.perms })),
  });
}

/** GET /api/access/users */
export async function listAccessUsers(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, email: true, name: true, role: true, tier: true,
        perms: true, accessRole: true, notifyByEmail: true, createdAt: true,
      },
    });
    res.json({
      users: users.map((u) => {
        // Show what the user EFFECTIVELY has, not the raw column: an unmigrated
        // user's power comes from `role`, and showing an empty list would be a lie.
        let perms: Perm[] = [];
        try {
          const arr = JSON.parse(u.perms || "[]");
          perms = Array.isArray(arr) ? arr.filter((p): p is Perm => (PERMS as readonly string[]).includes(p)) : [];
        } catch {
          perms = [];
        }
        const tier = (u.tier ?? (u.role === "OWNER" ? "ADMIN" : "ENGINEER")) as Tier;
        return {
          ...u,
          perms,
          tier,
          // The single stored role, or a best guess for not-yet-set rows.
          // The owner is shown as "Owner" and rendered locked; the server refuses changes
          // regardless, so this is presentation, not enforcement.
          accessRole: isProtectedOwner(u.email) ? "Owner" : u.accessRole || inferRole(tier, perms),
          protectedOwner: isProtectedOwner(u.email),
          migrated: Boolean(u.tier),
        };
      }),
    });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/access/users/:id  { role?, perms?, notifyByEmail? } — role-first: a known
 *  role sets tier + perms; "Custom" (or bare perms) keeps hand-picked perms as an
 *  engineer. tier + perms remain what accessOf actually reads. */
export async function setAccess(req: Request, res: Response) {
  try {
    const actorId = req.userId as string;
    const actorEmail = req.userEmail ?? "";
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, role: true, tier: true, perms: true, accessRole: true, notifyByEmail: true },
    });
    if (!target) return res.status(404).json({ error: "User not found." });

    const roleName = typeof req.body?.role === "string" ? req.body.role.trim() : undefined;
    const preset = ROLE_PRESETS.find((r) => r.name === roleName);
    const nextPermsRaw = req.body?.perms as string[] | undefined;
    // Turning e-mail off does NOT stop notifications — the in-app inbox still fills.
    const nextNotify =
      typeof req.body?.notifyByEmail === "boolean" ? (req.body.notifyByEmail as boolean) : undefined;

    // Resolve the resulting tier + perms + stored role from what was sent.
    let nextTier: Tier | undefined;
    let nextPerms: Perm[] | undefined;
    let nextRole: string | undefined;
    if (preset) {
      nextTier = preset.tier;
      nextPerms = preset.perms;
      nextRole = preset.name;
    } else if (roleName !== undefined || nextPermsRaw !== undefined) {
      // Custom (hand-picked) — always an engineer.
      nextTier = "ENGINEER";
      nextPerms = Array.isArray(nextPermsRaw)
        ? nextPermsRaw.filter((p): p is Perm => (PERMS as readonly string[]).includes(p))
        : [];
      nextRole = "";
    }

    // The system owner's access is not editable by anyone, including another admin and
    // including the owner. Personal preferences (e-mail notifications) still are — those
    // are not access. This is the guarantee behind the locked card in the Access Center;
    // the UI only reflects it, so disabling the controls there is not the protection.
    if (isProtectedOwner(target.email) && (nextTier !== undefined || nextPerms !== undefined)) {
      return res.status(403).json({
        error:
          "This is the system owner's account. Its role and permissions are locked and " +
          "cannot be changed by anyone.",
      });
    }

    // Locking yourself out is the one mistake with no in-app recovery.
    if (target.id === actorId && nextTier && nextTier !== "ADMIN") {
      return res.status(400).json({
        error: "You cannot remove your own admin access — ask another admin to do it.",
      });
    }

    const parsePerms = (raw: string): Perm[] => {
      try {
        const a = JSON.parse(raw || "[]");
        return Array.isArray(a) ? a.filter((p): p is Perm => (PERMS as readonly string[]).includes(p)) : [];
      } catch {
        return [];
      }
    };
    const prevTier = (target.tier ?? (target.role === "OWNER" ? "ADMIN" : "ENGINEER")) as Tier;
    const prevRole = target.accessRole || inferRole(prevTier, parsePerms(target.perms));

    const data: { tier?: string; perms?: string; accessRole?: string; notifyByEmail?: boolean } = {};
    if (nextTier) data.tier = nextTier;
    if (nextPerms) data.perms = JSON.stringify(nextPerms);
    if (nextRole !== undefined) data.accessRole = nextRole;
    if (nextNotify !== undefined) data.notifyByEmail = nextNotify;
    if (!Object.keys(data).length) return res.json({ ok: true });

    await prisma.user.update({ where: { id: target.id }, data });

    // One audit row per changed field.
    const changes: { field: string; oldValue: string; newValue: string }[] = [];
    if (data.accessRole !== undefined && (data.accessRole || "Custom") !== (prevRole || "Custom")) {
      changes.push({ field: "role", oldValue: prevRole || "Custom", newValue: data.accessRole || "Custom" });
    }
    if (data.tier && data.tier !== prevTier) {
      changes.push({ field: "tier", oldValue: prevTier, newValue: data.tier });
    }
    if (data.perms && data.perms !== target.perms) {
      changes.push({ field: "perms", oldValue: target.perms || "[]", newValue: data.perms });
    }
    if (data.notifyByEmail !== undefined && data.notifyByEmail !== target.notifyByEmail) {
      changes.push({
        field: "notifyByEmail",
        oldValue: target.notifyByEmail ? "on" : "off",
        newValue: data.notifyByEmail ? "on" : "off",
      });
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
          details: changes.map(
            (c) =>
              [
                c.field === "role" ? "Role"
                : c.field === "tier" ? "Access level"
                : c.field === "notifyByEmail" ? "E-mail notifications"
                : "Permissions",
                c.newValue,
              ] as [string, string]
          ),
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
