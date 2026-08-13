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
import { publishCurrentPrices } from "./pricing.controller";
import { combosForPayload } from "./pricing-lv-combos.controller";

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
      await publishCurrentPrices(by, `Price change: ${row.d || row.ref}`);
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
    await publishCurrentPrices(by, `Price change: ${row.name || row.ref}`);
    res.json({ ok: true, row: updated });
  } catch (e) {
    fail(res, e);
  }
}

/**
 * PATCH /api/pricing/lv/:id/poles — set a component's pole count.
 *
 * Connection copper is costed as (copper per pole × poles), so an item recorded
 * with zero poles contributes NO copper cost at all — it is quoted for less than
 * it costs. The spreadsheet round trip can set this in bulk, but items that exist
 * only on the live site (added there, never in our catalogue file) could not be
 * corrected at all without one, which is why this is editable in the table.
 *
 * Components only: enclosures have no poles.
 */
export async function updateLvPoles(req: Request, res: Response) {
  try {
    const raw = req.body?.poles;
    const poles = Math.trunc(Number(raw));
    if (!Number.isFinite(poles) || poles < 0 || poles > 12) {
      return res.status(400).json({ error: "Enter a whole number of poles between 0 and 12." });
    }
    const row = await prisma.lvComponent.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: "Item not found." });
    if (row.poles === poles) return res.json({ ok: true, row });

    const by = req.userEmail ?? "";
    const updated = await prisma.lvComponent.update({
      where: { id: row.id },
      data: { poles, updatedBy: by },
    });
    await prisma.priceChange.create({
      data: {
        domain: "LV", entity: "LvComponent", entityId: row.id,
        label: row.d || row.n || row.ref, field: "poles",
        oldValue: String(row.poles), newValue: String(poles),
        actorId: req.userId ?? null, actorEmail: by,
      },
    });
    // Publishes like any other price edit — the copper cost changes immediately.
    await publishCurrentPrices(by, `Poles: ${row.d || row.ref}`);
    res.json({ ok: true, row: updated });
  } catch (e) {
    fail(res, e);
  }
}

const newComponentSchema = z.object({
  t: z.string().trim().min(1, "Choose or type the Type."),
  f: z.string().trim().min(1, "Enter the Family."),
  r: z.string().trim().min(1, "Enter the Rating."),
  d: z.string().trim().min(3, "Enter a Description (at least 3 characters)."),
  ref: z.string().trim().min(2, "Enter the Reference."),
  brand: z.string().trim().min(1, "Enter the Brand."),
  poles: z.number().int().min(0, "Enter the number of poles."),
  cuP: z.number().min(0).default(0), // copper kg/pole — panels
  cuC: z.number().min(0).default(0), // copper kg/pole — cells
  eur: z.number().min(0),
  egp: z.number().min(0).default(0),
});

/** POST /api/pricing/lv — add a new LV component.
 *  Only components: enclosures and cells are matched by NAME against generated
 *  cell tables, so a hand-added one would never be found by the calculator. */
