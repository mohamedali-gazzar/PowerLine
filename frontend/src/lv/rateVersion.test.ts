// Default-rate versioning — the rule that decides when an open quotation is offered
// the newly-published rates. Pure logic, so it is checked here without a browser or DB.
//
// The rule (see rateUpdate in store.ts): a warning is due only when the quotation is
// eligible by status, is on an OLDER rate version, has not been dismissed against this
// version, and its numbers actually differ from the latest.

import { describe, it, expect } from "vitest";
import { rateUpdate, ratesEqual, pickRates, type RateSet } from "./store";

const V2: RateSet = { usd: 52, euro: 60, safetyFactor: 0.025, copper: 850 };
// A quotation still on version 1's numbers.
const factorsV1 = { usd: 51, euro: 60, safetyFactor: 0.02, copper: 800 } as any;
const state = (over: { rateVersion?: number; rateVersionDismissed?: number; factors?: any } = {}) => ({
  factors: over.factors ?? factorsV1,
  rateVersion: over.rateVersion,
  rateVersionDismissed: over.rateVersionDismissed,
});

describe("ratesEqual / pickRates", () => {
  it("compares only the four rate fields", () => {
    expect(ratesEqual(pickRates(factorsV1), { usd: 51, euro: 60, safetyFactor: 0.02, copper: 800 })).toBe(true);
    expect(ratesEqual(pickRates(factorsV1), V2)).toBe(false);
  });
  it("ignores tiny floating-point noise", () => {
    expect(ratesEqual({ usd: 51, euro: 60, safetyFactor: 0.02, copper: 800 }, { usd: 51, euro: 60, safetyFactor: 0.02 + 1e-12, copper: 800 })).toBe(true);
  });
});

describe("rateUpdate — when to warn", () => {
  it("warns an older DRAFT, with the before/after values", () => {
    const r = rateUpdate(state({ rateVersion: 1 }), "DRAFT", 2, V2);
    expect(r).not.toBeNull();
    expect(r!.current).toEqual({ usd: 51, euro: 60, safetyFactor: 0.02, copper: 800 });
    expect(r!.latest).toEqual(V2);
  });

  it("warns in every editable/approval status the owner chose", () => {
    for (const s of ["DRAFT", "RETURNED", "WAITING_APPROVAL", "APPROVED"]) {
      expect(rateUpdate(state({ rateVersion: 1 }), s, 2, V2), s).not.toBeNull();
    }
  });

  it("never warns a Submitted or Cancelled quotation", () => {
    expect(rateUpdate(state({ rateVersion: 1 }), "SUBMITTED", 2, V2)).toBeNull();
    expect(rateUpdate(state({ rateVersion: 1 }), "CANCELLED", 2, V2)).toBeNull();
  });

  it("does not warn a quotation already on the latest version", () => {
    expect(rateUpdate(state({ rateVersion: 2, factors: { ...V2 } }), "DRAFT", 2, V2)).toBeNull();
  });

  it("does not warn once the user kept the current rates against this version", () => {
    expect(rateUpdate(state({ rateVersion: 1, rateVersionDismissed: 2 }), "DRAFT", 2, V2)).toBeNull();
  });

  it("warns again when a still-newer version is published after a dismissal", () => {
    expect(rateUpdate(state({ rateVersion: 1, rateVersionDismissed: 2 }), "DRAFT", 3, V2)).not.toBeNull();
  });

  it("treats an un-stamped (legacy) quotation as older, but only if its numbers differ", () => {
    expect(rateUpdate(state({ rateVersion: undefined }), "DRAFT", 2, V2)).not.toBeNull();
    // …a legacy quotation that happens to already match the latest is left alone.
    expect(rateUpdate(state({ rateVersion: undefined, factors: { ...V2 } }), "DRAFT", 2, V2)).toBeNull();
  });

  it("does not warn before any rates have been published (version 0)", () => {
    expect(rateUpdate(state({ rateVersion: undefined }), "DRAFT", 0, V2)).toBeNull();
  });
});
