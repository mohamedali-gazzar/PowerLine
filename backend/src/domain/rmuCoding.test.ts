// CHARACTERIZATION TESTS — the RMU coding system and the data-availability gating.
//
// These pin behaviour that decides WHAT A CUSTOMER IS CHARGED. buildPriceKey() is the
// lookup key into the price list, so if its output changes by a single character the
// price silently becomes "on application" instead of the real figure.
//
// The most valuable test here is the round-trip over the real price list: every key the
// price book contains must be reachable from some configuration. That is what stops the
// coding functions and the price data drifting apart.

import { describe, it, expect } from "vitest";
import {
  BRAND_CODE,
  BRANDS_BY_FAMILY,
  AVAILABLE_BRANDS_BY_FAMILY,
  AVAILABLE_CLIENT_SPECS,
  isBrandAvailable,
  isClientSpecAvailable,
  buildCode,
  buildPanelCode,
  buildProductCode,
  buildPriceKey,
  isMurge,
  isSmart,
  brandWord,
  type RmuConfigInput,
  type LbsBrand,
} from "./assembly";
import pricing from "../data/rmu-pricing.json";

/** A valid baseline configuration; override only what a test is about. */
function cfg(over: Partial<RmuConfigInput> = {}): RmuConfigInput {
  return {
    productType: "PSEC",
    voltageKv: 12,
    lbsBrand: "ABB",
    clientSpec: "EECH",
    nalCount: 2,
    nalfCount: 1,
    hasMetering: false,
    rtuType: "NONE",
    installation: "INDOOR",
    busbarCurrentA: 630,
    ...over,
  };
}

describe("buildPanelCode — the legacy catalogue code used as the price key", () => {
  it("builds P-SEC / P-RAL / P-SEC.M prefixes from family and brand", () => {
    expect(buildPanelCode(cfg())).toBe("P-SEC12N2F1");
    expect(buildPanelCode(cfg({ productType: "PRAL" }))).toBe("P-RAL12N2F1");
    expect(buildPanelCode(cfg({ lbsBrand: "MURGE" }))).toBe("P-SEC.M12N2F1");
  });

  it("only PSEC can be Murge — a Murge PRAL is still P-RAL", () => {
    expect(isMurge(cfg({ lbsBrand: "MURGE" }))).toBe(true);
    expect(isMurge(cfg({ productType: "PRAL", lbsBrand: "MURGE" }))).toBe(false);
    expect(buildPanelCode(cfg({ productType: "PRAL", lbsBrand: "MURGE" }))).toBe("P-RAL12N2F1");
  });

  it("appends M1 only when metering is fitted", () => {
    expect(buildPanelCode(cfg({ hasMetering: true }))).toBe("P-SEC12N2F1M1");
    expect(buildPanelCode(cfg({ hasMetering: false }))).toBe("P-SEC12N2F1");
  });

  it("carries the ring and transformer feeder counts verbatim", () => {
    expect(buildPanelCode(cfg({ nalCount: 4, nalfCount: 0 }))).toBe("P-SEC12N4F0");
    expect(buildPanelCode(cfg({ voltageKv: 24, nalCount: 3, nalfCount: 2 }))).toBe("P-SEC24N3F2");
  });

  it("defaults a missing brand to ABB rather than throwing", () => {
    expect(buildPanelCode(cfg({ lbsBrand: null }))).toBe("P-SEC12N2F1");
    expect(brandWord(cfg({ lbsBrand: null }))).toBe("ABB");
  });
});

