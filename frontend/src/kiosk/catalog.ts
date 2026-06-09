// PCSS (Packaged Compact Secondary Substation / "Kiosk") catalog.
//
// Data source of truth: "PCSS Designs.xlsx" (dimensions, weights, the full 9-design
// catalog and the RMU↔design compatibility matrix).
// Selection workflow source: "PCSS SELECTION.html" (the validated 6-step engineering
// selector). The 6 designs used by the selector are the "Most uses in our Design"
// set from the Excel; their dimensions/weights were cross-checked against the sheet.
//
// A PCSS kiosk is a packaged substation enclosure that houses an MV panel (RMU),
// an LV distribution panel and a transformer (TR) compartment. The selector takes
// the chosen RMU + switching config + TR power + LV panel + breaker layout and
// returns the compatible P-CSS enclosure design(s).

export type RmuId = "psec50" | "psec375" | "murge" | "pral12" | "pral24";
export type Cfg = "2+1" | "3+1" | "2+1+M" | "3+1+M";
export type TrId = "500" | "1000" | "1500";
export type LvId = "175" | "210" | "230" | "any";
export type IecId = "iec" | "noiec";
export type Series = "5ST" | "10ST" | "16ST";

export interface Rmu {
  id: RmuId;
  label: string;
  sub: string;
  /** Switching configurations the selector offers for this RMU. */
  configs: Cfg[];
}

export interface TrPower {
  id: TrId;
  label: string;
  sub: string;
}

export interface LvPanel {
  id: LvId;
  label: string;
  sub: string;
  /** Usable internal width for breakers (mm). null = "any / not specified". */
  emptyMm: number | null;
  series: Series[];
  /** Physical panel size W×D×H (cm) from the Excel, where defined. */
  sizeCm?: string;
}

export interface Breaker {
  id: string;
  label: string;
  widthMm: number;
}

export interface Design {
  name: string;
  /** Outer shell W×H×D (cm). */
  outer: string;
  /** Inner clearance W×H×D (cm) — "decrease 10 cm for installing". */
  inner: string;
  /** LV compartment depth (cm). */
  lv: number;
  /** TR compartment depth (cm) — tracks TR power: 156≈500, 180≈1000, 205≈1500 kVA. */
  tr: number;
  /** Empty-enclosure weight (kg). */
  kg: number;
  series: Series;
  /** Matching LV panel id. */
  lvp: LvId;
  /** RMU group → switching configs this enclosure accepts (from the Excel matrix). */
  compat: Partial<Record<RmuId, Cfg[]>>;
  /** Whether this design is part of the standard selector ("Most uses in our Design"). */
  preferred: boolean;
}

// ── MV panels (RMU) the kiosk can house ──────────────────────────────────────
export const RMUS: Rmu[] = [
  { id: "psec50", label: "PSEC ABB 50 cm", sub: "ABB SF6 ring main unit", configs: ["2+1", "3+1", "2+1+M"] },
  { id: "psec375", label: "PSEC ABB 37.5 cm", sub: "ABB compact SF6 RMU", configs: ["2+1+M", "3+1+M"] },
  { id: "murge", label: "PSEC Murge", sub: "Murge SF6 switchgear", configs: ["2+1", "2+1+M", "3+1"] },
  { id: "pral12", label: "PRAL-12", sub: "Air-insulated · 190×190×80 cm", configs: ["2+1", "3+1", "2+1+M"] },
  { id: "pral24", label: "PRAL-24", sub: "Air-insulated · 220×205×110 cm", configs: ["2+1", "2+1+M"] },
];

// ── Transformer rated effective power ────────────────────────────────────────
// Ids stay 500/1000/1500 (the compatibility engine keys off them); labels are the
// PCSS effective-power ranges the user picks from.
export const TR_POWERS: TrPower[] = [
  { id: "500", label: "0–500 kVA", sub: "Standard load" },
  { id: "1000", label: "500–1000 kVA", sub: "Medium load" },
  { id: "1500", label: "1000–2000 kVA", sub: "High capacity" },
];

// Next PCSS range up, for the "upgrade instead of a Special Kiosk" hint.
// Top tier (1000–2000) has no upgrade → null.
export const TR_UPGRADE: Record<TrId, string | null> = {
  "500": "500–1000 kVA",
  "1000": "1000–2000 kVA",
  "1500": null,
};

// ── LV panel sizes ───────────────────────────────────────────────────────────
// Usable width (emptyMm) = physical width − ~390 mm frame overhead.
export const LV_PANELS: LvPanel[] = [
  { id: "175", label: "LV panel 175 cm", sub: "Usable 136 cm · PRAL-12 compact (5ST-A)", emptyMm: 1360, series: ["5ST"], sizeCm: "175×50×190" },
  { id: "210", label: "LV panel 210 cm", sub: "Usable 171 cm · 5ST / 10ST", emptyMm: 1710, series: ["5ST", "10ST"], sizeCm: "210×50×190" },
  { id: "230", label: "LV panel 230 cm", sub: "Usable 191 cm · 16ST", emptyMm: 1910, series: ["16ST"], sizeCm: "230×50×190" },
  { id: "any", label: "Any / not specified", sub: "Show all regardless of LV panel", emptyMm: null, series: ["5ST", "10ST", "16ST"] },
];