export async function createLvComponent(req: Request, res: Response) {
  try {
    const v = newComponentSchema.parse(req.body);
    if (!(v.eur > 0) && !(v.egp > 0)) {
      return res.status(400).json({ error: "Enter a price (EUR, or EGP if the item is not priced in euro)." });
    }
    if (v.eur > 0 && v.egp > 0) {
      return res.status(400).json({ error: "Price the item in ONE currency — set the other to 0." });
    }

    const clash = await prisma.lvComponent.findFirst({ where: { ref: v.ref } });
    if (clash) {
      return res.status(409).json({ error: `Reference "${v.ref}" already exists — edit that item instead.` });
    }

    // Append after the current catalogue: the ORDER is load-bearing (the
    // combination builders take the first description match), so a new item must
    // never be inserted in front of an existing one.
    const last = await prisma.lvComponent.findFirst({ orderBy: { sortIndex: "desc" }, select: { sortIndex: true } });
    const sortIndex = (last?.sortIndex ?? -1) + 1;
    const by = req.userEmail ?? "";

    const row = await prisma.lvComponent.create({
      data: {
        sortIndex,
        t: v.t, f: v.f, r: v.r, d: v.d, n: v.d, ref: v.ref,
        brand: v.brand, poles: v.poles, cuP: v.cuP, cuC: v.cuC, eur: v.eur, egp: v.egp,
        search: [v.t, v.f, v.r, v.d, v.ref, v.brand].join(" ").toLowerCase(),
        updatedBy: by,
      },
    });
    await prisma.priceChange.create({
      data: {
        domain: "LV", entity: "LvComponent", entityId: row.id,
        label: row.d, field: "__created",
        newValue: v.eur > 0 ? `${v.eur} EUR` : `${v.egp} EGP`,
        actorId: req.userId ?? null, actorEmail: by,
      },
    });
    await publishCurrentPrices(by, `New item: ${row.d}`);
    res.status(201).json({ ok: true, row });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/lv/:id/retire — stop offering an LV item, or bring it back.
 *  Soft only: the row is kept, so quotations already saved are untouched (they
 *  carry their own copy of the item) and the change can be reversed. */
export async function retireLvItem(req: Request, res: Response) {
  try {
    const kind = req.query.kind === "enclosures" ? "enclosures" : "components";
    const active = req.body?.active === true;
    const by = req.userEmail ?? "";

    if (kind === "components") {
      const row = await prisma.lvComponent.findUnique({ where: { id: req.params.id } });
      if (!row) return res.status(404).json({ error: "Item not found." });
      const updated = await prisma.lvComponent.update({ where: { id: row.id }, data: { active, updatedBy: by } });
      await prisma.priceChange.create({
        data: {
          domain: "LV", entity: "LvComponent", entityId: row.id, label: row.d || row.ref,
          field: active ? "__restored" : "__retired",
          oldValue: row.active ? "offered" : "retired", newValue: active ? "offered" : "retired",
          actorId: req.userId ?? null, actorEmail: by,
        },
      });
      // Retiring used to skip this, so "Remove" changed the draft and nothing else —
      // the item kept being offered until some later edit happened to publish.
      await publishCurrentPrices(by, `${active ? "Restored" : "Removed"}: ${row.d || row.ref}`);
      return res.json({ ok: true, row: updated });
    }

    const row = await prisma.lvEnclosure.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: "Item not found." });
    const updated = await prisma.lvEnclosure.update({ where: { id: row.id }, data: { active, updatedBy: by } });
    await prisma.priceChange.create({
      data: {
        domain: "LV", entity: "LvEnclosure", entityId: row.id, label: row.name || row.ref,
        field: active ? "__restored" : "__retired",
        oldValue: row.active ? "offered" : "retired", newValue: active ? "offered" : "retired",
        actorId: req.userId ?? null, actorEmail: by,
      },
    });
    await publishCurrentPrices(by, `${active ? "Restored" : "Removed"}: ${row.name || row.ref}`);
    res.json({ ok: true, row: updated });
  } catch (e) {
    fail(res, e);
  }
}

/** Rebuild the LV catalogue payload from the draft rows — the exact shape the
 *  frontend catalogue expects, in sortIndex order (the order is load-bearing:
 *  the combination builders take the FIRST description match). */
