// The transformer CODE carries an IP suffix: "…2300" = IP23 (standalone), "…0000" = IP00 (inside
// a kiosk). The code shown to the customer must follow the Standalone / Inside-kiosk toggle, NOT
// whatever suffix the price list stored — a standalone transformer whose price row is "PDTR1110010000"
// must still read "PDTR1110012300". These tests pin that rule (regression: it used to show …0000 for
// standalone) and the sibling model/IP helpers.
import { describe, it, expect } from "vitest";
import { trDisplayCode, trModel, trEnclosureIp, findTransformerTech } from "./transformerTechData";

describe("trDisplayCode", () => {
  it("standalone reads …2300 even when the price list stored …0000", () => {
    expect(trDisplayCode("PDTR1110010000", false)).toBe("PDTR1110012300");
    expect(trDisplayCode("PDTR2205010000", false)).toBe("PDTR2205012300");
  });
  it("inside a kiosk reads …0000", () => {
    expect(trDisplayCode("PDTR1110010000", true)).toBe("PDTR1110010000");
    expect(trDisplayCode("PDTR1110012300", true)).toBe("PDTR1110010000");
  });
  it("standalone keeps a …2300 code as-is", () => {
    expect(trDisplayCode("PDTR1110012300", false)).toBe("PDTR1110012300");
  });
  it("handles the dash form (e.g. Hitachi TRD …-00 / …-23)", () => {
    // A "…-00" (IP00) code reads as "…-23" for a standalone transformer.
    expect(trDisplayCode("TRD 1000-22-00", false)).toBe("TRD 1000-22-23");
    expect(trDisplayCode("TRD 1000-22-00", true)).toBe("TRD 1000-22-00");
    expect(trDisplayCode("TRD 1000-22-23", true)).toBe("TRD 1000-22-00");
    expect(trDisplayCode("TRD 1000-22-23", false)).toBe("TRD 1000-22-23");
  });
  it("handles the IP mid-code, before a brand suffix (e.g. Sewedy)", () => {
    expect(trDisplayCode("TRD 1000-22-00-Sewedy", false)).toBe("TRD 1000-22-23-Sewedy");
    expect(trDisplayCode("TRD 1000-22-23-Sewedy", true)).toBe("TRD 1000-22-00-Sewedy");
  });
  it("leaves a code with no IP suffix untouched", () => {
    expect(trDisplayCode("TRO 50-11-7", false)).toBe("TRO 50-11-7");
    expect(trDisplayCode("TRO 50-11-7", true)).toBe("TRO 50-11-7");
  });
});

describe("trModel / trEnclosureIp", () => {
  it("swaps the datasheet model suffix by IP context", () => {
    const t = findTransformerTech(11, 1000)!;
    expect(t.model).toBe("PDTR1110012300");
    expect(trModel(t, false)).toBe("PDTR1110012300");
    expect(trModel(t, true)).toBe("PDTR1110010000");
  });
  it("enclosure IP is IP23 standalone, IP00 inside a kiosk", () => {
    expect(trEnclosureIp(false)).toBe("IP23");
    expect(trEnclosureIp(true)).toBe("IP00");
  });
  it("finds a published datasheet only for the standard pairs", () => {
    expect(findTransformerTech(11, 1000)?.ratingKva).toBe(1000);
    expect(findTransformerTech(11, 1250)).toBeNull(); // 1250 kVA has no published sheet
    expect(findTransformerTech(33, 1000)).toBeNull(); // 33 kV not published
  });
});
