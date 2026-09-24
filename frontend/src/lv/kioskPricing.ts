// One source of truth for a kiosk's price. Both the live "Kiosk price (live)" table in the
// editor and the kiosk line on the MV Commercial offer compute from the functions here, so the
// number the engineer sees while building and the number the customer sees on paper can never
// drift apart. The RMU and Transformer costs are fetched from their own databases (async) by the
// caller and passed in; everything else (the LV panel build-up, the enclosure steel, the standard
// accessories and the extras) is a pure function of the panel and the quotation's rates.
import { calcPanel, DEFAULT_MV_CABLE_EGP_PER_M, type LvState, type LvPanel } from "./store";
import { kioskKg, lvCopperKg, MV_CABLE_METERS, KIOSK_EXTRAS, DEFAULT_KIOSK_ACCESSORIES } from "./kioskParts";

/** The five priced parts of a kiosk, in the order they appear on the cost sheet. */
export type KioskPartKey = "rmu" | "transformer" | "lv" | "size" | "accessories";
export const KIOSK_PART_KEYS: KioskPartKey[] = ["rmu", "transformer", "lv", "size", "accessories"];

// Default selling factor per kiosk part (selling = cost ÷ factor). Overridable per row in the table.
export const DEFAULT_KIOSK_FACTORS: Record<string, number> = {
  rmu: 0.85, transformer: 0.95, lv: 0.7, size: 0.7, accessories: 0.7,
};

/**
 * Every part's COST in EGP. `rmuCostEgp` / `trCostEgp` are fetched from the RMU and transformer
 * databases by the caller (they are async) and simply passed through; the other four are derived
 * here from the panel and the QTN's Pricing-Settings rates so a rate change reprices live.
 */
export function kioskCostsEgp(
  p: LvPanel, s: LvState, rmuCostEgp: number | null, trCostEgp: number | null,
): Record<KioskPartKey, number | null> {
  const usdRate = s.factors?.usd || 1;
  const sheetMetalRate = s.factors.sheetMetal || 0;
  const copperRate = s.factors.copper || 0;
  const mvCableRate = s.mvCableEgpPerM ?? DEFAULT_MV_CABLE_EGP_PER_M;
  const trRating = p.mvTransformerConfig?.ratingKva;
  // Kiosk Size: the chosen enclosure's steel weight × the sheet-metal rate.
  const sizeCode = p.mvKioskCost?.size?.code || "";
  const sizeKg = kioskKg(sizeCode, trRating);
  const size = sizeKg != null ? Math.round(sizeKg * sheetMetalRate) : null;
  // LV: the built-up cost of the LV panel (components + copper + enclosure + kits), before markup.
  const lv = Math.round(calcPanel(p, s.factors, s.abbItemDiscounts).unitCost) || null;
  // Accessories: MV-cable + LV-copper connections + the fixed accessory item list.
  const mvCableCost = Math.round(MV_CABLE_METERS * mvCableRate);
  const lvCopperKgVal = lvCopperKg(trRating);
  const lvCopperCost = lvCopperKgVal != null ? Math.round(lvCopperKgVal * copperRate) : 0;
  const accItemsTotal = DEFAULT_KIOSK_ACCESSORIES.reduce((sum, a) => sum + (a.cost || 0) * ((p.mvKioskAccQty?.[a.id] ?? a.qty) || 0), 0);
  // The tick-box items (Capacitor Box / Stone Paint) now live under Accessories, not a separate Extra.
  const accChecks = p.mvKioskAccChecks ?? {};
  const checksTotal = KIOSK_EXTRAS.reduce((sum, e) => {
    const price = e.usd != null ? Math.round(e.usd * usdRate) : Math.round((e.kg || 0) * sheetMetalRate);
    return sum + (accChecks[e.key] ? price : 0);
  }, 0);
  const accessories = (mvCableCost + lvCopperCost + accItemsTotal + checksTotal) || null;
  // "Without transformer": the compact substation ships without a transformer, so nothing is charged
  // for the transformer compartment (and its transportation drops out with it).
  const transformer = p.mvTransformerConfig?.withoutTransformer ? null : trCostEgp;
  return { rmu: rmuCostEgp, transformer, lv, size, accessories };
}

/** The selling factor for a part: the typed override on the panel, else the house default. */
export function kioskFactorOf(p: LvPanel, key: string): number | undefined {
  return p.mvKioskCost?.[key]?.factor ?? DEFAULT_KIOSK_FACTORS[key];
}

/** The transformer's flat transportation charge in USD (default $300), added to its selling price
 *  WITHOUT the factor — exactly as the standalone Transformer panel does. */
export function trTransportationUsd(p: LvPanel): number {
  return p.mvTransformerConfig?.transportation ?? 300;
}

/** One part's SELLING price in EGP, or null when it isn't priced yet. Normally cost ÷ factor; the
 *  transformer additionally carries a flat transportation charge (USD → EGP) added without the factor,
 *  so a transformer inside a kiosk is charged the same $300 transport as a standalone one. */
export function kioskPartSellingEgp(
  costs: Record<KioskPartKey, number | null>, p: LvPanel, key: KioskPartKey, usdRate: number,
): number | null {
  const c = costs[key];
  const f = kioskFactorOf(p, key);
  if (!c || !f) return null;
  let selling = Math.round(c / f);
  if (key === "transformer") selling += Math.round(trTransportationUsd(p) * (usdRate || 1));
  return selling;
}

/** The whole kiosk's COST in EGP (sum of the six parts). */
export function kioskTotalCostEgp(costs: Record<KioskPartKey, number | null>): number {
  return KIOSK_PART_KEYS.reduce((sum, k) => sum + (costs[k] ?? 0), 0);
}

/** The whole kiosk's SELLING price in EGP — what the commercial line charges for one unit
 *  (includes the transformer's transportation charge, via kioskPartSellingEgp). */
export function kioskTotalSellingEgp(
  costs: Record<KioskPartKey, number | null>, p: LvPanel, usdRate: number,
): number {
  return KIOSK_PART_KEYS.reduce((sum, k) => sum + (kioskPartSellingEgp(costs, p, k, usdRate) ?? 0), 0);
}
