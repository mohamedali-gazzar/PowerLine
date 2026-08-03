// LV configurator catalog — data generated from the master price database, plus
// the option lists / staff lists specified in RPT-01.
//   • components.json / enclosures.json — from the unified price DB
//     ("Database DD.M.YYYY.xlsx", Phase-01) via `frontend/scripts/lv-import-flat.cjs`.
//     Copper connection weight per pole comes from the DB (Weight/Panel/Pole → cuP,
//     Weight/Cell/Pole → cuC); enclosures carry no H/W/D dimensions (H=W=D=0).
//   • factors.json / combos.json — pricing factors and ATS/MCC/WD templates,
//     maintained separately via `frontend/scripts/lv-import.cjs`.

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
  euro: number;        // EGP / EUR (COST — EUR component prices × euro = EGP cost)
  usd: number;         // EGP / USD (SELLING — EGP selling ÷ usd = selling in USD)
  safetyFactor: number; // selling markup fraction: selling = (cost ÷ factor) × (1 + safetyFactor)
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
// Plating/treatment cost premium on the Main Busbar copper weight, by copper type.
export const COPPER_TYPE_FACTORS: Record<string, number> = {
  "Bare": 1,
  "Raychem": 1.02,
  "Tin-plated": 1.05,
  "Silver-Plated Connections": 1.15,
};
export const copperTypeFactor = (t?: string): number => COPPER_TYPE_FACTORS[t ?? "Bare"] ?? 1;
export const INCOMING_CABLES = ["Bottom", "Top", "Top Busway"] as const;
export const OUTGOING_CABLES = ["Bottom", "Top", "Top Busway", "Bottom & Top", "Bottom & Top Busway"] as const;
export const FORMS = ["1", "2a", "2b", "3a", "3b", "4a", "4b"] as const;

// Sizing & Copper systems (RPT-01): Panels allowed only when incomer ≤ 800 A.
export const PANEL_SYSTEMS = ["SR-Basic", "Unikit", "Local (Sheet Metal)", "Minicenter", "Primo", "Pillars", "Coffree"] as const;
export const CELL_SYSTEMS = ["Pro-E", "IS2", "PLP"] as const;
export const PANELS_MAX_INCOMER_A = 800;

// RPT-02: Double-panel layout restricted to these families, widths 60/80 only.
export const DOUBLE_FAMILIES = ["SR-Basic", "Unikit", "Local (Sheet Metal)"] as const;
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
const sane = (kg: number) => (kg > 0 && kg < 200 ? kg : 0); // guard stray codes in Cu columns (cells reach ~86 kg/pole)

/** EGP price of a component at current factors. ABB discount applies to ABB only (RPT-01).
 *  `itemFraction` (the per-item Material-List discount) applies to ANY brand when
 *  provided; without one, only ABB items follow the global factors.abbDiscount. */
export function componentPriceEgp(c: { eur: number; egp: number; brand: string }, f: Factors, itemFraction?: number): number {
  // The ABB discount only applies to items actually supplied from ABB — i.e. priced
  // off ABB's EUR import list (eur > 0). Locally-priced EGP items (current
  // transformers, digital meters, HRC fuses, surge protection, …) keep full price.
  const frac = itemFraction != null ? itemFraction : c.brand === "ABB" && c.eur > 0 ? f.abbDiscount : 0;
  const base = c.eur > 0 ? c.eur * f.euro : c.egp;
  return base * (1 - frac);
}
export function enclosurePriceEgp(e: { eur: number; egp: number }, f: Factors): number {
  return e.eur > 0 ? e.eur * f.euro : e.egp;
}

