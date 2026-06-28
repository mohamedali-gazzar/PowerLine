// LV configurator state + calculation engine + Material List builder (RPT-04).
// State is kept client-side and persisted to localStorage (Phase 1 — saving to
// the PowerLine backend as offers is a later phase).

import {
  COMPONENTS,
  ENCLOSURES,
  DEFAULT_FACTORS,
  DEFAULT_SALES_PEOPLE,
  DEFAULT_SUPPORT_ENGINEERS,
  SALES_MANAGER,
  componentPriceEgp,
  enclosurePriceEgp,
  componentByRef,
  enclosureByRefName,
  enclosureByFamName,
  cuPanelKg,
  copperTypeMult,
  kitRate,
  type DbComponent,
  type DbEnclosure,
  type Factors,
  type SalesPerson,
} from "./catalog";
import { defaultCellConfig, type CellConfig } from "./cells";
import type { CopperTool } from "./copper";

let uidCtr = 0;
export const uid = () => `u${++uidCtr}_${Math.random().toString(36).slice(2, 7)}`;

// ── Types ────────────────────────────────────────────────────────────────────
export interface PanelComponent {
  id: string;
  section: string;
  name: string;     // display description
  desc: string;     // short description
  ref: string;
  type: string;
  brand: string;
  rating: string;
  eur: number;
  egp: number;
  poles: number;
  cuP: number;
  cuC: number;
  stock: string;
  qty: number;
  adj: string;      // RPT-01: adjustable rating (free text)
  comment: string;  // RPT-01: free text
  note: string;     // RPT-01: free text
  group?: string;   // combination tag (e.g. "ATS 1 Out of 2")
  spacer?: boolean; // blank separator row — excluded from all cost/count/exports
}
/** True for a blank spacer row (separates component groups; never priced/counted). */
export const isSpacer = (c: PanelComponent): boolean => c.spacer === true;

export type SizingMode = "none" | "panels" | "cells";
export interface PanelsSizing {
  layout: "Single" | "Double";
  family: string;
  sizing1: string; // legacy (pre item-list) — kept for stored-data compat
  sizing2: string;
}

/** Panel Type selection — ONE enclosure per slot (Single = slot 1; Double = 1 + 2). */
export interface PanelTypeItem {
  id: string;
  slot?: 1 | 2;
  fam: string;
  name: string;
  ref: string;
  ip: string;
  eur: number;
  egp: number;
  qty: number; // always 1 (one item selected); kept for cost/material math
}

export interface LvPanel {
  id: string;
  name: string;
  code: string;
  fedFrom: string;   // RPT-01: next to panel name
  qty: number;
  ratingA: number;   // incoming breaker rating (drives the 800 A rule)
  ambTemp: string;
  neutral: string;
  earth: string;
  copperType: string;
  incomingCables: string;
  outgoingCables: string;
  form: string;
  encFam: string;        // legacy — superseded by panelItems
  encKey: string;        // legacy — superseded by panelItems
  mainBusbarKg: number;  // auto for panels / manual for cells (Phase 1: editable)
  copperTool: CopperTool; // RPT-1: per-rating copper lengths (Cells → Copper Tool)
  draft: string;          // RPT-1: per-panel scratchpad — never included in outputs
  sections: string[];
  activeSection: string;
  components: PanelComponent[];
  sizingMode: SizingMode;
  panelsSizing: PanelsSizing;
  panelItems: PanelTypeItem[]; // chosen enclosure sizings (component-like rows)
  cellConfig: CellConfig;
}

export interface LvProject {
  // QTN number is entered once at QTN creation (rec.number) — not duplicated here.
  optyNo: string;       // RPT-1: Opportunity number
  revisionNo: string;   // RPT-1: Revision number
  name: string;
  customer: string;
  date: string;
  salesPerson: string;
  salesMobile: string;
  salesEmail: string;
  supportEngineer: string;
  salesManager: string;
  salesManagerMobile: string; // RPT-1: sales-manager phone (auto-filled from staff)
  salesManagerEmail: string;  // RPT-1: sales-manager email (auto-filled from staff)
}

export interface LvState {
  project: LvProject;
  factors: Factors;
  salesPeople: SalesPerson[];
  supportEngineers: string[];
  panels: LvPanel[];
  selectedId: string | null;
}

