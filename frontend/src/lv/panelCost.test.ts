// CHARACTERIZATION TESTS — the LV panel cost formula.
//
// This is the money. calcPanel() decides what every low-voltage quotation charges, and
// there was no test on it at all. Every number below is hand-computed from the formula as
// it stands today, using deliberately round inputs so the arithmetic is checkable by eye.
//
// If one of these fails, a quotation's price has moved. That is a business event, not a
// test to update — go and find out why.

import { describe, it, expect } from "vitest";
import { calcPanel, grandTotals, newPanel, kitRate, buswayCopperMult, type LvPanel } from "./store";
import { componentPriceEgp, copperTypeFactor, type Factors } from "./catalog";
import type { PanelComponent, PanelTypeItem } from "./store";

/** Round factors, so expected values are obvious rather than reverse-engineered. */
const F: Factors = {
  factor: 0.5, // cost ÷ 0.5 = cost × 2
  euro: 50, // 1 EUR = 50 EGP
  usd: 50,
  safetyFactor: 0, // no markup unless a test is about it
  copper: 10, // 10 EGP per kg
  sheetMetal: 100,
  operations: 0, // no overhead unless a test is about it
  abbDiscount: 0.2, // 20% off ABB items priced in EUR
  vat: 0.14,
  forms: {},
};

function comp(over: Partial<PanelComponent> = {}): PanelComponent {
  return {
    id: Math.random().toString(36).slice(2),
    section: "Main Incoming",
    name: "Test item",
    desc: "Test item",
    ref: "REF-1",
    type: "MCCB",
    brand: "ABB",
    rating: "100A",
    eur: 0,
    egp: 0,
    poles: 0,
    cuP: 0,
    cuC: 0,
    stock: "",
    qty: 1,
    adj: "",
    comment: "",
    note: "",
    ...over,
  } as PanelComponent;
}

/** A chosen enclosure sizing row, in the real PanelTypeItem shape. */
function encItem(over: Partial<PanelTypeItem> = {}): PanelTypeItem {
  return { id: "e1", slot: 1, fam: "SR-Basic", name: "1800x800x300", ref: "E-REF", ip: "IP54", eur: 0, egp: 0, qty: 1, ...over };
}

/** A panel with no sizing: kit rate 0, no enclosure, no auto busbar. Clean arithmetic. */
function panel(over: Partial<LvPanel> = {}): LvPanel {
  return { ...newPanel(), name: "P1", ...over };
}

describe("the defaults a new panel starts with", () => {
  // Pinned because the formula's behaviour depends on them.
  it("has no sizing, quantity 1, bare copper and no per-panel selling factor", () => {
    const p = newPanel();
    expect(p.sizingMode).toBe("none");
    expect(p.qty).toBe(1);
    expect(p.copperType).toBe("Bare");
    expect(p.sellFactor).toBe(0);
    expect(p.mainBusbarKg).toBe(0);
    expect(p.busbarPoles).toBe(3);
    expect(p.components).toEqual([]);
    expect(p.panelItems).toEqual([]);
  });

  it("costs nothing when it is empty", () => {
    const c = calcPanel(panel(), F);
    expect(c.unitCost).toBe(0);
    expect(c.sellUnit).toBe(0);
    expect(c.totalSell).toBe(0);
  });
});

