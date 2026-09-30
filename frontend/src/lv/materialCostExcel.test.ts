// The flat material-cost sheet.
//
// This is a costing document: somebody reads a number off it and quotes a customer. The
// arithmetic, the grouping and the grand total are therefore worth pinning — a wrong total
// here is a wrong price, not a wrong pixel.
//
// It also has to be CHECKABLE. Items are priced in different currencies (ABB imports in EUR,
// local supply in EGP), so most figures on the sheet are conversions. A conversion whose rate
// is not written down cannot be verified, and months later cannot be reproduced at all — the
// rate in the app will have moved on. Hence the rate header and the per-line rate column.

import { describe, it, expect } from "vitest";
import { materialCostAoa, type MatCostRow, type MatCostRates } from "./materialExcel";

const RATES: MatCostRates = { eurToEgp: 50, usdToEgp: 48 };

const eurRow = (over: Partial<MatCostRow> = {}): MatCostRow => ({
  group: "1 · ABB Products",
  description: "MCCB 100A",
  reference: "REF-1",
  supplier: "ABB",
  stock: "In stock",
  qty: 2,
  listCurrency: "EUR",
  listPrice: 120,
  rateToEgp: 50,
  discPct: 20,
  mktPct: 0,
  unitCost: 4800, // 120 EUR × 50 × (1 − 0.20)
  ...over,
});

const egpRow = (over: Partial<MatCostRow> = {}): MatCostRow =>
  eurRow({
    group: "2 · Other Suppliers",
    description: "Contactor 40A",
    supplier: "Schneider",
    listCurrency: "EGP",
    listPrice: 3500,
    rateToEgp: null,
    discPct: 0,
    unitCost: 3500,
    ...over,
  });

/** Row 0 is the rates, row 1 blank, row 2 the headers; the last two are spacer + total. */
const headerRow = (aoa: (string | number)[][]) => aoa[2];
const dataRows = (aoa: (string | number)[][]) => aoa.slice(3, -2);
const totalRow = (aoa: (string | number)[][]) => aoa[aoa.length - 1];

describe("the material cost sheet", () => {
  it("states the rate every converted figure was worked out with", () => {
    const aoa = materialCostAoa([eurRow()], "EGP", RATES);
    expect(aoa[0][0]).toBe("Rates used");
    expect(aoa[0][1]).toBe("1 EUR = 50 EGP");
  });

  it("adds the USD rate only when the sheet is actually written in USD", () => {
    // Naming a rate nothing was converted with invites someone to apply it.
    expect(materialCostAoa([], "EGP", RATES)[0]).toHaveLength(2);
    expect(materialCostAoa([], "USD", RATES)[0]).toContain("1 USD = 48 EGP");
  });

  it("names the currency in the money headers, so a figure is never ambiguous", () => {
    expect(headerRow(materialCostAoa([], "USD", RATES))).toContain("Unit cost (USD)");
    expect(headerRow(materialCostAoa([], "EGP", RATES))).toContain("Total cost (EGP)");
  });

  it("keeps each item's OWN price-list currency and figure", () => {
    // The supplier's own number, so a line can be checked against their price list without
    // unwinding a discount and an exchange rate first.
    const aoa = materialCostAoa([eurRow(), egpRow()], "EGP", RATES);
    const [a, b] = dataRows(aoa);
    expect([a[6], a[7]]).toEqual(["EUR", 120]);
    expect([b[6], b[7]]).toEqual(["EGP", 3500]);
  });

  it("prints the rate on a converted line and a dash on one that was never converted", () => {
    const aoa = materialCostAoa([eurRow(), egpRow()], "EGP", RATES);
    const [a, b] = dataRows(aoa);
    expect(a[8]).toBe(50);   // EUR → EGP really happened
    expect(b[8]).toBe("—");  // already EGP; a rate here would imply a conversion
  });

  it("puts the supplier group on EVERY line, not just the first of a run", () => {
    // The whole point of one flat sheet: each line must stand on its own once sorted.
    const aoa = materialCostAoa([eurRow(), eurRow({ description: "MCCB 160A" }), egpRow()], "EGP", RATES);
    expect(dataRows(aoa).map((r) => r[0])).toEqual([
      "1 · ABB Products", "1 · ABB Products", "2 · Other Suppliers",
    ]);
  });

  it("multiplies the line out by quantity", () => {
    const aoa = materialCostAoa([eurRow({ unitCost: 100, qty: 2 })], "EGP", RATES);
    const r = dataRows(aoa)[0];
    expect(r[11]).toBe(100); // unit
    expect(r[12]).toBe(200); // total
  });

  it("adds every line into the grand total", () => {
    const aoa = materialCostAoa(
      [eurRow({ unitCost: 100, qty: 2 }), eurRow({ unitCost: 50.5, qty: 3 }), egpRow({ unitCost: 10, qty: 1 })],
      "EGP",
      RATES,
    );
    expect(totalRow(aoa)).toContain("TOTAL");
    expect(totalRow(aoa)[12]).toBe(361.5); // 200 + 151.5 + 10
  });

  it("keeps the cents on a unit cost", () => {
    // Rounding a unit to whole money makes the line total look wrong against a big quantity.
    const aoa = materialCostAoa([eurRow({ unitCost: 12.345, qty: 100 })], "EGP", RATES);
    expect(dataRows(aoa)[0][11]).toBe(12.35);
    expect(dataRows(aoa)[0][12]).toBe(1234.5);
  });

  it("separates the total from the data with a blank row, so a filter cannot drag it in", () => {
    const aoa = materialCostAoa([eurRow()], "EGP", RATES);
    expect(aoa[aoa.length - 2]).toEqual([]);
  });

  it("shows a dash rather than an empty cell for a missing reference, supplier or stock", () => {
    const aoa = materialCostAoa([eurRow({ reference: "", supplier: "", stock: "" })], "EGP", RATES);
    const r = dataRows(aoa)[0];
    expect([r[2], r[3], r[4]]).toEqual(["—", "—", "—"]);
  });

  it("still produces a usable sheet when there is nothing to cost", () => {
    const aoa = materialCostAoa([], "EGP", RATES);
    expect(headerRow(aoa)[0]).toBe("Group");
    expect(totalRow(aoa)[12]).toBe(0);
  });
});
