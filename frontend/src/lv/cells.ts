// Sizing & Copper — cell configuration tables, exactly per RPT-02.
//
// Pro-E: Depth 70/90 × Thickness 1.5/2 mm × IP65/IP31, with:
//   - 90 cm + 2 mm ⇒ IP31 unavailable (UI must disable it)
//   - IP naming rule: IP65 items end with a dot, IP31 items have NO dot
//   - Thickness rule: 2 mm items get a "2M" prefix
//   - "Sides" row always present, qty 1, locked
// IS2: Depth 60/80 only (IP54 + 1.5 mm implied, fields hidden)
// PLP: Depth 70/90/110 only (IP54 + 1.5 mm implied, fields hidden)

import { findCellEnclosure } from "./catalog";

export type CellType = "Pro-E" | "IS2" | "PLP";

export interface CellRow {
  desc: string;
  qty: number;
  locked?: boolean; // Sides rows: qty 1, non-editable
  // Price frozen onto the quotation when the row is created. Cell prices used to
  // be re-derived on every render by matching `desc` against the live enclosure
  // catalogue — a lookup that returns 0 on a miss. Once enclosure names became
  // editable, one rename could silently zero a saved quotation's cell cost.
  // The RAW catalogue fields are stored (not a computed EGP figure) so cells keep
  // tracking the EUR rate exactly like every other cost.
  eur?: number;
  egp?: number;
}

/** Stamp each row with the catalogue price of the enclosure it maps to. */
function stampPrices(type: CellType, rows: CellRow[]): CellRow[] {
  for (const r of rows) {
    const e = findCellEnclosure(type, r.desc);
    if (e) {
      r.eur = e.eur;
      r.egp = e.egp;
    }
  }
  return rows;
}

export const PRO_E_DEPTHS = [70, 90] as const;
export const PRO_E_THICKNESS = ["1.5", "2"] as const;
export const PRO_E_IPS = ["IP65", "IP31"] as const;
export const IS2_DEPTHS = [60, 80] as const;
export const PLP_DEPTHS = [70, 90, 110] as const;

/** RPT-02: with Depth=90 & 2 mm, IP31 must be disabled. */
export function proEIp31Disabled(depth: number, thickness: string): boolean {
  return depth === 90 && thickness === "2";
}

const PRO_E_BASE = ["C.C", "Cell 40", "Cell 60", "Cell 80", "Cell 80 (60+20)", "Cell 100", "Cell100 (60+40)"];

export function cellTable(type: CellType, depth: number, thickness: string, ip: string): CellRow[] {
  if (type === "Pro-E") {
    const m2 = thickness === "2" ? "2M" : "";
    const dot = ip === "IP31" ? "" : "."; // IP naming rule
    const rows: CellRow[] = PRO_E_BASE.map((b) => {
      // 2M variants drop the space in "Cell 80 (60+20)" style names (per reference tables)
      const name = m2 ? b.replace(" (", "(") : b;
      return { desc: `${m2}${name} x ${depth}${dot}`, qty: 0 };
    });
    rows.push({ desc: `${m2}Sides_${depth}${dot}`, qty: 1, locked: true });
    return stampPrices(type, rows);
  }
  if (type === "IS2") {
    const rows: CellRow[] = ["40", "60", "80", "100", "80(60+20)", "100(60+40)"].map((w) => ({
      desc: `${w}x${depth}`,
      qty: 0,
    }));
    rows.push({ desc: `Sidesx${depth}`, qty: 1, locked: true });
    return stampPrices(type, rows);
  }
  // PLP — depths 70/90/110 render as 700/900/1100 in the item names
  const rows: CellRow[] = ["400", "600", "800", "1000"].map((w) => ({
    desc: `2000x${w}x${depth * 10}`,
    qty: 0,
  }));
  rows.push({ desc: `LSides_${depth}`, qty: 1, locked: true });
  return stampPrices(type, rows);
}

/** Cell selection state stored on a panel. */
export interface CellConfig {
  type: CellType;
  depth: number;
  thickness: string; // Pro-E only
  ip: string;        // Pro-E only
  rows: CellRow[];
}

export function defaultCellConfig(type: CellType = "Pro-E"): CellConfig {
  const depth = type === "IS2" ? 60 : 70;
  const thickness = "1.5";
  const ip = type === "Pro-E" ? "IP65" : "IP54";
  return { type, depth, thickness, ip, rows: cellTable(type, depth, thickness, ip) };
}

/** Recompute the table after any selector change, preserving qty where descriptions persist. */
export function retable(cfg: CellConfig): CellConfig {
  const fresh = cellTable(cfg.type, cfg.depth, cfg.thickness, cfg.ip); // already price-stamped
  // carry over user quantities by row position (tables are parallel by construction)
  cfg.rows.forEach((old, i) => {
    if (fresh[i] && !fresh[i].locked) fresh[i].qty = old.locked ? fresh[i].qty : old.qty;
    // Same item as before → keep the price this quotation was already using, so
    // changing a selector never silently re-prices the rows that didn't change.
    if (fresh[i] && old.desc === fresh[i].desc && (old.eur != null || old.egp != null)) {
      fresh[i].eur = old.eur;
      fresh[i].egp = old.egp;
    }
  });
  return { ...cfg, rows: fresh };
}