describe("buildPriceKey — panel code plus the VT-with-fuse variant", () => {
  it("adds the fuse suffix only when metering AND with-fuse are both set", () => {
    expect(buildPriceKey(cfg({ hasMetering: true, meteringWithFuse: true })))
      .toBe("P-SEC12N2F1M1-With Fuse");
    expect(buildPriceKey(cfg({ hasMetering: true, meteringWithFuse: false })))
      .toBe("P-SEC12N2F1M1");
    // with-fuse is meaningless without metering, and must not leak into the key
    expect(buildPriceKey(cfg({ hasMetering: false, meteringWithFuse: true })))
      .toBe("P-SEC12N2F1");
  });

  it("treats a null/undefined with-fuse flag as without fuse", () => {
    expect(buildPriceKey(cfg({ hasMetering: true, meteringWithFuse: null }))).toBe("P-SEC12N2F1M1");
    expect(buildPriceKey(cfg({ hasMetering: true }))).toBe("P-SEC12N2F1M1");
  });

  it("ignores everything that is not part of the key", () => {
    // Installation, RTU, busbar and CT/VT detail must never move the price key.
    const base = buildPriceKey(cfg({ hasMetering: true }));
    expect(buildPriceKey(cfg({ hasMetering: true, installation: "OUTDOOR" }))).toBe(base);
    expect(buildPriceKey(cfg({ hasMetering: true, rtuType: "SMART2" }))).toBe(base);
    expect(buildPriceKey(cfg({ hasMetering: true, busbarCurrentA: 1250 }))).toBe(base);
    expect(buildPriceKey(cfg({ hasMetering: true, vtCores: 2, ctClass: "0.2" }))).toBe(base);
  });
});

describe("every key in the real price list is reachable from a configuration", () => {
  // If this fails, some priced product can no longer be quoted: the lookup misses and the
  // offer falls back to "on application". It is the guard rail on the coding functions.
  const keys = Object.keys((pricing as { panels: Record<string, number> }).panels);
  const KEY = /^(P-RAL|P-SEC\.M|P-SEC)(12|24)N(\d+)F(\d+)(M1)?(-With Fuse)?$/;

  it("has a non-empty price list to check", () => {
    expect(keys.length).toBeGreaterThan(40);
  });

  it.each(keys)("%s round-trips through buildPriceKey", (key) => {
    const m = KEY.exec(key);
    expect(m, `price key "${key}" does not match the documented code format`).not.toBeNull();
    const [, prefix, kv, nal, nalf, metering, fuse] = m!;
    const rebuilt = buildPriceKey(
      cfg({
        productType: prefix === "P-RAL" ? "PRAL" : "PSEC",
        lbsBrand: prefix === "P-SEC.M" ? "MURGE" : "ABB",
        voltageKv: Number(kv) as 12 | 24,
        nalCount: Number(nal),
        nalfCount: Number(nalf),
        hasMetering: metering === "M1",
        meteringWithFuse: fuse ? true : false,
      }),
    );
    expect(rebuilt).toBe(key);
  });

  it("never produces a fuse suffix for a key that has no metering", () => {
    for (const key of keys) {
      if (key.includes("-With Fuse")) expect(key).toContain("M1");
    }
    // The price list carries the VAT and currency the offers are built on.
    expect((pricing as { vatPct: number }).vatPct).toBe(14);
    expect((pricing as { currency: string }).currency).toBe("USD");
  });
});

describe("buildProductCode — the customer-facing coding-system code", () => {
  it("lays out family, client, type, brand, kV, feeders and measuring", () => {
    // PSEC + EECH(1) + Standard(0) + ABB(AB) + 12kV + R2 + T1 + Without measuring
    expect(buildProductCode(cfg())).toBe("PSEC10AB12R2T1W");
  });

  it("uses 9 for the type digit when a real RTU is fitted, 0 otherwise", () => {
    expect(buildProductCode(cfg({ rtuType: "SMART1" }))).toBe("PSEC19AB12R2T1W");
    expect(buildProductCode(cfg({ rtuType: "SMART2" }))).toBe("PSEC19AB12R2T1W");
    // "Ready to be smart" has no RTU installed, so it stays Standard.
    expect(buildProductCode(cfg({ rtuType: "READY1" }))).toBe("PSEC10AB12R2T1W");
    expect(buildProductCode(cfg({ rtuType: "READY2" }))).toBe("PSEC10AB12R2T1W");
    expect(isSmart(cfg({ rtuType: "READY2" }))).toBe(false);
    expect(isSmart(cfg({ rtuType: "SMART1" }))).toBe(true);
  });

  it("uses 2 for the KAHRABA client spec", () => {
    expect(buildProductCode(cfg({ clientSpec: "KAHRABA" }))).toBe("PSEC20AB12R2T1W");
  });

  it("switches the final letter to M when metering is fitted", () => {
    expect(buildProductCode(cfg({ hasMetering: true }))).toBe("PSEC10AB12R2T1M");
  });

  it("maps every brand to its two-letter code", () => {
    expect(BRAND_CODE).toEqual({
      ABB: "AB", MURGE: "MG", SCHNEIDER: "SH", JGGY: "GY", GRL: "GL", CHINT: "CH",
    });
    expect(buildProductCode(cfg({ lbsBrand: "MURGE" }))).toContain("MG");
  });

  it("returns an empty code for Lucy, which is outside the coding system", () => {
    expect(buildProductCode(cfg({ productType: "LUCY" }))).toBe("");
  });
});