export const DEFAULT_SECTIONS = ["Main Incoming", "Outgoings", "Metering", "Other"];
// Structural sections that can't be renamed or removed ("Other" and any
// user-added sections remain editable/removable).
export const FIXED_SECTIONS = ["Main Incoming", "Outgoings", "Metering"];

export function newPanel(_n?: number): LvPanel {
  return {
    id: uid(),
    name: "", // RPT-1: blank by default; mandatory before any output
    code: "",
    fedFrom: "",
    qty: 1,
    ratingA: 0,
    ambTemp: "35°C",
    neutral: "50% Phase",
    earth: "25% Phase",
    copperType: "Bare",
    incomingCables: "Bottom",
    outgoingCables: "Bottom",
    form: "1",
    encFam: "SR-Basic",
    encKey: "",
    mainBusbarKg: 0,
    copperTool: {},
    draft: "",
    sections: [...DEFAULT_SECTIONS],
    activeSection: DEFAULT_SECTIONS[0],
    components: [],
    sizingMode: "none",
    panelsSizing: { layout: "Single", family: "SR-Basic", sizing1: "", sizing2: "" },
    panelItems: [],
    cellConfig: defaultCellConfig(),
  };
}

export function initialState(): LvState {
  return {
    project: {
      optyNo: "", revisionNo: "", name: "", customer: "",
      date: new Date().toISOString().slice(0, 10),
      salesPerson: "", salesMobile: "", salesEmail: "",
      supportEngineer: "", salesManager: SALES_MANAGER,
      salesManagerMobile: "", salesManagerEmail: "",
    },
    factors: { ...DEFAULT_FACTORS },
    salesPeople: [...DEFAULT_SALES_PEOPLE],
    supportEngineers: [...DEFAULT_SUPPORT_ENGINEERS],
    panels: [],
    selectedId: null,
  };
}

// ── Persistence ──────────────────────────────────────────────────────────────
const LS_KEY = "powerline-lv-v1";
export function loadState(): LvState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return initialState();
    const s = JSON.parse(raw) as LvState;
    // forward-compat defaults (deep-merge project so new RPT-1 fields get defaults)
    return {
      ...initialState(),
      ...s,
      project: { ...initialState().project, ...s.project },
      factors: { ...DEFAULT_FACTORS, ...s.factors },
    };
  } catch {
    return initialState();
  }
}
export function saveState(s: LvState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* storage full/blocked — non-fatal */
  }
}

// ── Component helpers ────────────────────────────────────────────────────────
export function toPanelComponent(c: DbComponent, section: string, qty = 1, group?: string): PanelComponent {
  return {
    id: uid(), section, name: c.n, desc: c.d, ref: c.ref, type: c.t, brand: c.brand,
    rating: c.r, eur: c.eur, egp: c.egp, poles: c.poles, cuP: c.cuP, cuC: c.cuC,
    stock: c.stock, qty, adj: "", comment: "", note: "", group,
  };
}
/** For combo lines whose description didn't resolve to a DB component. */
export function freeComponent(desc: string, section: string, qty: number, group?: string): PanelComponent {
  return {
    id: uid(), section, name: desc, desc, ref: "", type: "Other", brand: "Other Supplier",
    rating: "", eur: 0, egp: 0, poles: 0, cuP: 0, cuC: 0, stock: "", qty,
    adj: "", comment: "", note: "", group,
  };
}
/** A blank spacer row used to separate component groups within a section. */
export function spacerComponent(section: string): PanelComponent {
  return {
    id: uid(), section, name: "", desc: "", ref: "", type: "", brand: "",
    rating: "", eur: 0, egp: 0, poles: 0, cuP: 0, cuC: 0, stock: "", qty: 0,
    adj: "", comment: "", note: "", spacer: true,
  };
}

/** RPT: incremental duplicate name — "PANEL 4" → "PANEL 4-1" → "PANEL 4-2" …
 *  Strips an existing "-N" (or legacy "(copy)") suffix so the series continues
 *  from the highest number already used for that base name. */
export function nextDuplicateName(srcName: string, panels: LvPanel[]): string {
  const base = srcName
    .replace(/\s*\(copy[^)]*\)\s*$/i, "") // legacy "(copy)" / "(copy 2)"
    .replace(/\s*-\s*\d+\s*$/, "")          // existing "-N"
    .trim();
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}\\s*-\\s*(\\d+)$`);
  let max = 0;
  for (const p of panels) {
    const m = p.name.trim().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${base}-${max + 1}`;
}

