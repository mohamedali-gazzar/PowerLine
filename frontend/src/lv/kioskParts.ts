// ── Kiosk (packaged compact secondary substation) cost data ──────────────────────────────────
// A kiosk's price is built from parts whose costs are COMPUTED, not typed: the steel enclosure
// (by weight), the MV-cable and LV-copper connections, and a list of accessories. These tables are
// the source data; the per-kg / per-metre rates come from the QTN's Pricing Settings (sheet metal,
// copper, MV cable), so changing a rate reprices every kiosk live.

/** One row of the kiosk enclosure database: keyed by RMU insulation (RAL = Air, SEC = SF6), MV
 *  voltage and transformer rating; costed by its sheet-metal weight × the sheet-metal rate. */
export interface KioskEnclosure {
  rmu: "RAL" | "SEC";
  kv: 12 | 24;
  ratingKva: number;
  name: string;
  code: string;
  kg: number;
}

export const KIOSK_ENCLOSURES: KioskEnclosure[] = [
  { rmu: "RAL", kv: 12, ratingKva: 500,  name: "P-CSS 5ST- Compact 12",  code: "P-CSS 5ST-A",  kg: 1520 },
  { rmu: "SEC", kv: 12, ratingKva: 500,  name: "P-CSS 5ST- P-SEC",       code: "P-CSS 5ST-C",  kg: 1647 },
  { rmu: "SEC", kv: 24, ratingKva: 500,  name: "P-CSS 5ST- P-SEC",       code: "P-CSS 5ST-C",  kg: 1647 },
  { rmu: "RAL", kv: 24, ratingKva: 500,  name: "P-CSS 16ST- Compact 24", code: "P-CSS 16ST-V", kg: 2040 },
  { rmu: "RAL", kv: 12, ratingKva: 1000, name: "P-CSS 10ST- Compact 12", code: "P-CSS 10ST-I", kg: 1647 },
  { rmu: "SEC", kv: 12, ratingKva: 1000, name: "P-CSS 10ST- P-SEC",      code: "P-CSS 10ST-K", kg: 1837 },
  { rmu: "SEC", kv: 24, ratingKva: 1000, name: "P-CSS 10ST- P-SEC",      code: "P-CSS 10ST-K", kg: 1837 },
  { rmu: "RAL", kv: 24, ratingKva: 1000, name: "P-CSS 16ST- Compact 24", code: "P-CSS 16ST-V", kg: 2080 },
  { rmu: "RAL", kv: 12, ratingKva: 1600, name: "P-CSS 16ST- Compact 12", code: "P-CSS 16ST-U", kg: 1948 },
  { rmu: "SEC", kv: 12, ratingKva: 1600, name: "P-CSS 16ST- P-SEC",      code: "P-CSS 16ST-W", kg: 2080 },
  { rmu: "SEC", kv: 24, ratingKva: 1600, name: "P-CSS 16ST- P-SEC",      code: "P-CSS 16ST-W", kg: 2080 },
  { rmu: "RAL", kv: 24, ratingKva: 1600, name: "P-CSS 16ST- Compact 24", code: "P-CSS 16ST-V", kg: 2040 },
];

/** The kiosk-size dropdown options — the distinct item codes, grouped by frame size. */
export const KIOSK_SIZE_CODES = [
  "P-CSS 5ST-A", "P-CSS 5ST-C", "P-CSS 10ST-I", "P-CSS 10ST-K",
  "P-CSS 16ST-U", "P-CSS 16ST-V", "P-CSS 16ST-W",
];

/** Sheet-metal weight (kg) for a kiosk item code. P-CSS 16ST-V exists at two weights, so the
 *  transformer rating picks the exact row when known; otherwise the first match is used. */
export function kioskKg(code: string | undefined | null, ratingKva?: number | null): number | null {
  if (!code) return null;
  const rows = KIOSK_ENCLOSURES.filter((k) => k.code === code);
  if (!rows.length) return null;
  const exact = ratingKva != null ? rows.find((k) => k.ratingKva === ratingKva) : undefined;
  return (exact ?? rows[0]).kg;
}

/** MV-cable connection: a fixed length (metres) for every kiosk; cost = metres × the MV-cable rate. */
export const MV_CABLE_METERS = 11;

/** Capacitor box: a fixed sheet-metal weight (kg); cost = kg × the sheet-metal rate. */
export const CAPACITOR_BOX_KG = 32;

/** LV-copper connection weight (kg) by transformer rating; cost = kg × the copper rate. */
export const LV_COPPER_KG: Record<number, number> = {
  200: 35, 300: 45, 500: 65, 1000: 95, 1500: 238, 1600: 238,
};
export function lvCopperKg(ratingKva?: number | null): number | null {
  if (ratingKva == null) return null;
  return LV_COPPER_KG[ratingKva] ?? null;
}

/** A kiosk accessory line: a named item with a quantity and a unit cost (EGP). */
export interface KioskAccessory {
  id: string;
  name: string;
  code?: string;
  qty: number;
  cost: number;
}

/** The kiosk "EXTRA" group. Shunt + Aux are quantity items (USD unit price → EGP by the QTN rate);
 *  Capacitor Box + Stone Paint are single tick-boxes (ticked = 1). Capacitor Box is costed by its
 *  sheet-metal weight; Stone Paint by a USD price. */
export type KioskExtra = { key: string; name: string; usd?: number; kg?: number };

// Tick-box accessory items shown under Accessories (a ticked item counts once). Capacitor Box is
// costed by its sheet-metal weight; Stone Paint by a USD price. (Shunt/Aux moved to the RMU feeders.)
export const KIOSK_EXTRAS: KioskExtra[] = [
  { key: "capbox", name: "Capacitor Box", kg: CAPACITOR_BOX_KG },
  { key: "stonepaint", name: "Stone Paint", usd: 600 },
];

/** The default accessory checklist for a new kiosk (editable / removable per panel). */
export const DEFAULT_KIOSK_ACCESSORIES: KioskAccessory[] = [
  { id: "acc-fire",       name: "Fire extinguisher",   code: "MVACC00014",  qty: 2, cost: 18600 },
  { id: "acc-fan",        name: "Air Fan 40*40 220v",  code: "MVACC00007",  qty: 2, cost: 3500 },
  { id: "acc-thermostat", name: "Thermostat for fans", code: "LVA0000004",  qty: 1, cost: 150 },
  { id: "acc-earth",      name: "Earthing Cable",      code: "ELECON00071", qty: 6, cost: 800 },
];
