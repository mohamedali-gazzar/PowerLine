// Sizing & Copper — cell configuration tables, exactly per RPT-02.
//
// Pro-E: Depth 70/90 × Thickness 1.5/2 mm × IP65/IP31, with:
//   - 90 cm + 2 mm ⇒ IP31 unavailable (UI must disable it)
//   - IP naming rule: IP65 items end with a dot, IP31 items have NO dot
//   - Thickness rule: 2 mm items get a "2M" prefix
//   - "Sides" row always present, qty 1, locked
// IS2: Depth 60/80 only (IP54 + 1.5 mm implied, fields hidden)
// PLP: Depth 70/90/110 only (IP54 + 1.5 mm implied, fields hidden)

export type CellType = "Pro-E" | "IS2" | "PLP";

export interface CellRow {
  desc: string;
  qty: number;
  locked?: boolean; // Sides rows: qty 1, non-editable
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
    return rows;
  }
  if (type === "IS2") {
    const rows: CellRow[] = ["40", "60", "80", "100", "80(60+20)", "100(60+40)"].map((w) => ({
      desc: `${w}x${depth}`,
      qty: 0,
    }));
    rows.push({ desc: `Sidesx${depth}`, qty: 1, locked: true });
    return rows;
  }
  // PLP — depths 70/90/110 render as 700/900/1100 in the item names
  const rows: CellRow[] = ["400", "600", "800", "1000"].map((w) => ({
    desc: `2000x${w}x${depth * 10}`,
    qty: 0,
  }));
  rows.push({ desc: `LSides_${depth}`, qty: 1, locked: true });
  return rows;
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
  const fresh = cellTable(cfg.type, cfg.depth, cfg.thickness, cfg.ip);
  // carry over user quantities by row position (tables are parallel by construction)
  cfg.rows.forEach((old, i) => {
    if (fresh[i] && !fresh[i].locked) fresh[i].qty = old.locked ? fresh[i].qty : old.qty;
  });
  return { ...cfg, rows: fresh };
}
