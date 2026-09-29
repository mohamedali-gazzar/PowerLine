// The VSD tick box must still add its accessories when the PUBLISHED combinations do not carry them.
//
// This is a real case, not a hypothetical: the Combinations screen downloads and re-loads the
// engineers' "Combinations Database - MCC.xlsx", and that workbook holds the starters and the
// control block only. A catalogue published from such a save keeps every drive row and arrives with
// no accessories and no spec — and the tick box then added nothing at all, silently.

import { describe, it, expect, beforeEach } from "vitest";
import { COMBOS, installCombos, type CombosData } from "./catalog";
import { buildVsd, vsdAccessories, vsdSpec, VSD_KIND } from "./combos";

/** A published catalogue as an uploaded MCC workbook leaves it: starters + control, nothing else. */
function installWorkbookShapedCombos(): void {
  const next = JSON.parse(JSON.stringify(COMBOS)) as CombosData;
  next.mcc = { combos: next.mcc.combos, control: next.mcc.control };
  installCombos(next);
}

const firstVsdKw = (): string => {
  const row = COMBOS.mcc.combos.find((m) => m.kind === VSD_KIND);
  if (!row) throw new Error("no VSD starter in the bundled combinations");
  return row.kw;
};

describe("VSD accessories", () => {
  beforeEach(() => installWorkbookShapedCombos());

  it("falls back to the shipped list when the published combinations have none", () => {
    expect(COMBOS.mcc.vsdAccessories).toBeUndefined(); // the published shape being repaired
    expect(vsdAccessories().length).toBeGreaterThan(0);
    expect(vsdSpec().length).toBeGreaterThan(0);
  });

  it("adds every accessory to the circuit when the tick box is on", () => {
    const kw = firstVsdKw();
    const off = buildVsd(kw, null, false);
    const on = buildVsd(kw, null, true);
    expect(on.length).toBe(off.length + vsdAccessories().length);
    for (const a of vsdAccessories()) {
      expect(on.some((l) => l.desc === a.desc)).toBe(true);
    }
  });

  it("scales the accessories with the combination quantity", () => {
    const kw = firstVsdKw();
    const acc = vsdAccessories()[0];
    const line = buildVsd(kw, null, true, 3).find((l) => l.desc === acc.desc);
    expect(line?.qty).toBe(3 * acc.qty);
    expect(line?.baseQty).toBe(acc.qty);
  });

  it("prefers the published list when one IS carried", () => {
    const next = JSON.parse(JSON.stringify(COMBOS)) as CombosData;
    next.mcc.vsdAccessories = [{ qty: 2, desc: "Owner's own accessory" }];
    installCombos(next);
    expect(vsdAccessories()).toEqual([{ qty: 2, desc: "Owner's own accessory" }]);
  });
});
