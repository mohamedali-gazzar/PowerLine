// How much of the LV panel the selection actually fills, and which panel
// chassis that forces. Kept apart from ./engine because it needs the derived
// bill of materials from ./bom.

import {
  BAND_LV_PANEL,
  DESIGNS,
  INCOMING_ONLY_BREAKERS,
  LV_PANELS,
  SWITCHFUSE_WIDTH,
  SWITCH_FUSE_LABEL,
  TR_BAND_RANK,
  type LvPanelId,
} from "./data";
import { allBomRows, pfSizingFrame } from "./bom";
import {
  checkDesignCompatibility,
  getActiveBreakers,
  isSelectionComplete,
  mainIncomingId,
  mccbWidthMm,
  panelEmptyMm,
  trBand,
  type Workspace,
} from "./engine";

export interface Footprint {
  /** Width consumed including EEHC gaps, in mm. */
  total: number;
  /** How many physical units sit in the panel. */
  count: number;
  stdGaps: number;
  swGaps: number;
}

/**
 * Adds up what is in the LV panel.
 *
 * The two modes deliberately measure different things:
 *
 *   Sizing    — only the components the engineer puts in, plus the
 *               power-factor breaker. No main incoming, no EEHC gaps.
 *   Technical — the complete offer: every catalogue line including the
 *               auto-added main incoming, plus EEHC spacing.
 *
 * EEHC spacing: a gap either side of every unit (units + 1 gaps). Switch-fuse
 * gaps are 20 mm and get used up first; the rest are 60 mm.
 */
export function totalUsedMm(ws: Workspace): Footprint {
  const { sel, qtys, customs, switchFuseItems } = ws;
  let total = 0;
  let count = 0;

  const useCatalog = sel.lvConfig === "inout" && sel.lvMode === "technical";
  const inoutSizing = sel.lvConfig === "inout" && sel.lvMode === "sizing";

  if (useCatalog) {
    for (const i of allBomRows(ws)) {
      if (i.excludeFromSizing) continue;
      total += mccbWidthMm(i.model, i.amp) * i.qty;
      count += i.qty;
    }
  } else {
    const pfFrame = pfSizingFrame(sel);
    for (const b of getActiveBreakers(sel)) {
      // Power-factor correction needs its own breaker frame in Sizing mode.
      const q = (qtys[b.id] || 0) + (pfFrame === b.id ? 1 : 0);
      total += q * b.widthMm;
      count += q;
    }
    if (inoutSizing) {
      for (const i of switchFuseItems) {
        total += (SWITCHFUSE_WIDTH[i.amp] || 0) * i.qty;
        count += i.qty;
      }
    }
    // On an Incoming Only panel the EEHC-recommended breaker is the whole
    // configuration, so it is the one auto row that still counts here.
    if (sel.lvConfig === "incoming") {
      const mb = INCOMING_ONLY_BREAKERS.find((x) => x.id === mainIncomingId(sel));
      if (mb) {
        total += mb.widthMm;
        count += 1;
      }
    }
    for (const c of customs) {
      total += c.qty * c.widthMm;
      count += c.qty;
    }
  }

  let stdGaps = 0;
  let swGaps = 0;
  if (useCatalog && sel.iec === "eehc" && count > 0) {
    const numGaps = count + 1;
    // Switch fuses only need 20 mm between them; everything else takes 60 mm.
    const switchFuseQty = allBomRows(ws)
      .filter((i) => i.model === SWITCH_FUSE_LABEL)
      .reduce((s, i) => s + i.qty, 0);
    swGaps = Math.min(switchFuseQty, numGaps);
    stdGaps = numGaps - swGaps;
    total += stdGaps * 60 + swGaps * 20;
  }

  return { total, count, stdGaps, swGaps };
}

/**
 * Picks the LV panel chassis.
 *
 * Starts at the smallest band the transformer allows, then steps up while
 * either no blueprint at that band suits this RMU and configuration, or the
 * breakers picked so far physically overflow the panel.
 */
export function computeEffectiveLvPanel(ws: Workspace): LvPanelId | null {
  return lvPanelDecision(ws).panel;
}

/** The chosen panel plus why — whether the transformer band alone settled it. */
export function lvPanelDecision(ws: Workspace): {
  panel: LvPanelId | null;
  /** The panel the transformer rating alone would have picked. */
  basePanel: LvPanelId | null;
  /** True when the breakers forced a bigger chassis than the rating needed. */
  escalated: boolean;
} {
  const { sel } = ws;
  const fixed = (panel: LvPanelId) => ({ panel, basePanel: panel, escalated: false });

  // Forced to the widest chassis regardless of transformer size.
  if (sel.rmu === "pral24") return fixed("230");
  if (sel.rmu === "psec50" && sel.cfg === "2+1+M") return fixed("230");
  if (sel.rmu === "murge" && sel.cfg === "2+1+M") return fixed("230");
  if (sel.rmu === "lucy" && sel.cfg === "2+1+M") return fixed("230");
  if (sel.rmu === "psec375" && sel.cfg === "3+1+M") return fixed("230");

  const band = trBand(sel.trRating);
  if (!band) return { panel: null, basePanel: null, escalated: false };

  const baseRank = TR_BAND_RANK[band] || 1;
  let rank = baseRank;
  const { total } = totalUsedMm(ws);

  while (rank < 3) {
    const panelId = BAND_LV_PANEL[rank];
    const panel = LV_PANELS.find((p) => p.id === panelId);
    const hasCompatibleDesign = DESIGNS.some((d) => d.lvp === panelId && checkDesignCompatibility(sel, d));
    const fits = !panel || panel.emptyMm === null || total <= panel.emptyMm;
    if (hasCompatibleDesign && fits) break;
    rank++;
  }
  return { panel: BAND_LV_PANEL[rank], basePanel: BAND_LV_PANEL[baseRank], escalated: rank > baseRank };
}

