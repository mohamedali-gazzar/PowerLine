// CHARACTERIZATION TESTS — the per-feeder Aux-contact / Shunt-trip lines on the RMU technical.
//
// These pin how ticking "Auxiliary contact" (any feeder) or "Shunt trip" (transformer feeders only)
// on the RMU config turns into lines on the generated cubicles — and, crucially, how the ring/
// transformer cubicles SPLIT when the ticks differ between feeders of the same family. This is what
// the customer reads on the technical offer, so the merge-vs-split rule must not drift.

import { describe, it, expect } from "vitest";
import { assembleOffer, type RmuConfigInput } from "./assembly";

function cfg(over: Partial<RmuConfigInput> = {}): RmuConfigInput {
  return {
    productType: "PSEC",
    voltageKv: 12,
    lbsBrand: "ABB",
    clientSpec: "EECH",
    nalCount: 3,
    nalfCount: 1,
    hasMetering: false,
    rtuType: "NONE",
    installation: "INDOOR",
    busbarCurrentA: 630,
    ...over,
  };
}

const AUX = "Auxiliary contact for LBS";
const SHUNT = "Shunt Trip for LBS";
const pcc = (o: ReturnType<typeof assembleOffer>) => o.cubicles.filter((c) => c.code === "PCC");
const pfc = (o: ReturnType<typeof assembleOffer>) => o.cubicles.filter((c) => c.code === "PFC");
const has = (c: { items: { description: string }[] }, d: string) => c.items.some((i) => i.description === d);

describe("RMU technical — Aux / Shunt lines and cubicle splitting", () => {
  it("no ticks → one merged ring cubicle (qty=nalCount), no extra lines", () => {
    const g = assembleOffer(cfg());
    const rings = pcc(g);
    expect(rings).toHaveLength(1);
    expect(rings[0].qty).toBe(3);
    expect(has(rings[0], AUX)).toBe(false);
    expect(has(rings[0], SHUNT)).toBe(false);
  });

  it("aux on ALL rings → stays one merged cubicle with the Aux line", () => {
    const g = assembleOffer(cfg({ feederAux: { R1: true, R2: true, R3: true } }));
    const rings = pcc(g);
    expect(rings).toHaveLength(1);
    expect(rings[0].qty).toBe(3);
    expect(has(rings[0], AUX)).toBe(true);
  });

  it("aux on SOME rings → splits into one qty-1 cubicle per ring, Aux only where ticked", () => {
    const g = assembleOffer(cfg({ feederAux: { R1: true, R2: true } })); // R3 not ticked
    const rings = pcc(g);
    expect(rings).toHaveLength(3);
    expect(rings.every((r) => r.qty === 1)).toBe(true);
    expect(rings.filter((r) => has(r, AUX))).toHaveLength(2);
  });

  it("shunt trip on the transformer feeder shows on the PFC cubicle", () => {
    const g = assembleOffer(cfg({ feederShunt: { T1: true } }));
    const trafos = pfc(g);
    expect(trafos).toHaveLength(1);
    expect(has(trafos[0], SHUNT)).toBe(true);
  });

  it("shunt never lands on a ring cubicle even if the map carries a ring id", () => {
    const g = assembleOffer(cfg({ feederShunt: { R1: true } as Record<string, boolean> }));
    expect(pcc(g).some((r) => has(r, SHUNT))).toBe(false);
  });

  it("total physical cubicle count is unchanged whether merged or split", () => {
    const merged = assembleOffer(cfg({ feederAux: { R1: true, R2: true, R3: true } }));
    const split = assembleOffer(cfg({ feederAux: { R1: true, R2: true } }));
    const sumQty = (o: ReturnType<typeof assembleOffer>) => o.cubicles.reduce((n, c) => n + c.qty, 0);
    expect(sumQty(merged)).toBe(sumQty(split));
  });
});
