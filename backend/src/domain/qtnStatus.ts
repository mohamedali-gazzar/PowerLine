// The QTN approval state machine, and the single owner of the legacy
// `submitted` / `submittedAt` mirror columns.
//
// Amending any of them cancels the source and opens the next revision as a DRAFT.
// CANCELLED is terminal: a superseded revision is kept for the record, never reworked.
//
//   DRAFT ──request──▶ WAITING_APPROVAL ──approve──▶ APPROVED ──submit──▶ SUBMITTED
//     ▲                    │        │                    │                    │
//     │                    │        └──withdraw──────────┴────────────────────┘
//     └──── return ────────┘                                 reopen (perm-gated)
//         (RETURNED) ──request──▶ WAITING_APPROVAL
//
// Nothing outside this module may write `status`, `submitted` or `submittedAt`.

export const QTN_STATUSES = [
  "DRAFT",
  "WAITING_APPROVAL",
  "RETURNED",
  "APPROVED",
  "SUBMITTED",
  /** Superseded by a later revision. Terminal — kept for the record, never edited. */
  "CANCELLED",
] as const;
export type QtnStatus = (typeof QTN_STATUSES)[number];

export const QTN_STATUS_LABEL: Record<QtnStatus, string> = {
  DRAFT: "Draft",
  WAITING_APPROVAL: "Waiting for approval",
  RETURNED: "Returned for revision",
  APPROVED: "Approved — waiting for submission",
  SUBMITTED: "Submitted",
  CANCELLED: "Cancelled",
};

/** Allowed moves. Anything not listed here is rejected with a 409. */
export const QTN_TRANSITIONS: Record<QtnStatus, QtnStatus[]> = {
  DRAFT: ["WAITING_APPROVAL"],
  WAITING_APPROVAL: ["APPROVED", "RETURNED", "DRAFT"], // DRAFT = creator withdraws
  RETURNED: ["WAITING_APPROVAL", "DRAFT"],
  // DRAFT = owner withdraws before submission; WAITING_APPROVAL = approver retracts their
  // approval (un-approve) while it hasn't been submitted yet.
  APPROVED: ["SUBMITTED", "DRAFT", "WAITING_APPROVAL"],
  SUBMITTED: ["DRAFT"], // reopen — requires qtn.reopen
  // Terminal. A superseded revision is history; the work continues on the amendment
  // that replaced it, so there is nothing to move it to.
  CANCELLED: [],
};

/** Statuses in which the quotation's CONTENT is frozen. */
export const QTN_LOCKED: QtnStatus[] = ["WAITING_APPROVAL", "APPROVED", "SUBMITTED", "CANCELLED"];

/** The action name recorded in the audit trail for a given move. */
export function qtnAction(from: QtnStatus, to: QtnStatus): string {
  if (to === "WAITING_APPROVAL") return from === "APPROVED" ? "WITHDRAW_APPROVAL" : "REQUEST_APPROVAL";
  if (to === "APPROVED") return "APPROVE";
  if (to === "RETURNED") return "RETURN";
  if (to === "SUBMITTED") return "SUBMIT";
  if (to === "CANCELLED") return "CANCEL";
  if (to === "DRAFT") return from === "SUBMITTED" ? "REOPEN" : "WITHDRAW";
  return "UPDATE";
}

/**
 * A row's effective status. Rows written before the workflow existed have
 * `status = NULL`, so fall back to the `submitted` mirror — which makes every read
 * correct from the moment the column appears, with no backfill race.
 */
export function qtnStatus(row: { status?: string | null; submitted?: boolean }): QtnStatus {
  if (row.status && (QTN_STATUSES as readonly string[]).includes(row.status)) {
    return row.status as QtnStatus;
  }
  return row.submitted ? "SUBMITTED" : "DRAFT";
}

export function isLocked(s: QtnStatus): boolean {
  return QTN_LOCKED.includes(s);
}

export function canMove(from: QtnStatus, to: QtnStatus): boolean {
  return (QTN_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * The ONLY place `status`, `submitted` and `submittedAt` are written.
 *
 * `submittedAt` is sticky on purpose: the old reopen path nulled it, which moved a
 * quotation out of the week it was actually submitted in and silently rewrote the
 * dashboard's history. Keeping the first real submission time makes the chart
 * immutable and leaves its existing query untouched.
 */
export function statusWrite(to: QtnStatus, prevSubmittedAt: Date | null) {
  const now = new Date();
  return {
    status: to,
    statusAt: now,
    // `submitted` tracks the CURRENT state, so a cancelled revision is no longer a
    // live submission — but `submittedAt` below is left alone, so the dashboard's
    // history of the week it was actually submitted in cannot be rewritten.
    submitted: to === "SUBMITTED",
    submittedAt: to === "SUBMITTED" ? prevSubmittedAt ?? now : prevSubmittedAt,
    ...(to === "WAITING_APPROVAL" ? { submittedForApprovalAt: now } : {}),
    ...(to === "APPROVED" ? { approvedAt: now } : {}),
  };
}
