// Tests for the product-coding rules.
//
// The guide these came from had its rules tangled into the page, so nothing could be
// checked and it was free to drift away from what the app actually stamps on an offer.
// The most valuable test here is the round-trip over all 864 approved RMU codes: if a rule
// changes, a real product stops being describable, and this fails.

import { describe, it, expect } from "vitest";
import {
  ratingIsExact,
  ratingSharedWith,
  buildRmuCode,
  decodeRmu,
  rmuLayout,
  rmuClassText,
  isApprovedRmu,
  rmuRangeCoverage,
  ratingCode,
  ratingKva,
  buildTrCode,
  decodeTr,
  buildGearCode,
  decodeGear,
  decodeAny,
} from "./codes";
import { RMU_RANGES, RMU_CLASSES, RMU_SPECS, RMU_EXAMPLES, TR_KVA } from "./data";

describe("RMU codes", () => {
  it("builds the documented shape", () => {
    expect(
      buildRmuCode({ family: "PSEC", spec: "10", cls: "AB", volt: "24", ring: "2", trans: "1", meas: "M" }),
    ).toBe("PSEC10AB24R2T1M");
  });

  it("describes the cell layout the way the engineers write it", () => {
    expect(rmuLayout({ ring: "3", trans: "1", meas: "M" })).toBe("3+1+M");
    expect(rmuLayout({ ring: "3", trans: "1", meas: "W" })).toBe("3+1");
    expect(rmuLayout({ ring: "4", trans: "0", meas: "W" })).toBe("4+0");
  });

  it("uses the SF6 wording for PSEC and the air wording for PRAL", () => {
    // The same supplier letter means a different switch depending on the family.
    expect(rmuClassText("AB", "PSEC")).toContain("SF6");
    expect(rmuClassText("AB", "PRAL")).toContain("Air");
    expect(rmuClassText("ZZ", "PSEC")).toBe("unknown supplier");
  });

  // The guard rail. Every approved product must remain buildable and readable.
  it("round-trips ALL 864 approved codes", () => {
    expect(RMU_RANGES.length).toBe(864);
    const broken: string[] = [];
    for (const [code, layout] of RMU_RANGES) {
      const d = decodeRmu(code);
      if (!d.ok) { broken.push(`${code}: cannot decode`); continue; }
      const seg = (f: string) => d.segments.find((s) => s.field === f)?.chars ?? "";
      const rebuilt = buildRmuCode({
        family: seg("Family"),
        spec: seg("Client + type"),
        cls: seg("LBS supplier"),
        volt: seg("Voltage"),
        ring: seg("Ring feeders").slice(1),
        trans: seg("Transformer feeders").slice(1),
        meas: seg("Measuring"),
      });
      if (rebuilt !== code) broken.push(`${code}: rebuilt as ${rebuilt}`);
      const built = rmuLayout({
        ring: seg("Ring feeders").slice(1),
        trans: seg("Transformer feeders").slice(1),
        meas: seg("Measuring"),
      });
      if (built !== layout) broken.push(`${code}: layout ${built} but catalogue says ${layout}`);
    }
    expect(broken).toEqual([]);
  });

  it("agrees with every worked example in the engineers' guide", () => {
    for (const ex of RMU_EXAMPLES) {
      expect(decodeRmu(ex.code).ok, ex.code).toBe(true);
    }
  });

  it("knows which codes are in the approved range", () => {
    expect(isApprovedRmu("PSEC10AB12R2T0W")).toBe(true);
    expect(isApprovedRmu("  psec10ab12r2t0w  ")).toBe(true); // tolerant of how it is typed
    // Valid shape, but not a product anyone has signed off.
    expect(isApprovedRmu("PSEC10AB12R5T2M")).toBe(false);
  });

  it("reports how much of the possible range is actually approved", () => {
    const { approved, possible } = rmuRangeCoverage();
    expect(approved).toBe(864);
    expect(possible).toBeGreaterThan(approved); // the shape allows more than is offered
  });

  describe("reading a code back", () => {
    it("explains every part", () => {
      const d = decodeRmu("PSEC19AB24R3T1M");
      expect(d.ok).toBe(true);
      expect(d.segments.map((s) => s.field)).toEqual([
        "Family", "Client + type", "LBS supplier", "Voltage",
        "Ring feeders", "Transformer feeders", "Measuring",
      ]);
      expect(d.summary).toContain("Smart");
      expect(d.summary).toContain("24 kV");
      expect(d.summary).toContain("with measuring cell");
    });

    it("is tolerant of case and whitespace", () => {
      expect(decodeRmu("  psec10ab24r2t1m ").code).toBe("PSEC10AB24R2T1M");
    });

    it("refuses something that is not an RMU code, with a useful message", () => {
      const d = decodeRmu("HELLO");
      expect(d.ok).toBe(false);
      expect(d.error).toContain("PSEC10AB24R2T1M");
    });

    it("flags a reserved specification rather than pretending it is valid", () => {
      const reserved = RMU_SPECS.find((s) => s.reserved);
      expect(reserved).toBeTruthy();
      const d = decodeRmu(`PSEC${reserved!.code}AB24R2T1M`);
      expect(d.segments.find((s) => s.field === "Client + type")?.problem).toMatch(/Reserved/i);
    });

    it("flags a supplier letter that is not in the table", () => {
      const d = decodeRmu("PSEC10ZZ24R2T1M");
      expect(d.segments.find((s) => s.field === "LBS supplier")?.problem).toBeTruthy();
    });
  });
});

