// A combination is one contiguous run of same-group rows, drawn with one header. Dragging a
// component so it lands between another combination's members used to split that combination
// into two runs → its header rendered twice, stacked ("two identical rows"). mergeSplitGroups
// pulls the split run back together so every combination reads as one block again.

import { describe, it, expect } from "vitest";
import type { PanelComponent } from "./store";
import { mergeSplitGroups, resolveComboMembershipOnDrop, dropTargetGroup, effGroupOf } from "./combosHeal";

// The number of separate header-runs a group name occupies (a healthy combination = exactly 1).
const runCount = (arr: PanelComponent[], group: string, section = "Incoming") => {
  const eff = effGroupOf(arr);
  let runs = 0, inRun = false;
  for (const c of arr) {
    const hit = c.section === section && (eff.get(c.id) || "") === group;
    if (hit && !inRun) runs++;
    inRun = hit;
  }
  return runs;
};

let n = 0;
function row(partial: Partial<PanelComponent> & { id?: string }): PanelComponent {
  return {
    id: partial.id ?? `c${++n}`,
    section: "Incoming", name: "x", desc: "", ref: "", type: "", brand: "", rating: "",
    eur: 0, egp: 0, poles: 0, cuP: 0, cuC: 0, stock: "", qty: 1,
    adj: "", comment: "", note: "",
    ...partial,
  };
}
const ids = (arr: PanelComponent[]) => arr.map((c) => c.id).join(",");

describe("mergeSplitGroups", () => {
  it("leaves healthy data untouched (returns the same order)", () => {
    const arr = [
      row({ id: "a" }),
      row({ id: "lp1", group: "LP" }),
      row({ id: "lp2", group: "LP" }),
      row({ id: "z" }),
    ];
    expect(ids(mergeSplitGroups(arr))).toBe("a,lp1,lp2,z");
  });

  it("keeps a blank spacer sitting inside a combination in place", () => {
    // spacer bracketed by LP on both sides is part of LP — one run, must not be relocated.
    const arr = [
      row({ id: "lp1", group: "LP" }),
      row({ id: "sp", spacer: true }),
      row({ id: "lp2", group: "LP" }),
    ];
    expect(ids(mergeSplitGroups(arr))).toBe("lp1,sp,lp2");
  });

  it("pulls a split combination back into one block", () => {
    // A member of MC dragged between LP's rows splits LP into two runs → two LP headers.
    const arr = [
      row({ id: "lp1", group: "LP" }),
      row({ id: "mc1", group: "MC" }),
      row({ id: "lp2", group: "LP" }),
    ];
    // LP becomes contiguous again; the stray MC row ends up just after it.
    expect(ids(mergeSplitGroups(arr))).toBe("lp1,lp2,mc1");
  });

  it("heals both combinations when each was split by the other", () => {
    const arr = [
      row({ id: "lp1", group: "LP" }),
      row({ id: "mc1", group: "MC" }),
      row({ id: "lp2", group: "LP" }),
      row({ id: "mc2", group: "MC" }),
    ];
    const out = mergeSplitGroups(arr);
    // Each name appears in exactly one contiguous run.
    const runs: string[] = [];
    out.forEach((c) => { if (c.group && runs[runs.length - 1] !== c.group) runs.push(c.group); });
    expect(runs).toEqual([...new Set(runs)]); // no name repeats after a gap
  });

  it("does not merge same-named combinations that live in different sections", () => {
    const arr = [
      row({ id: "a", section: "Incoming", group: "LP" }),
      row({ id: "b", section: "Outgoing", group: "LP" }),
    ];
    expect(ids(mergeSplitGroups(arr))).toBe("a,b");
  });
});

