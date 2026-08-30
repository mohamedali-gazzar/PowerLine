// The bug these lock down: a quotation whose revision lived in the COLUMN was read as
// revision 0, so amending "QTN-24-00749" at revision 8 offered "-1" instead of "-9",
// and renaming it back to the same base collided with the original.

import { describe, it, expect } from "vitest";
import { baseOf, revisionOf, formatQtnNumber, nextRevision, sequenceOf } from "./qtnRevision";

describe("reading a revision", () => {
  it("reads it from the column — the shape that was being missed", () => {
    expect(revisionOf({ number: "QTN-24-00749", revisionNo: 8 })).toEqual({
      base: "QTN-24-00749",
      rev: 8,
    });
  });

  it("still reads the legacy suffix, because those rows are live", () => {
    expect(revisionOf({ number: "QTN-24-00749-8", revisionNo: 0 })).toEqual({
      base: "QTN-24-00749",
      rev: 8,
    });
  });

  it("takes the HIGHER when a row carries both", () => {
    // Handing back the lower would propose a revision that already exists.
    expect(revisionOf({ number: "QTN-24-00749-3", revisionNo: 8 }).rev).toBe(8);
    expect(revisionOf({ number: "QTN-24-00749-9", revisionNo: 2 }).rev).toBe(9);
  });

  it("treats a plain number as revision 0", () => {
    expect(revisionOf({ number: "QTN-24-00749" })).toEqual({ base: "QTN-24-00749", rev: 0 });
    expect(revisionOf({ number: "QTN-24-00749", revisionNo: null }).rev).toBe(0);
  });

  it("never mistakes the running number for a revision", () => {
    // "QTN-24-00749" must not split into base "QTN-24" revision 749.
    expect(baseOf("QTN-24-00749")).toBe("QTN-24-00749");
    expect(revisionOf({ number: "QTN-24-00749" }).rev).toBe(0);
  });

  it("is not confused by spaces around the number", () => {
    expect(revisionOf({ number: "  QTN-24-00749-2  " })).toEqual({
      base: "QTN-24-00749",
      rev: 2,
    });
  });
});

describe("choosing the next revision", () => {
  const src = { number: "QTN-24-00749", revisionNo: 8 };

  it("follows the CURRENT revision — the whole point of the fix", () => {
    expect(nextRevision(src, [src])).toBe(9);
  });

  it("counts every sibling, so two amendments cannot collide", () => {
    const siblings = [
      { number: "QTN-24-00749", revisionNo: 8 },
      { number: "QTN-24-00749", revisionNo: 9 }, // somebody already amended it
      { number: "QTN-24-00749-3", revisionNo: 0 }, // and an old-style one exists too
    ];
    expect(nextRevision(src, siblings)).toBe(10);
  });

  it("ignores quotations for other jobs", () => {
    expect(nextRevision(src, [{ number: "QTN-24-00750", revisionNo: 40 }])).toBe(9);
  });

  it("works from the source alone when the sibling list is empty", () => {
    expect(nextRevision(src, [])).toBe(9);
  });

  it("takes an original to revision 1", () => {
    expect(nextRevision({ number: "QTN-26-0001", revisionNo: 0 }, [])).toBe(1);
  });
});

describe("writing the number out", () => {
  it("joins base and revision the way the offer prints it", () => {
    expect(formatQtnNumber("QTN-24-00749", 9)).toBe("QTN-24-00749-9");
  });

  it("shows an original with no suffix at all", () => {
    expect(formatQtnNumber("QTN-24-00749", 0)).toBe("QTN-24-00749");
  });
});

describe("the running number", () => {
  it("reads the sequence, not a revision suffix", () => {
    // The old code read the trailing digits, so this returned 8 and the next new
    // quotation could be numbered from 8 instead of from 749.
    expect(sequenceOf("QTN-24-00749-8")).toBe(749);
    expect(sequenceOf("QTN-24-00749")).toBe(749);
  });

  it("gives 0 for something with no sequence in it", () => {
    expect(sequenceOf("DRAFT")).toBe(0);
    expect(sequenceOf("")).toBe(0);
  });
});
