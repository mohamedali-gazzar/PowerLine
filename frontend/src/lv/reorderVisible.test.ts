import { describe, it, expect } from "vitest";
import { reorderVisiblePanels, reorderVisiblePanelsMany } from "./store";
import type { LvPanel } from "./store";

// Minimal panel — the reorder helpers only read id + groupId.
const P = (id: string, groupId?: string) => ({ id, groupId } as unknown as LvPanel);
const ids = (ps: LvPanel[]) => ps.map((p) => p.id).join(",");
const gid = (ps: LvPanel[], id: string) => ps.find((p) => p.id === id)?.groupId;

// Part 1 (group g1): a,b   ·   Part 2 (group g2): c,d,e
const full = () => [P("a", "g1"), P("b", "g1"), P("c", "g2"), P("d", "g2"), P("e", "g2")];
const bothVisible = new Set(["a", "b", "c", "d", "e"]);
const part1Collapsed = new Set(["c", "d", "e"]); // only Part 2 is on screen

describe("reorderVisiblePanels — the collapsed-group drag bug", () => {
  it("reorders within the visible group when the group ABOVE is collapsed", () => {
    // Drag Part 2's last visible panel (e, visible index 2) to the top of Part 2 (visible index 0).
    const out = reorderVisiblePanels(full(), part1Collapsed, 2, 0);
    // Part 1 (a,b) is untouched; Part 2 becomes e,c,d — and e stays in g2.
    expect(ids(out)).toBe("a,b,e,c,d");
    expect(gid(out, "e")).toBe("g2");
  });

  it("does NOT move or regroup any collapsed panel", () => {
    const out = reorderVisiblePanels(full(), part1Collapsed, 0, 2); // c → end of visible
    expect(ids(out)).toBe("a,b,d,e,c");
    expect(gid(out, "a")).toBe("g1");
    expect(gid(out, "b")).toBe("g1");
  });

  it("works normally when nothing is collapsed (indices == full order)", () => {
    const out = reorderVisiblePanels(full(), bothVisible, 4, 0); // e → very top
    expect(ids(out)).toBe("e,a,b,c,d");
  });

  it("a panel dropped at the top of its visible group keeps that group, not the hidden one above", () => {
    // With Part 1 collapsed, dropping at visible slot 0 must NOT adopt g1 (the hidden neighbour).
    const out = reorderVisiblePanels(full(), part1Collapsed, 1, 0); // d → top of visible
    expect(gid(out, "d")).toBe("g2");
  });

  it("leaves the order unchanged for an out-of-range drop", () => {
    expect(ids(reorderVisiblePanels(full(), part1Collapsed, 0, 9))).toBe(ids(full()));
  });
});

describe("reorderVisiblePanelsMany — moving several ticked panels", () => {
  it("moves a ticked block within the visible group, collapsed group untouched", () => {
    // Tick c and e (Part 2); drop at visible slot 0 → block lands before d.
    const out = reorderVisiblePanelsMany(full(), part1Collapsed, new Set(["c", "e"]), 0);
    expect(ids(out)).toBe("a,b,c,e,d");
    expect(gid(out, "c")).toBe("g2");
    expect(gid(out, "e")).toBe("g2");
  });

  it("is a no-op with fewer than two ticked panels", () => {
    expect(ids(reorderVisiblePanelsMany(full(), part1Collapsed, new Set(["c"]), 0))).toBe(ids(full()));
  });
});
