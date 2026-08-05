// Price-list API — Stage 1: read the published list + the one-time first import.
// Editing endpoints arrive in Stage 2.

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { buildPriceKey, type RmuConfigInput } from "../domain/assembly";
import { lucyKey } from "../domain/lucy";
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
/**
 * True when the price list customers are served is older than the prices in the
 * database.
 *
 * Not the same question as "are there unpublished edits". Prices can reach the
 * database without going through the editor — a catalogue import, or the
 * first-run seed — and those write no PriceChange rows. Judging by edit rows
 * alone reported "up to date" while quotations were still being priced from an
 * older snapshot, with no way to publish. Comparing timestamps catches every
 * route into the data, however it got there.
 */
async function livePriceListIsBehind(): Promise<boolean> {
  const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });
  if (!book || book.version === 0 || book.source === "json") return false;

  const [rmu, comp, encl, setting] = await Promise.all([
    prisma.rmuPrice.aggregate({ _max: { updatedAt: true } }),
    prisma.lvComponent.aggregate({ _max: { updatedAt: true } }),
    prisma.lvEnclosure.aggregate({ _max: { updatedAt: true } }),
    prisma.priceSetting.aggregate({ _max: { updatedAt: true } }),
  ]);
  const latestData = [
    rmu._max.updatedAt, comp._max.updatedAt, encl._max.updatedAt, setting._max.updatedAt,
  ].reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);
  if (!latestData) return false;

  const snaps = await prisma.priceSnapshot.findMany({
    where: { version: book.version },
    select: { domain: true, createdAt: true },
  });
  if (!snaps.length) return true;

  // An LV catalogue that has never been published is behind by definition.
  const lvRows = await prisma.lvComponent.count();
  if (lvRows > 0 && !snaps.some((s) => s.domain === "LV")) return true;

  const published = snaps.reduce((a, s) => (s.createdAt > a ? s.createdAt : a), snaps[0].createdAt);
  // A second of slack: the snapshot is written moments after the rows it covers.
  return latestData.getTime() > published.getTime() + 1000;
}

