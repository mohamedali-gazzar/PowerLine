// REGRESSION TEST — panel ORDER in a shared (Co-Work) quotation.
//
// The bug: the panel order kept snapping back for the OWNER of a shared quotation. Every routine
// autosave ships the saver's whole panel array, so a co-worker's stale save was rewriting the list
// to the co-worker's (old) view of the order — silently reverting an order the owner had just
// dragged into place. Only the person who owns the arrangement — the PRIMARY owner — may set the
// order now; a co-worker's save keeps the owner's stored order and only touches their own panels.
//
// These tests pin that contract so it can't quietly regress on customer paper.

import { describe, it, expect } from "vitest";
import { mergeCoWork, type PanelLike } from "./qtns.controller";

const OWNER = "owner-1";
const CO = "co-2";

// Helper: a panel with an id, an owner and a marker so we can tell content apart.
const P = (id: string, ownerId: string | undefined, mark: string): PanelLike => ({ id, ownerId, mark });
const ids = (s: { panels?: PanelLike[] }) => (s.panels ?? []).map((p) => p.id);
const byId = (s: { panels?: PanelLike[] }, id: string) => (s.panels ?? []).find((p) => p.id === id);

// A owned by the owner, B owned by the owner, C owned by the co-worker.
const A = P("A", OWNER, "A");
const B = P("B", OWNER, "B");
const C = P("C", CO, "C");

describe("mergeCoWork — the owner owns the panel arrangement", () => {
  it("keeps the OWNER's new order when the owner saves", () => {
    const stored = { panels: [A, B, C], note: "shared" };
    const incoming = { panels: [C, A, B], note: "shared" }; // owner dragged C to the top
    const out = mergeCoWork(stored, incoming, OWNER, OWNER);
    expect(ids(out)).toEqual(["C", "A", "B"]);
  });

  it("keeps a co-worker's panel CONTENT authoritative even when the owner moves it", () => {
    const stored = { panels: [A, B, C] };
    const tamperedC = P("C", CO, "C-tampered-by-owner");
    const incoming = { panels: [tamperedC, A, B] };
    const out = mergeCoWork(stored, incoming, OWNER, OWNER);
    expect(ids(out)).toEqual(["C", "A", "B"]);
    expect(byId(out, "C")?.mark).toBe("C"); // the owner cannot rewrite the co-worker's panel
  });

  it("THE BUG: a co-worker's stale save must NOT revert the owner's order", () => {
    // The owner has already reordered to [C, A, B] and it is stored.
    const stored = { panels: [C, A, B] };
    // The co-worker's client is still on the old order and edits its own panel C.
    const editedC = P("C", CO, "C-edited-by-co");
    const incoming = { panels: [A, B, editedC] }; // stale order [A, B, C]
    const out = mergeCoWork(stored, incoming, OWNER, CO);
    expect(ids(out)).toEqual(["C", "A", "B"]); // owner's order survives
    expect(byId(out, "C")?.mark).toBe("C-edited-by-co"); // …but the co-worker's edit still lands
    expect(byId(out, "A")?.mark).toBe("A"); // owner's panels untouched
    expect(byId(out, "B")?.mark).toBe("B");
  });

  it("lets a co-worker edit only their OWN panel content, never someone else's", () => {
    const stored = { panels: [A, B, C] };
    // The co-worker's client sends tampered copies of the owner's panels too — ignored.
    const incoming = { panels: [P("A", OWNER, "hax"), P("B", OWNER, "hax"), P("C", CO, "C2")] };
    const out = mergeCoWork(stored, incoming, OWNER, CO);
    expect(byId(out, "A")?.mark).toBe("A");
    expect(byId(out, "B")?.mark).toBe("B");
    expect(byId(out, "C")?.mark).toBe("C2");
  });

  it("appends a co-worker's NEW panel after the owner's arrangement", () => {
    const stored = { panels: [A, B, C] };
    const D = P("D", CO, "D");
    const incoming = { panels: [D, A, B, C] }; // co-worker added D (and a stale order)
    const out = mergeCoWork(stored, incoming, OWNER, CO);
    expect(ids(out)).toEqual(["A", "B", "C", "D"]); // D appended, owner's order kept
  });

  it("drops a co-worker's own panel when they delete it, keeping everyone else's", () => {
    const stored = { panels: [A, B, C] };
    const incoming = { panels: [A, B] }; // co-worker removed their own C
    const out = mergeCoWork(stored, incoming, OWNER, CO);
    expect(ids(out)).toEqual(["A", "B"]);
  });

  it("never lets a co-worker drop the owner's panels, even if their client omits them", () => {
    const stored = { panels: [A, B, C] };
    const incoming = { panels: [P("C", CO, "C3")] }; // only the co-worker's own panel came back
    const out = mergeCoWork(stored, incoming, OWNER, CO);
    expect(ids(out)).toEqual(["A", "B", "C"]);
    expect(byId(out, "C")?.mark).toBe("C3");
  });

  it("treats a panel with no ownerId as the owner's", () => {
    const legacy = P("L", undefined, "L"); // pre-co-work panel
    const stored = { panels: [legacy, C] };
    // A co-worker's stale save cannot move or change the legacy (owner's) panel.
    const incoming = { panels: [C, P("L", undefined, "hax")] };
    const out = mergeCoWork(stored, incoming, OWNER, CO);
    expect(ids(out)).toEqual(["L", "C"]);
    expect(byId(out, "L")?.mark).toBe("L");
  });

  it("keeps the owner's shared fields on an owner save, and the stored ones on a co-worker save", () => {
    const stored = { panels: [A, B, C], projectName: "stored" };
    const ownerSave = mergeCoWork(stored, { panels: [A, B, C], projectName: "owner-typed" }, OWNER, OWNER);
    expect((ownerSave as { projectName?: string }).projectName).toBe("owner-typed");
    const coSave = mergeCoWork(stored, { panels: [A, B, C], projectName: "co-typed" }, OWNER, CO);
    expect((coSave as { projectName?: string }).projectName).toBe("stored"); // co-worker can't edit shared tabs
  });
});
