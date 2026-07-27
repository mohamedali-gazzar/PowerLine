// Price-list API — Stage 1: read the published list + the one-time first import.
// Editing endpoints arrive in Stage 2.

import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";
import { priceBookInfo, refreshPriceBook } from "../domain/pricing-data";
import { roleOf } from "../middleware/roles";
import { seedRmuFromBundle, buildRmuPayload, diffAgainstBundle } from "../services/price-seed.service";

/** GET /api/pricing/version — tiny poll target so a screen can notice that
 *  someone else published, without refetching the whole catalogue. */
export async function getVersion(_req: Request, res: Response) {
  try {
    await refreshPriceBook();
    const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });
    const info = priceBookInfo();
    res.json({
      version: info.version,
      source: info.source,
      stale: info.stale,
      seedState: book?.seedState ?? "EMPTY",
      publishedAt: book?.publishedAt ?? null,
      publishedBy: book?.publishedBy ?? "",
    });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/status — what the price screen shows on load. */
export async function getStatus(req: Request, res: Response) {
  try {
    await refreshPriceBook();
    const [book, rmuCount, settingCount, lvComponents, lvEnclosures, role] = await Promise.all([
      prisma.priceBook.findUnique({ where: { id: "singleton" } }),
      prisma.rmuPrice.count(),
      prisma.priceSetting.count(),
      prisma.lvComponent.count(),
      prisma.lvEnclosure.count(),
      roleOf(req.userId),
    ]);
    const info = priceBookInfo();
    res.json({
      role,
      canEdit: role === "PRICE_ADMIN" || role === "OWNER",
      version: info.version,
      source: info.source,
      stale: info.stale,
      seedState: book?.seedState ?? "EMPTY",
      counts: { rmuPrices: rmuCount, settings: settingCount, lvComponents, lvEnclosures },
    });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/catalog/rmu — the RMU price list currently being served.
 *  `?source=bundle` returns the list shipped with the code, so the two can be
 *  compared without a deploy. */
export async function getRmuCatalog(req: Request, res: Response) {
  try {
    await refreshPriceBook();
    if (req.query.source === "bundle") {
      const { BUNDLED } = await import("../domain/pricing-data");
      return res.json({ source: "bundled", version: 0, data: BUNDLED });
    }
    const info = priceBookInfo();
    const data = info.source === "db" ? await buildRmuPayload() : (await import("../domain/pricing-data")).BUNDLED;
    res.json({ source: info.source, version: info.version, data });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/seed — the one-time first import.
 *
 *  Bootstrap rule: allowed for any signed-in user only while nothing has ever
 *  been published (version 0). Whoever runs it becomes OWNER, so there is a
 *  first administrator without hand-editing the database. Once a version exists,
 *  OWNER is required. */
export async function postSeed(req: Request, res: Response) {
  try {
    const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });
    const alreadyPublished = (book?.version ?? 0) > 0;
    const role = await roleOf(req.userId);

    if (alreadyPublished && role !== "OWNER") {
      return res.status(403).json({ error: "The price list is already set up — owner access required." });
    }
    if (!req.userId) return res.status(401).json({ error: "Not signed in." });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const result = await seedRmuFromBundle({ id: req.userId, email: user?.email ?? "" });

    if (!result.ok) {
      return res.status(409).json({
        error: "Import checked out different to the price list in the app — nothing was published.",
        mismatches: result.mismatches.slice(0, 20),
      });
    }

    // First importer becomes the owner (only while bootstrapping).
    if (!alreadyPublished && role !== "OWNER") {
      await prisma.user.update({ where: { id: req.userId }, data: { role: "OWNER" } });
    }

    await refreshPriceBook(true);
    res.json({ ...result, role: "OWNER" });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/rmu — the editable draft rows for the price screen. */
export async function listRmuPrices(_req: Request, res: Response) {
  try {
    const rows = await prisma.rmuPrice.findMany({ orderBy: [{ kind: "asc" }, { key: "asc" }] });
    const pending = await prisma.priceChange.count({ where: { version: null } });
    res.json({ rows, pendingChanges: pending });
  } catch (e) {
    fail(res, e);
  }
}

/** PATCH /api/pricing/rmu/:id — change one price. Saves to the DRAFT only:
 *  customers keep seeing the old price until "Update price list" is pressed. */
export async function updateRmuPrice(req: Request, res: Response) {
  try {
    const price = Number(req.body?.priceUsd);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: "Enter a price greater than 0." });
    }
    const row = await prisma.rmuPrice.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: "Price not found." });
    if (row.priceUsd === price) return res.json({ ok: true, unchanged: true, row });

    const user = req.userId ? await prisma.user.findUnique({ where: { id: req.userId } }) : null;
    const updated = await prisma.rmuPrice.update({
      where: { id: row.id },
      data: { priceUsd: price, updatedBy: user?.email ?? "" },
    });
    await prisma.priceChange.create({
      data: {
        domain: "RMU",
        entity: "RmuPrice",
        entityId: row.id,
        label: row.label || row.key,
        field: "priceUsd",
        oldValue: String(row.priceUsd),
        newValue: String(price),
        actorId: req.userId ?? null,
        actorEmail: user?.email ?? "",
      },
    });
    res.json({ ok: true, row: updated });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/rmu/:id/retire — stop offering a product, or bring it back.
 *
 *  Never a hard delete: the row stays so quotations already saved keep resolving
 *  their price. It simply stops being offered from the next publish. */
export async function retireRmuPrice(req: Request, res: Response) {
  try {
    const active = req.body?.active === true; // false (or missing) = retire
    const row = await prisma.rmuPrice.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: "Price not found." });
    if (row.active === active) return res.json({ ok: true, unchanged: true, row });

    // Guard: the outdoor enclosure is applied automatically to OUTDOOR offers,
    // so retiring it would silently drop that charge from future quotations.
    if (!active && row.kind === "ADDON" && row.key === "outdoorEnclosure") {
      return res.status(400).json({
        error:
          "The Outdoor Enclosure cannot be retired — outdoor offers would lose that charge. Change its price instead.",
      });
    }

    const user = req.userId ? await prisma.user.findUnique({ where: { id: req.userId } }) : null;
    const updated = await prisma.rmuPrice.update({ where: { id: row.id }, data: { active, updatedBy: user?.email ?? "" } });
    await prisma.priceChange.create({
      data: {
        domain: "RMU",
        entity: "RmuPrice",
        entityId: row.id,
        label: row.label || row.key,
        field: active ? "__restored" : "__retired",
        oldValue: row.active ? "offered" : "retired",
        newValue: active ? "offered" : "retired",
        actorId: req.userId ?? null,
        actorEmail: user?.email ?? "",
      },
    });
    res.json({ ok: true, row: updated });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/pending — the review list shown before publishing. */
export async function getPending(_req: Request, res: Response) {
  try {
    const changes = await prisma.priceChange.findMany({
      where: { version: null },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ changes });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/publish — "Update price list & database".
 *  Validates, writes an immutable snapshot and bumps the live version, so every
 *  request from now on serves the new prices. No deploy involved. */
export async function postPublish(req: Request, res: Response) {
  try {
    const built = await buildRmuPayload();

    // Blockers — never publish a list that would break quoting.
    const blockers: string[] = [];
    for (const [k, v] of Object.entries(built.panels)) if (!(v > 0)) blockers.push(`Panel ${k} has no price`);
    for (const [k, v] of Object.entries(built.lucy)) if (!(v > 0)) blockers.push(`Lucy ${k} has no price`);
    if (!built.addOns.outdoorEnclosure) blockers.push("The Outdoor Enclosure add-on is missing — outdoor offers would lose that charge");
    if (!(built.vatPct >= 0 && built.vatPct <= 100)) blockers.push(`VAT ${built.vatPct}% is out of range`);
    if (blockers.length) return res.status(400).json({ error: "Cannot publish yet.", blockers });

    const user = req.userId ? await prisma.user.findUnique({ where: { id: req.userId } }) : null;
    const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });
    const version = (book?.version ?? 0) + 1;
    const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 200) : "";

    await prisma.priceSnapshot.create({
      data: {
        domain: "RMU",
        version,
        payload: JSON.stringify(built),
        rowCount: Object.keys(built.panels).length + Object.keys(built.lucy).length,
      },
    });
    await prisma.priceBook.update({
      where: { id: "singleton" },
      data: { version, publishedAt: new Date(), publishedBy: user?.email ?? "", note, source: "db" },
    });
    await prisma.priceChange.updateMany({ where: { version: null }, data: { version } });

    await refreshPriceBook(true); // force: the publisher must never see stale numbers
    res.json({ ok: true, version });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/verify — proves the database reproduces the shipped price
 *  list exactly. Used after the import and before trusting the switch-over. */
export async function getVerify(_req: Request, res: Response) {
  try {
    const built = await buildRmuPayload();
    const mismatches = diffAgainstBundle(built);
    res.json({
      identical: mismatches.length === 0,
      mismatches: mismatches.slice(0, 50),
      counts: {
        panels: Object.keys(built.panels).length,
        lucy: Object.keys(built.lucy).length,
        rtu: Object.values(built.rtu).reduce((n, m) => n + Object.keys(m).length, 0),
        addOns: Object.keys(built.addOns).length,
      },
    });
  } catch (e) {
    fail(res, e);
  }
}
