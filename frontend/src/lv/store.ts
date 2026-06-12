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
  cuPanelKg,
  type DbComponent,
  type DbEnclosure,
  type Factors,
  type SalesPerson,
} from "./catalog";
import { defaultCellConfig, type CellConfig } from "./cells";

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
}

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
  sections: string[];
  activeSection: string;
  components: PanelComponent[];
  sizingMode: SizingMode;
  panelsSizing: PanelsSizing;
  panelItems: PanelTypeItem[]; // chosen enclosure sizings (component-like rows)
  cellConfig: CellConfig;
}

export interface LvProject {
  ref: string;
  name: string;
  customer: string;
  location: string;
  date: string;
  salesPerson: string;
  salesMobile: string;
  salesEmail: string;
  supportEngineer: string;
  salesManager: string;
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

export function newPanel(n: number): LvPanel {
  return {
    id: uid(),
    name: `Panel ${n}`,
    code: "",
    fedFrom: "",
    qty: 1,
    ratingA: 0,
    ambTemp: "35°C",
    neutral: "50% Phase",
    earth: "50% Phase",
    copperType: "Tin-plated",
    incomingCables: "Bottom",
    outgoingCables: "Bottom",
    form: "1",
    encFam: "SR-Basic",
    encKey: "",
    mainBusbarKg: 0,
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
      ref: "", name: "", customer: "", location: "",
      date: new Date().toISOString().slice(0, 10),
      salesPerson: "", salesMobile: "", salesEmail: "",
      supportEngineer: "", salesManager: SALES_MANAGER,
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
    // forward-compat defaults
    return { ...initialState(), ...s, factors: { ...DEFAULT_FACTORS, ...s.factors } };
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

export function duplicatePanel(p: LvPanel, n: number): LvPanel {
  return {
    ...structuredClone(p),
    id: uid(),
    name: `${p.name} (copy${n > 1 ? ` ${n}` : ""})`,
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
  unitCost: number;
  unitCostOps: number;
  sellUnit: number;
  totalSell: number;
}
export function findEnclosure(p: LvPanel): DbEnclosure | undefined {
  return ENCLOSURES.find((e) => e.fam === p.encFam && `${e.name}|${e.ref}` === p.encKey);
}
export function calcPanel(p: LvPanel, f: Factors): PanelCalc {
  let compCost = 0;
  let cuWeight = 0;
  for (const c of p.components) {
    compCost += componentPriceEgp(c, f) * c.qty;
    cuWeight += cuPanelKg(c) * c.qty;
  }
  // Panel Type items (enclosure sizings added like components)
  let enclCost = 0;
  for (const it of p.panelItems ?? []) {
    enclCost += (it.eur > 0 ? it.eur * f.euro : it.egp) * it.qty;
  }
  const cuConnCost = cuWeight * f.copper;
  const busbarCost = (p.mainBusbarKg || 0) * f.copper;
  const fam = p.panelsSizing?.family ?? "";
  const noKit = fam === "Minicenter" || fam === "Primo";
  const kits = noKit ? 0 : enclCost * (0.02 + (f.forms[p.form] || 0));
  const unitCost = compCost + enclCost + cuConnCost + busbarCost + kits;
  const unitCostOps = unitCost * (1 + f.operations);
  const sellUnit = f.factor > 0 ? unitCostOps / f.factor : unitCostOps;
  return { compCost, enclCost, cuConnCost, busbarCost, kits, cuWeight, unitCost, unitCostOps, sellUnit, totalSell: sellUnit * p.qty };
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
    copperKg += (p.mainBusbarKg || 0) * mult;
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
