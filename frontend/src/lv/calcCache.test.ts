// The memoized panel-cost cache must never change a number.
//
// calcPanelCached() caches calcPanel()'s result on the panel object so a 400-panel project reprices
// only the panels that actually changed. That optimisation is only safe if the cached result is
// byte-for-byte the same as recomputing. These tests pin that: same inputs → identical figures, a
// changed panel (new object) → recomputed, a changed rate → recomputed, and grandTotals (which uses
// the cache) equals a full uncached sum across many panels.

import { describe, it, expect } from "vitest";
import { calcPanel, calcPanelCached, grandTotals, newPanel, type LvPanel } from "./store";
import type { Factors } from "./catalog";
import type { PanelComponent, LvState } from "./store";

const F: Factors = {
  factor: 0.5, euro: 50, usd: 50, safetyFactor: 0, copper: 10, sheetMetal: 100,
  operations: 0.1, abbDiscount: 0.2, vat: 0.14, forms: {},
};
// One stable discounts object — the cache keys on reference identity (in the app s.abbItemDiscounts is
// a stable reference across panel edits), so passing a fresh {} each call would always miss the cache.
const ABB: Record<string, number> = {};

function comp(over: Partial<PanelComponent> = {}): PanelComponent {
  return {
    id: Math.random().toString(36).slice(2), section: "Main Incoming", name: "Item", desc: "Item",
    ref: "REF-1", type: "MCCB", brand: "ABB", rating: "100A", eur: 0, egp: 0, poles: 0, cuP: 0, cuC: 0,
    stock: "", qty: 1, adj: "", comment: "", note: "", ...over,
  } as PanelComponent;
}
function panel(i: number): LvPanel {
  // A mix so the formula's branches are exercised across the set.
  return {
    ...newPanel(), name: `P${i}`, qty: (i % 3) + 1,
    mainBusbarKg: (i % 5) * 10,
    components: [
      comp({ egp: 1000 + i, brand: "Other", qty: (i % 4) + 1 }),
      comp({ eur: 10 + (i % 7), brand: "ABB", cuP: 0.5, poles: 4 }),
    ],
  };
}

describe("calcPanelCached returns exactly what calcPanel does", () => {
  it("matches the uncached figures for a spread of panels", () => {
    for (let i = 0; i < 25; i++) {
      const p = panel(i);
      expect(calcPanelCached(p, F, {})).toEqual(calcPanel(p, F, {}));
    }
  });

  it("returns the SAME cached object for an unchanged panel (a cache hit)", () => {
    const p = panel(1);
    const a = calcPanelCached(p, F, ABB);
    const b = calcPanelCached(p, F, ABB);
    expect(b).toBe(a); // same reference → it was served from cache, not recomputed
  });

  it("recomputes when the panel object changes (an edit)", () => {
    const p = panel(2);
    const a = calcPanelCached(p, F, ABB);
    const edited = { ...p, mainBusbarKg: p.mainBusbarKg + 100 }; // upPanel makes a new object like this
    const b = calcPanelCached(edited, F, ABB);
    expect(b).not.toBe(a);
    expect(b).toEqual(calcPanel(edited, F, ABB));
    expect(b.busbarCost).not.toBe(a.busbarCost); // the change is reflected
  });

  it("recomputes when the rate object changes", () => {
    const p = panel(3);
    const a = calcPanelCached(p, F, ABB);
    const G: Factors = { ...F, copper: 20 };
    const b = calcPanelCached(p, G, ABB);
    expect(b).not.toBe(a);
    expect(b).toEqual(calcPanel(p, G, ABB));
  });
});

describe("grandTotals is identical with the cache, at scale", () => {
  it("equals a full uncached sum over 400 unique panels", () => {
    const panels = Array.from({ length: 400 }, (_, i) => panel(i));
    const state = { panels, factors: F, abbItemDiscounts: {} } as unknown as LvState;

    // Reference figure computed the slow way, with NO cache involved.
    const refSell = panels.reduce((sum, p) => sum + calcPanel(p, F, {}).totalSell, 0);
    const t = grandTotals(state);

    expect(t.sell).toBeCloseTo(refSell, 6);
    expect(t.vat).toBeCloseTo(refSell * F.vat, 6);
    expect(t.incl).toBeCloseTo(refSell + refSell * F.vat, 6);
  });
});