describe("the RMU rules must match the offer engine", () => {
  // buildProductCode() in backend/src/domain/assembly.ts stamps the real offer. If this
  // guide teaches a different shape, it is teaching people something untrue.
  it("uses the same spec digits: client 1/2, type 0/9", () => {
    expect(RMU_SPECS.map((s) => s.code).sort()).toEqual(["10", "19", "20", "29", "30"].sort());
    // 1x = EECH, 2x = KAHRABA; x0 = Standard, x9 = Smart.
    expect(RMU_SPECS.find((s) => s.code === "10")!.en).toMatch(/Standard/i);
    expect(RMU_SPECS.find((s) => s.code === "19")!.en).toMatch(/Smart/i);
    expect(RMU_SPECS.find((s) => s.code === "20")!.en).toMatch(/KAHRABA/i);
    expect(RMU_SPECS.find((s) => s.code === "29")!.en).toMatch(/Smart/i);
  });

  it("uses the same two-letter supplier codes the offer engine emits", () => {
    // BRAND_CODE in assembly.ts: ABB AB, MURGE MG, SCHNEIDER SH, JGGY GY, GRL GL, CHINT CH.
    expect(RMU_CLASSES.map((c) => c.code)).toEqual(["AB", "MG", "SH", "GY", "GL"]);
  });

  it("DOCUMENTS a real gap: the offer engine knows CHINT (CH), this guide does not", () => {
    // Deliberately asserted rather than silently fixed. assembly.ts lists CHINT as a PRAL
    // brand with code "CH", but the engineers' guide has no CH row, so a CHINT unit would
    // produce a code this page cannot explain. Adding it is an engineering decision — the
    // supplier wording has to come from them, not be invented here.
    expect(RMU_CLASSES.find((c) => c.code === "CH")).toBeUndefined();
    expect(decodeRmu("PRAL10CH12R2T1W").segments.find((s) => s.field === "LBS supplier")?.problem)
      .toBeTruthy();
  });
});

