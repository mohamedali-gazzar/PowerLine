// RPT-1: Copper Tool — manual main-busbar copper lengths per standard rating,
// with automatic weight using the database formula:
//   weight(kg) = length(mm) × CSA(mm²) × 0.000009   (×3 for a 3-phase run)
//   (0.000009 ≈ copper density in kg/mm³, so the length is in MILLIMETRES)
import type { CellType } from "./cells";

export const COPPER_RATINGS = [
  100, 160, 250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300,
] as const;

// CSA (Main Busbar mm²) per rating — Pro-E table (per the RPT-1 reference sheet).
const CSA_PRO_E: Record<number, number> = {
  100: 100, 160: 100, 250: 100, 400: 160, 630: 315, 800: 400, 1000: 400, 1250: 500,
  1600: 800, 2000: 1200, 2500: 1600, 3200: 2000, 4000: 3600, 5000: 4800, 6300: 6000,
};
// PLP / IS2 share the same CSA table.
const CSA_PLP: Record<number, number> = {
  100: 100, 160: 100, 250: 100, 400: 300, 630: 400, 800: 500, 1000: 600, 1250: 800,
  1600: 1000, 2000: 1200, 2500: 1600, 3200: 2000, 4000: 2400, 5000: 3000, 6300: 6000,
};

export function csaFor(type: CellType, rating: number): number {
  return (type === "Pro-E" ? CSA_PRO_E : CSA_PLP)[rating] ?? 0;
}

export interface CopperLen { p: number; n: number; e: number } // lengths in mm
export type CopperTool = Record<string, CopperLen>;            // keyed by rating

const K = 0.000009; // copper density (kg/mm³)
export const copperWeight = (lengthMm: number, csa: number, phases = 1): number =>
  (lengthMm || 0) * csa * K * phases;

/** Round a current UP to the next available standard rating (ceiling),
 *  e.g. 315 → 400, 625 → 630. Exceeding the top of the ladder → the largest. */
export function roundUpRating(a: number): number {
  for (const r of COPPER_RATINGS) if (r >= a - 1e-9) return r; // COPPER_RATINGS is ascending
  return COPPER_RATINGS[COPPER_RATINGS.length - 1];
}

/** Total copper weight (kg) for a tool, using the cell type's CSA table. */
export function copperTotal(type: CellType, tool: CopperTool): number {
  let sum = 0;
  for (const r of COPPER_RATINGS) {
    const row = tool[String(r)];
    if (!row) continue;
    const csa = csaFor(type, r);
    sum += copperWeight(row.p, csa, 3) + copperWeight(row.n, csa, 1) + copperWeight(row.e, csa, 1);
  }
  return sum;
}

/** Parse a "50% Phase" style value to a fraction (e.g. 0.5). Defaults to 1. */
export function pctOf(s: string): number {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(s || "");
  return m ? parseFloat(m[1]) / 100 : 1;
}