export function duplicatePanel(p: LvPanel, name: string): LvPanel {
  return {
    ...structuredClone(p),
    id: uid(),
    name,
    components: p.components.map((c) => ({ ...c, id: uid() })),
  };
}

// ── Calculation engine (mirrors the validated sample tool) ───────────────────
export interface PanelCalc {
  compCost: number;
  enclCost: number;
  cuConnCost: number;
  busbarCost: number;
  kits: number;
  cuWeight: number;
  busbarKg: number;
  unitCost: number;
  unitCostOps: number;
  sellUnit: number;
  totalSell: number;
}
export function findEnclosure(p: LvPanel): DbEnclosure | undefined {
  return ENCLOSURES.find((e) => e.fam === p.encFam && `${e.name}|${e.ref}` === p.encKey);
}

// V15.3 main busbar (Technical L8): for panels with a busbar-bearing enclosure
// the busbar weight = 3 phases × CSA(rating) × enclosure height (mm) × copper
// density. CSA tiers follow the Panels Data busbar table.
const BUSBAR_FAMILIES = new Set(["SR-Basic", "Unikit"]);
function busbarCsa(ratingA: number): number {
  if (ratingA <= 160) return 100;
  if (ratingA <= 250) return 200;
  if (ratingA <= 400) return 300;
  if (ratingA <= 630) return 400;
  return 500;
}
/** Auto main-busbar weight (kg) for a panel, or 0 when it doesn't apply (e.g.
 *  cells / non-busbar families) — in which case the manual mainBusbarKg is used. */
export function autoMainBusbarKg(p: LvPanel): number {
  if (!p.ratingA || p.ratingA <= 0) return 0;
  const items = p.panelItems ?? [];
  const item = items.find((it) => it.slot === 1) ?? items[0];
  if (!item) return 0;
  const enc = ENCLOSURES.find((e) => e.ref === item.ref && e.name === item.name);
  if (!enc || !BUSBAR_FAMILIES.has(enc.fam)) return 0;
  return 3 * busbarCsa(p.ratingA) * enc.H * 0.000009;
}
export function calcPanel(p: LvPanel, f: Factors): PanelCalc {
  let compCost = 0;
  let cuWeight = 0;     // physical copper weight (kg) → Material List
  let cuConnKg = 0;     // cost-weighted copper (V15.3: Busway connections ×1.5)
  for (const c of p.components) {
    if (isSpacer(c)) continue; // blank separator — no cost/copper
    // Price from the live catalogue by ref (V15.3-synced); fall back to the
    // stored line for free / combination items not in the database.
    compCost += componentPriceEgp(componentByRef(c.ref) ?? c, f) * c.qty;
    const kg = cuPanelKg(c) * c.qty;
    cuWeight += kg;
    cuConnKg += kg * (c.type === "Busway" ? 1.5 : 1);
  }
  // Panel Type items (enclosure sizings added like components). V15.3 internal
  // kits are a per-enclosure fraction of its price by family (Panels Data AA).
  let enclCost = 0;
  let kits = 0;
  for (const it of p.panelItems ?? []) {
    const enc = enclosureByRefName(it.ref, it.name);
    const unit = enc ? enclosurePriceEgp(enc, f) : (it.eur > 0 ? it.eur * f.euro : it.egp);
    const itemCost = unit * it.qty;
    enclCost += itemCost;
    kits += itemCost * kitRate(it.fam);
  }
  // Cells mode (floor-standing Pro-E / IS2 / PLP): cost each selected cell system
  // from the catalogue (V15.3 "Enclosure / PLP Cells / Pro-E" buckets), with the
  // same family kit rate. Cell rows carry the enclosure name as their description.
  if (p.sizingMode === "cells" && p.cellConfig) {
    const cc = p.cellConfig;
    for (const row of cc.rows) {
      if (!(row.qty > 0)) continue;
      const enc = enclosureByFamName(cc.type, row.desc);
      if (!enc) continue;
      const cellCost = enclosurePriceEgp(enc, f) * row.qty;
      enclCost += cellCost;
      // "Sides" rows are locked and carry no kit (V15.3 AA blank for them).
      if (!row.locked) kits += cellCost * kitRate(cc.type);
    }
  }
  const cuConnCost = cuConnKg * f.copper;
  // V15.3 main busbar: kg × Cu price × copper-type multiplier × Double (×1.5).
  // Weight is auto-computed for panels; the manual field is the cells fallback.
  const busbarKg = autoMainBusbarKg(p) || (p.mainBusbarKg || 0);
  const busbarMult = copperTypeMult(p.copperType) * (p.panelsSizing?.layout === "Double" ? 1.5 : 1);
  const busbarCost = busbarKg * f.copper * busbarMult;
  const unitCost = compCost + enclCost + cuConnCost + busbarCost + kits;
  const unitCostOps = unitCost * (1 + f.operations);
  const sellUnit = f.factor > 0 ? unitCostOps / f.factor : unitCostOps;
  return { compCost, enclCost, cuConnCost, busbarCost, kits, cuWeight, busbarKg, unitCost, unitCostOps, sellUnit, totalSell: sellUnit * p.qty };
}
export function grandTotals(s: LvState) {
  let sell = 0;
  s.panels.forEach((p) => (sell += calcPanel(p, s.factors).totalSell));
  const vat = sell * s.factors.vat;
  return { sell, vat, incl: sell + vat };
}

