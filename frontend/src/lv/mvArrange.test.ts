// REGRESSION TEST — MV RMU grouping. In the Technical offer one product photo shows at the
// start of each contiguous same-type run, so grouping same-type RMUs collapses the photos to
// at most 3 (Air / SF6 / Lucy). These pure helpers back that and the "arrange by type" nudge.

import { describe, it, expect } from "vitest";
import { mvRmuGroupedByType, arrangeMvRmusByType } from "./mvArrange";
import type { LvPanel } from "./store";

// Minimal panels — the helpers only read id / mvType / mvRmuConfig.productType.
const rmu = (id: string, type: string): LvPanel =>
  ({ id, mvType: "rmu", mvRmuConfig: { productType: type } } as unknown as LvPanel);
const kiosk = (id: string): LvPanel => ({ id, mvType: "kiosk" } as unknown as LvPanel);
const types = (ps: LvPanel[]) => ps.map((p) => (p.mvType === "rmu" ? p.mvRmuConfig!.productType : p.mvType));

describe("mvRmuGroupedByType", () => {
  it("is true when each product type is contiguous", () => {
    expect(mvRmuGroupedByType([rmu("a", "PRAL"), rmu("b", "PRAL"), rmu("c", "PSEC")])).toBe(true);
  });
  it("is false when a type reappears after a different one", () => {
    expect(mvRmuGroupedByType([rmu("a", "PRAL"), rmu("b", "PSEC"), rmu("c", "PRAL")])).toBe(false);
  });
  it("treats zero or one RMU as grouped", () => {
    expect(mvRmuGroupedByType([])).toBe(true);
    expect(mvRmuGroupedByType([rmu("a", "LUCY")])).toBe(true);
  });
});

describe("arrangeMvRmusByType", () => {
  it("groups same types, keeping first-appearance order of types and order within a type", () => {
    const out = arrangeMvRmusByType([rmu("a1", "PRAL"), rmu("s1", "PSEC"), rmu("a2", "PRAL"), rmu("l1", "LUCY"), rmu("s2", "PSEC")]);
    expect(out.map((p) => p.id)).toEqual(["a1", "a2", "s1", "s2", "l1"]);
    expect(mvRmuGroupedByType(out)).toBe(true);
  });
  it("leaves Kiosk / Transformer panels in their slots and only reorders RMUs", () => {
    const out = arrangeMvRmusByType([rmu("a1", "PRAL"), kiosk("k"), rmu("s1", "PSEC"), rmu("a2", "PRAL")]);
    // slot 1 (the kiosk) is untouched; the three RMU slots hold the RMUs grouped by type.
    expect(out.map((p) => p.id)).toEqual(["a1", "k", "a2", "s1"]);
    expect(types(out)).toEqual(["PRAL", "kiosk", "PRAL", "PSEC"]);
  });
  it("is a no-op on already-grouped RMUs", () => {
    const input = [rmu("a", "PRAL"), rmu("b", "PRAL"), rmu("c", "PSEC")];
    expect(arrangeMvRmusByType(input).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});
