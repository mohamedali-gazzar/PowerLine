// The kiosk follows the P-CSS Selector's limitations for which RMU configurations exist.
// Headline rule (from the owner): a PRAL (Air) ring main unit has no 3+1+M kiosk configuration.

import { describe, it, expect } from "vitest";
import type { RmuConfigInput } from "../types";
import { mapRmuToPcss, rmuKioskLimitation } from "./kioskRmu";

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
