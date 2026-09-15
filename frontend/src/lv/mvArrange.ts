// MV RMU ordering helpers. In the MV Technical offer one product photo (cover) is shown at
// the start of each contiguous run of the same RMU product type — so 10 Air RMUs in a row
// share a single Air cover (at most 3 covers: Air / SF6 / Lucy). These helpers detect when
// same-type RMUs are scattered and reorder them together, driving the "arrange by type"
// recommendation the MV panels tab offers.

import type { LvPanel } from "./store";

/** True when same-type RMUs are already contiguous (each product photo appears once). False
 *  when a product type reappears after a different one (its photo would repeat). */
export function mvRmuGroupedByType(rmus: LvPanel[]): boolean {
  const closed = new Set<string>();
  let prev = "";
  for (const p of rmus) {
    const t = p.mvRmuConfig?.productType ?? "";
    if (t !== prev) {
      if (closed.has(t)) return false; // seen this type earlier, then left it → not grouped
      if (prev) closed.add(prev);
      prev = t;
    }
  }
  return true;
}

/** Reorder the RMU panels so same product types sit together — first-appearance order of the
 *  types, original order within each type. Kiosk / Transformer panels keep their slots. */
export function arrangeMvRmusByType(panels: LvPanel[]): LvPanel[] {
  const idxs: number[] = [];
  const rmus: LvPanel[] = [];
  panels.forEach((p, i) => { if (p.mvType === "rmu" && p.mvRmuConfig) { idxs.push(i); rmus.push(p); } });
  const order: string[] = [];
  const byType = new Map<string, LvPanel[]>();
  for (const p of rmus) {
    const t = p.mvRmuConfig?.productType ?? "";
    if (!byType.has(t)) { byType.set(t, []); order.push(t); }
    byType.get(t)!.push(p);
  }
  const sorted = order.flatMap((t) => byType.get(t)!);
  const out = [...panels];
  idxs.forEach((idx, k) => { out[idx] = sorted[k]; });
  return out;
}
