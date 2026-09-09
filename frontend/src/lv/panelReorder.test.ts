// REGRESSION TEST — dragging a panel to reorder must move the panel the user grabbed.
//
// The sidebar renders panels in GROUPED layout order (panelLayout: each group by its order, then
// the ungrouped ones), but the drag handed back a ROW index. If that index was used to splice the
// physical `s.panels` array and that array was NOT already in group order — which happens to a
// quotation that was once co-worked, where the old server merge rebuilt the list from a saver's
// order — the wrong panel moved, so the drag "did nothing" / snapped back. This is the bug the
// owner Mayar hit on a single-person (but previously co-worked) quotation.
//
// The fix is two-fold and both halves are checked here:
//   1) load normalises the physical array to group order (resortByGroup), and
//   2) the reorder splices the LAYOUT order, never the raw array.

import { describe, it, expect } from "vitest";
import { panelLayout, resortByGroup } from "./store";
import type { LvState, LvPanel, LvGroup } from "./store";

// Minimal panels/groups — panelLayout and resortByGroup only read id / groupId / order.
const panel = (id: string, groupId?: string): LvPanel => ({ id, groupId } as unknown as LvPanel);
const group = (id: string, order: number): LvGroup => ({ id, name: id, order } as unknown as LvGroup);

// Two groups, and a STORED array deliberately out of group order: p3 (group A) sits after p2
// (group B). The sidebar still renders it grouped → [p1, p3] (A), [p2] (B), [p4] (ungrouped).
const groups = [group("A", 0), group("B", 1)];
const scrambled: LvState = {
  groups,
  panels: [panel("p1", "A"), panel("p2", "B"), panel("p3", "A"), panel("p4")],
} as unknown as LvState;

const ids = (ps: LvPanel[]) => ps.map((p) => p.id);
const flat = (s: LvState) => panelLayout(s).flatMap((sec) => sec.panels);

// The NEW reorder: splice the LAYOUT (rendered) order, then re-sort to the canonical array.
function reorderByLayout(s: LvState, from: number, to: number): string[] {
  const arr = flat(s);
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  const neighbour = to > 0 ? arr[to - 1] : arr[to + 1];
  (moved as { groupId?: string }).groupId = (neighbour as { groupId?: string })?.groupId;
  return ids(resortByGroup(arr, s.groups ?? []));
}

// The OLD reorder: splice the raw physical array by the same row index (the bug).
function reorderByRawArray(s: LvState, from: number, to: number): string[] {
  const arr = [...s.panels];
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  const neighbour = to > 0 ? arr[to - 1] : arr[to + 1];
  (moved as { groupId?: string }).groupId = (neighbour as { groupId?: string })?.groupId;
  return ids(resortByGroup(arr, s.groups ?? []));
}

describe("panel reorder maps the dragged row to the right panel", () => {
  it("renders grouped, so the layout order differs from a drifted physical array", () => {
    expect(ids(flat(scrambled))).toEqual(["p1", "p3", "p2", "p4"]); // what the user sees
    expect(ids(scrambled.panels)).toEqual(["p1", "p2", "p3", "p4"]); // what's stored — different!
  });

  it("resortByGroup makes the physical array match the rendered order (the load-time fix)", () => {
    expect(ids(resortByGroup(scrambled.panels, groups))).toEqual(ids(flat(scrambled)));
  });

  it("dragging the 3rd visible row to the top moves THAT panel (p2), not p3", () => {
    // Row index 2 in the rendered list is p2 (the lone group-B panel).
    expect(flat(scrambled)[2].id).toBe("p2");
    // New logic: p2 lands first (and joins group A, its new neighbour) — the panel the user grabbed.
    expect(reorderByLayout(scrambled, 2, 0)).toEqual(["p2", "p1", "p3", "p4"]);
    // Old logic on the drifted array would have grabbed p3 instead — the visible bug.
    expect(reorderByRawArray(scrambled, 2, 0)).toEqual(["p3", "p1", "p2", "p4"]);
  });

  it("on an already-sorted quotation the two approaches agree (no behaviour change)", () => {
    const sorted: LvState = {
      groups,
      panels: [panel("p1", "A"), panel("p3", "A"), panel("p2", "B"), panel("p4")],
    } as unknown as LvState;
    expect(reorderByLayout(sorted, 2, 0)).toEqual(reorderByRawArray(sorted, 2, 0));
  });
});
