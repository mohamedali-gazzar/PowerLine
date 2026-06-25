// Builds the worksheet rows (array-of-arrays) for the Material List Excel export.
// Mirrors exactly what the on-screen tables show: one numbered title row per
// block, the header row, then the data rows (Description / Reference /
// [Supplier] / Stock / Qty), with the copper block as a single weight line.
import type { MatRow } from "./store";

export type MatBlock =
  | { kind: "table"; title: string; rows: MatRow[]; withSupplier?: boolean }
  | { kind: "copper"; title: string; kg: number };

export function materialAoa(blocks: MatBlock[]): (string | number)[][] {
  const aoa: (string | number)[][] = [];
  blocks.forEach((b, i) => {
    const title = `${i + 1} · ${b.title}`;
    if (b.kind === "copper") {
      aoa.push([title]);
      aoa.push(["Total project weight (kg)", Number(b.kg.toFixed(1))]);
    } else {
      aoa.push([title]);
      aoa.push(["Description", "Reference", ...(b.withSupplier ? ["Supplier"] : []), "Stock", "Qty"]);
      b.rows.forEach((r) =>
        aoa.push([
          r.description,
          r.reference || "—",
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
