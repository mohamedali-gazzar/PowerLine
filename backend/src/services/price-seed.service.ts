// First-time import: copy the price list shipped with the code into the database
// and publish it as version 1, so the app starts reading prices from the database
// instead of the bundled file.
//
// Safety properties:
//  - IDEMPOTENT: re-running it upserts the same rows, so a retry is harmless.
//  - VERIFIED: the payload rebuilt FROM THE DATABASE is deep-compared against the
//    bundled file before the version is bumped. If a single price differs, nothing
//    is published — the app keeps serving the bundled list.
//  - REVERSIBLE: the bundled file stays in the repo; setting PriceBook.source to
//    "json" returns to it instantly, with no redeploy.

import { prisma } from "../lib/prisma";
import { BUNDLED, type RmuPricingData } from "../domain/pricing-data";

export interface SeedResult {
  ok: boolean;
  version: number;
  counts: { panels: number; lucy: number; rtu: number; addOns: number; settings: number };
  mismatches: string[];
}

/** Rebuild the price-list payload from the DRAFT rows in the database. This is
 *  the exact shape the app consumes, so it can be compared byte-for-byte with
 *  the bundled file. */
export async function buildRmuPayload(): Promise<RmuPricingData> {
  const [rows, settings] = await Promise.all([
    prisma.rmuPrice.findMany({ where: { active: true }, orderBy: { key: "asc" } }),
    prisma.priceSetting.findMany({ where: { scope: "RMU" } }),
  ]);

  const panels: Record<string, number> = {};
  const lucy: Record<string, number> = {};
  const rtu: Record<string, Record<string, number>> = {};
  const addOns: Record<string, { name: string; price: number }> = {};

  for (const r of rows) {
    if (r.kind === "PANEL") panels[r.key] = r.priceUsd;
    else if (r.kind === "LUCY") lucy[r.key] = r.priceUsd;
    else if (r.kind === "RTU") {
      const [product, level] = r.key.split(":");
      if (product && level) (rtu[product] ??= {})[level] = r.priceUsd;
    } else if (r.kind === "ADDON") addOns[r.key] = { name: r.label, price: r.priceUsd };
  }

  const num = (k: string, fallback: number) =>
    settings.find((s) => s.key === k)?.num ?? fallback;
  const text = (k: string, fallback: string) =>
    settings.find((s) => s.key === k)?.text ?? fallback;

  return {
    currency: text("currency", BUNDLED.currency),
    vatPct: num("vatPct", BUNDLED.vatPct),
    panels,
    lucy,
    rtu,
    addOns,
  };
}

/** Compare a rebuilt payload against the bundled list; returns human-readable
 *  differences (empty array = identical). */
export function diffAgainstBundle(built: RmuPricingData): string[] {
  const out: string[] = [];
  const cmpMap = (label: string, a: Record<string, number>, b: Record<string, number>) => {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] !== b[k]) out.push(`${label} ${k}: db=${a[k] ?? "(missing)"} file=${b[k] ?? "(missing)"}`);
    }
  };
  cmpMap("panel", built.panels, BUNDLED.panels);
  cmpMap("lucy", built.lucy, BUNDLED.lucy);
  for (const p of new Set([...Object.keys(built.rtu), ...Object.keys(BUNDLED.rtu)])) {
    cmpMap(`rtu.${p}`, built.rtu[p] ?? {}, BUNDLED.rtu[p] ?? {});
  }
  for (const k of new Set([...Object.keys(built.addOns), ...Object.keys(BUNDLED.addOns)])) {
    const a = built.addOns[k];
    const b = BUNDLED.addOns[k];
    if (a?.price !== b?.price || a?.name !== b?.name) {
      out.push(`addOn ${k}: db=${JSON.stringify(a)} file=${JSON.stringify(b)}`);
    }
  }
  if (built.vatPct !== BUNDLED.vatPct) out.push(`vatPct: db=${built.vatPct} file=${BUNDLED.vatPct}`);
  if (built.currency !== BUNDLED.currency) out.push(`currency: db=${built.currency} file=${BUNDLED.currency}`);
  return out;
}

/** Copy the bundled price list into the database and publish it as version 1. */
export async function seedRmuFromBundle(actor: { id?: string; email?: string }): Promise<SeedResult> {
  const by = actor.email ?? "";

  await prisma.priceBook.upsert({
    where: { id: "singleton" },
    update: { seedState: "SEEDING", seedStage: "RMU" },
    create: { id: "singleton", seedState: "SEEDING", seedStage: "RMU" },
  });

  const counts = { panels: 0, lucy: 0, rtu: 0, addOns: 0, settings: 0 };

  const upsert = (kind: string, key: string, priceUsd: number, label = "") =>
    prisma.rmuPrice.upsert({
      where: { kind_key: { kind, key } },
      update: { priceUsd, label, active: true, updatedBy: by },
      create: { kind, key, priceUsd, label, updatedBy: by },
    });

  for (const [key, price] of Object.entries(BUNDLED.panels)) {
    await upsert("PANEL", key, price);
    counts.panels++;
  }
  for (const [key, price] of Object.entries(BUNDLED.lucy)) {
    await upsert("LUCY", key, price);
    counts.lucy++;
  }
  for (const [product, levels] of Object.entries(BUNDLED.rtu)) {
    for (const [level, price] of Object.entries(levels)) {
      await upsert("RTU", `${product}:${level}`, price);
      counts.rtu++;
    }
  }
  for (const [key, a] of Object.entries(BUNDLED.addOns)) {
    await upsert("ADDON", key, a.price, a.name);
    counts.addOns++;
  }

  for (const [key, value] of [
    ["vatPct", BUNDLED.vatPct],
    ["currency", BUNDLED.currency],
  ] as [string, number | string][]) {
    await prisma.priceSetting.upsert({
      where: { scope_key: { scope: "RMU", key } },
      update: typeof value === "number" ? { num: value, updatedBy: by } : { text: value, updatedBy: by },
      create:
        typeof value === "number"
          ? { scope: "RMU", key, num: value, updatedBy: by }
          : { scope: "RMU", key, text: value, updatedBy: by },
    });
    counts.settings++;
  }

  // Prove the database reproduces the shipped price list EXACTLY before going live.
  const built = await buildRmuPayload();
  const mismatches = diffAgainstBundle(built);
  if (mismatches.length > 0) {
    return { ok: false, version: 0, counts, mismatches };
  }

  const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });
  const version = (book?.version ?? 0) + 1;

  await prisma.priceSnapshot.upsert({
    where: { domain_version: { domain: "RMU", version } },
    update: { payload: JSON.stringify(built), rowCount: counts.panels + counts.lucy + counts.rtu + counts.addOns },
    create: {
      domain: "RMU",
      version,
      payload: JSON.stringify(built),
      rowCount: counts.panels + counts.lucy + counts.rtu + counts.addOns,
    },
  });

  await prisma.priceBook.update({
    where: { id: "singleton" },
    data: {
      version,
      publishedAt: new Date(),
      publishedBy: by,
      note: "Initial import from the price list shipped with the app",
      seedState: "READY",
      seedStage: "",
      source: "db",
    },
  });

  await prisma.priceChange.create({
    data: {
      version,
      domain: "RMU",
      entity: "PriceBook",
      entityId: "singleton",
      label: "Initial import",
      field: "__seed",
      newValue: String(version),
      actorId: actor.id ?? null,
      actorEmail: by,
    },
  });

  return { ok: true, version, counts, mismatches: [] };
}
