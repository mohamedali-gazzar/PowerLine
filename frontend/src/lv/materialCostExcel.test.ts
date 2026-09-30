// The flat material-cost sheet.
//
// This is a costing document: somebody reads a number off it and quotes a customer. The
// arithmetic and the grouping are therefore worth pinning, and the grand total most of all —
// a wrong total here is a wrong price, not a wrong pixel.

import { describe, it, expect } from "vitest";
import { materialCostAoa, type MatCostRow } from "./materialExcel";

const row = (over: Partial<MatCostRow> = {}): MatCostRow => ({
  group: "1 · ABB Products",
  description: "MCCB 100A",
  reference: "REF-1",
  supplier: "ABB",
  stock: "In stock",
  qty: 2,
  discPct: 20,
  mktPct: 0,
  unitCost: 100,
  ...over,
});

/** The sheet without its header, spacer and total — just the item lines. */
const dataRows = (aoa: (string | number)[][]) => aoa.slice(1, -2);
const totalRow = (aoa: (string | number)[][]) => aoa[aoa.length - 1];

describe("the material cost sheet", () => {
  it("names the currency in the money headers, so a figure is never ambiguous", () => {
    expect(materialCostAoa([], "USD")[0]).toContain("Unit cost (USD)");
    expect(materialCostAoa([], "USD")[0]).toContain("Total cost (USD)");
    expect(materialCostAoa([], "EGP")[0]).toContain("Unit cost (EGP)");
  });

  it("puts the supplier group on EVERY line, not just the first of a run", () => {
    // The whole point of one flat sheet: each line must stand on its own once sorted.
    const aoa = materialCostAoa(
      [row(), row({ description: "MCCB 160A" }), row({ group: "2 · Other Suppliers", supplier: "Schneider" })],
      "EGP",
    );
    expect(dataRows(aoa).map((r) => r[0])).toEqual([
      "1 · ABB Products", "1 · ABB Products", "2 · Other Suppliers",
    ]);
  });

  it("multiplies the line out by quantity", () => {
    const aoa = materialCostAoa([row({ unitCost: 100, qty: 2 })], "EGP");
    const r = dataRows(aoa)[0];
    expect(r[8]).toBe(100); // unit
    expect(r[9]).toBe(200); // total
  });

  it("adds every line into the grand total", () => {
    const aoa = materialCostAoa(
      [row({ unitCost: 100, qty: 2 }), row({ unitCost: 50.5, qty: 3 }), row({ unitCost: 10, qty: 1 })],
      "EGP",
    );
    expect(totalRow(aoa)).toContain("TOTAL");
    expect(totalRow(aoa)[9]).toBe(361.5); // 200 + 151.5 + 10
  });

  it("keeps the cents on a unit cost", () => {
    // Rounding a unit to whole money makes the line total look wrong against a big quantity.
    const aoa = materialCostAoa([row({ unitCost: 12.345, qty: 100 })], "EGP");
    expect(dataRows(aoa)[0][8]).toBe(12.35);
    expect(dataRows(aoa)[0][9]).toBe(1234.5);
  });

  it("separates the total from the data with a blank row, so a filter cannot drag it in", () => {
    const aoa = materialCostAoa([row()], "EGP");
    expect(aoa[aoa.length - 2]).toEqual([]);
  });

  it("shows a dash rather than an empty cell for a missing reference, supplier or stock", () => {
    const aoa = materialCostAoa([row({ reference: "", supplier: "", stock: "" })], "EGP");
    const r = dataRows(aoa)[0];
    expect([r[2], r[3], r[4]]).toEqual(["—", "—", "—"]);
  });

  it("still produces a usable sheet when there is nothing to cost", () => {
    const aoa = materialCostAoa([], "EGP");
    expect(aoa[0][0]).toBe("Group");
    expect(totalRow(aoa)[9]).toBe(0);
  });
});
