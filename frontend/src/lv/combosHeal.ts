import type { PanelComponent } from "./store";
import { isSpacer } from "./store";

// Which combination (group name) each row effectively belongs to — the same rule the editor
// uses to draw one header per combination: a real row keeps its own group; a blank/ungrouped
// row inherits a combination only when the SAME group brackets it on both sides within its
// section. (Mirrors effectiveGroups() in LvConfiguratorPage.)
export function effGroupOf(comps: PanelComponent[]): Map<string, string> {
  const out = new Map<string, string>();
  comps.forEach((c, i) => {
    if (!isSpacer(c) && c.group) { out.set(c.id, c.group); return; }
    let prev = "", next = "";
    for (let j = i - 1; j >= 0; j--) { if (comps[j].section !== c.section) break; const g = comps[j].group; if (g) { prev = g; break; } }
    for (let j = i + 1; j < comps.length; j++) { if (comps[j].section !== c.section) break; const g = comps[j].group; if (g) { next = g; break; } }
    out.set(c.id, prev && prev === next ? prev : "");
  });
  return out;
}

/**
 * Keep every combination whole: one contiguous block, one header.
 *
 * A combination is a run of rows sharing one group name inside a section. If a row from a
 * DIFFERENT combination is moved so it sits between the members of another (e.g. by dragging a
 * component through it), that combination's name would appear in two separate places — the editor
 * then draws its header twice, stacked, which is the "two identical rows" the owner saw. This pulls
 * the stray second run back up next to the first so the combination reads as one block again.
 *
 * It only ever relocates whole same-name runs; blank/spacer rows that legitimately sit inside a
 * combination are left where they are, and healthy data comes back untouched (same order). Order of
 * rows and their quantities/prices are never changed — only which section-slot a split run sits in.
 */
export function mergeSplitGroups(comps: PanelComponent[]): PanelComponent[] {
  let arr = comps;
  // Each pass fixes one split, then re-derives (moving a run can change what inherits what). The
  // guard is a safety net against a pathological input; normal edits settle in one or two passes.
  for (let pass = 0; pass < 50; pass++) {
    const eff = effGroupOf(arr);
    // Break the section into contiguous runs of one effective group.
    const runs: { sec: string; g: string; items: PanelComponent[] }[] = [];
    for (const c of arr) {
      const g = eff.get(c.id) || "";
      const last = runs[runs.length - 1];
      if (last && last.sec === c.section && last.g === g) last.items.push(c);
      else runs.push({ sec: c.section, g, items: [c] });
    }
    // Find the first named group that shows up in two separate runs of the same section.
    let mergeInto = -1, stray = -1;
    for (let i = 0; i < runs.length && stray < 0; i++) {
      if (!runs[i].g) continue;
      for (let j = i + 1; j < runs.length; j++) {
        if (runs[j].sec === runs[i].sec && runs[j].g === runs[i].g) { mergeInto = i; stray = j; break; }
      }
    }
    if (stray < 0) break; // nothing split → done
    const [moved] = runs.splice(stray, 1);
    runs.splice(mergeInto + 1, 0, moved); // sit the stray run right after the first one
    arr = runs.flatMap((r) => r.items);
  }
  return arr;
}

/**
 * Where a just-dropped component landed, in combination terms, from its IMMEDIATE neighbours
 * (spacers skipped, the moved row itself ignored so it can't distort the reading):
 *   • both neighbours are the same combination          → dropped inside it     → join it
 *   • only one side is a combination (other side open)  → dropped next to it    → join it
 *   • it sits between two different combinations         → join the one above    (stays contiguous)
 *   • both sides are open / section edges                → dropped in open space → standalone
 */
export function dropTargetGroup(comps: PanelComponent[], movedId: string): string {
  const idx = comps.findIndex((c) => c.id === movedId);
  if (idx < 0) return "";
  const c = comps[idx];
  if (isSpacer(c)) return "";
  const sec = c.section;
  const eff = effGroupOf(comps.filter((x) => x.id !== movedId)); // read neighbours as if the moved row weren't there
  const immediate = (dir: -1 | 1): string => {
    for (let j = idx + dir; j >= 0 && j < comps.length && comps[j].section === sec; j += dir) {
      if (comps[j].id === movedId || isSpacer(comps[j])) continue;
      return eff.get(comps[j].id) || "";
    }
    return "";
  };
  const above = immediate(-1), below = immediate(1);
  if (above && above === below) return above;
  if (above) return above;
  if (below) return below;
  return "";
}

/** Commit a component drop: figure out which combination it landed in (or none) and rewrite its
 *  combination properties to match — the full behaviour the drag-drop spec describes. */
export function resolveComboMembershipOnDrop(comps: PanelComponent[], movedId: string): PanelComponent[] {
  return assignComboMembership(comps, movedId, dropTargetGroup(comps, movedId));
}

/**
 * Move a dropped component into a combination — or out of every combination — by REWRITING its
 * combination properties completely (never merging old + new). This is what a drag-drop commits:
 *
 *   • targetGroup is a real combination  → the row joins it: it takes that combination's name,
 *     its instance id, its scalable flag and (for a scalable combo) its ×N quantity, keeping only
 *     its own per-unit base quantity. It now behaves exactly like the combination's other members.
 *   • targetGroup is ""                  → the row becomes a standalone/free component: no group,
 *     no combination id, no scaling, and its quantity resets to its own per-unit base.
 *
 * The moved row's OLD combination is updated purely by it leaving (its members are read fresh),
 * so a combination emptied of its last member simply stops rendering — there is no empty header to
 * clean up. The section is finally kept contiguous (one header per combination) via mergeSplitGroups.
 */
export function assignComboMembership(comps: PanelComponent[], movedId: string, targetGroup: string): PanelComponent[] {
  const arr = comps.slice();
  const idx = arr.findIndex((c) => c.id === movedId);
  if (idx < 0) return comps;
  const c = arr[idx];
  if (isSpacer(c)) return comps;
  const sec = c.section;
  const base = c.baseQty ?? c.qty; // the component's own per-unit quantity
  if (!targetGroup) {
    // Standalone: strip every combination property and drop the ×N scaling.
    arr[idx] = { ...c, group: "", comboScalable: false, comboId: undefined, baseQty: undefined, qty: base };
  } else {
    const eff = effGroupOf(arr);
    const members = arr.filter((x) => x.section === sec && !isSpacer(x) && x.id !== c.id && (eff.get(x.id) || "") === targetGroup);
    const cid = members.find((m) => m.comboId)?.comboId;           // adopt the combination instance id
    const scalable = /\(Type \d+\)/.test(targetGroup) || members.some((x) => x.comboScalable);
    if (scalable) {
      const first = members[0];
      const fb = first?.baseQty ?? first?.qty ?? 1;
      const cq = fb > 0 ? Math.max(1, Math.round((first?.qty ?? 0) / fb)) : 1; // the combination's current ×N
      arr[idx] = { ...c, group: targetGroup, comboScalable: true, comboId: cid, baseQty: base, qty: base * cq };
    } else {
      arr[idx] = { ...c, group: targetGroup, comboScalable: false, comboId: cid, baseQty: undefined, qty: base };
    }
  }
  return mergeSplitGroups(arr);
}
