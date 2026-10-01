// The owner's rule for money, in his own examples: two decimals when they mean something, nothing
// when they do not. Pinned here because every price on screen and on an offer goes through it.

import { describe, it, expect } from "vitest";
import { fmtMoney } from "./money";

describe("fmtMoney", () => {
  it("drops decimals that say nothing", () => {
    expect(fmtMoney(1950)).toBe("1,950");
    expect(fmtMoney(1950.0)).toBe("1,950");
    expect(fmtMoney(1950.004)).toBe("1,950");   // rounds away below half a piastre
  });

  it("keeps one decimal when that is all there is", () => {
    expect(fmtMoney(1950.2)).toBe("1,950.2");
    expect(fmtMoney(1950.2)).not.toBe("1,950.20");
  });

  it("keeps both decimals when both mean something", () => {
    expect(fmtMoney(1950.25)).toBe("1,950.25");
    expect(fmtMoney(0.05)).toBe("0.05");
  });

  it("rounds to two decimals rather than showing a long tail", () => {
    expect(fmtMoney(1 / 3)).toBe("0.33");
    expect(fmtMoney(1950.256)).toBe("1,950.26");
  });

  it("separates thousands, which is what makes a long total readable", () => {
    expect(fmtMoney(199584)).toBe("199,584");
    expect(fmtMoney(1234567.89)).toBe("1,234,567.89");
  });

  it("handles zero and negatives", () => {
    expect(fmtMoney(0)).toBe("0");
    expect(fmtMoney(-1950.5)).toBe("-1,950.5");
  });

  it("shows nothing worse than zero for a broken number", () => {
    // An offer printing "NaN" helps nobody; the export blockers are what complain about a bad price.
    expect(fmtMoney(NaN)).toBe("0");
    expect(fmtMoney(Infinity)).toBe("0");
  });

  it("writes Latin digits whatever the machine's locale", () => {
    expect(fmtMoney(1950.2)).toMatch(/^[\d,.]+$/);
  });
});