/** Incoming Only is always the fixed 1400 mm chassis. */
export function effectiveLvPanel(ws: Workspace): LvPanelId | null {
  if (ws.sel.lvConfig === "incoming") return "1400";
  return computeEffectiveLvPanel(ws);
}

export interface SpaceInfo {
  panel: LvPanelId | null;
  emptyMm: number | null;
  footprint: Footprint;
  remainingMm: number | null;
  /** How full the panel is, 0-100. */
  pct: number;
  status: "ok" | "warn" | "over" | "unknown";
  /** True when the breakers pushed the panel up a size on their own. */
  escalated: boolean;
  basePanel: LvPanelId | null;
}

export function spaceInfo(ws: Workspace): SpaceInfo {
  const footprint = totalUsedMm(ws);
  const incomingOnly = ws.sel.lvConfig === "incoming";
  const decision = incomingOnly
    ? { panel: "1400" as LvPanelId, basePanel: "1400" as LvPanelId, escalated: false }
    : lvPanelDecision(ws);
  const emptyMm = panelEmptyMm(decision.panel);
  const base = { escalated: decision.escalated, basePanel: decision.basePanel };

  if (emptyMm === null) {
    return { panel: decision.panel, emptyMm, footprint, remainingMm: null, pct: 0, status: "unknown", ...base };
  }
  const remainingMm = emptyMm - footprint.total;
  const pct = Math.min((footprint.total / emptyMm) * 100, 100);
  const status = remainingMm < 0 ? "over" : remainingMm < emptyMm * 0.1 ? "warn" : "ok";
  return { panel: decision.panel, emptyMm, footprint, remainingMm, pct, status, ...base };
}

/** True once every required field is set and the panel has something in it. */
export function isConfigComplete(ws: Workspace): boolean {
  return isSelectionComplete(ws.sel) && totalUsedMm(ws).count > 0;
}

export interface SpaceLine {
  label: string;
  qty: number;
  eachMm: number;
  totalMm: number;
  /** Set on rows the tool added itself, so they can be called out. */
  auto?: boolean;
}

/**
 * Itemises what is eating the panel width, so the bar is explainable rather
 * than just a number that moves.
 */
export function spaceBreakdown(ws: Workspace): SpaceLine[] {
  const { sel, qtys, customs, switchFuseItems } = ws;
  const lines: SpaceLine[] = [];
  const push = (label: string, qty: number, eachMm: number, auto?: boolean) => {
    if (qty > 0) lines.push({ label, qty, eachMm, totalMm: qty * eachMm, auto });
  };

  const useCatalog = sel.lvConfig === "inout" && sel.lvMode === "technical";
  const inoutSizing = sel.lvConfig === "inout" && sel.lvMode === "sizing";

  if (useCatalog) {
    for (const i of allBomRows(ws)) {
      if (i.excludeFromSizing) continue;
      push(`${i.model} ${i.amp}A`, i.qty, mccbWidthMm(i.model, i.amp), i.id.startsWith("auto-"));
    }
  } else {
    const pfFrame = pfSizingFrame(sel);
    for (const b of getActiveBreakers(sel)) {
      push(b.label, qtys[b.id] || 0, b.widthMm);
      if (pfFrame === b.id) push(`${b.label} — power factor`, 1, b.widthMm, true);
    }
    if (inoutSizing) {
      for (const i of switchFuseItems) push(`Switch fuse ${i.amp} A`, i.qty, SWITCHFUSE_WIDTH[i.amp] || 0);
    }
    if (sel.lvConfig === "incoming") {
      const mb = INCOMING_ONLY_BREAKERS.find((x) => x.id === mainIncomingId(sel));
      if (mb) push(`${mb.label} — incoming breaker`, 1, mb.widthMm, true);
    }
    for (const c of customs) push(c.label, c.qty, c.widthMm);
  }

  // Gaps and the main incoming belong to the complete offer, not to Sizing.
  const { stdGaps, swGaps } = totalUsedMm(ws);
  push("EEHC gaps (60 mm)", stdGaps, 60, true);
  push("EEHC gaps, switch fuse (20 mm)", swGaps, 20, true);
  return lines;
}

/** Blueprints split into what fits and what does not. */
export function evaluateDesigns(ws: Workspace, filter: "all" | "5ST" | "10ST" | "16ST") {
  const { sel } = ws;
  const space = spaceInfo(ws);
  const pool = filter === "all" ? DESIGNS : DESIGNS.filter((d) => d.series === filter);

  const compatible = pool.filter((d) => checkDesignCompatibility(sel, d));
  const incompatible = pool.filter((d) => !checkDesignCompatibility(sel, d));
  const spaceOk = space.emptyMm === null || space.footprint.total === 0 || space.footprint.total <= space.emptyMm;

  return { compatible, incompatible, spaceOk, recommendedLv: space.panel, space };
}
