// LV price list — the 2,121 components and 253 enclosures.
//
// Seeding is driven by the BROWSER in chunks: the catalogue JSON lives in the
// frontend bundle, not in the serverless function, and a 2,374-row write would
// exceed the function time limit in one go. Each chunk is idempotent, so a
// failed or timed-out chunk is simply re-posted at the same offset.

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";

const componentSchema = z.object({
  sortIndex: z.number().int().min(0),
  t: z.string().default(""),
  f: z.string().default(""),
  r: z.string().default(""),
  d: z.string().default(""),
  n: z.string().default(""),
  ref: z.string().default(""),
  eur: z.number().default(0),
  egp: z.number().default(0),
  poles: z.number().int().default(0),
  cuP: z.number().default(0),
  cuC: z.number().default(0),
  brand: z.string().default(""),
  stock: z.string().default(""),
});

const enclosureSchema = z.object({
  sortIndex: z.number().int().min(0),
  fam: z.string().default(""),
  name: z.string().default(""),
  ref: z.string().default(""),
  abb: z.string().default(""),
  eur: z.number().default(0),
  egp: z.number().default(0),
  ip: z.string().default(""),
  H: z.number().int().default(0),
  W: z.number().int().default(0),
  D: z.number().int().default(0),
  mount: z.string().default(""),
  ral: z.string().default("7035"),
});

const chunkSchema = z.object({
  stage: z.enum(["LV_COMPONENTS", "LV_ENCLOSURES"]),
  offset: z.number().int().min(0),
  rows: z.array(z.unknown()).max(400),
});

const searchText = (...parts: string[]) => parts.join(" ").toLowerCase();

