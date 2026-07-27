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

    await refreshPriceBook();
    res.json({ ...result, role: "OWNER" });
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
