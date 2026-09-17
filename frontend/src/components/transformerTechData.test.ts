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
  it("leaves a non-PDTR code (no IP suffix) untouched", () => {
    expect(trDisplayCode("TRD 500-11-00", false)).toBe("TRD 500-11-00");
    expect(trDisplayCode("TRD 500-11-00", true)).toBe("TRD 500-11-00");
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
