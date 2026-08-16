// One rule, in one place: two price-list items must never carry the same name.
//
// WHY THIS IS MONEY, NOT TIDINESS
// The combination builders (ATS / MCC / photocell / WD / motorized) find their
// parts by description text and take the FIRST match in catalogue order — see
// findByName() in frontend/src/lv/catalog.ts. The breaker pickers show the same
// text as the label. So two items sharing one name means the app silently uses
// whichever sits earlier, at that item's price, with nothing on screen to show a
// choice was made. In today's catalogue such a pair can differ by 2x: "Change
// over switch 160A 3P" exists at EUR 81.85 and at EUR 179.91 under two different
// ABB order codes.
//
// WHY THIS IS ENFORCED HERE AND NOT BY A UNIQUE INDEX
// Every deploy runs `prisma db push --accept-data-loss` against the live price
// list with no backup (CLAUDE.md §4.2). A unique index on a column that already
// holds one duplicate makes that push FAIL and takes the site down — and the
// catalogue already holds 47 duplicated descriptions, so that is not a
// hypothetical. In application code a clash can be reported to the person
// causing it, and the duplicates that already exist keep working (nothing is
// rewritten behind the owner's back) until he decides which of each pair is
// right. LvEnclosure keeps its existing @@unique([fam, name]) — it is clean and
// proven clean; this module only translates its error into a sentence.
//
// WHY THE COMPARISON IS NORMALISED THE WAY IT IS
// It must match findByName() EXACTLY. A check stricter than the matcher refuses
// names the app can already tell apart; a check looser than the matcher lets
// through pairs the app cannot. Either is worse than no check at all.
//
// findByName() also has fuzzy fallbacks — "contains", "starts with" — and those
// are deliberately NOT mirrored here. They only ever run when no exact match
// exists, so they cannot produce the two-rows-both-match ambiguity this rule is
// about; and refusing every name that contains another would reject the shape
// the catalogue is built on ("MCCB XT1B 125A" next to "MCCB XT1B 125A 4P").

import { prisma } from "../lib/prisma";

/**
 * Characters that take up no space on screen, so two names carrying different
 * ones look identical to a person reading the price list. They arrive by paste
 * — from a PDF datasheet, a browser, or Excel: zero-width space/non-joiner/
 * joiner, the left/right marks, word-joiner, byte-order mark, soft hyphen.
 * `\s` does NOT match any of them, so without this a name with one appended
 * passed the rule while being unreadable as a difference. Removed outright,
 * not turned into a space: they are absences, not separators.
 *
 * Verified a no-op on today's data — 0 occurrences across components.json,
 * enclosures.json and combos.json — so this hardens the rule without changing
 * how any existing part resolves.
 */
const INVISIBLE = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;

/**
 * The one comparison used everywhere a price-list name is checked.
 *
 * Mirrors findByName(): drop the invisibles, collapse every run of whitespace
 * to one space, trim, lowercase. `\s` covers the non-breaking spaces that
 * arrive from Excel, so "MCCB  XT1B" pasted from a sheet and "MCCB XT1B" typed
 * by hand are one name here — exactly as they are one name to the combination
 * builders. CHANGING THIS MEANS CHANGING findByName() IN THE SAME COMMIT; the
 * two are only safe while they agree.
 */
