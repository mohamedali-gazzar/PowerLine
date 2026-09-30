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
  /** The currency this item is PRICED IN on the price list — "EUR" or "EGP", per item. */
  listCurrency: string;
  /** Its price-list figure, in that currency, before any discount or market price. */
  listPrice: number;
  /** EGP per unit of listCurrency, or null when the item is already priced in EGP and
   *  nothing was converted. Printed so a converted figure can always be checked by hand. */
  rateToEgp: number | null;
  discPct: number;
  mktPct: number;
  unitCost: number;
}

/** The rates every converted figure on the sheet was worked out with. */
export interface MatCostRates {
  /** EGP per 1 EUR — what a EUR-listed item is multiplied by. */
  eurToEgp: number;
  /** EGP per 1 USD — used only when the sheet is written in USD. */
  usdToEgp: number;
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
export function materialCostAoa(
  rows: MatCostRow[],
  currency: string,
  rates: MatCostRates,
): (string | number)[][] {
  const aoa: (string | number)[][] = [];
  // THE RATES COME FIRST, on the sheet itself. Items are priced in different currencies —
  // ABB imports in EUR, local supply in EGP — so every figure below is either a list price
  // or a conversion, and a conversion nobody can check is a number nobody can defend to a
  // customer. Stating the rate here means the sheet can be re-derived months later, when
  // the rate in the app has moved on.
  aoa.push(["Rates used", `1 EUR = ${rates.eurToEgp} EGP`,
    ...(currency === "USD" ? [`1 USD = ${rates.usdToEgp} EGP`] : [])]);
  aoa.push([]);
  aoa.push([
    "Group", "Description", "Reference", "Supplier", "Stock", "Qty",
    // The item's own price list, untouched — the figure to check against the supplier.
    "List currency", "List price",
    "Rate to EGP",
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
      r.listCurrency,
      Number(r.listPrice.toFixed(2)),
      // An EGP-listed item was never converted; printing a rate would imply one happened.
      r.rateToEgp == null ? "—" : r.rateToEgp,
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
  aoa.push(["", "", "", "", "", "", "", "", "", "", "TOTAL", "", Number(total.toFixed(2))]);
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
