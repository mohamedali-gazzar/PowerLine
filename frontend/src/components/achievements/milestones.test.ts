import { describe, it, expect } from "vitest";
import { milestoneForCount, milestoneByCount, LIVE_MILESTONES } from "./milestones";
import { notePanelCount, onPanelCount } from "./milestoneBus";

describe("milestoneForCount — fires when the panel count reaches a milestone", () => {
  it("fires milestone 10 when the count reaches 10, and 25 when it reaches 25", () => {
    expect(milestoneForCount(10, [])?.count).toBe(10);
    expect(milestoneForCount(25, [])?.count).toBe(25);
    expect(milestoneForCount(25, [10])?.count).toBe(25); // seeing 10 earlier doesn't block 25
  });

  it("does NOT fire on non-milestone counts (only exact thresholds)", () => {
    for (const n of [0, 9, 11, 24, 26, 49]) expect(milestoneForCount(n, [])).toBeUndefined();
  });

  it("never fires a milestone the user has already seen", () => {
    expect(milestoneForCount(10, [10])).toBeUndefined();
    expect(milestoneForCount(25, [10, 25])).toBeUndefined();
  });

  it("does not fire for a not-yet-live (TBD) milestone like 50", () => {
    expect(milestoneByCount(50)).toBeUndefined();       // 50 is TBD → not live
    expect(milestoneForCount(50, [])).toBeUndefined();
  });

  it("only 10 and 25 are live today", () => {
    expect(LIVE_MILESTONES.map((m) => m.count)).toEqual([10, 25]);
  });
});

describe("milestoneBus", () => {
  it("delivers a panel count to every subscriber, and stops after unsubscribe", () => {
    const seen: number[] = [];
    const off = onPanelCount((n) => seen.push(n));
    notePanelCount(10);
    notePanelCount(25);
    off();
    notePanelCount(7); // ignored after unsubscribe
    expect(seen).toEqual([10, 25]);
  });
});
