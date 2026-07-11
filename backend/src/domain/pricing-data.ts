// RMU pricing provider — the ONLY module that knows where prices come from.
//
// Today: prices load from src/data/rmu-pricing.json (statically imported, so it
// bundles into the Vercel serverless function with zero config). That JSON is
// generated from pricing/RMU-Pricing.xlsx via `node tools/pricing-import.cjs rmu`.
//
// ERP integration later: replace the internals of these functions with ERP
// lookups (or point a sync job at regenerating rmu-pricing.json on a schedule).
// Consumers (priceList.ts, lucy.ts, commercial.service.ts) never change.

import pricingJson from "../data/rmu-pricing.json";

export interface AddOnPrice {
  name: string;
  price: number;
}

interface RmuPricingData {
  currency: string;
  vatPct: number;
  panels: Record<string, number>;
  lucy: Record<string, number>;
  rtu: Record<string, Record<string, number>>;
  addOns: Record<string, AddOnPrice>;
}

const DATA = pricingJson as unknown as RmuPricingData;

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

/** VAT percentage applied on commercial offers (e.g. 14 for Egypt). */
export const VAT_PCT: number = DATA.vatPct;

/** Pricing currency of the master data ("USD"). */
export const PRICING_CURRENCY: string = DATA.currency;
