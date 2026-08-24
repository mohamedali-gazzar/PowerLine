// CHARACTERIZATION TESTS — these pin the QTN approval state machine as it behaves TODAY.
//
// They are deliberately not "how approval ought to work". If one of these fails after a
// change, the change altered the workflow real quotations move through, and that needs a
// decision from the owner — not a rewritten test.
//
// Every expectation below was read out of qtnStatus.ts, which is the single owner of the
// `status`, `submitted` and `submittedAt` columns.

import { describe, it, expect } from "vitest";
import {
  QTN_STATUSES,
  QTN_STATUS_LABEL,
  QTN_TRANSITIONS,
  QTN_LOCKED,
  qtnAction,
  qtnStatus,
  isLocked,
  canMove,
  statusWrite,
  type QtnStatus,
} from "./qtnStatus";

describe("the set of statuses", () => {
  it("is exactly these five, in this order", () => {
    expect(QTN_STATUSES).toEqual([
      "DRAFT",
      "WAITING_APPROVAL",
      "RETURNED",
      "APPROVED",
      "SUBMITTED",
    ]);
  });

  it("gives every status a human label", () => {
    for (const s of QTN_STATUSES) {
      expect(QTN_STATUS_LABEL[s]).toBeTruthy();
    }
    // The exact wording appears in the UI and in e-mails.
    expect(QTN_STATUS_LABEL.APPROVED).toBe("Approved — waiting for submission");
    expect(QTN_STATUS_LABEL.RETURNED).toBe("Returned for revision");
  });
});

describe("allowed moves", () => {
  // The full matrix, spelled out. Anything not listed must be rejected.
  const allowed: Array<[QtnStatus, QtnStatus]> = [
    ["DRAFT", "WAITING_APPROVAL"],
    ["WAITING_APPROVAL", "APPROVED"],
    ["WAITING_APPROVAL", "RETURNED"],
    ["WAITING_APPROVAL", "DRAFT"],
    ["RETURNED", "WAITING_APPROVAL"],
    ["RETURNED", "DRAFT"],
    ["APPROVED", "SUBMITTED"],
    ["APPROVED", "DRAFT"],
    ["APPROVED", "WAITING_APPROVAL"], // approver retracts their approval (un-approve)
    ["SUBMITTED", "DRAFT"],
  ];

  it.each(allowed)("%s -> %s is allowed", (from, to) => {
    expect(canMove(from, to)).toBe(true);
  });

  it("rejects every move that is not in the matrix", () => {
    const rejected: Array<[QtnStatus, QtnStatus]> = [];
    for (const from of QTN_STATUSES) {
      for (const to of QTN_STATUSES) {
        if (!allowed.some(([f, t]) => f === from && t === to)) rejected.push([from, to]);
      }
    }
    for (const [from, to] of rejected) {
      expect(canMove(from, to), `${from} -> ${to} must be rejected`).toBe(false);
    }
    // Sanity: the matrix is 5x5 with 10 legal moves, so 15 are illegal.
    expect(rejected).toHaveLength(15);
  });

  it("never allows a status to move to itself", () => {
    for (const s of QTN_STATUSES) expect(canMove(s, s)).toBe(false);
  });

  it("cannot skip approval — a draft can never go straight to approved or submitted", () => {
    expect(canMove("DRAFT", "APPROVED")).toBe(false);
    expect(canMove("DRAFT", "SUBMITTED")).toBe(false);
  });

  it("declares the transition table for every status", () => {
    expect(Object.keys(QTN_TRANSITIONS).sort()).toEqual([...QTN_STATUSES].sort());
  });
});

describe("which statuses freeze the quotation's content", () => {
  it("locks waiting, approved and submitted; leaves draft and returned editable", () => {
    expect(QTN_LOCKED).toEqual(["WAITING_APPROVAL", "APPROVED", "SUBMITTED"]);
    expect(isLocked("WAITING_APPROVAL")).toBe(true);
    expect(isLocked("APPROVED")).toBe(true);
    expect(isLocked("SUBMITTED")).toBe(true);
    expect(isLocked("DRAFT")).toBe(false);
    expect(isLocked("RETURNED")).toBe(false);
  });
});

