// The kiosk follows the P-CSS Selector's limitations for which RMU configurations exist.
// Headline rule (from the owner): a PRAL (Air) ring main unit has no 3+1+M kiosk configuration.

import { describe, it, expect } from "vitest";
import type { RmuConfigInput } from "../types";
import { kioskSizeOptions, mapRmuToPcss, rmuKioskLimitation } from "./kioskRmu";

// A minimal RMU config — only the fields the mapping/limitation read.
const rmu = (over: Partial<RmuConfigInput>): RmuConfigInput => ({
  productType: "PRAL", voltageKv: 12, nalCount: 2, nalfCount: 1, hasMetering: false,
  rtuType: "NONE", installation: "INDOOR", busbarCurrentA: 630, ...over,
});

describe("kiosk RMU P-CSS limitations", () => {
  it("maps product + voltage + feeders + metering to a P-CSS (rmu, cfg)", () => {
    expect(mapRmuToPcss(rmu({ productType: "PRAL", voltageKv: 12 }))).toEqual({ rmu: "pral12", cfg: "2+1" });
    expect(mapRmuToPcss(rmu({ productType: "PRAL", voltageKv: 24 }))).toEqual({ rmu: "pral24", cfg: "2+1" });
    expect(mapRmuToPcss(rmu({ productType: "LUCY" }))).toEqual({ rmu: "lucy", cfg: "2+1" });
    expect(mapRmuToPcss(rmu({ productType: "PSEC" }))).toEqual({ rmu: "psec50", cfg: "2+1" });
    expect(mapRmuToPcss(rmu({ productType: "PSEC", lbsBrand: "MURGE" }))).toEqual({ rmu: "murge", cfg: "2+1" });
    expect(mapRmuToPcss(rmu({ nalCount: 3, nalfCount: 1, hasMetering: true })).cfg).toBe("3+1+M");
  });

  it("flags PRAL (Air) 3+1+M — the configuration that does not exist inside a kiosk", () => {
    const msg = rmuKioskLimitation(rmu({ productType: "PRAL", nalCount: 3, nalfCount: 1, hasMetering: true }));
    expect(msg).toContain("PRAL (Air)");
    expect(msg).toContain("3+1+M");
    expect(msg).toContain("2+1, 3+1, 2+1+M"); // the available PRAL configurations
  });

  it("allows PRAL configurations that DO exist (2+1, 3+1, 2+1+M)", () => {
    expect(rmuKioskLimitation(rmu({ nalCount: 2, nalfCount: 1, hasMetering: false }))).toBeNull();
    expect(rmuKioskLimitation(rmu({ nalCount: 3, nalfCount: 1, hasMetering: false }))).toBeNull();
    expect(rmuKioskLimitation(rmu({ nalCount: 2, nalfCount: 1, hasMetering: true }))).toBeNull();
  });

  it("allows 3+1+M for the switchgear RMUs that offer it (PSEC / Lucy)", () => {
    expect(rmuKioskLimitation(rmu({ productType: "PSEC", nalCount: 3, nalfCount: 1, hasMetering: true }))).toBeNull();
    expect(rmuKioskLimitation(rmu({ productType: "LUCY", nalCount: 3, nalfCount: 1, hasMetering: true }))).toBeNull();
  });
});

// Which ENCLOSURE a kiosk may be built in — the Selector's own design-compatibility rules, reached
// through kioskSizeOptions(). These pin the rules that actually bite in the kiosk editor.
describe("kiosk P-CSS size options", () => {
  it("narrows a PSEC 2+1+M to P-CSS 16ST-V alone", () => {
    // The rule that matters most in practice: metering on a PSEC unit forces the widest enclosure.
    expect(kioskSizeOptions(rmu({ productType: "PSEC", nalCount: 2, nalfCount: 1, hasMetering: true })))
      .toEqual(["P-CSS 16ST-V"]);
  });

  it("offers a PSEC 2+1 its three enclosures — never 5ST-A, which is PRAL-only", () => {
    const opts = kioskSizeOptions(rmu({ productType: "PSEC", nalCount: 2, nalfCount: 1, hasMetering: false }));
    expect(opts).toEqual(["P-CSS 5ST-C", "P-CSS 10ST-K", "P-CSS 16ST-V"]);
    expect(opts).not.toContain("P-CSS 5ST-A");
  });

  it("forces a PRAL 24 kV kiosk to P-CSS 16ST-V whatever its configuration", () => {
    expect(kioskSizeOptions(rmu({ productType: "PRAL", voltageKv: 24 }))).toEqual(["P-CSS 16ST-V"]);
  });

  it("gives a PRAL 12 kV kiosk the Air enclosures only", () => {
    expect(kioskSizeOptions(rmu({ productType: "PRAL", voltageKv: 12 })))
      .toEqual(["P-CSS 5ST-A", "P-CSS 10ST-I", "P-CSS 16ST-U"]);
  });

  it("uses the transformer rating as a FLOOR, not a window", () => {
    const pral12 = rmu({ productType: "PRAL", voltageKv: 12 });
    // 1600 kVA rules out every 5ST and 10ST frame…
    expect(kioskSizeOptions(pral12, 1600)).toEqual(["P-CSS 16ST-U"]);
    // …while a small transformer still leaves the bigger frames on offer.
    expect(kioskSizeOptions(pral12, 500)).toEqual(["P-CSS 5ST-A", "P-CSS 10ST-I", "P-CSS 16ST-U"]);
    // No rating yet ⇒ the floor is not applied at all.
    expect(kioskSizeOptions(pral12, null)).toEqual(["P-CSS 5ST-A", "P-CSS 10ST-I", "P-CSS 16ST-U"]);
  });

  it("never offers P-CSS 16ST-W — the Selector has no such design", () => {
    // kioskParts' KIOSK_SIZE_CODES lists it (the SF6 1600 kVA enclosure) but the Selector's DESIGNS
    // table does not, so applying the Selector's rules means it can no longer be chosen.
    for (const product of ["PRAL", "PSEC", "LUCY"] as const) {
      for (const kv of [12, 24] as const) {
        expect(kioskSizeOptions(rmu({ productType: product, voltageKv: kv }), 1600)).not.toContain("P-CSS 16ST-W");
      }
    }
  });
});