export async function getStatus(req: Request, res: Response) {
  try {
    await refreshPriceBook();
    const [book, rmuCount, settingCount, lvComponents, lvEnclosures, role, behind] = await Promise.all([
      prisma.priceBook.findUnique({ where: { id: "singleton" } }),
      prisma.rmuPrice.count(),
      prisma.priceSetting.count(),
      prisma.lvComponent.count(),
      prisma.lvEnclosure.count(),
      roleOf(req.userId),
      livePriceListIsBehind(),
    ]);
    const info = priceBookInfo();
    res.json({
      role,
      canEdit: role === "PRICE_ADMIN" || role === "OWNER",
      version: info.version,
      source: info.source,
      stale: info.stale,
      seedState: book?.seedState ?? "EMPTY",
      /** Database prices are newer than the published list — publishing is needed. */
      behindLive: behind,
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

// ── Adding a product ─────────────────────────────────────────────────────────
// The price key is DERIVED here from the attributes, using the very same builder
// the configurator uses to look a price up. A person never types it — which is
// what makes it impossible to save a row that nothing can ever find. (The old
// Excel sheet accepted any hand-typed key, so a typo became a dead price that
// silently never applied.)

const ADDON_KEYS = ["outdoorEnclosure", "shuntTrip", "auxiliarySwitch"] as const;

const createSchema = z
  .object({
    kind: z.enum(["PANEL", "LUCY", "RTU", "ADDON"]),
    priceUsd: z.number().positive("Enter a price greater than 0."),
    // PANEL
    family: z.enum(["P-RAL", "P-SEC", "P-SEC.M"]).optional(),
    voltageKv: z.union([z.literal(12), z.literal(24)]).optional(),
    // PANEL + LUCY
    nalCount: z.number().int().min(0).max(5).optional(),
    nalfCount: z.number().int().min(0).max(2).optional(),
    hasMetering: z.boolean().optional(),
    withFuse: z.boolean().optional(),
    // RTU
    productType: z.enum(["PSEC", "LUCY"]).optional(),
    rtuLevel: z.enum(["READY1", "READY2", "SMART1", "SMART2"]).optional(),
    // ADDON
    addOnKey: z.enum(ADDON_KEYS).optional(),
    label: z.string().trim().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    if (v.kind === "PANEL") {
      need(!!v.family, "Choose the product family.");
      need(v.voltageKv === 12 || v.voltageKv === 24, "Choose the voltage.");
      need(v.nalCount != null, "Enter the number of ring ways.");
      need(v.nalfCount != null, "Enter the number of transformer ways.");
    } else if (v.kind === "LUCY") {
      need(v.nalCount != null, "Enter the number of feeders.");
      need(v.nalfCount != null, "Enter the number of transformers.");
    } else if (v.kind === "RTU") {
      need(!!v.productType, "Choose the product.");
      need(!!v.rtuLevel, "Choose the Smart/RTU level.");
    } else if (v.kind === "ADDON") {
      need(!!v.addOnKey, "Choose which add-on this is.");
      need(!!v.label && v.label.trim().length >= 3, "Enter the name printed on the customer's offer.");
    }
  });

type CreateInput = z.infer<typeof createSchema>;

/** Build the price key the configurator will look for. */
function derivePriceKeyFor(v: CreateInput): string {
  if (v.kind === "PANEL") {
    const productType = v.family === "P-RAL" ? "PRAL" : "PSEC";
    const lbsBrand = v.family === "P-SEC.M" ? "MURGE" : "ABB";
    return buildPriceKey({
      productType,
      lbsBrand,
      clientSpec: "EECH",
      voltageKv: v.voltageKv,
      nalCount: v.nalCount,
      nalfCount: v.nalfCount,
      hasMetering: !!v.hasMetering,
      meteringWithFuse: !!v.hasMetering && !!v.withFuse,
      rtuType: "NONE",
      installation: "INDOOR",
      busbarCurrentA: 630,
    } as unknown as RmuConfigInput);
  }
  if (v.kind === "LUCY") {
    return lucyKey({ nalCount: v.nalCount!, nalfCount: v.nalfCount!, hasMetering: !!v.hasMetering });
  }
  if (v.kind === "RTU") return `${v.productType}:${v.rtuLevel}`;
  return v.addOnKey!;
}

/** POST /api/pricing/rmu/derive-key — live preview of the code, so the person
 *  adding a product sees exactly what the app will look for before saving. */
export async function postDeriveKey(req: Request, res: Response) {
  try {
    const input = createSchema.parse({ ...req.body, priceUsd: req.body?.priceUsd || 1 });
    const key = derivePriceKeyFor(input);
    const existing = await prisma.rmuPrice.findUnique({ where: { kind_key: { kind: input.kind, key } } });
    res.json({ key, exists: !!existing, existingPrice: existing?.priceUsd ?? null });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/rmu — add a product to the DRAFT price list. */
export async function createRmuPrice(req: Request, res: Response) {
  try {
    const input = createSchema.parse(req.body);
    const key = derivePriceKeyFor(input);

    const existing = await prisma.rmuPrice.findUnique({ where: { kind_key: { kind: input.kind, key } } });
    if (existing) {
      return res.status(409).json({
        error: `That product is already in the list as ${key} — edit its price instead of adding it again.`,
        key,
      });
    }

    const user = req.userId ? await prisma.user.findUnique({ where: { id: req.userId } }) : null;
    const row = await prisma.rmuPrice.create({
      data: {
        kind: input.kind,
        key,
        priceUsd: input.priceUsd,
        label: input.label ?? "",
        family: input.family ?? null,
        voltageKv: input.voltageKv ?? null,
        nalCount: input.nalCount ?? null,
        nalfCount: input.nalfCount ?? null,
        hasMetering: !!input.hasMetering,
        withFuse: !!input.withFuse,
        productType: input.productType ?? null,
        rtuLevel: input.rtuLevel ?? null,
        updatedBy: user?.email ?? "",
      },
    });
    await prisma.priceChange.create({
      data: {
        domain: "RMU",
        entity: "RmuPrice",
        entityId: row.id,
        label: row.label || row.key,
        field: "__created",
        newValue: String(row.priceUsd),
        actorId: req.userId ?? null,
        actorEmail: user?.email ?? "",
      },
    });
    res.status(201).json({ ok: true, row });
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

    // Publish the LV catalogue at the SAME version, so both halves of the price
    // book always move together and can be rolled back as one.
    const lvCount = await prisma.lvComponent.count();
    if (lvCount > 0) {
      const { buildLvPayload } = await import("./pricing-lv.controller");
      const lv = await buildLvPayload();
      await prisma.priceSnapshot.create({
        data: {
          domain: "LV",
          version,
          payload: JSON.stringify(lv),
          rowCount: lv.components.length + lv.enclosures.length,
        },
      });
    }
    await prisma.priceBook.update({
      where: { id: "singleton" },
      data: { version, publishedAt: new Date(), publishedBy: user?.email ?? "", note, source: "db" },
    });
    await prisma.priceChange.updateMany({ where: { version: null }, data: { version } });

    await refreshPriceBook(true); // force: the publisher must never see stale numbers
    await pruneSnapshots();
    res.json({ ok: true, version });
  } catch (e) {
    fail(res, e);
  }
}

/** Keep the recent versions so a rollback is still possible, drop the rest —
 *  an LV payload is ~500 KB and publishing now happens on every change. */
const KEEP_VERSIONS = 15;
async function pruneSnapshots(): Promise<void> {
  const versions = await prisma.priceSnapshot.findMany({
    distinct: ["version"],
    select: { version: true },
    orderBy: { version: "desc" },
    take: KEEP_VERSIONS,
  });
  if (versions.length < KEEP_VERSIONS) return;
  const cutoff = versions[versions.length - 1].version;
  await prisma.priceSnapshot.deleteMany({ where: { version: { lt: cutoff } } });
}

/**
 * Push the current database prices live.
 *
 * Called after every price write so that changing a price and it reaching a
 * quotation are the same act. The draft-then-publish gap was a review step,
 * but in practice it stranded the price list: prices arriving by import or by
 * the first-run copy left nothing to "review", so the button sat disabled
 * while quotations kept serving older numbers. History and Undo still cover
 * the mistakes the gap was there to catch.
 *
 * Never throws: a price edit that saved must not report failure because the
 * publish half had a problem — the list can always be published by hand.
 */
export async function publishCurrentPrices(actorEmail: string, note: string): Promise<number | null> {
  return (await publishCurrentPricesDetailed(actorEmail, note)).version;
}

/**
 * As publishCurrentPrices, but says WHY it declined.
 *
 * The guards below are RMU-side, so an unrelated gap there (a panel priced 0, a
 * missing add-on) silently stopped an LV catalogue import from reaching anyone:
 * the draft updated, the snapshot did not, and the app kept serving old data
 * with no visible reason. Callers surface `blockers` so that is never invisible.
 */
export async function publishCurrentPricesDetailed(
  actorEmail: string,
  note: string,
): Promise<{ version: number | null; blockers: string[] }> {
  const blocked = (blockers: string[]) => ({ version: null, blockers });
  try {
    const built = await buildRmuPayload();
    // The same guards as a manual publish — never send a broken list to quoting.
    const bad: string[] = [];
    for (const [k, v] of Object.entries(built.panels)) if (!(v > 0)) bad.push(`RMU panel “${k}” has no price`);
    for (const [k, v] of Object.entries(built.lucy)) if (!(v > 0)) bad.push(`Lucy “${k}” has no price`);
    if (!built.addOns.outdoorEnclosure) bad.push("The Outdoor Enclosure add-on is missing");
    if (bad.length) return blocked(bad);

    const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });
    const version = (book?.version ?? 0) + 1;

    await prisma.priceSnapshot.create({
      data: {
        domain: "RMU",
        version,
        payload: JSON.stringify(built),
        rowCount: Object.keys(built.panels).length + Object.keys(built.lucy).length,
      },
    });

    if ((await prisma.lvComponent.count()) > 0) {
      const { buildLvPayload } = await import("./pricing-lv.controller");
      const lv = await buildLvPayload();
      await prisma.priceSnapshot.create({
        data: {
          domain: "LV",
          version,
          payload: JSON.stringify(lv),
          rowCount: lv.components.length + lv.enclosures.length,
        },
      });
    }

    await prisma.priceBook.update({
      where: { id: "singleton" },
      data: { version, publishedAt: new Date(), publishedBy: actorEmail, note, source: "db" },
    });
    await prisma.priceChange.updateMany({ where: { version: null }, data: { version } });
    await refreshPriceBook(true);
    await pruneSnapshots();
    return { version, blockers: [] };
  } catch (e) {
    // the edit itself succeeded; publishing can be retried by hand
    return blocked([e instanceof Error ? e.message : "Publishing failed."]);
  }
}

/** GET /api/pricing/history — who changed what, newest first. */
export async function getHistory(_req: Request, res: Response) {
  try {
    const changes = await prisma.priceChange.findMany({ orderBy: { createdAt: "desc" }, take: 150 });
    res.json({ changes });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/changes/:id/undo — reverse one change.
 *
 *  Applied as a NEW forward change, never by rewriting history: the audit trail
 *  stays a complete record of what happened, including the undo itself. */
export async function postUndo(req: Request, res: Response) {
  try {
    const change = await prisma.priceChange.findUnique({ where: { id: req.params.id } });
    if (!change) return res.status(404).json({ error: "Change not found." });
    if (change.entity !== "RmuPrice") {
      return res.status(400).json({ error: "That change cannot be undone automatically." });
    }
    const row = await prisma.rmuPrice.findUnique({ where: { id: change.entityId } });
    if (!row) return res.status(404).json({ error: "That product no longer exists." });

    const user = req.userId ? await prisma.user.findUnique({ where: { id: req.userId } }) : null;
    const actor = { actorId: req.userId ?? null, actorEmail: user?.email ?? "" };
    let field = "";
    let oldValue = "";
    let newValue = "";

    if (change.field === "priceUsd" && change.oldValue != null) {
      const back = Number(change.oldValue);
      if (!Number.isFinite(back) || back <= 0) return res.status(400).json({ error: "The previous price is not valid." });
      await prisma.rmuPrice.update({ where: { id: row.id }, data: { priceUsd: back, updatedBy: actor.actorEmail } });
      field = "priceUsd";
      oldValue = String(row.priceUsd);
      newValue = String(back);
    } else if (change.field === "__retired" || change.field === "__created") {
      // undo a retire → offer it again;  undo an add → stop offering it
      const active = change.field === "__retired";
      await prisma.rmuPrice.update({ where: { id: row.id }, data: { active, updatedBy: actor.actorEmail } });
      field = active ? "__restored" : "__retired";
      oldValue = row.active ? "offered" : "retired";
      newValue = active ? "offered" : "retired";
    } else if (change.field === "__restored") {
      await prisma.rmuPrice.update({ where: { id: row.id }, data: { active: false, updatedBy: actor.actorEmail } });
      field = "__retired";
      oldValue = "offered";
      newValue = "retired";
    } else {
      return res.status(400).json({ error: "That change cannot be undone automatically." });
    }

    await prisma.priceChange.create({
      data: {
        domain: "RMU",
        entity: "RmuPrice",
        entityId: row.id,
        label: row.label || row.key,
        field,
        oldValue,
        newValue,
        ...actor,
      },
    });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/users — who can edit prices (owner only). */
export async function listUsers(_req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true },
      orderBy: { email: "asc" },
    });
    res.json({ users });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/users/:id/role — grant or remove price-editing access. */
export async function setUserRole(req: Request, res: Response) {
  try {
    const role = String(req.body?.role ?? "");
    if (!["USER", "PRICE_ADMIN", "OWNER"].includes(role)) {
      return res.status(400).json({ error: "Unknown access level." });
    }
    if (req.params.id === req.userId && role !== "OWNER") {
      return res.status(400).json({ error: "You cannot remove your own owner access — ask another owner to do it." });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: "User not found." });

    const actor = req.userId ? await prisma.user.findUnique({ where: { id: req.userId } }) : null;
    await prisma.user.update({ where: { id: target.id }, data: { role } });
    await prisma.priceChange.create({
      data: {
        domain: "RMU",
        entity: "User",
        entityId: target.id,
        label: target.email,
        field: "role",
        oldValue: target.role,
        newValue: role,
        actorId: req.userId ?? null,
        actorEmail: actor?.email ?? "",
      },
    });
    res.json({ ok: true });
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
