// Transformer price database — the /pricing "Transformer" tab.
//
// Managed ONLY through the Excel round-trip (Download current → edit → Upload → preview → Apply)
// in pricing-transformer-import.controller.ts; there is no inline add/edit. `code` is the match
// key. The sheet's "Price (EGP)" is the COST; the SELLING price is cost / factor, where factor is
// one default scalar (PriceSetting scope "TRANSFORMER" key "factor", default 0.95).

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";
import { publishCurrentPricesDetailed } from "./pricing.controller";
import { ipTwin } from "./pricing-transformer-sheet.controller";

export const TRANSFORMER_DEFAULT_FACTOR = 0.95;

/** The selling factor (selling = cost / factor). Falls back to the default when unset/invalid. */
export async function getTransformerFactor(): Promise<number> {
  const row = await prisma.priceSetting.findUnique({
    where: { scope_key: { scope: "TRANSFORMER", key: "factor" } },
  });
  const f = row?.num;
  return typeof f === "number" && f > 0 ? f : TRANSFORMER_DEFAULT_FACTOR;
}

/** GET /api/pricing/transformer — the rows for the table AND for "Download current". */
export async function listTransformerPrices(req: Request, res: Response) {
  try {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const brand = String(req.query.brand ?? "").trim();
    const insulation = String(req.query.insulation ?? "").trim();
    const activeOnly = req.query.active === "1";
    const page = Math.max(0, Number(req.query.page ?? 0));
    const take = Math.min(1000, Math.max(10, Number(req.query.take ?? 200)));

    const where: Record<string, unknown> = {};
    if (q) where.search = { contains: q };
    if (brand) where.brand = brand;
    if (insulation) where.insulation = insulation;
    if (activeOnly) where.active = true;

    const [rows, total, factor] = await Promise.all([
      prisma.transformerPrice.findMany({ where, orderBy: { sortIndex: "asc" }, skip: page * take, take }),
      prisma.transformerPrice.count({ where }),
      getTransformerFactor(),
    ]);
    // Which technical sheets are uploaded — for each row's own code AND its IP twin, since one
    // transformer can carry both an IP23 (…2300) and an IP00 (…0000) datasheet. `sheetCodes` lets
    // the UI/offer show the right variant; `hasSheet` stays the row's own-code flag.
    const wanted = new Set<string>();
    for (const r of rows) {
      wanted.add(r.code);
      const twin = ipTwin(r.code);
      if (twin) wanted.add(twin);
    }
    const withSheet = new Set(
      (
        await prisma.transformerSheet.findMany({
          where: { code: { in: [...wanted] } },
          select: { code: true },
        })
      ).map((s) => s.code),
    );
    const tagged = rows.map((r) => ({ ...r, hasSheet: withSheet.has(r.code) }));
    res.json({ rows: tagged, total, page, take, factor, sheetCodes: [...withSheet] });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/transformer/facets — dropdown values for the filters. */
export async function getTransformerFacets(_req: Request, res: Response) {
  try {
    const [brands, insulations] = await Promise.all([
      prisma.transformerPrice.findMany({ distinct: ["brand"], select: { brand: true }, orderBy: { brand: "asc" } }),
      prisma.transformerPrice.findMany({ distinct: ["insulation"], select: { insulation: true }, orderBy: { insulation: "asc" } }),
    ]);
    res.json({
      brands: brands.map((b) => b.brand).filter(Boolean),
      insulations: insulations.map((i) => i.insulation).filter(Boolean),
    });
  } catch (e) {
    fail(res, e);
  }
}

const factorSchema = z.object({ factor: z.number().positive().max(10) });

/** POST /api/pricing/transformer/factor — set the selling factor (selling = cost / factor). */
export async function postTransformerFactor(req: Request, res: Response) {
  try {
    const parsed = factorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Factor must be a positive number." });
    const factor = parsed.data.factor;
    const prev = await getTransformerFactor();
    await prisma.priceSetting.upsert({
      where: { scope_key: { scope: "TRANSFORMER", key: "factor" } },
      update: { num: factor, updatedBy: req.userEmail ?? "" },
      create: { scope: "TRANSFORMER", key: "factor", num: factor, updatedBy: req.userEmail ?? "" },
    });
    if (prev !== factor) {
      await prisma.priceChange.create({
        data: {
          domain: "TRANSFORMER", entity: "PriceSetting", entityId: "TRANSFORMER.factor",
          label: "Transformer selling factor", field: "factor",
          oldValue: String(prev), newValue: String(factor),
          actorId: req.userId ?? null, actorEmail: req.userEmail ?? "",
        },
      });
    }
    // Every price change goes live as it is made (same model as LV/RMU).
    const { version } = await publishCurrentPricesDetailed(req.userEmail ?? "", "Transformer factor");
    res.json({ ok: true, factor, published: version != null, version });
  } catch (e) {
    fail(res, e);
  }
}

export interface TransformerPayloadRow {
  code: string;
  ratingKva: number;
  primaryKv: number;
  costEgp: number;
  brand: string;
  insulation: string;
}

/** The published transformer payload: the factor + the active rows (cost). Selling = cost / factor. */
export async function buildTransformerPayload(): Promise<{ factor: number; rows: TransformerPayloadRow[] }> {
  const [factor, rows] = await Promise.all([
    getTransformerFactor(),
    prisma.transformerPrice.findMany({ where: { active: true }, orderBy: { sortIndex: "asc" } }),
  ]);
  return {
    factor,
    rows: rows.map((r) => ({
      code: r.code, ratingKva: r.ratingKva, primaryKv: r.primaryKv,
      costEgp: r.costEgp, brand: r.brand, insulation: r.insulation,
    })),
  };
}

/** Write a TRANSFORMER snapshot at the shared price-book version (no-op when the table is empty).
 *  Called by BOTH publish paths in pricing.controller so the transformer database moves with the
 *  same version as RMU and LV. */
export async function snapshotTransformer(version: number): Promise<void> {
  if ((await prisma.transformerPrice.count()) === 0) return;
  const payload = await buildTransformerPayload();
  await prisma.priceSnapshot.create({
    data: { domain: "TRANSFORMER", version, payload: JSON.stringify(payload), rowCount: payload.rows.length },
  });
}