describe("transformer codes", () => {
  it("codes the rating as kVA divided by ten, always three digits", () => {
    expect(ratingCode(630)).toBe("063");
    expect(ratingCode(50)).toBe("005");
    expect(ratingCode(3150)).toBe("315");
    expect(ratingCode(1000)).toBe("100");
  });

  it("reads the rating back exactly for every rating that divides by ten", () => {
    for (const kva of TR_KVA) {
      if (kva % 10 === 0) expect(ratingKva(ratingCode(kva)), String(kva)).toBe(kva);
    }
  });

  it("admits that 63 kVA CANNOT be written exactly, instead of hiding it", () => {
    // The field is kVA / 10, so 63 becomes 006 and reads back as 60. 63 kVA is the only
    // rating in the range with this problem. The engineers flagged it in prose; it is a
    // value here so the page can show it and this test can hold it.
    expect(ratingIsExact(63)).toBe(false);
    expect(ratingKva(ratingCode(63))).toBe(60);
    for (const kva of TR_KVA) {
      if (kva !== 63) expect(ratingIsExact(kva), String(kva)).toBe(true);
    }
  });

  it("names the other ratings that share an ambiguous field", () => {
    // 63 kVA codes as 006, which is what 60 kVA would use if it were in the range.
    expect(ratingSharedWith(630)).toEqual([]);
    for (const kva of TR_KVA) expect(Array.isArray(ratingSharedWith(kva))).toBe(true);
  });

  it("builds the documented shape", () => {
    expect(
      buildTrCode({ prefix: "PDTR", volt: "22", kva: 630, core: "1", ip: "21", acc: "0", serial: 1 }),
    ).toBe("PDTR2206312101");
  });

  it("round-trips every rating through build and decode", () => {
    for (const kva of TR_KVA) {
      const code = buildTrCode({ prefix: "POTR", volt: "11", kva, core: "2", ip: "00", acc: "1", serial: 3 });
      const d = decodeTr(code);
      expect(d.ok, code).toBe(true);
      const shown = ratingKva(ratingCode(kva));
      expect(d.segments.find((s) => s.field === "Rating")?.meaning, code).toContain(`${shown} kVA`);
    }
  });

  it("names the New Capital protection class rather than leaving it unexplained", () => {
    const d = decodeTr("PDTR2206312101");
    expect(d.segments.find((s) => s.field === "Protection")?.problem).toMatch(/ACUD/);
  });

  it("flags values outside the tables instead of inventing a meaning", () => {
    const d = decodeTr("PDTR9906392901");
    expect(d.segments.find((s) => s.field === "Primary voltage")?.problem).toBeTruthy();
    expect(d.segments.find((s) => s.field === "Protection")?.problem).toBeTruthy();
    expect(d.segments.find((s) => s.field === "Winding")?.problem).toBeTruthy();
  });

  it("refuses a non-transformer code with a useful message", () => {
    expect(decodeTr("PSEC10AB24R2T1M").ok).toBe(false);
    expect(decodeTr("nope").error).toContain("PDTR");
  });
});

describe("switchgear codes", () => {
  it("builds the documented shape, padding the outgoing count to two digits", () => {
    expect(
      buildGearCode({ volt: "2", incoming: 1, outgoing: 4, couplers: "1", adapt: "1", serial: 1 }),
    ).toBe("PLG2I1O04C1S11");
  });

  it("reads it back and counts the panels", () => {
    const d = decodeGear("PLG2I1O04C1S11");
    expect(d.ok).toBe(true);
    expect(d.summary).toContain("12 kV");
    expect(d.summary).toContain("1 incoming");
    expect(d.summary).toContain("4 outgoing");
    expect(d.summary).toContain("7 panels"); // 1 + 4 + 1 coupler + 1 service panel
  });

  it("does not count a service panel that is not fitted", () => {
    expect(decodeGear("PLG4I1O02C0S01").summary).toContain("3 panels");
  });

  it("flags options outside the tables", () => {
    const d = decodeGear("PLG9I1O02C5S91");
    expect(d.segments.find((s) => s.field === "Voltage")?.problem).toBeTruthy();
    expect(d.segments.find((s) => s.field === "Bus couplers")?.problem).toBeTruthy();
    expect(d.segments.find((s) => s.field === "Service panel")?.problem).toBeTruthy();
  });
});

describe("decoding anything that is pasted in", () => {
  it("routes each prefix to the right system", () => {
    expect(decodeAny("PSEC10AB24R2T1M").system).toBe("rmu");
    expect(decodeAny("PRAL10AB24R3T1W").system).toBe("rmu");
    expect(decodeAny("PDTR2206312101").system).toBe("transformer");
    expect(decodeAny("POTR1106322001").system).toBe("transformer");
    expect(decodeAny("PLG2I1O04C1S11").system).toBe("gear");
  });

  it("says what the valid prefixes are when it recognises nothing", () => {
    const d = decodeAny("QQQ123");
    expect(d.ok).toBe(false);
    expect(d.error).toContain("PSEC");
    expect(d.error).toContain("PDTR");
    expect(d.error).toContain("PLG");
  });

  it("handles an empty box without throwing", () => {
    expect(() => decodeAny("")).not.toThrow();
    expect(decodeAny("").ok).toBe(false);
  });
});
