// Quotation numbering and revisions.
//
// A quotation has a BASE number ("QTN-24-00749") and a REVISION ("8"), shown joined
// as "QTN-24-00749-8". The base is `LvQtn.number`, the revision is `LvQtn.revisionNo`.
//
// ⚠️ HISTORY, AND WHY EVERY READ GOES THROUGH revisionOf().
// The revision used to live in TWO places at once. The client-side Amend wrote it into
// the number STRING (duplicate, then rename to "base-N+1"), while the Project tab's
// "Revision No." field wrote it into the revisionNo COLUMN. Both were then rendered the
// same way, so the two shapes were indistinguishable on screen — and Amend read the
// string, so a quotation carrying revision 8 in the column looked like revision 0 and
// was offered "-1" as its next revision.
//
// The column is now the only writer. These helpers still READ both shapes, because
// rows created by the old flow are live and their numbers keep the suffix forever.

/** A number split into the part that identifies the job and the revision of it. */
export interface Revision {
  base: string;
  rev: number;
}

/**
 * A trailing "-N" on a stored number, from the old Amend flow.
 *
 * Requires at least three digits before the dash so a genuine number is never
 * mistaken for a revision: "QTN-24-00749" must not split into base "QTN-24" rev 749.
 */
const LEGACY_SUFFIX = /^(.*\d{3,})-(\d{1,3})$/;

/** The base number, with any legacy "-N" suffix stripped. */
export function baseOf(number: string): string {
  const raw = (number ?? "").trim();
  const m = LEGACY_SUFFIX.exec(raw);
  return m ? m[1] : raw;
}

/**
 * The revision of a row, whichever of the two shapes it was written in.
 *
 * When a row somehow carries both — a legacy suffix AND a column value — the HIGHER
 * wins. Picking the lower would hand out a revision number that already exists, which
 * is the collision that made Amend fail in the first place.
 */
export function revisionOf(row: { number: string; revisionNo?: number | null }): Revision {
  const raw = (row.number ?? "").trim();
  const m = LEGACY_SUFFIX.exec(raw);
  const fromColumn = Number(row.revisionNo ?? 0) || 0;
  const fromSuffix = m ? parseInt(m[2], 10) : 0;
  return { base: m ? m[1] : raw, rev: Math.max(fromColumn, fromSuffix) };
}

/** How a quotation is written on screen and on the offer: "QTN-24-00749-9". */
export function formatQtnNumber(base: string, rev: number): string {
  return rev > 0 ? `${base}-${rev}` : base;
}

/**
 * The revision an amendment should take: one past the highest that exists.
 *
 * Counted across every row sharing the base, not just the one being amended — two
 * amendments of the same quotation must not both land on the same revision. The
 * source's own revision is included so it still works when the list is incomplete.
 */
export function nextRevision(
  source: { number: string; revisionNo?: number | null },
  siblings: { number: string; revisionNo?: number | null }[],
): number {
  const { base, rev } = revisionOf(source);
  let max = rev;
  for (const s of siblings) {
    const r = revisionOf(s);
    if (r.base === base) max = Math.max(max, r.rev);
  }
  return max + 1;
}

/**
 * The running number for a brand-new quotation, as an integer.
 *
 * Reads the LAST group of digits that is at least three long, so a legacy revision
 * suffix cannot be mistaken for the sequence: "QTN-24-00749-8" is number 749, not 8.
 * Reading the plain trailing digits — as this once did — made an amended quotation
 * report 8, and the sequence would restart from there if it were ever the only row.
 */
export function sequenceOf(number: string): number {
  const groups = (number ?? "").match(/\d{3,}/g);
  if (groups === null || groups.length === 0) return 0;
  return parseInt(groups[groups.length - 1], 10) || 0;
}