/** POST /api/pricing/lv/seed-chunk — import one slice of the catalogue. */
export async function postLvSeedChunk(req: Request, res: Response) {
  try {
    const { stage, offset, rows } = chunkSchema.parse(req.body);
    const by = req.userEmail ?? "";

    if (stage === "LV_COMPONENTS") {
      const parsed = rows.map((r) => componentSchema.parse(r));
      // Replace this slice wholesale so a re-post can never duplicate rows.
      await prisma.$transaction([
        prisma.lvComponent.deleteMany({
          where: { sortIndex: { gte: offset, lt: offset + parsed.length } },
        }),
        prisma.lvComponent.createMany({
          data: parsed.map((c) => ({
            ...c,
            brand: c.brand || "ABB",
            search: searchText(c.t, c.f, c.r, c.d, c.n, c.ref, c.brand),
            updatedBy: by,
          })),
        }),
      ]);
    } else {
      const parsed = rows.map((r) => enclosureSchema.parse(r));
      await prisma.$transaction([
        prisma.lvEnclosure.deleteMany({
          where: { sortIndex: { gte: offset, lt: offset + parsed.length } },
        }),
        prisma.lvEnclosure.createMany({
          data: parsed.map((e) => ({
            ...e,
            search: searchText(e.fam, e.name, e.ref, e.abb, e.ip, e.mount),
            updatedBy: by,
          })),
        }),
      ]);
    }

    await prisma.priceBook.update({
      where: { id: "singleton" },
      data: { seedStage: stage, seedCursor: offset + rows.length },
    });

    const [components, enclosures] = await Promise.all([
      prisma.lvComponent.count(),
      prisma.lvEnclosure.count(),
    ]);
    res.json({ ok: true, imported: rows.length, components, enclosures });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/lv/settings — the LV factors (EUR rate, copper, VAT…). */
export async function postLvSettings(req: Request, res: Response) {
  try {
    const factors = req.body?.factors;
    if (!factors || typeof factors !== "object") {
      return res.status(400).json({ error: "No factors supplied." });
    }
    const by = req.userEmail ?? "";
    let saved = 0;
    for (const [key, value] of Object.entries(factors as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        await prisma.priceSetting.upsert({
          where: { scope_key: { scope: "LV", key } },
          update: { num: value, updatedBy: by },
          create: { scope: "LV", key, num: value, updatedBy: by },
        });
        saved++;
      } else if (value && typeof value === "object") {
        // nested "forms" map
        for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) {
          if (typeof v2 === "number" && Number.isFinite(v2)) {
            await prisma.priceSetting.upsert({
              where: { scope_key: { scope: "LV", key: `${key}.${k2}` } },
              update: { num: v2, updatedBy: by },
              create: { scope: "LV", key: `${key}.${k2}`, num: v2, updatedBy: by },
            });
            saved++;
          }
        }
      }
    }
    res.json({ ok: true, saved });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/lv — paged, filtered list for the price screen.
 *  Filtering uses the lowercase `search` column so local SQLite and production
 *  Postgres behave identically. */
export async function listLvPrices(req: Request, res: Response) {
  try {
    const kind = req.query.kind === "enclosures" ? "enclosures" : "components";
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const type = String(req.query.type ?? "").trim();
    const brand = String(req.query.brand ?? "").trim();
    const fam = String(req.query.fam ?? "").trim();
    const onlyNoPrice = req.query.noPrice === "1";
    const page = Math.max(0, Number(req.query.page ?? 0));
    const take = Math.min(200, Math.max(10, Number(req.query.take ?? 50)));

    if (kind === "components") {
      const where: Record<string, unknown> = {};
      if (q) where.search = { contains: q };
      if (type) where.t = type;
      if (brand) where.brand = brand;
      if (onlyNoPrice) where.AND = [{ eur: 0 }, { egp: 0 }];
      const [rows, total] = await Promise.all([
        prisma.lvComponent.findMany({ where, orderBy: { sortIndex: "asc" }, skip: page * take, take }),
        prisma.lvComponent.count({ where }),
      ]);
      return res.json({ kind, rows, total, page, take });
    }

    const where: Record<string, unknown> = {};
    if (q) where.search = { contains: q };
    if (fam) where.fam = fam;
    if (onlyNoPrice) where.AND = [{ eur: 0 }, { egp: 0 }];
    const [rows, total] = await Promise.all([
      prisma.lvEnclosure.findMany({ where, orderBy: { sortIndex: "asc" }, skip: page * take, take }),
      prisma.lvEnclosure.count({ where }),
    ]);
    res.json({ kind, rows, total, page, take });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/lv/facets — the dropdown values for the filters. */
export async function getLvFacets(_req: Request, res: Response) {
  try {
    const [types, brands, fams] = await Promise.all([
      prisma.lvComponent.findMany({ distinct: ["t"], select: { t: true }, orderBy: { t: "asc" } }),
      prisma.lvComponent.findMany({ distinct: ["brand"], select: { brand: true }, orderBy: { brand: "asc" } }),
      prisma.lvEnclosure.findMany({ distinct: ["fam"], select: { fam: true }, orderBy: { fam: "asc" } }),
    ]);
    res.json({
      types: types.map((x) => x.t).filter(Boolean),
      brands: brands.map((x) => x.brand).filter(Boolean),
      families: fams.map((x) => x.fam).filter(Boolean),
    });
  } catch (e) {
    fail(res, e);
  }
}

/** PATCH /api/pricing/lv/:id — change one LV price (EUR or EGP). */
export async function updateLvPrice(req: Request, res: Response) {
  try {
    const kind = req.query.kind === "enclosures" ? "enclosures" : "components";
    const eur = Number(req.body?.eur ?? 0);
    const egp = Number(req.body?.egp ?? 0);
    if (!Number.isFinite(eur) || !Number.isFinite(egp) || eur < 0 || egp < 0) {
      return res.status(400).json({ error: "Enter a valid price." });
    }
    if (eur > 0 && egp > 0) {
      return res.status(400).json({
        error: "Price the item in ONE currency — set the other to 0. (EUR wins if both are filled.)",
      });
    }
    const by = req.userEmail ?? "";

    if (kind === "components") {
      const row = await prisma.lvComponent.findUnique({ where: { id: req.params.id } });
      if (!row) return res.status(404).json({ error: "Item not found." });
      const updated = await prisma.lvComponent.update({ where: { id: row.id }, data: { eur, egp, updatedBy: by } });
      await prisma.priceChange.create({
        data: {
          domain: "LV", entity: "LvComponent", entityId: row.id,
          label: row.d || row.n || row.ref, field: "price",
          oldValue: `${row.eur} EUR / ${row.egp} EGP`, newValue: `${eur} EUR / ${egp} EGP`,
          actorId: req.userId ?? null, actorEmail: by,
        },
      });
      return res.json({ ok: true, row: updated });
    }

    const row = await prisma.lvEnclosure.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: "Item not found." });
    const updated = await prisma.lvEnclosure.update({ where: { id: row.id }, data: { eur, egp, updatedBy: by } });
    await prisma.priceChange.create({
      data: {
        domain: "LV", entity: "LvEnclosure", entityId: row.id,
        label: row.name || row.ref, field: "price",
        oldValue: `${row.eur} EUR / ${row.egp} EGP`, newValue: `${eur} EUR / ${egp} EGP`,
        actorId: req.userId ?? null, actorEmail: by,
      },
    });
    res.json({ ok: true, row: updated });
  } catch (e) {
    fail(res, e);
  }
}

/** Rebuild the LV catalogue payload from the draft rows — the exact shape the
 *  frontend catalogue expects, in sortIndex order (the order is load-bearing:
 *  the combination builders take the FIRST description match). */
export async function buildLvPayload() {
  const [components, enclosures, settings] = await Promise.all([
    prisma.lvComponent.findMany({ orderBy: { sortIndex: "asc" } }),
    prisma.lvEnclosure.findMany({ orderBy: { sortIndex: "asc" } }),
    prisma.priceSetting.findMany({ where: { scope: "LV" } }),
  ]);

  const factors: Record<string, number | Record<string, number>> = {};
  for (const s of settings) {
    if (s.num == null) continue;
    if (s.key.includes(".")) {
      const [group, k] = s.key.split(".");
      ((factors[group] ??= {}) as Record<string, number>)[k] = s.num;
    } else factors[s.key] = s.num;
  }

  return {
    components: components.map((c) => ({
      t: c.t, f: c.f, r: c.r, d: c.d, n: c.n, ref: c.ref,
      eur: c.eur, egp: c.egp, poles: c.poles, cuP: c.cuP, cuC: c.cuC,
      brand: c.brand, stock: c.stock,
    })),
    enclosures: enclosures.map((e) => ({
      fam: e.fam, name: e.name, ref: e.ref, abb: e.abb, eur: e.eur, egp: e.egp,
      ip: e.ip, H: e.H, W: e.W, D: e.D, mount: e.mount, ral: e.ral,
    })),
    factors,
  };
}

/** GET /api/catalog/lv — the published LV catalogue the app loads at start-up. */
export async function getLvCatalog(_req: Request, res: Response) {
  try {
    const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });
    if (!book || book.version === 0 || book.source === "json") {
      return res.json({ source: "bundled", version: 0, data: null });
    }
    const snap = await prisma.priceSnapshot.findUnique({
      where: { domain_version: { domain: "LV", version: book.version } },
    });
    if (!snap) return res.json({ source: "bundled", version: 0, data: null });
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("ETag", `"lv-${book.version}"`);
    res.json({ source: "db", version: book.version, data: JSON.parse(snap.payload) });
  } catch (e) {
    fail(res, e);
  }
}