describe("resolveComboMembershipOnDrop (move a component between combinations)", () => {
  const combo = (name: string) => name; // readability
  const byId = (arr: PanelComponent[], id: string) => arr.find((c) => c.id === id)!;

  it("moves a component from LP into MDB, and it joins MDB", () => {
    // Component B has already been dragged to sit after MDB's members (still tagged LP).
    const arr = [
      row({ id: "a", group: "LP" }),
      row({ id: "c", group: "LP" }),
      row({ id: "d", group: "MDB" }),
      row({ id: "e", group: "MDB" }),
      row({ id: "b", group: "LP" }), // the moved one, dropped at MDB's end
    ];
    const out = resolveComboMembershipOnDrop(arr, "b");
    expect(byId(out, "b").group).toBe(combo("MDB"));            // joined MDB
    expect(ids(out.filter((x) => x.group === "LP"))).toBe("a,c"); // LP updated (B gone)
    expect(ids(out.filter((x) => x.group === "MDB"))).toBe("d,e,b"); // B now a member of MDB
  });

  it("dropping a component in open space makes it standalone and drops the combination's ×N scaling", () => {
    const arr = [
      row({ id: "x" }),                                  // loose
      row({ id: "b", group: "LP", comboScalable: true, baseQty: 1, qty: 3 }), // was in a ×3 combo
      row({ id: "y" }),                                  // loose
    ];
    const out = resolveComboMembershipOnDrop(arr, "b");
    const b = byId(out, "b");
    expect(b.group || "").toBe("");        // no combination
    expect(b.comboScalable).toBe(false);
    expect(b.comboId).toBeUndefined();
    expect(b.qty).toBe(1);                 // reset to its own per-unit quantity
  });

  it("inherits the target combination's ×N quantity when it is scalable", () => {
    const arr = [
      row({ id: "m1", group: "MDB", comboScalable: true, comboId: "cid1", baseQty: 1, qty: 2 }), // ×2
      row({ id: "m2", group: "MDB", comboScalable: true, comboId: "cid1", baseQty: 1, qty: 2 }),
      row({ id: "b", group: "", baseQty: 1, qty: 1 }),  // moved to sit inside MDB
    ];
    const out = resolveComboMembershipOnDrop(arr, "b");
    const b = byId(out, "b");
    expect(b.group).toBe("MDB");
    expect(b.comboScalable).toBe(true);
    expect(b.comboId).toBe("cid1");        // adopts the combination's instance id
    expect(b.qty).toBe(2);                 // scaled to the combination's ×2
    expect(b.baseQty).toBe(1);             // keeps its own per-unit base
  });

  it("emptying a combination of its last member leaves no trace of it", () => {
    const arr = [
      row({ id: "only", group: "LP" }),  // LP's only member
      row({ id: "x" }),                  // loose
      row({ id: "y" }),                  // loose — 'only' dragged to sit here (open space)
    ];
    // Simulate 'only' having been dragged to the end (open space):
    const moved = [arr[1], arr[2], arr[0]];
    const out = resolveComboMembershipOnDrop(moved, "only");
    expect(out.some((c) => (c.group || "") === "LP")).toBe(false); // LP is gone entirely
    expect(byId(out, "only").group || "").toBe("");                // it's now standalone
  });

  it("dropTargetGroup reads the combination at the drop point", () => {
    const arr = [
      row({ id: "a", group: "LP" }),
      row({ id: "b" }),           // moved, sitting between two LP rows
      row({ id: "c", group: "LP" }),
    ];
    expect(dropTargetGroup(arr, "b")).toBe("LP"); // sandwiched inside LP → joins LP
  });
});

describe("drag-and-drop leaves combinations whole (no duplicate / empty headers)", () => {
  // Real-world shape seen after buggy drags: an ATS combination whose "Control CT" sub-group ended
  // up in TWO separate blocks (two headers), split apart by Source 1 / Interlock / Source 2.
  const atsSplit = () => [
    row({ id: "ct1", group: "Control CT" }), row({ id: "ct2", group: "Control CT" }),
    row({ id: "s1a", group: "Source 1" }), row({ id: "s1b", group: "Source 1" }),
    row({ id: "il1", group: "Interlock" }), row({ id: "il2", group: "Interlock" }),
    row({ id: "s2a", group: "Source 2" }), row({ id: "s2b", group: "Source 2" }),
    row({ id: "ct3", group: "Control CT" }), row({ id: "ct4", group: "Control CT" }), // second Control CT block
  ];

  it("re-knits a combination that was split into two blocks", () => {
    const healed = mergeSplitGroups(atsSplit());
    expect(runCount(healed, "Control CT")).toBe(1);   // one header again, not two
    // every other combination is still a single block
    for (const g of ["Source 1", "Interlock", "Source 2"]) expect(runCount(healed, g)).toBe(1);
    // its members are contiguous
    expect(ids(healed.filter((c) => c.group === "Control CT"))).toBe("ct1,ct2,ct3,ct4");
  });

  it("a row shown group-less mid-drag never splits the combination it is passing through", () => {
    // While dragging, the moved row is written group:"" so it floats. Dropped among Source 1's
    // members it must read as Source 1 (inherited) — NOT paint its own stray header there.
    const arr = [
      row({ id: "s1a", group: "Source 1" }),
      row({ id: "drag", group: "" }),          // the dragged row, blanked, sitting inside Source 1
      row({ id: "s1b", group: "Source 1" }),
      row({ id: "ct1", group: "Control CT" }),
    ];
    const healed = mergeSplitGroups(arr);
    expect(runCount(healed, "Source 1")).toBe(1);       // Source 1 stays one block
    expect(runCount(healed, "Control CT")).toBe(1);
    expect(effGroupOf(healed).get("drag")).toBe("Source 1"); // the floating row reads as Source 1
  });

  it("dragging a member out to open space leaves its old combination whole and one header", () => {
    // ct1 pulled out of Control CT to the end (open space), blanked to group:"" as it would be mid-drag.
    const arr = [
      row({ id: "ct2", group: "Control CT" }),
      row({ id: "s1a", group: "Source 1" }),
      row({ id: "loose" }),                    // open space
      row({ id: "ct1", group: "" }),           // the dragged-out member, blanked
    ];
    const healed = mergeSplitGroups(arr);
    expect(runCount(healed, "Control CT")).toBe(1);     // what remains of Control CT is one block
    expect(runCount(healed, "Source 1")).toBe(1);
    expect(effGroupOf(healed).get("ct1") || "").toBe(""); // the dragged row is free, no stray header
  });
});