// ── Material List (RPT-04) ───────────────────────────────────────────────────
// Aggregate across all panels (× panel qty), group identical references, and
// split into the 7 mandated tables.
export interface MatRow {
  supplier: string;
  description: string;
  reference: string;
  stock: string;
  qty: number;
}
export interface MaterialList {
  abb: MatRow[];
  other: MatRow[];
  plpCells: MatRow[];
  abbEnclosures: MatRow[];
  is2: MatRow[];
  proE: MatRow[];
  copperKg: number;
}

export function buildMaterialList(s: LvState): MaterialList {
  const agg = new Map<string, MatRow>();
  const add = (key: string, row: MatRow) => {
    const ex = agg.get(key);
    if (ex) ex.qty += row.qty;
    else agg.set(key, { ...row });
  };
  let copperKg = 0;

  for (const p of s.panels) {
    const mult = p.qty || 1;
    for (const c of p.components) {
      if (isSpacer(c)) continue; // blank separator — never a material line
      add(`c|${c.ref || c.name}`, {
        supplier: c.brand || "ABB",
        description: c.name,
        reference: c.ref,
        stock: c.stock,
        qty: c.qty * mult,
      });
      copperKg += cuPanelKg(c) * c.qty * mult;
    }
    for (const it of p.panelItems ?? []) {
      add(`e|${it.ref || it.name}`, {
        supplier: ["Pro-E", "IS2", "PLP"].includes(it.fam) ? it.fam : "ABB Enclosure",
        description: `${it.fam} — ${it.name}`,
        reference: it.ref,
        stock: "",
        qty: it.qty * mult,
      });
    }
    copperKg += (autoMainBusbarKg(p) || p.mainBusbarKg || 0) * mult;
    // Sizing & Copper cell tables → their own supplier buckets
    if (p.sizingMode === "cells") {
      for (const r of p.cellConfig.rows) {
        if (r.qty > 0)
          add(`cell|${p.cellConfig.type}|${r.desc}`, {
            supplier: p.cellConfig.type,
            description: r.desc,
            reference: "",
            stock: "",
            qty: r.qty * mult,
          });
      }
    }
  }

  const rows = [...agg.values()];
  const isEnc = (r: MatRow) => r.supplier === "ABB Enclosure";
  return {
    abb: rows.filter((r) => r.supplier === "ABB" && !isEnc(r)),
    other: rows.filter((r) => !["ABB", "Pro-E", "IS2", "PLP"].includes(r.supplier) && !isEnc(r)),
    plpCells: rows.filter((r) => r.supplier === "PLP"),
    abbEnclosures: rows.filter(isEnc),
    is2: rows.filter((r) => r.supplier === "IS2"),
    proE: rows.filter((r) => r.supplier === "Pro-E"),
    copperKg,
  };
}

// ── Search ───────────────────────────────────────────────────────────────────
export function searchComponents(q: string, limit = 50): DbComponent[] {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: DbComponent[] = [];
  for (const c of COMPONENTS) {
    const hay = `${c.n} ${c.d} ${c.ref} ${c.t} ${c.f} ${c.r} ${c.brand}`.toLowerCase();
    if (terms.every((t) => hay.includes(t))) {
      hits.push(c);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}
