// Builds the worksheet rows (array-of-arrays) for the Material List Excel export.
// Mirrors exactly what the on-screen tables show: one numbered title row per
// block, the header row, then the data rows (Description / Reference /
// [Supplier] / Stock / Qty), with the copper block as a single weight line.
import type { MatRow } from "./store";

export type MatBlock =
  | { kind: "table"; title: string; rows: MatRow[]; withSupplier?: boolean; abbDiscPct?: number[]; abbMktPct?: number[] }
  | { kind: "copper"; title: string; kg: number };

/**
 * One costed line for the flat cost sheet.
 *
 * `unitCost` arrives ALREADY in the chosen currency — the caller owns the conversion, since
 * it is the screen's own rate and toggle, and doing it twice is how an export ends up
 * disagreeing with the table it was exported from.
 */
export interface MatCostRow {
  /** Which Material-List table the line came from, numbered as on screen: "1 · ABB Products". */
  group: string;
  description: string;
  reference: string;
  supplier: string;
  stock: string;
  qty: number;
  discPct: number;
  mktPct: number;
  unitCost: number;
}

/**
 * The whole quotation's materials as ONE flat sheet, every line carrying the group it
 * belongs to.
 *
 * Separate from materialAoa because the two answer different questions. That one reproduces
 * the printed Material List — blocks, titles, no money — for the supply chain. This one is
 * for costing: every item in the job on one sortable, filterable sheet, so the cost of any
 * product can be found without reading six tables and adding them up by hand.
 */
export function materialCostAoa(rows: MatCostRow[], currency: string): (string | number)[][] {
  const aoa: (string | number)[][] = [];
  aoa.push([
    "Group", "Description", "Reference", "Supplier", "Stock", "Qty",
    "Discount (%)", "Market Price (%)",
    `Unit cost (${currency})`, `Total cost (${currency})`,
  ]);
  let total = 0;
  for (const r of rows) {
    const line = r.unitCost * r.qty;
    total += line;
    aoa.push([
      r.group,
      r.description,
      r.reference || "—",
      r.supplier || "—",
      r.stock || "—",
      r.qty,
      r.discPct,
      r.mktPct,
      // Two decimals: a unit cost rounded to whole money makes the line total look wrong
      // against a quantity of fifty.
      Number(r.unitCost.toFixed(2)),
      Number(line.toFixed(2)),
    ]);
  }
  // Blank spacer, then the total — so a filter over the data rows never drags it along.
  aoa.push([]);
  aoa.push(["", "", "", "", "", "", "", "TOTAL", "", Number(total.toFixed(2))]);
  return aoa;
}

export function materialAoa(blocks: MatBlock[]): (string | number)[][] {
  const aoa: (string | number)[][] = [];
  blocks.forEach((b, i) => {
    const title = `${i + 1} · ${b.title}`;
    if (b.kind === "copper") {
      aoa.push([title]);
      aoa.push(["Total project weight (KG)", Number(b.kg.toFixed(1))]);
    } else {
      const withDisc = Array.isArray(b.abbDiscPct);
      const withMkt = Array.isArray(b.abbMktPct);
      aoa.push([title]);
      aoa.push([
        "Description", "Reference",
        ...(withDisc ? ["Discount (%)"] : []),
        ...(withMkt ? ["Market Price (%)"] : []),
        ...(b.withSupplier ? ["Supplier"] : []),
        "Stock", "Qty",
      ]);
      b.rows.forEach((r, ri) =>
        aoa.push([
          r.description,
          r.reference || "—",
          ...(withDisc ? [b.abbDiscPct![ri] ?? 0] : []),
          ...(withMkt ? [b.abbMktPct![ri] ?? 0] : []),
          ...(b.withSupplier ? [r.supplier] : []),
          r.stock || "—",
          r.qty,
        ])
      );
    }
    aoa.push([]); // blank spacer between blocks
  });
  return aoa;
}