describe("the action name written to the audit trail", () => {
  it("names each move the way the history shows it", () => {
    expect(qtnAction("DRAFT", "WAITING_APPROVAL")).toBe("REQUEST_APPROVAL");
    expect(qtnAction("RETURNED", "WAITING_APPROVAL")).toBe("REQUEST_APPROVAL");
    expect(qtnAction("APPROVED", "WAITING_APPROVAL")).toBe("WITHDRAW_APPROVAL"); // un-approve
    expect(qtnAction("WAITING_APPROVAL", "APPROVED")).toBe("APPROVE");
    expect(qtnAction("WAITING_APPROVAL", "RETURNED")).toBe("RETURN");
    expect(qtnAction("APPROVED", "SUBMITTED")).toBe("SUBMIT");
  });

  it("distinguishes withdrawing from reopening — both land on DRAFT", () => {
    // This distinction is the whole reason `from` is a parameter.
    expect(qtnAction("SUBMITTED", "DRAFT")).toBe("REOPEN");
    expect(qtnAction("WAITING_APPROVAL", "DRAFT")).toBe("WITHDRAW");
    expect(qtnAction("APPROVED", "DRAFT")).toBe("WITHDRAW");
    expect(qtnAction("RETURNED", "DRAFT")).toBe("WITHDRAW");
  });
});

describe("reading a row's effective status", () => {
  it("uses the status column when it holds a known value", () => {
    expect(qtnStatus({ status: "APPROVED" })).toBe("APPROVED");
    expect(qtnStatus({ status: "RETURNED", submitted: true })).toBe("RETURNED");
  });

  it("falls back to the submitted mirror for rows written before the workflow existed", () => {
    // Legacy rows have status = NULL. This is why no backfill was needed.
    expect(qtnStatus({ status: null, submitted: true })).toBe("SUBMITTED");
    expect(qtnStatus({ status: null, submitted: false })).toBe("DRAFT");
    expect(qtnStatus({})).toBe("DRAFT");
  });

  it("treats an unrecognised status string as legacy rather than trusting it", () => {
    expect(qtnStatus({ status: "BANANA", submitted: true })).toBe("SUBMITTED");
    expect(qtnStatus({ status: "", submitted: false })).toBe("DRAFT");
    expect(qtnStatus({ status: "draft" })).toBe("DRAFT"); // lower case is not a known value
  });
});

describe("statusWrite — the only place the status columns are written", () => {
  it("sets the submitted mirror only for SUBMITTED", () => {
    expect(statusWrite("SUBMITTED", null).submitted).toBe(true);
    for (const s of ["DRAFT", "WAITING_APPROVAL", "RETURNED", "APPROVED"] as QtnStatus[]) {
      expect(statusWrite(s, null).submitted).toBe(false);
    }
  });

  it("stamps the first submission time when there was none", () => {
    const before = Date.now();
    const w = statusWrite("SUBMITTED", null);
    expect(w.submittedAt).toBeInstanceOf(Date);
    expect((w.submittedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("KEEPS the original submission time when re-submitting", () => {
    // Sticky on purpose: the weekly chart must not silently move a quotation
    // into a different week when it is reopened and submitted again.
    const first = new Date("2026-03-04T09:00:00.000Z");
    expect(statusWrite("SUBMITTED", first).submittedAt).toBe(first);
  });

  it("does NOT clear the submission time when reopening to DRAFT", () => {
    const first = new Date("2026-03-04T09:00:00.000Z");
    const w = statusWrite("DRAFT", first);
    expect(w.submittedAt).toBe(first);
    expect(w.submitted).toBe(false); // the mirror flips, the timestamp survives
  });

  it("carries a null submission time through non-submit moves untouched", () => {
    for (const s of ["DRAFT", "WAITING_APPROVAL", "RETURNED", "APPROVED"] as QtnStatus[]) {
      expect(statusWrite(s, null).submittedAt).toBeNull();
    }
  });

  it("records when it entered the approval queue, and only then", () => {
    expect(statusWrite("WAITING_APPROVAL", null).submittedForApprovalAt).toBeInstanceOf(Date);
    expect(statusWrite("APPROVED", null)).not.toHaveProperty("submittedForApprovalAt");
    expect(statusWrite("DRAFT", null)).not.toHaveProperty("submittedForApprovalAt");
  });

  it("records the approval time, and only on approval", () => {
    expect(statusWrite("APPROVED", null).approvedAt).toBeInstanceOf(Date);
    expect(statusWrite("SUBMITTED", null)).not.toHaveProperty("approvedAt");
    expect(statusWrite("RETURNED", null)).not.toHaveProperty("approvedAt");
  });

  it("always sets status and statusAt together", () => {
    for (const s of QTN_STATUSES) {
      const w = statusWrite(s, null);
      expect(w.status).toBe(s);
      expect(w.statusAt).toBeInstanceOf(Date);
    }
  });
});
