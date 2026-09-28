// The Busbar Rating the panel proposes. A switch disconnector now sets it as well as a breaker —
// the owner's ladder (28 Sep 2026): anything below 160 A → 160, 200/250 → 250, 315/400 → 400, and
// 630 upwards each to themselves.

import { describe, it, expect } from "vitest";
import { predictIncomerRating } from "./busbarRating";
import type { LvPanel, PanelComponent } from "./store";

const sd = (amps: number): PanelComponent =>
  ({ type: "LBS", name: `Switch Disconnector ${amps}A 3P - Direct Operation`, section: "Main Incoming" } as PanelComponent);
const mccb = (frame: number): PanelComponent =>
  ({ type: "MCCB", name: `MCCB XT4N 200A-36kA ${frame} AF Ekip Dip LS/I 3P`, section: "Main Incoming" } as PanelComponent);
const panel = (...components: PanelComponent[]): LvPanel => ({ components } as LvPanel);

describe("Busbar Rating from a switch disconnector", () => {
  it("follows the owner's ladder exactly", () => {
    const expected: [number, number][] = [
      [16, 160], [25, 160], [40, 160], [63, 160], [80, 160], [100, 160], [125, 160], [160, 160],
      [200, 250], [250, 250],
      [315, 400], [400, 400],
      [630, 630], [800, 800], [1000, 1000], [1250, 1250],
      [1600, 1600], [2000, 2000], [2500, 2500], [3200, 3200],
    ];
    for (const [amps, bar] of expected) {
      expect(predictIncomerRating(panel(sd(amps)))).toBe(bar);
    }
  });

  it("only counts a switch disconnector on the incoming section", () => {
    const outgoing = { ...sd(400), section: "Outgoings" } as PanelComponent;
    expect(predictIncomerRating(panel(outgoing))).toBe(0);
  });

  it("takes the largest when several feed the same bar", () => {
    expect(predictIncomerRating(panel(sd(160), sd(630), sd(250)))).toBe(630);
  });

  it("never undersizes the bar when a breaker is there too", () => {
    // The breaker wants 250, the disconnector 630 — the bar has to carry both.
    expect(predictIncomerRating(panel(mccb(250), sd(630)))).toBe(630);
    // …and the other way round.
    expect(predictIncomerRating(panel(mccb(1600), sd(160)))).toBe(1600);
  });

  it("still returns nothing for an empty panel", () => {
    expect(predictIncomerRating(panel())).toBe(0);
  });
});

describe("Busbar Rating from a breaker — unchanged", () => {
  it("snaps the ampere frame up to a standard rating", () => {
    expect(predictIncomerRating(panel(mccb(160)))).toBe(160);
    expect(predictIncomerRating(panel(mccb(250)))).toBe(250);
    expect(predictIncomerRating(panel(mccb(1600)))).toBe(1600);
  });

  it("gives an MCB-only incomer the standard 100 A bar", () => {
    const mcb = { type: "MDRC", name: "MCB S203 C63", section: "Main Incoming" } as PanelComponent;
    expect(predictIncomerRating(panel(mcb))).toBe(100);
  });
});
