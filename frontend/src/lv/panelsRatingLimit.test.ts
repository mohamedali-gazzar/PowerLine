// Above 800 A a job has to be built in cells, not standard panel enclosures (RPT-01).
//
// This test exists because of what the app used to DO about it. Opening a panel that was already
// saved as Panels above the limit switched it to Cells and cleared the enclosures chosen for it —
// so a quotation amended from an approved one came out with two panels changed and their sizing
// gone, with nobody having touched them. The rule now only follows a rating the engineer actually
// raises; a saved panel in that state is reported instead.

import { describe, it, expect } from "vitest";
import { panelsOverRating, PANELS_MAX_INCOMER_A } from "./catalog";

describe("panelsOverRating — when Panels is not a buildable choice", () => {
  it("is true for a panels-mode panel above the limit", () => {
    expect(panelsOverRating("panels", PANELS_MAX_INCOMER_A + 1)).toBe(true);
    expect(panelsOverRating("panels", 1000)).toBe(true);
    expect(panelsOverRating("panels", 2500)).toBe(true);
  });

  it("is false at the limit exactly — 800 A is allowed on panels", () => {
    expect(panelsOverRating("panels", PANELS_MAX_INCOMER_A)).toBe(false);
  });

  it("is false below the limit", () => {
    for (const a of [0, 80, 160, 400, 630, 800]) {
      expect(panelsOverRating("panels", a), `${a} A`).toBe(false);
    }
  });

  it("says nothing about a panel that is not in panels mode", () => {
    // Cells have no such limit, and a panel whose type was never chosen is a separate warning.
    expect(panelsOverRating("cells", 4000)).toBe(false);
    expect(panelsOverRating("none", 4000)).toBe(false);
  });

  it("treats a missing rating as zero rather than throwing", () => {
    expect(panelsOverRating("panels", undefined as unknown as number)).toBe(false);
    expect(panelsOverRating("panels", NaN)).toBe(false);
  });
});
