// Official technical data for the Powerline PDTR cast-resin dry-type transformers, taken
// verbatim from the published datasheets (PDTR Series · Rev. 2026-06), 11 kV and 22 kV, for
// the six standard ratings 500 / 1000 / 1500 / 1600 / 2000 / 2500 kVA.
//
// IP23 (standalone) vs IP00 (inside a kiosk): the two datasheets are identical EXCEPT for
//   • the model number suffix — "…2300" (IP23) becomes "…0000" (IP00), and
//   • the ENCLOSURE IP rating — IP23 becomes IP00.
// So we store one row per (voltage × rating) and derive the IP00 form on render — see
// `trModel()` and `trEnclosureIp()` below. Nothing else changes between the two.

export type TrKv = 11 | 22;

export interface TransformerTech {
  primaryKv: TrKv;
  ratingKva: number;
  /** IP23 (standalone) model number, e.g. "PDTR1105012300". IP00 = …2300 → …0000. */
  model: string;
  productCode: string;
  /** Rated current, HV / LV, e.g. "26.2 A / 721.7 A". */
  ratedCurrent: string;
  trDims: string;
  enclosureDims: string;
  weightKg: number;
  soundDb: number;
  loadLossW: number;
  impedancePct: string;
  noLoadLossW: number;
  hvResistance: string;
  lvResistance: string;
  /** The head-of-table figure(s): 11 kV sheets give two winding-rise values, 22 kV give "< 100". */
  tempRise: string;
  /** The seven HV tap currents (A), tap positions 1…7 (rated = position 3). */
  tapCurrentsA: string[];
}

// Data shared by every rating of a given primary voltage.
export const TR_TECH_BY_KV: Record<TrKv, { hvInsulation: string; tapVoltages: string[]; ratedHv: string }> = {
  11: { hvInsulation: "LI 75 kV / AC 35 kV", tapVoltages: ["11550", "11275", "11000", "10725", "10450", "10175", "9900"], ratedHv: "11000" },
  22: { hvInsulation: "LI 125 kV / AC 55 kV", tapVoltages: ["23100", "22550", "22000", "21450", "20900", "20350", "19800"], ratedHv: "22000" },
};

// The seven tap-position percentage labels (constant across all sheets).
export const TR_TAP_LABELS = ["+5 %", "+2.5 %", "rated", "−2.5 %", "−5 %", "−7.5 %", "−10 %"];

