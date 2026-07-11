// RMU price lookups. All actual prices live in the pricing master
// (src/data/rmu-pricing.json, edited via pricing/RMU-Pricing.xlsx) and are read
// through the pricing-data provider — no prices are hardcoded here.
// "Minimum unit price" — the floor; the selling price is set per offer.

import {
  buildProductCode,
  buildPriceKey,
  type RmuConfigInput,
} from "./assembly";
import { lucyKey } from "./lucy";
import { RTU_LABEL } from "./standards";
import { panelPrice, lucyConfigPrice, rtuPrice, addOnPrice } from "./pricing-data";

/** Smart/RTU commercial add-on for this config, or null when none applies.
 *  PRAL has no smart option (absent from the rtu price map) → never priced. */
function rtuAddOn(c: RmuConfigInput): { name: string; price: number } | null {
  const price = rtuPrice(c.productType, c.rtuType ?? "NONE");
  return price ? { name: `Smart / RTU — ${RTU_LABEL[c.rtuType] ?? c.rtuType}`, price } : null;
}

export interface ConfigPricing {
  panelCode: string;
  priceKey: string;
  basePrice: number | null; // null = not in the price list (price on application)
  addOns: { name: string; price: number }[];
  listPrice: number | null; // basePrice + add-ons (null when base not found)
  found: boolean;
}

/** The price list only covers ABB/Murge (PSEC) and ABB (PRAL). Other brands
 *  (Schneider/Chint) have no list price → quoted on application. */
function priceEligible(c: RmuConfigInput): boolean {
  const brand = c.lbsBrand ?? "ABB";
  if (c.productType === "PSEC") return brand === "ABB" || brand === "MURGE";
  return brand === "ABB"; // PRAL list = ABB air only
}

/** Common optional extras applied to any product family. */
function commonAddOns(c: RmuConfigInput): { name: string; price: number }[] {
  const addOns: { name: string; price: number }[] = [];
  if (c.installation === "OUTDOOR") {
    const enc = addOnPrice("outdoorEnclosure");
    if (enc) addOns.push(enc);
  }
  const rtu = rtuAddOn(c);
  if (rtu) addOns.push(rtu);
  return addOns;
}

/** Look up the minimum list price for a configuration, plus applicable add-ons. */
export function priceForConfig(c: RmuConfigInput): ConfigPricing {
  // Lucy has its own USD price map keyed by config (same for 12 & 24 kV).
  // Configs outside the catalogue → price on application.
  if (c.productType === "LUCY") {
    const basePrice = lucyConfigPrice(lucyKey(c));
    const addOns = commonAddOns(c);
    const listPrice =
      basePrice == null ? null : basePrice + addOns.reduce((s, a) => s + a.price, 0);
    return {
      panelCode: "",
      priceKey: `LUCY-${lucyKey(c)}`,
      basePrice,
      addOns,
      listPrice,
      found: basePrice != null,
    };
  }
  const panelCode = buildProductCode(c);
  const priceKey = buildPriceKey(c);
  const basePrice = priceEligible(c) ? panelPrice(priceKey) : null;
  const addOns = commonAddOns(c);

  const listPrice =
    basePrice == null
      ? null
      : basePrice + addOns.reduce((s, a) => s + a.price, 0);

  return { panelCode, priceKey, basePrice, addOns, listPrice, found: basePrice != null };
}