describe("buildCode — the short human-readable label", () => {
  it("reads as family, kV and the feeder mix", () => {
    expect(buildCode(cfg({ productType: "PRAL", nalCount: 3, nalfCount: 1 }))).toBe("PRAL12(3+1)");
    expect(buildCode(cfg({ nalCount: 3, nalfCount: 1, hasMetering: true }))).toBe("PSEC12(3+1+M)");
  });
});

describe("data-availability gating — we never fabricate one brand's data from another", () => {
  it("only offers brands we hold verified data for", () => {
    expect(AVAILABLE_BRANDS_BY_FAMILY).toEqual({
      PSEC: ["ABB", "MURGE"],
      PRAL: ["ABB"],
      LUCY: [],
    });
    expect(isBrandAvailable({ productType: "PSEC", lbsBrand: "ABB" })).toBe(true);
    expect(isBrandAvailable({ productType: "PSEC", lbsBrand: "MURGE" })).toBe(true);
    expect(isBrandAvailable({ productType: "PRAL", lbsBrand: "ABB" })).toBe(true);
  });

  it("locks every brand without data, even though the coding system defines it", () => {
    const locked: Array<[("PSEC" | "PRAL"), LbsBrand]> = [
      ["PSEC", "SCHNEIDER"],
      ["PRAL", "CHINT"],
      ["PRAL", "JGGY"],
      ["PRAL", "GRL"],
      ["PSEC", "JGGY"],
    ];
    for (const [productType, lbsBrand] of locked) {
      expect(isBrandAvailable({ productType, lbsBrand }), `${productType}/${lbsBrand}`).toBe(false);
    }
    // Schneider is a DEFINED PSEC brand but is not an AVAILABLE one — the two lists
    // are deliberately different, and conflating them would fabricate an offer.
    expect(BRANDS_BY_FAMILY.PSEC).toContain("SCHNEIDER");
    expect(AVAILABLE_BRANDS_BY_FAMILY.PSEC).not.toContain("SCHNEIDER");
  });

  it("defaults an absent brand to ABB, which is available", () => {
    expect(isBrandAvailable({ productType: "PSEC" })).toBe(true);
    expect(isBrandAvailable({ productType: "PSEC", lbsBrand: null })).toBe(true);
  });

  it("allows only the EECH client specification", () => {
    expect(AVAILABLE_CLIENT_SPECS).toEqual(["EECH"]);
    expect(isClientSpecAvailable("EECH")).toBe(true);
    expect(isClientSpecAvailable("KAHRABA")).toBe(false);
    expect(isClientSpecAvailable(null)).toBe(true); // absent means the EECH default
    expect(isClientSpecAvailable(undefined)).toBe(true);
  });

  it("offers no LBS brand for Lucy, a single-OEM family", () => {
    expect(BRANDS_BY_FAMILY.LUCY).toEqual([]);
    expect(isBrandAvailable({ productType: "LUCY", lbsBrand: "ABB" })).toBe(false);
  });
});
