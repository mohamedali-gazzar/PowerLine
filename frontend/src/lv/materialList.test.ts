// What the Material List must actually contain.
//
// The list is the costing document as well as the supply-chain one, so anything a panel is
// CHARGED for has to appear with the price it is charged at. A line that shows a quantity
// against no price does not read as broken — it reads as free, and it quietly understates
// the job.

import { describe, it, expect } from "vitest";
import { buildMaterialList, newPanel, initialState, type LvPanel, type LvState } from "./store";

function state(panels: LvPanel[]): LvState {
  return { ...initialState(), panels };
}

/** A cells-mode panel: on these the CELLS are the enclosure, and they are charged for. */
function cellsPanel(rows: { desc: string; qty: number; eur?: number; egp?: number }[], over: Partial<LvPanel> = {}): LvPanel {
  const p = newPanel();
  return {
    ...p,
    name: "P1",
    sizingMode: "cells",
    cellConfig: { ...p.cellConfig, type: "PLP", rows: rows as never },
    ...over,
  } as LvPanel;
}

describe("the Material List carries the price of everything it lists", () => {
  it("prices the CELLS on a cells-mode panel", () => {
    // These were listed with a quantity and no price at all, so the PLP / IS2 / Pro-E
    // tables valued a real enclosure at zero.
    const ml = buildMaterialList(state([
      cellsPanel([{ desc: "PLP cell 800x2000", qty: 2, eur: 0, egp: 12000 }]),
    ]));
    const cell = ml.plpCells.find((r) => r.description === "PLP cell 800x2000");
    expect(cell).toBeTruthy();
    expect(cell!.qty).toBe(2);
    expect(cell!.egp).toBe(12000);
  });

  it("keeps a euro-priced cell in euro, so the conversion happens once, later", () => {
    const ml = buildMaterialList(state([
      cellsPanel([{ desc: "PLP cell EUR", qty: 1, eur: 250, egp: 0 }]),
    ]));
    // By description, not by position: a cells panel also carries its own fixed rows.
    expect(ml.plpCells.find((r) => r.description === "PLP cell EUR")?.eur).toBe(250);
  });

  it("multiplies cell quantities by the panel quantity, like every other line", () => {
    const ml = buildMaterialList(state([
      cellsPanel([{ desc: "PLP cell", qty: 3, egp: 100 }], { qty: 4 }),
    ]));
    expect(ml.plpCells.find((r) => r.description === "PLP cell")?.qty).toBe(12);
  });

  it("still reports the copper weight, which is what the workshop orders by", () => {
    const p = newPanel();
    const ml = buildMaterialList(state([
      { ...p, name: "P1", mainBusbarKg: 25, copperType: "Bare" } as LvPanel,
    ]));
    expect(ml.copperKg).toBeGreaterThan(0);
  });

  it("prices an enclosure chosen in panels mode", () => {
    const p = newPanel();
    const ml = buildMaterialList(state([
      {
        ...p, name: "P1",
        panelItems: [{ id: "e1", slot: 1, fam: "SR-Basic", name: "1800x800x300", ref: "E-REF", ip: "IP54", eur: 300, egp: 0, qty: 1 }],
      } as LvPanel,
    ]));
    const enc = ml.abbEnclosures.find((r) => r.description.includes("1800x800x300"));
    expect(enc?.eur).toBe(300);
  });
});
