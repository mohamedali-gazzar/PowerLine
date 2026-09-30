// Which published changes are worth putting in front of a person.
//
// This one predicate decides THREE things: the red badge on "Check for updates", whether the
// dialog opens by itself, and what the dialog lists. They have to agree. When only the list
// was filtered, the badge still counted rows nobody would see, so the dialog opened on its
// own, claimed unread updates, and then said "Nothing has changed since this quotation".
//
// The rows it drops are real records: an import used to log a "price" change for every
// enclosure it touched whether the price moved or not. That is fixed at the source, but the
// ones already published are permanent, so this filter has to keep working.

import { describe, it, expect } from "vitest";
import { shownChanges } from "./CatalogUpdateCheck";
import type { CatalogChangeItem } from "../api";

const item = (over: Partial<CatalogChangeItem> = {}): CatalogChangeItem => ({
  field: "price",
  label: "SR-Basic · Galv SR 800x800x300",
  oldValue: "186.11 EUR / 0 EGP",
  newValue: "186.11 EUR / 0 EGP",
  ...over,
} as CatalogChangeItem);

describe("deciding what counts as a change", () => {
  it("drops a price row whose figure did not move", () => {
    // The exact shape Mohamed saw: "186.11 EUR -> 186.11 EUR, 0%".
    expect(shownChanges([item()])).toEqual([]);
  });

  it("keeps a price row that really moved, in either currency", () => {
    expect(shownChanges([item({ newValue: "199.99 EUR / 0 EGP" })])).toHaveLength(1);
    expect(shownChanges([item({ oldValue: "0 EUR / 1000 EGP", newValue: "0 EUR / 1200 EGP" })])).toHaveLength(1);
  });

  it("keeps a price row it cannot read, rather than guessing it away", () => {
    // Hiding a real price change is the worse failure, so anything unparseable stays.
    expect(shownChanges([item({ oldValue: null })])).toHaveLength(1);
    expect(shownChanges([item({ oldValue: "n/a", newValue: "see note" })])).toHaveLength(1);
  });

  it("never drops anything that is not a price row", () => {
    // Added, retired, renamed and settings changes are meaningful on their own terms — the
    // equal-values test does not apply to them and must not be run against them.
    const others = [
      item({ field: "__created", oldValue: null, newValue: "120 EUR" }),
      item({ field: "__retired", oldValue: "offered", newValue: "retired" }),
      item({ field: "description", oldValue: "Old name", newValue: "New name" }),
      item({ field: "usd", oldValue: "50", newValue: "50" }),
    ];
    expect(shownChanges(others)).toHaveLength(4);
  });

  it("counts a mixed batch the way the dialog will show it", () => {
    // 16 phantom enclosure rows and one real rise -> the badge must read 1, not 17.
    const batch = [
      ...Array.from({ length: 16 }, () => item()),
      item({ label: "Real rise", newValue: "210.00 EUR / 0 EGP" }),
    ];
    expect(shownChanges(batch)).toHaveLength(1);
  });

  it("returns nothing for an empty batch rather than throwing", () => {
    expect(shownChanges([])).toEqual([]);
  });
});
