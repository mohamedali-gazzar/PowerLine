// LV configurator catalog — data generated from the QTN workbook + Combinations
// Database by `frontend/scripts/lv-import.cjs` (re-run it when a new QTN arrives),
// plus the option lists / staff lists specified in RPT-01.

import componentsJson from "./data/components.json";
import enclosuresJson from "./data/enclosures.json";
import factorsJson from "./data/factors.json";
import combosJson from "./data/combos.json";

// ── Component DB ─────────────────────────────────────────────────────────────
export interface DbComponent {
  t: string;    // Type (MCB, MCCB, ACB, Contactor, …)
  f: string;    // Family (S200, XT1, E2.2, …)
  r: string;    // Rating ("63A", …)
  d: string;    // short description
  n: string;    // PL description (display name)
  ref: string;  // catalog reference
  eur: number;  // ABB price list (EUR)
  egp: number;  // workbook EGP fallback (for non-EUR items)
  poles: number;
  cuP: number;  // copper kg/pole — panels
  cuC: number;  // copper kg/pole — cells
  brand: string;
  stock: string;
}
export const COMPONENTS = componentsJson as DbComponent[];

export interface DbEnclosure {
  fam: string;
  name: string;
  ref: string;
  abb: string;
  eur: number;
  egp: number;
  ip: string;
  H: number;
  W: number;
  D: number;
  mount: string;
  ral: string;
}
export const ENCLOSURES = enclosuresJson as DbEnclosure[];

export interface Factors {
  factor: number;      // selling factor (cost ÷ factor = sell)
  euro: number;        // EGP / EUR
  usd: number;         // EGP / USD
  copper: number;      // EGP / kg
  sheetMetal: number;  // EGP / kg
  operations: number;  // overhead fraction
  abbDiscount: number; // ABB-only discount fraction (RPT-01)
  vat: number;
  forms: Record<string, number>;
}
export const DEFAULT_FACTORS = factorsJson as Factors;

export const COMBOS = combosJson as {
  ats: Record<"1oo2" | "2oo3", Record<string, { group: string; items: { qty: number; desc: string }[] }[]>>;
  photocell: { ratings: { a: number; contactor: string; aux: string }[]; fixed: { qty: number; desc: string }[] };
  mcc: { combos: { kind: string; kw: string; type: number; parts: string[] }[]; control: { qty: number; desc: string }[] };
  wd: { frame: string; poles: string; fp: string; mp: string }[];
};

// ── RPT-01 option lists ──────────────────────────────────────────────────────
export const AMB_TEMPS = ["35°C", "40°C", "45°C", "50°C", "55°C"] as const;
export const NEUTRAL_EARTH = ["25% Phase", "50% Phase", "100% Phase"] as const;
export const COPPER_TYPES = ["Bare", "Raychem", "Tin-plated", "Silver-Plated Connections"] as const;
export const INCOMING_CABLES = ["Bottom", "Top", "Top Busway"] as const;
export const OUTGOING_CABLES = ["Bottom", "Top", "Top Busway", "Bottom & Top", "Bottom & Top Busway"] as const;
export const FORMS = ["1", "2a", "2b", "3a", "3b", "4a", "4b"] as const;

// Sizing & Copper systems (RPT-01): Panels allowed only when incomer ≤ 800 A.
export const PANEL_SYSTEMS = ["SR-Basic", "Unikit", "Local (Sheet Metal)", "Minicenter", "Primo", "Pillars", "Coffree"] as const;
export const CELL_SYSTEMS = ["Pro-E", "IS2", "PLP"] as const;
export const PANELS_MAX_INCOMER_A = 800;

// RPT-02: Double-panel layout restricted to these families, widths 60/80 only.
export const DOUBLE_FAMILIES = ["SR-Basic", "Unikit"] as const;
export const DOUBLE_SECOND_WIDTHS = [60, 80] as const;

