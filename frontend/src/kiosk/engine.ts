// PCSS selector engine — pure functions ported verbatim (typed) from
// "PCSS SELECTION.html". Same rules → same recommendations as the reference tool.

import {
  SELECTOR_DESIGNS,
  STD_BREAKERS,
  LV_PANELS,
  IEC_GAP_MM,
  type Design,
  type RmuId,
  type Cfg,
  type TrId,
  type LvId,
  type IecId,
} from "./catalog";

export interface Selection {
  rmu: RmuId | null;
  cfg: Cfg | null;
  trPower: TrId | null;
  lv: LvId | null;
  iec: IecId | null;
}

export interface CustomBreaker {
  id: string;
  label: string;
  widthMm: number;
  qty: number;
}

export const emptySelection = (): Selection => ({ rmu: null, cfg: null, trPower: null, lv: null, iec: null });

/** Which LV panel sizes are valid for the current selection. */
export function getAllowedLvPanels(sel: Selection): LvId[] {
  // PRAL-12 unlocks the 175 cm compact panel.
  if (sel.rmu === "pral12") return ["175", "210", "230", "any"];
  if (!sel.trPower) return ["210", "230", "any"];
  if (sel.rmu === "pral24") return ["230"];
  if (sel.rmu === "psec50" && sel.cfg === "2+1+M") return ["230"];
  if (sel.trPower === "1500") return ["230"];
  if (sel.trPower === "500" || sel.trPower === "1000") {
    if ((sel.rmu === "psec375" && sel.cfg === "3+1+M") || (sel.rmu === "murge" && sel.cfg === "2+1+M")) {
      return ["230"];
    }
    return ["210"];
  }
  return ["210", "230", "any"];
}

/** Is a given P-CSS design compatible with the current selection? */
export function checkDesignCompatibility(d: Design, sel: Selection): boolean {
  // PRAL-24 only ever fits the 16ST-V enclosure.
  if (sel.rmu === "pral24") return d.name === "P-CSS 16ST-V";

  if (!sel.rmu || !sel.cfg) return false;
  const cfgs = d.compat[sel.rmu];
  if (!cfgs || !cfgs.includes(sel.cfg)) return false;

  if (sel.rmu === "psec50") {
    if (d.name === "P-CSS 5ST-A") return false;
    if (sel.cfg === "2+1+M" && d.name === "P-CSS 16ST-V") return true;
    if (d.name === "P-CSS 5ST-C" && sel.trPower && sel.trPower !== "500") return false;
    if (d.name === "P-CSS 10ST-K" && sel.trPower && sel.trPower !== "1000") return false;
    if (d.name === "P-CSS 16ST-V" && sel.trPower && sel.trPower !== "1500") return false;
  }

  if (sel.rmu === "psec375") {
    if (d.name === "P-CSS 5ST-A") return false;
    if (sel.cfg === "2+1+M") {
      if (d.name === "P-CSS 5ST-C" && sel.trPower && sel.trPower !== "500") return false;
      if (d.name === "P-CSS 10ST-K" && sel.trPower && sel.trPower !== "1000") return false;
      if (d.name === "P-CSS 16ST-V" && sel.trPower && sel.trPower !== "1500") return false;
    }
    if (sel.cfg !== "2+1+M" && d.name !== "P-CSS 16ST-V") return false;
  }

  if (sel.rmu === "murge") {
    if (d.name === "P-CSS 5ST-A") return false;
    if (d.name === "P-CSS 16ST-U") return false;
    if (d.name === "P-CSS 5ST-C" && sel.trPower && sel.trPower !== "500") return false;
    if (d.name === "P-CSS 10ST-K" && sel.trPower && sel.trPower !== "1000") return false;
  }

  if (sel.rmu === "pral12") {
    if (sel.lv === "175") return d.name === "P-CSS 5ST-A";
    if (d.name === "P-CSS 5ST-A" && sel.trPower === "1000") return false;
  }

  return true;
}

export type Qtys = Record<string, number>;

/** Total breaker footprint (mm) including IEC inter-breaker gaps. */
export function totalUsedMm(sel: Selection, qtys: Qtys, customs: CustomBreaker[]): { total: number; count: number } {
  const gap = sel.iec === "iec" ? IEC_GAP_MM : 0;
  let total = 0;
  let count = 0;
  for (const b of STD_BREAKERS) {
    const q = qtys[b.id] || 0;
    total += q * b.widthMm;
    count += q;
  }
  for (const c of customs) {
    total += c.qty * c.widthMm;
    count += c.qty;
  }
  if (count > 1) total += (count - 1) * gap;
  return { total, count };
}

/** Usable internal width (mm) of the selected LV panel; null if "any". */
export function emptyMm(sel: Selection): number | null {
  const lv = LV_PANELS.find((p) => p.id === sel.lv);
  return lv ? lv.emptyMm : null;
}

export interface SpaceInfo {
  em: number | null;
  total: number;
  count: number;
  remain: number | null;
  pct: number;
  status: "ok" | "warn" | "over" | "idle";
  gap: number;
}

export function spaceInfo(sel: Selection, qtys: Qtys, customs: CustomBreaker[]): SpaceInfo {
  const em = emptyMm(sel);
  const { total, count } = totalUsedMm(sel, qtys, customs);
  const gap = sel.iec === "iec" ? IEC_GAP_MM : 0;
  if (em == null) return { em: null, total, count, remain: null, pct: 0, status: "idle", gap };
  const remain = em - total;
  const pct = Math.min((total / em) * 100, 100);
  const status: SpaceInfo["status"] = remain < 0 ? "over" : remain < em * 0.1 ? "warn" : "ok";
  return { em, total, count, remain, pct, status, gap };
}

export interface KioskResult {
  compatible: Design[];
  incompatible: Design[];
  spaceOk: boolean;
  /** The single best recommendation (first compatible, smallest enclosure). */
  recommended: Design | null;
}

/** Full evaluation for the current selection (compatible designs + space check). */
export function evaluate(
  sel: Selection,
  qtys: Qtys,
  customs: CustomBreaker[],
  filter: "all" | "5ST" | "10ST" | "16ST" = "all"
): KioskResult {
  if (!sel.rmu || !sel.cfg) {
    return { compatible: [], incompatible: [], spaceOk: true, recommended: null };
  }
  let pool = SELECTOR_DESIGNS;
  if (sel.lv && sel.lv !== "any") pool = pool.filter((d) => d.lvp === sel.lv);
  if (filter !== "all") pool = pool.filter((d) => d.series === filter);

  const compatible = pool.filter((d) => checkDesignCompatibility(d, sel));
  const incompatible = pool.filter((d) => !checkDesignCompatibility(d, sel));

  const { em, total } = spaceInfo(sel, qtys, customs);
  const spaceOk = em == null || total === 0 || total <= em;

  return { compatible, incompatible, spaceOk, recommended: compatible[0] ?? null };
}
