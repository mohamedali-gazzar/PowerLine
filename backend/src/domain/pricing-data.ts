// RMU pricing provider — the ONLY module that knows where prices come from.
//
// Prices live in the database as a published PriceSnapshot, pointed at by the
// one-row PriceBook.version. `refreshPriceBook()` (called by the withPriceBook
// middleware, once per request) loads that snapshot into the module-level cache
// below; the four lookups stay SYNCHRONOUS, so priceList.ts, offer.service.ts
// and offers.controller.ts need no async refactor.
//
// The bundled src/data/rmu-pricing.json remains in the repo as three things:
//   1. the seed for the first import,
//   2. the cold-start / database-unreachable fallback, and
//   3. the kill switch — setting PriceBook.source = "json" serves it again
//      instantly, with no redeploy.
// Consumers (priceList.ts, lucy.ts, commercial.service.ts) never change.

import pricingJson from "../data/rmu-pricing.json";
import { prisma } from "../lib/prisma";

export interface AddOnPrice {
  name: string;
  price: number;
}

export interface RmuPricingData {
  currency: string;
  vatPct: number;
  panels: Record<string, number>;
  lucy: Record<string, number>;
  rtu: Record<string, Record<string, number>>;
  addOns: Record<string, AddOnPrice>;
}

/** The price list shipped with the code — fallback and seed, never edited at runtime. */
export const BUNDLED = pricingJson as unknown as RmuPricingData;

/** What the synchronous lookups below read. Swapped wholesale by refreshPriceBook. */
let DATA: RmuPricingData = BUNDLED;
let activeVersion = 0; // 0 = serving the bundled JSON
let activeSource: "bundled" | "db" = "bundled";
let lastError: string | null = null;

/** Where the prices currently being served came from (for the UI + diagnostics). */
export function priceBookInfo(): {
  version: number;
  source: "bundled" | "db";
  stale: boolean;
  error: string | null;
} {
  return { version: activeVersion, source: activeSource, stale: lastError != null, error: lastError };
}

/** Load the published price list if the live version differs from the cached one.
 *
 *  Cheap: one indexed primary-key read per request, and the (larger) snapshot
 *  read only when the version actually changed — which is what makes a publish
 *  visible on the very next request without a redeploy.
 *
 *  Never throws. If the database is unreachable we keep serving the last good
 *  data (or the bundled list) and flag it as stale, so a blip degrades reads
 *  instead of failing them. */
export async function refreshPriceBook(): Promise<void> {
  try {
    const book = await prisma.priceBook.findUnique({ where: { id: "singleton" } });

    // Not seeded yet, or the kill switch is on → serve the bundled list.
    if (!book || book.version === 0 || book.source === "json") {
      DATA = BUNDLED;
      activeVersion = 0;
      activeSource = "bundled";
      lastError = null;
      return;
    }

    if (activeSource === "db" && activeVersion === book.version) {
      lastError = null; // already current
      return;
    }

    const snap = await prisma.priceSnapshot.findUnique({
      where: { domain_version: { domain: "RMU", version: book.version } },
    });
    if (!snap) {
      // Pointer with no snapshot — keep whatever we have rather than serve nothing.
      lastError = `no RMU snapshot for version ${book.version}`;
      return;
    }

    DATA = JSON.parse(snap.payload) as RmuPricingData;
    activeVersion = book.version;
    activeSource = "db";
    lastError = null;
  } catch (e) {
    lastError = (e as Error).message;
  }
}

/** Minimum (floor) USD price for a PRAL/PSEC panel by its price key, or null. */
export function panelPrice(priceKey: string): number | null {
  return DATA.panels[priceKey] ?? null;
}

/** Lucy AEGIS PLUS selling price (USD) by config key ("2+1", "3+1+M"…), or null. */
export function lucyConfigPrice(configKey: string): number | null {
  return DATA.lucy[configKey] ?? null;
}

/** Smart/RTU add-on price (USD) for a product family + level, or null. */
export function rtuPrice(productType: string, rtuType: string): number | null {
  return DATA.rtu[productType]?.[rtuType] ?? null;
}

/** Named optional extra (outdoorEnclosure, shuntTrip, auxiliarySwitch), or null. */
export function addOnPrice(key: string): AddOnPrice | null {
  const a = DATA.addOns[key];
  return a ? { ...a } : null;
}

/** VAT percentage applied on commercial offers (e.g. 14 for Egypt).
 *  A FUNCTION, not a const: once the price list is editable online this value can
 *  change while the server is running, and a module-load constant would freeze it
 *  until the next deploy. Callers must read it per request. */
export function vatPct(): number {
  return DATA.vatPct;
}

/** Pricing currency of the master data ("USD"). Function for the same reason. */
export function pricingCurrency(): string {
  return DATA.currency;
}