describe("component pricing and the ABB discount", () => {
  it("converts a EUR price at the euro rate", () => {
    // 10 EUR × 50 = 500 EGP, less the 20% ABB discount = 400
    expect(componentPriceEgp({ eur: 10, egp: 0, brand: "ABB" }, F)).toBe(400);
  });

  it("gives the ABB discount ONLY to ABB items priced in euro", () => {
    // An ABB item priced locally in EGP keeps full price — it is not an import.
    expect(componentPriceEgp({ eur: 0, egp: 500, brand: "ABB" }, F)).toBe(500);
    // A non-ABB item priced in euro keeps full price too.
    expect(componentPriceEgp({ eur: 10, egp: 0, brand: "Schneider" }, F)).toBe(500);
    // Only ABB + euro gets it.
    expect(componentPriceEgp({ eur: 10, egp: 0, brand: "ABB" }, F)).toBe(400);
  });

  it("lets an explicit per-item discount override, for ANY brand", () => {
    // 0.5 = 50% off, applied to a non-ABB item that would otherwise get nothing.
    expect(componentPriceEgp({ eur: 10, egp: 0, brand: "Hitachi" }, F, 0.5)).toBe(250);
    // An explicit 0 must mean "no discount", not "fall back to the ABB rule".
    expect(componentPriceEgp({ eur: 10, egp: 0, brand: "ABB" }, F, 0)).toBe(500);
  });

  it("prefers EUR over EGP when both are set", () => {
    expect(componentPriceEgp({ eur: 10, egp: 999, brand: "Other" }, F)).toBe(500);
  });

  it("multiplies by the line quantity", () => {
    const c = calcPanel(panel({ components: [comp({ egp: 100, brand: "Other", qty: 3 })] }), F);
    expect(c.compCost).toBe(300);
  });

  it("honours a per-item discount passed into calcPanel by reference key", () => {
    const p = panel({ components: [comp({ ref: "REF-X", egp: 1000, brand: "Other" })] });
    const c = calcPanel(p, F, { "REF-X": 25 }); // percent, not fraction
    expect(c.compCost).toBe(750);
  });
});

describe("spacer rows", () => {
  it("cost nothing and carry no copper", () => {
    const p = panel({
      components: [
        comp({ egp: 500, brand: "Other" }),
        { ...comp({ egp: 9999, brand: "Other", cuP: 10, poles: 4 }), spacer: true } as PanelComponent,
      ],
    });
    const c = calcPanel(p, F);
    expect(c.compCost).toBe(500);
    expect(c.cuWeight).toBe(0);
  });
});

describe("connection copper", () => {
  it("is copper-per-pole × poles × quantity × the copper rate", () => {
    // cuP 0.5 × 4 poles = 2 kg per unit; × 3 units = 6 kg; × 10 EGP = 60
    const p = panel({ components: [comp({ cuP: 0.5, poles: 4, qty: 3 })] });
    const c = calcPanel(p, F);
    expect(c.cuWeight).toBe(6);
    expect(c.cuConnCost).toBe(60);
  });

  it("uses the CELL copper column in cells mode and the PANEL column in panels mode", () => {
    const parts = [comp({ cuP: 1, cuC: 5, poles: 2 })];
    expect(calcPanel(panel({ components: parts }), F).cuWeight).toBe(2); // cuP × 2
    expect(calcPanel(panel({ components: parts, sizingMode: "cells" }), F).cuWeight).toBe(10); // cuC × 2
  });

  it("doubles the copper for a busway-fed row, found anywhere in the note, any case", () => {
    expect(buswayCopperMult("fed by BusWay from above")).toBe(2);
    expect(buswayCopperMult("normal cable")).toBe(1);
    expect(buswayCopperMult(undefined)).toBe(1);
    const p = panel({ components: [comp({ cuP: 1, poles: 3, note: "Top BUSWAY" })] });
    expect(calcPanel(p, F).cuWeight).toBe(6); // 3 kg × 2
  });

  it("ignores a nonsense copper figure rather than pricing it", () => {
    // sane() drops anything >= 200 kg/pole — those are stray codes in the data column.
    const p = panel({ components: [comp({ cuP: 500, poles: 1 })] });
    expect(calcPanel(p, F).cuWeight).toBe(0);
    // …and a negative.
    expect(calcPanel(panel({ components: [comp({ cuP: -5, poles: 2 })] }), F).cuWeight).toBe(0);
  });

  it("contributes nothing when a component has no pole count", () => {
    // This is exactly the fault that made switch fuses cost no copper.
    const p = panel({ components: [comp({ cuP: 1.5, poles: 0 })] });
    expect(calcPanel(p, F).cuWeight).toBe(0);
  });
});