// ── LV circuit-breaker frame widths (ABB Tmax XT family) ─────────────────────
export const STD_BREAKERS: Breaker[] = [
  { id: "xt1", label: "XT1", widthMm: 76 },
  { id: "xt2", label: "XT2", widthMm: 90 },
  { id: "xt3", label: "XT3", widthMm: 105 },
  { id: "xt4", label: "XT4", widthMm: 105 },
  { id: "xt5", label: "XT5", widthMm: 140 },
  { id: "xt6", label: "XT6", widthMm: 209 },
  { id: "xt7", label: "XT7", widthMm: 210 },
];

// IEC clearance between adjacent breakers (mm).
export const IEC_GAP_MM = 60;

// Capacitor box (optional add-on), kg — from the Excel reference.
export const CAPACITOR_BOX_KG = 32;

// ── P-CSS enclosure catalog ──────────────────────────────────────────────────
// The 9 designs from the Excel. `preferred: true` marks the 6 used by the selector
// ("Most uses in our Design"); the other 3 are kept for the full reference table.
export const DESIGNS: Design[] = [
  {
    name: "P-CSS 5ST-A", outer: "215×95×208", inner: "195×85×199", lv: 50, tr: 156, kg: 1520, series: "5ST", lvp: "175", preferred: true,
    compat: { pral12: ["2+1", "3+1", "2+1+M"] },
  },
  {
    name: "P-CSS 5ST-B", outer: "260×130×208", inner: "240×120×199", lv: 50, tr: 156, kg: 1598, series: "5ST", lvp: "210", preferred: false,
    compat: { psec50: ["2+1", "3+1"], psec375: ["2+1+M", "3+1+M"] },
  },
  {
    name: "P-CSS 5ST-C", outer: "240×130×208", inner: "220×120×199", lv: 50, tr: 156, kg: 1647, series: "5ST", lvp: "210", preferred: true,
    compat: { psec50: ["2+1", "3+1", "2+1+M"], psec375: ["2+1+M"], murge: ["2+1", "2+1+M", "3+1"] },
  },
  {
    name: "P-CSS 10ST-I", outer: "240×95×218", inner: "220×85×209", lv: 50, tr: 156, kg: 1647, series: "10ST", lvp: "210", preferred: true,
    compat: { pral12: ["2+1", "3+1", "2+1+M"] },
  },
  {
    name: "P-CSS 10ST-J", outer: "270×130×268", inner: "250×120×258", lv: 50, tr: 205, kg: 2303, series: "10ST", lvp: "210", preferred: false,
    compat: {},
  },
  {
    name: "P-CSS 10ST-K", outer: "240×140×226", inner: "220×130×216", lv: 50, tr: 180, kg: 1837, series: "10ST", lvp: "210", preferred: true,
    compat: { psec50: ["2+1", "3+1", "2+1+M"], psec375: ["2+1+M"], murge: ["2+1", "2+1+M", "3+1"] },
  },
  {
    name: "P-CSS 16ST-U", outer: "260×95×226", inner: "240×85×216", lv: 50, tr: 205, kg: 1948, series: "16ST", lvp: "230", preferred: true,
    compat: { pral12: ["2+1", "3+1", "2+1+M"] },
  },
  {
    name: "P-CSS 16ST-V", outer: "260×130×238", inner: "240×120×228", lv: 50, tr: 205, kg: 2040, series: "16ST", lvp: "230", preferred: true,
    compat: { psec50: ["2+1", "3+1", "2+1+M"], psec375: ["2+1+M", "3+1+M"], murge: ["2+1", "2+1+M", "3+1"], pral24: ["2+1", "3+1", "2+1+M"] },
  },
  {
    name: "P-CSS 16ST-W", outer: "260×140×216", inner: "240×130×206", lv: 50, tr: 205, kg: 2080, series: "16ST", lvp: "230", preferred: false,
    compat: { psec50: ["2+1", "3+1"], psec375: ["2+1+M", "3+1+M"], murge: ["2+1", "2+1+M", "3+1", "3+1+M"], pral24: ["2+1", "3+1", "2+1+M"] },
  },
];

// The 6 designs the selector reasons over.
export const SELECTOR_DESIGNS: Design[] = DESIGNS.filter((d) => d.preferred);

export const lvPanel = (id: LvId | null) => LV_PANELS.find((p) => p.id === id) ?? null;
export const rmu = (id: RmuId | null) => RMUS.find((r) => r.id === id) ?? null;
export const trPower = (id: TrId | null) => TR_POWERS.find((t) => t.id === id) ?? null;