export const normLvName = (s: string): string =>
  String(s ?? "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The columns the name rule needs off an LvComponent row. */
export interface LvNamedItem {
  id: string;
  ref: string;
  /** Short description — the text the price list shows and templates name. */
  d: string;
  /** Display name. findByName() tries this first, then `d`, so both are keys. */
  n: string;
  active: boolean;
  sortIndex: number;
  eur: number;
  egp: number;
  /** Set on a name claimed by a row that is being imported but not yet written,
   *  so a clash inside one spreadsheet reads differently from a clash with the
   *  catalogue. */
  pending?: boolean;
}

/**
 * Every name currently in use, keyed the way the app matches names.
 *
 * The whole (small) catalogue is read into memory rather than queried per name:
 * SQLite and Postgres disagree about case-insensitive matching, and neither can
 * collapse whitespace in a WHERE clause, so the only way to apply findByName()'s
 * normalisation identically on both is to apply it in code. ~2,100 short rows on
 * an admin action is cheap; buildLvPayload() already reads more than this on
 * every publish.
 *
 * An import claims names as it goes, so two rows of ONE spreadsheet cannot both
 * take a name that was free when the file was opened.
 */
export class LvNameIndex {
  private readonly byKey = new Map<string, LvNamedItem[]>();

  private constructor(rows: LvNamedItem[]) {
    for (const r of rows) this.claim(r.d, r), this.claim(r.n, r);
  }

  static fromRows(rows: LvNamedItem[]): LvNameIndex {
    return new LvNameIndex(rows);
  }

  static async load(): Promise<LvNameIndex> {
    const rows = await prisma.lvComponent.findMany({
      select: { id: true, ref: true, d: true, n: true, active: true, sortIndex: true, eur: true, egp: true },
      orderBy: { sortIndex: "asc" },
    });
    return new LvNameIndex(rows);
  }

  /**
   * The item that already holds this name, or undefined when it is free.
   *
   * RETIRED ROWS COUNT — deliberately. "Removed from the list" is a flag on a
   * row that STAYS in the catalogue and stays in the published payload (see
   * buildLvPayload: retired items are kept on purpose so saved quotations still
   * resolve), and findByName() never looks at it. So reusing a removed item's
   * name creates exactly the same ambiguity as reusing a live one's — the
   * builders would still be able to land on the removed row. The answer is
   * therefore: a removed item keeps its name. The message says so and points at
   * Restore, so it reads as a rule rather than a mystery.
   */
  owner(name: string, excludeId?: string): LvNamedItem | undefined {
    const key = normLvName(name);
    if (!key) return undefined;
    return (this.byKey.get(key) ?? []).find((r) => r.id !== excludeId);
  }

  /** Record a name as taken (an added row, or a rename about to be applied). */
  claim(name: string, item: LvNamedItem): void {
    const key = normLvName(name);
    if (!key) return;
    const list = this.byKey.get(key) ?? [];
    // `d` and `n` are usually identical — index the row once per key, not twice,
    // or every row would look like its own duplicate.
    if (!list.some((r) => r.id === item.id)) list.push(item);
    this.byKey.set(key, list);
  }

  /** Give a name back, because the row that held it is being renamed away. */
  release(name: string, item: LvNamedItem): void {
    const key = normLvName(name);
    const list = this.byKey.get(key);
    if (!list) return;
    const at = list.findIndex((r) => r.id === item.id);
    if (at >= 0) list.splice(at, 1);
    if (!list.length) this.byKey.delete(key);
  }

  /** Names already shared by more than one item, in catalogue order.
   *  Reported, never repaired — see getLvDuplicateNames. */
  duplicates(): { name: string; items: LvNamedItem[] }[] {
    const out: { name: string; items: LvNamedItem[] }[] = [];
    for (const items of this.byKey.values()) {
      if (items.length < 2) continue;
      const sorted = [...items].sort((a, b) => a.sortIndex - b.sortIndex);
      out.push({ name: (sorted[0].d || sorted[0].n).trim(), items: sorted });
    }
    return out.sort((a, b) => a.items[0].sortIndex - b.items[0].sortIndex);
  }
}

/** Names the item that already holds the name, and what to do about it. */
function holder(by: LvNamedItem): string {
  const code = String(by.ref ?? "").trim();
  const which = code ? `item code ${code}` : "an item that has no item code";
  if (by.pending) return `${which}, earlier in this same file`;
  if (!by.active) {
    return `${which}, which you removed from the list — a removed item keeps its name, so restore and rename that one rather than adding a second`;
  }
  return which;
}

/** Refusing a hand-added component. Mirrors the reference check next to it:
 *  same 409, same "edit that item instead". */
export const lvNameTakenMessage = (name: string, by: LvNamedItem): string =>
  `"${String(name).trim()}" is already the name of another item (${holder(by)}). ` +
  `Two items with the same name cannot be told apart — a quotation would use whichever comes first in the list, at that item's price. ` +
  `Edit that item instead, or give this one a name that tells the two apart.`;

/** Refusing ONE spreadsheet row that would add a second item under a used name. */
export const lvAddNameClashWarning = (name: string, code: string, by: LvNamedItem): string =>
  `${String(code ?? "").trim() ? `${String(code).trim()}: ` : ""}“${String(name).trim()}” is already the name of another item (${holder(by)}) — not added. ` +
  `Two items with the same name cannot be told apart, so a quotation would use whichever comes first. ` +
  `Give this one a description that tells them apart and upload again.`;

/** Refusing ONE rename inside a spreadsheet row. The rename is dropped on its
 *  own — a naming clash must never cost the uploader their price update — but
 *  the sentence has to tell the truth about the REST of the row, and that
 *  differs by caller. The preview runs above the Apply button and has written
 *  nothing yet; and a row whose only change WAS the refused rename leaves
 *  nothing behind at all. One fixed past-tense sentence claimed a price update
 *  in both of those cases, which reads to a non-developer as "the upload
 *  already happened". */
export type LvRenameOutcome = "will-apply" | "will-apply-nothing" | "applied" | "applied-nothing";

export const lvRenameClashWarning = (shown: string, to: string, by: LvNamedItem, rest: LvRenameOutcome): string => {
  const tail: Record<LvRenameOutcome, string> = {
    "will-apply": "Everything else on this row, the price included, will still be applied.",
    "will-apply-nothing": "The description was the only change on this row, so this row will be left as it is.",
    applied: "Everything else on this row, the price included, was still applied.",
    "applied-nothing": "The description was the only change on this row, so nothing on it was changed.",
  };
  return (
    `${String(shown).trim()}: description NOT changed to “${String(to).trim()}” — another item already has that name (${holder(by)}). ` +
    tail[rest]
  );
};

/** Prisma's "unique constraint failed". The database enforces exactly one name
 *  rule — LvEnclosure @@unique([fam, name]) — and fail() renders it as a bare
 *  "Server error.", which tells nobody what happened or what to do. */
export const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