describe("the main busbar", () => {
  it("is weight × plating factor, then × the copper rate", () => {
    // 100 kg × 1 (Bare) × 10 = 1000
    expect(calcPanel(panel({ mainBusbarKg: 100 }), F).busbarCost).toBe(1000);
  });

  it("applies the plating premium to the WEIGHT, so the reported kg carries it too", () => {
    expect(copperTypeFactor("Bare")).toBe(1);
    expect(copperTypeFactor("Raychem")).toBe(1.02);
    expect(copperTypeFactor("Tin-plated")).toBe(1.05);
    expect(copperTypeFactor("Silver-Plated Connections")).toBe(1.15);
    expect(copperTypeFactor("something unknown")).toBe(1); // never throws, never zeroes
    const c = calcPanel(panel({ mainBusbarKg: 100, copperType: "Tin-plated" }), F);
    expect(c.busbarKg).toBe(105);
    expect(c.busbarCost).toBe(1050);
  });
});

describe("the assembly kit percentage", () => {
  it("is 10% for sheet-metal families, 3% for Pro-E, and nothing for the rest", () => {
    const mk = (family: string) =>
      kitRate(panel({ sizingMode: "panels", panelsSizing: { layout: "Single", family, sizing1: "", sizing2: "" } }));
    for (const fam of ["SR-Basic", "Unikit", "Local (Sheet Metal)", "PLP", "IS2"]) {
      expect(mk(fam), fam).toBe(0.1);
    }
    expect(mk("Pro-E")).toBe(0.03);
    for (const fam of ["Minicenter", "Primo", "Pillars", "Coffree", ""]) {
      expect(mk(fam), fam).toBe(0);
    }
  });

  it("is charged on the enclosure cost only", () => {
    const p = panel({
      sizingMode: "panels",
      panelsSizing: { layout: "Single", family: "SR-Basic", sizing1: "", sizing2: "" },
      panelItems: [encItem({ egp: 1000 })],
      components: [comp({ egp: 5000, brand: "Other" })],
    });
    const c = calcPanel(p, F);
    expect(c.enclCost).toBe(1000);
    expect(c.kits).toBe(100); // 10% of the enclosure, not of the components
  });

  it("never applies the global ABB discount to an enclosure", () => {
    // Enclosures are quoted at list price whatever the family.
    const p = panel({
      panelItems: [encItem({ eur: 10, qty: 2 })],
    });
    expect(calcPanel(p, F).enclCost).toBe(1000); // 10 × 50 × 2, no 20% off
  });
});

describe("the full chain: cost -> overhead -> selling -> quantity", () => {
  it("adds overhead, divides by the selling factor, then multiplies by quantity", () => {
    const G: Factors = { ...F, operations: 0.1, factor: 0.5 };
    const p = panel({ components: [comp({ egp: 1000, brand: "Other" })], qty: 4 });
    const c = calcPanel(p, G);
    expect(c.unitCost).toBe(1000);
    expect(c.unitCostOps).toBeCloseTo(1100, 6); // × 1.10
    expect(c.sellUnit).toBeCloseTo(2200, 6); // ÷ 0.5
    expect(c.totalSell).toBeCloseTo(8800, 6); // × 4 panels
  });

  it("treats the safety factor as a markup on the selling price", () => {
    const G: Factors = { ...F, safetyFactor: 0.02 };
    const p = panel({ components: [comp({ egp: 1000, brand: "Other" })] });
    // 1000 ÷ 0.5 = 2000, × 1.02 = 2040
    expect(calcPanel(p, G).sellUnit).toBeCloseTo(2040, 6);
  });

  it("lets a per-panel selling factor override the global one", () => {
    const p = panel({ components: [comp({ egp: 1000, brand: "Other" })], sellFactor: 0.25 });
    expect(calcPanel(p, F).sellUnit).toBeCloseTo(4000, 6); // ÷ 0.25, not ÷ 0.5
  });

  it("sells at cost rather than dividing by zero when the factor is 0", () => {
    const G: Factors = { ...F, factor: 0 };
    const p = panel({ components: [comp({ egp: 1000, brand: "Other" })] });
    expect(calcPanel(p, G).sellUnit).toBe(1000);
  });

  it("sums every cost term into unitCost exactly once", () => {
    const G: Factors = { ...F, operations: 0 };
    const p = panel({
      sizingMode: "panels",
      panelsSizing: { layout: "Single", family: "SR-Basic", sizing1: "", sizing2: "" },
      panelItems: [encItem({ egp: 1000 })],
      components: [comp({ egp: 2000, brand: "Other", cuP: 1, poles: 3 })],
      mainBusbarKg: 50,
    });
    const c = calcPanel(p, G);
    expect(c.compCost).toBe(2000);
    expect(c.enclCost).toBe(1000);
    expect(c.cuConnCost).toBe(30); // 3 kg × 10
    expect(c.busbarCost).toBe(500); // 50 kg × 10
    expect(c.kits).toBe(100); // 10% of 1000
    expect(c.unitCost).toBe(2000 + 1000 + 30 + 500 + 100);
  });
});

