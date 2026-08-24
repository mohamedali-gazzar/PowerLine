// CHARACTERIZATION TESTS — the "No. of poles" sizing summary, MCB rule.
//
// An MCB occupies one DIN-rail module per pole, so its space IS its pole count: a 1-pole
// MCB is 1 pole of space, a 3-pole MCB is 3. The pole count is read from the breaker's own
// rating (the "1P/2P/3P/4P" in its name, or the ABB S20x family code) so the space is right
// even when a saved or hand-typed row's stored `poles` number is stale. This is a sizing
// readout only — it never feeds any price.

import { describe, it, expect } from "vitest";
import { componentPoles, panelPoles } from "./poles";
import type { PanelComponent } from "./store";

const mcb = (name: string, poles: number) => ({ name, type: "MDRC", poles });

describe("MCB pole-width (space) = pole count", () => {
  it("counts a 1P MCB as 1 pole and a 3P MCB as 3", () => {
    expect(componentPoles(mcb("S201-C16 Miniature Circuit Breaker - 1P - C - 16 A", 1))).toEqual({ kind: "mcb", poles: 1 });
    expect(componentPoles(mcb("S202-C16 Miniature Circuit Breaker - 2P - C - 16 A", 2))).toEqual({ kind: "mcb", poles: 2 });
    expect(componentPoles(mcb("S203-C16 Miniature Circuit Breaker - 3P - C - 16 A", 3))).toEqual({ kind: "mcb", poles: 3 });
    expect(componentPoles(mcb("S204-C16 Miniature Circuit Breaker - 4P - C - 16 A", 4))).toEqual({ kind: "mcb", poles: 4 });
  });

  it("reads the pole count from the name even when the stored poles field is stale", () => {
    // A 3P breaker whose saved row wrongly says 1 pole must still occupy 3 poles of space.
    expect(componentPoles(mcb("S203-C63 Miniature Circuit Breaker - 3P - C - 63 A", 1))!.poles).toBe(3);
  });

  it("falls back to the ABB family code for a terse name with no poles field", () => {
    expect(componentPoles(mcb("S203-C63", 0))!.poles).toBe(3);
    expect(componentPoles(mcb("S201-C16", 0))!.poles).toBe(1);
    expect(componentPoles(mcb("SN201-C10", 0))!.poles).toBe(1);
  });

  it("defaults to 1 pole when nothing states the pole count", () => {
    expect(componentPoles(mcb("Custom breaker", 0))!.poles).toBe(1);
  });
});

describe("panelPoles totals MCB space across quantity", () => {
  it("sums pole-width x quantity and skips spacers", () => {
    const comps = [
      { ...mcb("S203-C16 Miniature Circuit Breaker - 3P - C - 16 A", 3), qty: 2 }, // 3 x 2 = 6
      { ...mcb("S201-C16 Miniature Circuit Breaker - 1P - C - 16 A", 1), qty: 3 }, // 1 x 3 = 3
      { ...mcb("S203-C16 Miniature Circuit Breaker - 3P - C - 16 A", 3), qty: 9, spacer: true }, // ignored
    ] as unknown as PanelComponent[];
    const r = panelPoles(comps);
    expect(r.rows.mcb.poles).toBe(9);
    expect(r.rows.mcb.count).toBe(5); // 2 + 3 breakers
    expect(r.total).toBe(9);
    expect(r.groups.protection).toBe(9);
  });
});
