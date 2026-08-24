// CHARACTERIZATION + REGRESSION TESTS for an RMU offer's workflow state.
//
// offerStatus() decides whether an offer is a draft, is awaiting approval, is locked
// against editing, and whether it can be removed. Getting it wrong on old rows put
// every offer generated before the approval workflow existed into the wrong state.

import { describe, it, expect } from "vitest";
import { offerStatus } from "./offer.service";

const AT = new Date("2026-06-30T10:00:00.000Z");

describe("an offer that has moved through the workflow", () => {
  it("uses the status column once statusAt proves the workflow wrote it", () => {
    for (const status of ["DRAFT", "WAITING_APPROVAL", "RETURNED", "APPROVED", "SUBMITTED"]) {
      expect(offerStatus({ status, statusAt: AT }), status).toBe(status);
    }
  });

  it("ignores the status column when statusAt is absent", () => {
    // statusAt is what proves a transition actually happened. Without it the column may
    // be a schema default rather than a real state.
    expect(offerStatus({ status: "SUBMITTED", statusAt: null })).toBe("DRAFT");
    expect(offerStatus({ status: "APPROVED" })).toBe("DRAFT");
  });

  it("ignores an unrecognised status string", () => {
    expect(offerStatus({ status: "BANANA", statusAt: AT })).toBe("DRAFT");
    expect(offerStatus({ status: "", statusAt: AT })).toBe("DRAFT");
    expect(offerStatus({ status: "draft", statusAt: AT })).toBe("DRAFT"); // lower case is not a value
  });
});

describe("an offer written before the workflow existed", () => {
  // REGRESSION. The fallback used to read `submittedAt`, but on Offer that column never
  // meant "went through approval": the old postOffer() stamped it the moment an offer was
  // GENERATED, to feed the dashboard chart. So every pre-workflow offer reported as
  // SUBMITTED while the list showed it as Draft — which made it undeletable and placed it
  // wrongly in the approval queue.
  it("is a DRAFT even though it carries a generation timestamp", () => {
    expect(offerStatus({ status: "DRAFT", statusAt: null, submitted: false })).toBe("DRAFT");
    // The shape of a real legacy row: status defaulted, no statusAt, never submitted.
    expect(offerStatus({ status: "DRAFT", statusAt: null, submitted: null })).toBe("DRAFT");
    expect(offerStatus({ statusAt: null, submitted: false })).toBe("DRAFT");
  });

  it("does not consult submittedAt at all", () => {
    // Passing it must change nothing — it is not part of the decision any more.
    const legacy = { status: "DRAFT", statusAt: null, submitted: false };
    expect(offerStatus({ ...legacy, submittedAt: AT } as Parameters<typeof offerStatus>[0])).toBe("DRAFT");
  });

  it("trusts the submitted mirror when it is set", () => {
    // statusWrite() is the only writer of `submitted`, and it always writes statusAt too,
    // so this pairing is really only reachable via the workflow.
    expect(offerStatus({ statusAt: null, submitted: true })).toBe("SUBMITTED");
  });
});

describe("an empty or unknown offer", () => {
  it("reads as a DRAFT rather than throwing", () => {
    expect(offerStatus({})).toBe("DRAFT");
    expect(offerStatus({ status: null, statusAt: null, submitted: null })).toBe("DRAFT");
  });
});
