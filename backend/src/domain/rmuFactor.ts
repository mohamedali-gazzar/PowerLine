// RMU selling factor + cost helpers, mirroring the Transformer's cost/factor model.
//
// The RMU database now stores a COST per row (RmuPrice.costUsd, edited via the Excel round-trip).
// The SELLING price the pricing engine reads is RmuPrice.priceUsd = round(cost / factor), where the
// factor is one scalar (PriceSetting scope "RMU" key "factor", default 0.85). Keeping priceUsd
// authoritative means the engine, priceForConfig and the offer snapshot are all untouched.
//
// This module deliberately imports nothing from the pricing controllers, so pricing.controller can
// read the factor / run the back-fill without an import cycle.

import { prisma } from "../lib/prisma";

export const RMU_DEFAULT_FACTOR = 0.85;

/** The RMU selling factor (selling = round(cost / factor)). Falls back to the default when unset. */
export async function getRmuFactor(): Promise<number> {
  const row = await prisma.priceSetting.findUnique({
    where: { scope_key: { scope: "RMU", key: "factor" } },
  });
  const f = row?.num;
  return typeof f === "number" && f > 0 ? f : RMU_DEFAULT_FACTOR;
}

/** Selling price from a cost + factor: round(cost / factor); at factor 0, sell at cost. */
export const sellRmu = (cost: number, factor: number): number => (factor > 0 ? Math.round(cost / factor) : cost);

/**
 * One-time, idempotent back-fill. Before this feature, RMU rows held only priceUsd (the selling
 * price) and no cost. The owner's rule: treat those prices as "selling on the 0.85 factor", so
 * cost = priceUsd * factor. We set the cost and LEAVE priceUsd untouched, so no existing RMU offer
 * moves (cost / factor still rounds back to the same priceUsd). Only rows still at cost 0 with a
 * real price are touched, so re-running does nothing.
 */
export async function backfillRmuCost(): Promise<number> {
  const factor = await getRmuFactor();
  const rows = await prisma.rmuPrice.findMany({
    where: { costUsd: 0, priceUsd: { gt: 0 } },
    select: { id: true, priceUsd: true },
  });
  for (const r of rows) {
    await prisma.rmuPrice.update({ where: { id: r.id }, data: { costUsd: r.priceUsd * factor } });
  }
  return rows.length;
}