// ── Cell-system pricing (Pro-E / IS2 / PLP) ──────────────────────────────────
// Cell rows are generated algorithmically (see cells.ts); their descriptions map
// to priced enclosure records. Names differ slightly between UI and DB:
//   Pro-E thickness prefix "2M" (UI) vs "2mm" (DB);  IP31 = no trailing dot;
//   PLP UI "2000x400x700" / "LSides_70" vs DB "PLP Cell 2000 x 400 x 700mm".
// Normalize, then look up; Pro-E falls back across the IP dot (same cell, ≈ price).
function cellNorm(fam: string, s: string): string {
  if (fam === "PLP") {
    if (/sides/i.test(s)) {
      const d = parseInt((s.match(/(\d+)/) ?? [])[1] ?? "0", 10);
      return `sides-${d > 0 && d < 200 ? d * 10 : d}`;
    }
    return (s.match(/\d+/g) ?? []).join("-");
  }
  return s.replace(/\s+/g, "").toLowerCase().replace(/2mm/g, "2m");
}
const CELL_DB: Record<string, Map<string, DbEnclosure>> = {};
function rebuildCellDb(): void {
  for (const fam of ["Pro-E", "IS2", "PLP"]) {
    const m = new Map<string, DbEnclosure>();
    ENCLOSURES.filter((e) => e.fam === fam).forEach((e) => m.set(cellNorm(fam, e.name), e));
    CELL_DB[fam] = m;
  }
}
rebuildCellDb();
/** Find the priced enclosure for a cell-table row (by family + description). */
export function findCellEnclosure(type: string, desc: string): DbEnclosure | undefined {
  const m = CELL_DB[type];
  if (!m) return undefined;
  const key = cellNorm(type, desc);
  if (m.has(key)) return m.get(key);
  if (type === "Pro-E") {
    const alt = key.endsWith(".") ? key.slice(0, -1) : key + ".";
    if (m.has(alt)) return m.get(alt);
  }
  return undefined;
}
/** EGP price of a single cell-table row (0 if it can't be matched). */
export function cellPriceEgp(type: string, desc: string, f: Factors): number {
  const e = findCellEnclosure(type, desc);
  return e ? enclosurePriceEgp(e, f) : 0;
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

/** Rebuild everything derived from COMPONENTS / ENCLOSURES.
 *  Call this after the catalogue contents are replaced (see lv/catalogSource.ts).
 *  These lists and the cell index are built once at load, so without this a new
 *  or re-priced item is in the catalogue but invisible in the pickers, and cell
 *  prices keep resolving against the previous data. */
export function rebuildDerived(): void {
  COMPONENT_TYPES.length = 0;
  COMPONENT_TYPES.push(...new Set(COMPONENTS.map((c) => c.t).filter(Boolean)));
  ENCLOSURE_FAMILIES.length = 0;
  ENCLOSURE_FAMILIES.push(...new Set(ENCLOSURES.map((e) => e.fam)));
  rebuildCellDb();
}

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

/** A 3-pole breaker with an LSIG trip unit (ground-fault "G") measures the neutral
 *  OUTSIDE the breaker, so it needs an external neutral current sensor. Given a
 *  breaker's name, return the matching sensor's catalogue name (to add alongside it),
 *  or null when it doesn't apply (4-pole or no LSIG). Sensor selection follows ABB's
 *  ranges: XT2/XT4 use the per-rating "TA NEUTRO EXT" CTs, XT5/XT6 use frame+rating
 *  CTs, and XT7/XT7M + the Emax E-frames share the EXT CS N sensors — every name
 *  matches the catalogue exactly, so the added sensor line carries its price. */
export function externalNeutralCT(name: string): string | null {
  const n = name || "";
  if (!/lsig/i.test(n) || !/\b3P\b/i.test(n)) return null; // 3-pole LSIG only (4-pole has the neutral inside)
  const amp = parseInt((n.match(/(\d{2,4})\s*A\b/) || [])[1] || "0", 10); // first rating, e.g. "400A"
  if (/\bXT2[NSH]?\b/i.test(n)) return amp <= 25 ? "TA NEUTRO EXT 25A XT2" : amp <= 63 ? "TA NEUTRO EXT 63A XT2" : amp <= 100 ? "TA NEUTRO EXT 100A XT2" : "TA NEUTRO EXT 160A XT2";
  if (/\bXT4[NSH]?\b/i.test(n)) return "TA NEUTRO EXT 250A XT4"; // one sensor covers the XT4 frame
  if (/\bXT5[NSH]?\b/i.test(n)) return amp <= 500 ? "EXT CT N XT5 400 A EKIP DIP IEC/UL" : "EXT CT N XT5 630 A EKIP DIP IEC";
  if (/\bXT6[NSH]?\b/i.test(n)) return amp <= 630 ? "EXT CT N XT6 630 A EKIP DIP IEC" : "EXT CT N XT6 800 A EKIP DIP IEC/UL";
  if (/\bXT7/i.test(n)) return "EXT CS N E1.2-E2.2-XT7-XT7M 2000A"; // XT7 / XT7M
  if (/\bE1\.2/i.test(n)) return "EXT CS N E1.2-E2.2-XT7-XT7M 2000A";
  if (/\bE2\.2/i.test(n)) return amp <= 2000 ? "EXT CS N E1.2-E2.2-XT7-XT7M 2000A" : "EXT CS N E2.2 2500A";
  if (/\bE4\.2/i.test(n)) return amp <= 3200 ? "EXT CS N E4.2 3200A" : "EXT CS E4.2 4000A - E6.2 N 50%";
  if (/\bE6\.2/i.test(n)) return "EXT CS N E6.2";
  return null;
}
