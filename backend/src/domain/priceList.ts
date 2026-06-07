// RMU price list (USD), transcribed from "Pricing Sheet RMU 2026".
// Keyed by the catalogue panel code / price key (see buildPriceKey).
// "Minimum unit price" — the floor; the selling price is set per offer.

import {
  buildProductCode,
  buildPriceKey,
  type RmuConfigInput,
} from "./assembly";

export const PRICE_LIST: Record<string, number> = {
  // --- P-RAL 12 (air) ---
  "P-RAL12N0F1": 2482,
  "P-RAL12N2F1": 4828,
  "P-RAL12N3F1": 6260,
  "P-RAL12N2F1M1": 8467,
  "P-RAL12N3F1M1": 9841,
  "P-RAL12N4F0M1": 9795,
  "P-RAL12N2F1M1-With Fuse": 9342,
  "P-RAL12N3F1M1-With Fuse": 10749,
  "P-RAL12N4F0M1-With Fuse": 10671,

  // --- P-RAL 24 (air) ---
  "P-RAL24N0F1": 2534,
  "P-RAL24N2F1": 5916,
  "P-RAL24N3F1": 7365,
  "P-RAL24N2F1M1": 10259,
  "P-RAL24N3F1M1": 12049,
  "P-RAL24N2F1M1-With Fuse": 10878,
  "P-RAL24N3F1M1-With Fuse": 12720,

  // --- P-SEC (SF6, ABB) ---
  "P-SEC24N0F1": 3952,
  "P-SEC24N1F0": 3269,
  "P-SEC24N1F1": 6196,
  "P-SEC24N2F1": 8826,
  "P-SEC24N3F1": 11374,
  "P-SEC24N4F0": 10920,
  "P-SEC12N2F1M1": 13190,
  "P-SEC12N3F1M1": 15887,
  "P-SEC12N2F1M1-With Fuse": 14065,
  "P-SEC12N3F1M1-With Fuse": 16762,
  "P-SEC24N2F1M1": 14160,
  "P-SEC24N3F1M1": 16857,
  "P-SEC24N0F1M1": 9071,
  "P-SEC24N2F1M1-With Fuse": 14864,
  "P-SEC24N3F1M1-With Fuse": 17561,
  "P-SEC24N0F1M1-With Fuse": 9904,

  // --- P-SEC Murge (SF6, Murge LBS) ---
  // 12 kV (metering variants only, per the price sheet)
  "P-SEC.M12N2F1M1": 10225,
  "P-SEC.M12N3F1M1": 11968,
  "P-SEC.M12N4F0M1": 11527,
  "P-SEC.M12N2F1M1-With Fuse": 11100,
  "P-SEC.M12N3F1M1-With Fuse": 12843,
  "P-SEC.M12N4F0M1-With Fuse": 12402,
  // 24 kV
  "P-SEC.M24N2F1": 5592,
  "P-SEC.M24N3F1": 7197,
  "P-SEC.M24N2F1M1": 10746,
  "P-SEC.M24N3F1M1": 12939,
  "P-SEC.M24N4F0M1": 12497,
  "P-SEC.M24N2F1M1-With Fuse": 11899,
  "P-SEC.M24N3F1M1-With Fuse": 13642,
  "P-SEC.M24N4F0M1-With Fuse": 13201,
};

// Optional extras (USD).
export const ADD_ONS = {
  shuntTrip: { name: "Shunt trip", price: 220 },
  auxiliarySwitch: { name: "Auxiliary Switch", price: 301 },
  outdoorEnclosure: { name: "Outdoor Enclosure", price: 2000 },
} as const;

export interface ConfigPricing {
  panelCode: string;
  priceKey: string;
  basePrice: number | null; // null = not in the price list (price on application)
  addOns: { name: string; price: number }[];
  listPrice: number | null; // basePrice + add-ons (null when base not found)
  found: boolean;
}

/** The price list only covers ABB/Murge (PSEC) and ABB (PRAL). Other brands
 *  (Schneider/JGGY/GRL) have no list price → quoted on application. */
function priceEligible(c: RmuConfigInput): boolean {
  const brand = c.lbsBrand ?? "ABB";
  if (c.productType === "PSEC") return brand === "ABB" || brand === "MURGE";
  return brand === "ABB"; // PRAL list = ABB air only
}

/** Look up the minimum list price for a configuration, plus applicable add-ons. */
export function priceForConfig(c: RmuConfigInput): ConfigPricing {
  const panelCode = buildProductCode(c);
  const priceKey = buildPriceKey(c);
  const basePrice = priceEligible(c) ? PRICE_LIST[priceKey] ?? null : null;

  const addOns: { name: string; price: number }[] = [];
  if (c.installation === "OUTDOOR") addOns.push({ ...ADD_ONS.outdoorEnclosure });

  const listPrice =
    basePrice == null
      ? null
      : basePrice + addOns.reduce((s, a) => s + a.price, 0);

  return { panelCode, priceKey, basePrice, addOns, listPrice, found: basePrice != null };
}