export const TRANSFORMER_TECH: TransformerTech[] = [
  // ───────────────────────── 11 kV ─────────────────────────
  {
    primaryKv: 11, ratingKva: 500, model: "PDTR1105012300", productCode: "1.710.41212",
    ratedCurrent: "26.2 A / 721.7 A", trDims: "1191 × 1150 × 1020 mm", enclosureDims: "1650 × 1500 × 2200 mm",
    weightKg: 1430, soundDb: 56, loadLossW: 5100, impedancePct: "4.14 %", noLoadLossW: 1300,
    hvResistance: "5.234 Ω", lvResistance: "1.221 × 10⁻³ Ω", tempRise: "92.0 / 92.2",
    tapCurrentsA: ["25.0", "25.6", "26.2", "26.9", "27.6", "28.4", "29.2"],
  },
  {
    primaryKv: 11, ratingKva: 1000, model: "PDTR1110012300", productCode: "1.710.41215",
    ratedCurrent: "52.5 A / 1443.4 A", trDims: "1336 × 1410 × 1120 mm", enclosureDims: "1900 × 1650 × 2200 mm",
    weightKg: 2440, soundDb: 59, loadLossW: 8000, impedancePct: "5.10 %", noLoadLossW: 1850,
    hvResistance: "1.674 Ω", lvResistance: "5.332 × 10⁻⁴ Ω", tempRise: "90.1 / 88.0",
    tapCurrentsA: ["50.0", "51.2", "52.5", "53.8", "55.2", "56.7", "58.3"],
  },
  {
    primaryKv: 11, ratingKva: 1500, model: "PDTR1115012300", productCode: "1.710.41217",
    ratedCurrent: "78.7 A / 2165.1 A", trDims: "1412 × 1620 × 1270 mm", enclosureDims: "2200 × 1750 × 2200 mm",
    weightKg: 3265, soundDb: 61, loadLossW: 11200, impedancePct: "5.85 %", noLoadLossW: 2600,
    hvResistance: "1.092 Ω", lvResistance: "2.613 × 10⁻⁴ Ω", tempRise: "89.8 / 87.6",
    tapCurrentsA: ["75.0", "76.8", "78.7", "80.7", "82.9", "85.1", "87.5"],
  },
  {
    primaryKv: 11, ratingKva: 1600, model: "PDTR1116012300", productCode: "1.710.41217",
    ratedCurrent: "84 A / 2309.4 A", trDims: "1391 × 1680 × 1320 mm", enclosureDims: "2200 × 1750 × 2200 mm",
    weightKg: 3445, soundDb: 61, loadLossW: 12300, impedancePct: "5.85 %", noLoadLossW: 2800,
    hvResistance: "9.808 × 10⁻¹ Ω", lvResistance: "2.869 × 10⁻⁴ Ω", tempRise: "86.5 / 90.5",
    tapCurrentsA: ["80.0", "81.9", "84", "86.1", "88.4", "90.8", "93.3"],
  },
  {
    primaryKv: 11, ratingKva: 2000, model: "PDTR1120012300", productCode: "1.710.41018",
    ratedCurrent: "105 A / 2886.8 A", trDims: "1516 × 1790 × 1370 mm", enclosureDims: "2200 × 1800 × 2200 mm",
    weightKg: 4145, soundDb: 62, loadLossW: 14900, impedancePct: "5.97 %", noLoadLossW: 3500,
    hvResistance: "7.390 × 10⁻¹ Ω", lvResistance: "2.303 × 10⁻⁴ Ω", tempRise: "88.7 / 86.3",
    tapCurrentsA: ["100.0", "102.4", "105", "107.7", "110.5", "113.5", "116.6"],
  },
  {
    primaryKv: 11, ratingKva: 2500, model: "PDTR1125012300", productCode: "1.710.41019",
    ratedCurrent: "131.2 A / 3608.4 A", trDims: "1626 × 1880 × 1370 mm", enclosureDims: "2400 × 1800 × 2200 mm",
    weightKg: 4930, soundDb: 65, loadLossW: 18300, impedancePct: "6.00 %", noLoadLossW: 4300,
    hvResistance: "5.683 × 10⁻¹ Ω", lvResistance: "1.711 × 10⁻⁴ Ω", tempRise: "88.8 / 89.6",
    tapCurrentsA: ["125.0", "128.0", "131.2", "134.6", "138.1", "141.9", "145.8"],
  },
  // ───────────────────────── 22 kV ─────────────────────────
  {
    primaryKv: 22, ratingKva: 500, model: "PDTR2205012300", productCode: "1.710.12012",
    ratedCurrent: "13.1 A / 721.7 A", trDims: "1506 × 1240 × 1300 mm", enclosureDims: "1800 × 1800 × 2200 mm",
    weightKg: 1785, soundDb: 56, loadLossW: 5600, impedancePct: "3.99 %", noLoadLossW: 1500,
    hvResistance: "2.211 × 10¹ Ω", lvResistance: "1.423 × 10⁻³ Ω", tempRise: "< 100",
    tapCurrentsA: ["12.5", "12.8", "13.1", "13.5", "13.8", "14.2", "14.6"],
  },
  {
    primaryKv: 22, ratingKva: 1000, model: "PDTR2210012300", productCode: "1.710.12015",
    ratedCurrent: "26.2 A / 1443.4 A", trDims: "1491 × 1460 × 1500 mm", enclosureDims: "2000 × 2000 × 2200 mm",
    weightKg: 2710, soundDb: 59, loadLossW: 8900, impedancePct: "5.02 %", noLoadLossW: 2200,
    hvResistance: "8.307 Ω", lvResistance: "4.905 × 10⁻⁴ Ω", tempRise: "< 100",
    tapCurrentsA: ["25.0", "25.6", "26.2", "26.9", "27.6", "28.4", "29.2"],
  },
  {
    primaryKv: 22, ratingKva: 1500, model: "PDTR2215012300", productCode: "1.710.12017",
    ratedCurrent: "39.4 A / 2165.1 A", trDims: "1616 × 1670 × 1550 mm", enclosureDims: "2250 × 2100 × 2200 mm",
    weightKg: 3640, soundDb: 61, loadLossW: 12800, impedancePct: "5.99 %", noLoadLossW: 2800,
    hvResistance: "4.217 Ω", lvResistance: "3.237 × 10⁻⁴ Ω", tempRise: "< 100",
    tapCurrentsA: ["37.5", "38.4", "39.4", "40.4", "41.4", "42.6", "43.7"],
  },
  {
    primaryKv: 22, ratingKva: 1600, model: "PDTR2216012300", productCode: "1.710.12017",
    ratedCurrent: "42 A / 2309.4 A", trDims: "1616 × 1780 × 1600 mm", enclosureDims: "2300 × 2100 × 2201 mm",
    weightKg: 3905, soundDb: 61, loadLossW: 14000, impedancePct: "5.97 %", noLoadLossW: 3100,
    hvResistance: "4.860 Ω", lvResistance: "2.984 × 10⁻⁴ Ω", tempRise: "< 100",
    tapCurrentsA: ["40.0", "41.0", "42", "43.1", "44.2", "45.4", "46.7"],
  },
  {
    primaryKv: 22, ratingKva: 2000, model: "PDTR2220012300", productCode: "1.710.12118",
    ratedCurrent: "52.5 A / 2886.8 A", trDims: "1716 × 1830 × 1650 mm", enclosureDims: "2400 × 2200 × 2200 mm",
    weightKg: 4445, soundDb: 62, loadLossW: 17500, impedancePct: "6.02 %", noLoadLossW: 4000,
    hvResistance: "3.618 Ω", lvResistance: "2.773 × 10⁻⁴ Ω", tempRise: "< 100",
    tapCurrentsA: ["50.0", "51.2", "52.5", "53.8", "55.2", "56.7", "58.3"],
  },
  {
    primaryKv: 22, ratingKva: 2500, model: "PDTR2225012300", productCode: "1.710.12118",
    ratedCurrent: "65.6 A / 3608.4 A", trDims: "1846 × 1890 × 1650 mm", enclosureDims: "2400 × 2200 × 2200 mm",
    weightKg: 5335, soundDb: 65, loadLossW: 20000, impedancePct: "5.92 %", noLoadLossW: 5000,
    hvResistance: "2.556 Ω", lvResistance: "1.830 × 10⁻⁴ Ω", tempRise: "< 100",
    tapCurrentsA: ["62.5", "64.0", "65.6", "67.3", "69.1", "70.9", "72.9"],
  },
];