export async function buildLvPayload() {
  const [components, enclosures, settings, combos] = await Promise.all([
    prisma.lvComponent.findMany({ orderBy: { sortIndex: "asc" } }),
    prisma.lvEnclosure.findMany({ orderBy: { sortIndex: "asc" } }),
    prisma.priceSetting.findMany({ where: { scope: "LV" } }),
    combosForPayload(),
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
    // Retired items stay in the payload with active:false — removing them
    // outright would break the combination builders, which find their parts by
    // description. The pickers filter on this flag instead.
    components: components.map((c) => ({
      t: c.t, f: c.f, r: c.r, d: c.d, n: c.n, ref: c.ref,
      eur: c.eur, egp: c.egp, poles: c.poles, cuP: c.cuP, cuC: c.cuC,
      brand: c.brand, stock: c.stock, active: c.active,
    })),
    enclosures: enclosures.map((e) => ({
      fam: e.fam, name: e.name, ref: e.ref, abb: e.abb, eur: e.eur, egp: e.egp,
      ip: e.ip, H: e.H, W: e.W, D: e.D, mount: e.mount, ral: e.ral, active: e.active,
    })),
    factors,
    // Omitted entirely when the table has not been seeded, so the client keeps
    // its bundled copy rather than being handed a half-empty set.
    ...(combos ? { combos } : {}),
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

/** How many changed items to name; the counts always cover everything. */
const CHANGE_DETAIL_CAP = 60;

/**
 * GET /api/catalog/lv/changes?since=<version>
 *
 * What actually changed in the price list, read from the audit trail — every
 * PriceChange is stamped with the version it went live in, so this is the real
 * record rather than a guess from comparing payloads.
 *
 * `since` given and behind → everything published since then. Otherwise the most
 * recent version's changes, so "what came in the last upload?" is always
 * answerable even when the caller is already up to date.
 *
 * Deliberately NOT price-admin gated: reading what changed is how someone about
 * to quote checks they are on current prices. It exposes no editing.
 */
export async function getLvCatalogChanges(req: Request, res: Response) {
  try {
    const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });
    const latest = book?.version ?? 0;
    if (!latest) return res.json({ version: 0, from: 0, counts: {}, total: 0, items: [], publishedAt: null, publishedBy: "", note: "" });

    const sinceRaw = Number(req.query.since);
    const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.min(sinceRaw, latest) : latest;
    // Behind → everything since. Current → just the newest version's changes.
    const from = since < latest ? since : latest - 1;

    const where = { domain: "LV", version: { gt: from, lte: latest } } as const;
    const [rows, total] = await Promise.all([
      prisma.priceChange.findMany({
        where,
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        take: CHANGE_DETAIL_CAP,
        select: { version: true, label: true, field: true, oldValue: true, newValue: true, actorEmail: true, createdAt: true, entity: true, entityId: true },
      }),
      prisma.priceChange.count({ where }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of await prisma.priceChange.groupBy({ by: ["field"], where, _count: { field: true } })) {
      counts[g.field] = g._count.field;
    }

    // Attach the item itself. An audit row records one field, which is not enough to
    // describe an item that was ADDED or REMOVED ("every data about it"), and not
    // enough to say whether a brand change turned the ABB discount on or off — that
    // needs the price too, since the discount only applies to EUR-priced ABB lines.
    const compIds = [...new Set(rows.filter((r) => r.entity === "LvComponent").map((r) => r.entityId))];
    const enclIds = [...new Set(rows.filter((r) => r.entity === "LvEnclosure").map((r) => r.entityId))];
    const [comps, encls] = await Promise.all([
      compIds.length
        ? prisma.lvComponent.findMany({
            where: { id: { in: compIds } },
            select: { id: true, ref: true, t: true, f: true, r: true, d: true, brand: true, poles: true, cuP: true, cuC: true, stock: true, eur: true, egp: true, active: true },
          })
        : [],
      enclIds.length
        ? prisma.lvEnclosure.findMany({
            where: { id: { in: enclIds } },
            select: { id: true, ref: true, fam: true, name: true, ip: true, mount: true, ral: true, eur: true, egp: true, active: true },
          })
        : [],
    ]);
    const detail = new Map<string, unknown>();
    for (const c of comps) detail.set(c.id, c);
    for (const e of encls) detail.set(e.id, e);

    res.setHeader("Cache-Control", "no-cache");
    res.json({
      version: latest,
      from,
      counts,
      total,
      items: rows.map((r) => ({ ...r, detail: detail.get(r.entityId) ?? null })),
      publishedAt: book?.publishedAt ?? null,
      publishedBy: book?.publishedBy ?? "",
      note: book?.note ?? "",
    });
  } catch (e) {
    fail(res, e);
  }
}