describe("a spare-parts cell is costed differently on purpose", () => {
  it("charges components plus manual busbar, with NO overhead and no kits", () => {
    const G: Factors = { ...F, operations: 0.5 }; // would be very visible if applied
    const p = panel({ spare: true, components: [comp({ egp: 1000, brand: "Other" })], mainBusbarKg: 10 });
    const c = calcPanel(p, G);
    expect(c.unitCost).toBe(1100); // 1000 + 10 kg × 10
    expect(c.unitCostOps).toBe(1100); // overhead deliberately NOT applied
    expect(c.kits).toBe(0);
    expect(c.enclCost).toBe(0);
    expect(c.sellUnit).toBeCloseTo(2200, 6); // ÷ 0.5
  });
});

describe("grand totals and VAT", () => {
  it("sums the panels, then adds VAT on top", () => {
    const state = {
      panels: [
        panel({ components: [comp({ egp: 1000, brand: "Other" })] }),
        panel({ components: [comp({ egp: 500, brand: "Other" })], qty: 2 }),
      ],
      factors: F,
      abbItemDiscounts: {},
    } as unknown as Parameters<typeof grandTotals>[0];
    const t = grandTotals(state);
    // panel 1: 1000 ÷ 0.5 = 2000. panel 2: 500 ÷ 0.5 = 1000, × 2 = 2000.
    expect(t.sell).toBeCloseTo(4000, 6);
    expect(t.vat).toBeCloseTo(560, 6); // 14%
    expect(t.incl).toBeCloseTo(4560, 6);
  });
});

describe("a damaged or older saved panel must not crash the calculation", () => {
  // Saved state is read back from JSON with no schema (the API stores it as `unknown`),
  // so the declared types are not guaranteed at runtime. A throw inside calcPanel blanks
  // the entire configurator, which reads to the user as lost work.
  it("survives an enclosure item that has no name", () => {
    const p = panel({
      sizingMode: "panels",
      panelsSizing: { layout: "Single", family: "SR-Basic", sizing1: "", sizing2: "" },
      // `name` is declared required, but an older or imported row can arrive without it.
      panelItems: [{ ...encItem({ egp: 1000 }), name: undefined } as unknown as PanelTypeItem],
      mainBusbarKg: 20,
    });
    expect(() => calcPanel(p, F)).not.toThrow();
    const c = calcPanel(p, F);
    expect(c.enclCost).toBe(1000); // the price still counts
    // No height means the auto busbar rule cannot apply, so the manual figure is used —
    // exactly as if no sizing item had been chosen at all.
    expect(c.busbarKg).toBe(20);
  });

  it("survives panelItems being absent altogether", () => {
    const p = { ...panel(), panelItems: undefined } as unknown as LvPanel;
    expect(() => calcPanel(p, F)).not.toThrow();
    expect(calcPanel(p, F).enclCost).toBe(0);
  });

  it("survives a component list containing a malformed row", () => {
    const p = panel({
      components: [comp({ egp: 100, brand: "Other" }), {} as unknown as PanelComponent],
    });
    expect(() => calcPanel(p, F)).not.toThrow();
  });
});
