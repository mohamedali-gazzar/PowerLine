// Loading the engineers' MCC workbook must not delete the parts of the section it cannot carry.
//
// The workbook holds the starters and the control block. Everything else the mcc section carries —
// today the VSD tick-box accessories and the spec strip — is absent from it, so storing an upload
// verbatim wiped them while leaving the drive rows in place. A published catalogue then offered a
// VSD starter whose Accessories tick box added nothing.

import { describe, it, expect } from "vitest";
import { keepMccExtras } from "./pricing-lv-combos.controller";

const stored = () => ({
  combos: [{ kind: "VSD", kw: "55 kW", type: 1, parts: ["Variable speed drive 55 kW"] }],
  control: [{ qty: 1, desc: "Relay" }],
  vsdAccessories: [{ qty: 1, desc: "Selector 3 Position" }],
  vsdSpec: ["Rated Voltage: 400 V"],
});

/** What parseMcc returns for an uploaded workbook: the two lists it can see, and nothing else. */
const fromWorkbook = () => ({
  combos: [{ kind: "VSD", kw: "55 kW", type: 1, parts: ["Variable speed drive 55 kW"] }],
  control: [{ qty: 1, desc: "Relay" }],
});

describe("keepMccExtras", () => {
  it("carries the accessories and the spec through a workbook upload", () => {
    const incoming = fromWorkbook() as Record<string, unknown>;
    keepMccExtras(incoming, stored());
    expect(incoming.vsdAccessories).toEqual([{ qty: 1, desc: "Selector 3 Position" }]);
    expect(incoming.vsdSpec).toEqual(["Rated Voltage: 400 V"]);
  });

  it("leaves the uploaded starters and control block exactly as they came", () => {
    const incoming = fromWorkbook() as Record<string, unknown>;
    keepMccExtras(incoming, { ...stored(), combos: [], control: [{ qty: 9, desc: "Old" }] });
    expect(incoming.combos).toEqual(fromWorkbook().combos);
    expect(incoming.control).toEqual(fromWorkbook().control);
  });

  it("lets an upload that brings its own list win", () => {
    const incoming = { ...fromWorkbook(), vsdAccessories: [{ qty: 4, desc: "New" }] } as Record<string, unknown>;
    keepMccExtras(incoming, stored());
    expect(incoming.vsdAccessories).toEqual([{ qty: 4, desc: "New" }]);
    expect(incoming.vsdSpec).toEqual(["Rated Voltage: 400 V"]); // the one it did not bring is still kept
  });

  it("treats an empty list as nothing brought", () => {
    const incoming = { ...fromWorkbook(), vsdAccessories: [] } as Record<string, unknown>;
    keepMccExtras(incoming, stored());
    expect(incoming.vsdAccessories).toEqual([{ qty: 1, desc: "Selector 3 Position" }]);
  });

  it("does nothing when there is no stored section, and never throws", () => {
    const incoming = fromWorkbook() as Record<string, unknown>;
    keepMccExtras(incoming, null);
    keepMccExtras(incoming, "not an object");
    keepMccExtras(null, stored());
    expect(incoming.vsdAccessories).toBeUndefined();
  });
});