// Staff lists (RPT-01) — editable in the UI; these are the seeded defaults.
export const SALES_MANAGER = "Ali Kamal";
export const DEFAULT_SUPPORT_ENGINEERS = [
  "Rana Hazem", "Fatma Ibrahim", "Sara Mohamed", "Yasmina Mohamed",
  "Reham ElHusseiny", "H.Hassan", "Esraa Emara", "Merna Magdy",
  "Mayar Hamdy", "Mariam Yasser", "Amr Fouad", "Mohamed Tamer",
];
export interface SalesPerson { name: string; mobile: string; email: string }
export const DEFAULT_SALES_PEOPLE: SalesPerson[] = [
  { name: "Ali Kamal", mobile: "0100 000 2147", email: "Ali.kamal@powerline.com.eg" },
  { name: "Ehab Magdy", mobile: "0106 486 0832", email: "ehab.magdy@powerline.com.eg" },
  { name: "Alaa Essam", mobile: "0100 444 7445", email: "alaa.essam@powerline.com.eg" },
  { name: "Ahmed Behiry", mobile: "0111 090 9303", email: "a.bahiry@powerline.com.eg" },
  { name: "Mai Metwally", mobile: "0122 349 2317", email: "mai.metwally@powerline.com.eg" },
  { name: "Mohamed Yahia", mobile: "0106 098 0263", email: "mohamed.yahia@powerline.com.eg" },
  { name: "Menna-Allah Hassan", mobile: "0102 621 9415", email: "menna.hassan@powerline.com.eg" },
  { name: "Mahmoud Abdelrahman", mobile: "0102 723 4124", email: "mahmoud.abdelrahman@powerline.com.eg" },
  { name: "Salma Samy", mobile: "0102 411 4462", email: "salma.samy@powerline.com.eg" },
  { name: "Shady Sayed", mobile: "0109 659 9179", email: "shady.sayed@powerline.com.eg" },
  { name: "Aya Wael", mobile: "0105 009 4130", email: "aya.moustafa@powerline.com.eg" },
  { name: "Ramez Hany", mobile: "0106 909 0657", email: "ramez.hani@powerline.com.eg" },
];

// ── Pricing helpers ──────────────────────────────────────────────────────────
const sane = (kg: number) => (kg > 0 && kg < 50 ? kg : 0); // guard stray codes in Cu columns

/** EGP price of a component at current factors. ABB discount applies to ABB only (RPT-01). */
export function componentPriceEgp(c: { eur: number; egp: number; brand: string }, f: Factors): number {
  const disc = c.brand === "ABB" ? 1 - f.abbDiscount : 1;
  if (c.eur > 0) return c.eur * f.euro * disc;
  return c.egp * disc;
}
export function enclosurePriceEgp(e: DbEnclosure, f: Factors): number {
  return e.eur > 0 ? e.eur * f.euro : e.egp;
}
export const cuPanelKg = (c: { cuP: number; poles: number }) => sane(c.cuP) * (c.poles || 0);
export const cuCellKg = (c: { cuC: number; poles: number }) => sane(c.cuC) * (c.poles || 0);

export const fmtEgp = (n: number) =>
  (isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmt2 = (n: number) =>
  (isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Distinct component types for the picker, in catalog order.
export const COMPONENT_TYPES: string[] = [...new Set(COMPONENTS.map((c) => c.t).filter(Boolean))];
export const ENCLOSURE_FAMILIES: string[] = [...new Set(ENCLOSURES.map((e) => e.fam))];

/** Find a DB component whose display name matches a combination-template description. */
export function findByName(desc: string): DbComponent | undefined {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const want = norm(desc);
  return (
    COMPONENTS.find((c) => norm(c.n) === want) ??
    COMPONENTS.find((c) => norm(c.d) === want) ??
    // template description contained in the DB name (e.g. DB prefixes "Multifunction relay, …")
    COMPONENTS.find((c) => norm(c.n).includes(want)) ??
    COMPONENTS.find((c) => want.includes(norm(c.n)) && norm(c.n).length > 12) ??
    COMPONENTS.find((c) => norm(c.n).startsWith(want.slice(0, 40)))
  );
}