/** Find the official datasheet for a primary voltage (kV) + rating (kVA), or null if we don't
 *  publish one for that pair. */
export function findTransformerTech(primaryKv: number | null | undefined, ratingKva: number | null | undefined): TransformerTech | null {
  if (primaryKv == null || ratingKva == null) return null;
  return TRANSFORMER_TECH.find((t) => t.primaryKv === primaryKv && t.ratingKva === ratingKva) ?? null;
}

/** The model number for the chosen IP context: standalone keeps the sheet's "…2300"; inside a
 *  kiosk it becomes "…0000". */
export function trModel(t: TransformerTech, insideKiosk: boolean): string {
  return insideKiosk ? t.model.replace(/2300$/, "0000") : t.model;
}

/** Enclosure IP: IP23 standalone, IP00 inside a kiosk. (The transformer body is always IP00.) */
export function trEnclosureIp(insideKiosk: boolean): string {
  return insideKiosk ? "IP00" : "IP23";
}

/** A transformer code as it should read for the chosen IP context. Codes carry an IP suffix in one
 *  of two shapes: Powerline "…2300" (IP23) / "…0000" (IP00), or the dash form used by e.g. Hitachi
 *  "TRD 1000-22-23" (IP23) / "TRD 1000-22-00" (IP00). Swap it to match the Standalone / Inside-kiosk
 *  choice, whichever variant the price list stored. A code with no IP suffix is returned unchanged. */
export function trDisplayCode(code: string, insideKiosk: boolean): string {
  // Powerline form: the last four digits are the IP suffix.
  if (/(?:2300|0000)$/.test(code)) return code.replace(/(?:2300|0000)$/, insideKiosk ? "0000" : "2300");
  // Dash form: the trailing "-23" / "-00" is the IP suffix.
  if (/-(?:00|23)$/.test(code)) return code.replace(/-(?:00|23)$/, insideKiosk ? "-00" : "-23");
  return code;
}
