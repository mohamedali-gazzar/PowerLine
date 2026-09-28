// An XT7 that the panel will OPERATE — an ATS incomer, or the Motorized C.B combination — has to be
// the factory-motorised XT7 M on a DISTRIBUTION trip unit. Both halves matter, and the owner gave a
// real example of each: the one to offer, and the one that used to slip through.

import { describe, it, expect } from "vitest";
import { isOperableXt7, operableBreakerPool, atsBreakerPool, frameOf } from "./combos";
import type { DbComponent } from "./catalog";

/** Only the name is read, so a bare component is enough. */
const cb = (n: string): DbComponent => ({ n, t: "MCCB" } as DbComponent);

describe("XT7 as a switched incomer", () => {
  it("accepts the motorised XT7 on a distribution trip unit", () => {
    // The owner's example of a correct one: "M" for motorised, LS/I as the trip unit.
    expect(isOperableXt7(cb("MCCB XT7S M 1000A-50kA 1000 AF Ekip Dip LS/I 3P"))).toBe(true);
    expect(isOperableXt7(cb("MCCB XT7S M 1000A-50kA 1000 AF Ekip Dip LSIG 4P"))).toBe(true);
    expect(isOperableXt7(cb("MCCB XT7H M 1600A-70kA 1600 AF Ekip Dip LSIG 3P"))).toBe(true);
  });

  it("rejects the motor-protection unit that reads as motorised", () => {
    // The owner's example of the wrong one. It says "XT7S M", so a motorised-only test lets it
    // through, but "Ekip M Dip I" protects a MOTOR — it is not a distribution incomer.
    expect(isOperableXt7(cb("MCCB XT7S M 1000 Ekip M Dip I In=1000A 3p F F"))).toBe(false);
  });

  it("rejects a plain XT7 — its operator is not a bolt-on accessory", () => {
    expect(isOperableXt7(cb("MCCB XT7S 1000A-50kA 1000 AF Ekip Dip LS/I 3P"))).toBe(false);
    expect(isOperableXt7(cb("MCCB XT7H 1600A-70kA 1600 AF Ekip Dip LSIG 4P"))).toBe(false);
  });

  it("offers only motorised XT7s, and leaves every other frame alone", () => {
    const all = atsBreakerPool();
    const pool = operableBreakerPool();
    const xt7 = pool.filter((c) => frameOf(c) === "XT7");
    expect(xt7.length).toBeGreaterThan(0);          // the catalogue does carry them
    expect(xt7.every(isOperableXt7)).toBe(true);
    // Nothing outside XT7 was touched.
    const others = (xs: DbComponent[]) => xs.filter((c) => frameOf(c) !== "XT7").length;
    expect(others(pool)).toBe(others(all));
    // …and the plain XT7s really were dropped.
    expect(xt7.length).toBeLessThan(all.filter((c) => frameOf(c) === "XT7").length);
  });
});
