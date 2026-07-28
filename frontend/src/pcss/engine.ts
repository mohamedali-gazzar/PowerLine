// PCSS Engineering Selector — the maths.
//
// Every function here is pure: it takes the current selection and returns a
// result. Nothing reads or writes the DOM, so the numbers can be checked
// without rendering anything.

import {
  CAP_STEP_EFFECTIVE_400,
  CAP_STEP_RATED_525,
  FUSE_LINK_LABEL,
  INCOMING_ONLY_BREAKERS,
  INOUT_BREAKERS,
  LV_PANELS,
  MCCB_CATALOG,
  MCCB_WIDTH_MAP,
  METERING_DATABASE,
  MV_VOLTAGES,
  PF_DATABASE,
  SERIES_RANK,
  SMART_ELIGIBLE_RMUS,
  SWITCHFUSE_WIDTH,
  SWITCH_FUSE_LABEL,
  TR_BAND_RANK,
  type Brand,
  type Breaker,
  type Design,
  type EehcId,
  type LvConfigId,
  type LvModeId,
  type LvPanelId,
  type MeteringRow,
  type PfRow,
  type RmuId,
  type SmartTypeId,
  type TrBand,
  type TrConnId,
  type TrPresenceId,
  type TrTypeId,
} from "./data";

// ── State ────────────────────────────────────────────────────────────────────

/** Everything the seven steps collect. */
export interface Selection {
  // Step 1 — project data
  projectName: string;
  customer: string;
  qtnNo: string;
  revisionNo: string;
  optyNo: string;
  projectDate: string;
  supportEngineer: string;
  salesManager: string;
  salesPerson: string;
  // Steps 2-3 — MV panel
  rmu: RmuId | null;
  cfg: string | null;
  // Step 4 — smart provisions
  smartType: SmartTypeId | null;
  // Step 5 — transformer
  trPresence: TrPresenceId | null;
  trRating: number | null;
  trBrand: string | null;
  trType: TrTypeId | null;
  trConn: TrConnId | null;
  primaryV: string | null;
  secondaryV: string | null;
  // Step 6 — LV standard
  iec: EehcId | null;
  // Step 7 — LV breakers
  lvConfig: LvConfigId | null;
  lvMode: LvModeId;
  includePf: boolean;
  pfBrand: Brand;
  mainIncoming: string | null;
  mainIncomingBrand: Brand;
}

export interface CustomItem {
  id: string;
  label: string;
  widthMm: number;
  qty: number;
}

/** A line on the technical-offer bill of materials. */
export interface MccbItem {
  id: string;
  brand: string;
  model: string;
  amp: number | string;
  sc: string;
  trip: string;
  qty: number;
  isPf?: boolean;
  isMetering?: boolean;
  isMeteringAccessory?: boolean;
  isMainIncoming?: boolean;
  /** Accessories and capacitor banks take no breaker-panel width. */
  excludeFromSizing?: boolean;
}

export interface SwitchFuseItem {
  amp: number;
  qty: number;
}

/** The breaker quantities picked in Sizing mode, keyed by breaker id. */
export type Qtys = Record<string, number>;

export interface Workspace {
  sel: Selection;
  qtys: Qtys;
  customs: CustomItem[];
  mccbItems: MccbItem[];
  switchFuseItems: SwitchFuseItem[];
}

export function emptySelection(): Selection {
  return {
    projectName: "",
    customer: "",
    qtnNo: "",
    revisionNo: "",
    optyNo: "",
    projectDate: "",
    supportEngineer: "",
    salesManager: "",
    salesPerson: "",
    rmu: null,
    cfg: null,
    smartType: null,
    trPresence: null,
    trRating: null,
    trBrand: null,
    trType: null,
    trConn: null,
    primaryV: null,
    secondaryV: null,
    iec: null,
    lvConfig: null,
    lvMode: "sizing",
    includePf: false,
    pfBrand: "ABB",
    mainIncoming: null,
    mainIncomingBrand: "ABB",
  };
}

export function emptyQtys(): Qtys {
  const q: Qtys = {};
  for (const b of allBreakers()) q[b.id] = 0;
  return q;
}

/** Every breaker frame either configuration can use. */
export function allBreakers(): Breaker[] {
  return [...INCOMING_ONLY_BREAKERS, ...INOUT_BREAKERS.filter((b) => !INCOMING_ONLY_BREAKERS.some((x) => x.id === b.id))];
}

export function getActiveBreakers(sel: Selection): Breaker[] {
  return sel.lvConfig === "incoming" ? INCOMING_ONLY_BREAKERS : INOUT_BREAKERS;
}

// ── Widths ───────────────────────────────────────────────────────────────────

/** Panel width a catalogue line occupies, in mm. */
export function mccbWidthMm(model: string, amp: number | string): number {
  if (model === SWITCH_FUSE_LABEL) return SWITCHFUSE_WIDTH[Number(amp)] || 0;
  if (model === FUSE_LINK_LABEL) return 0;
  const m = model.match(/^(XT\d|HMW\d)/);
  return m ? MCCB_WIDTH_MAP[m[1]] || 0 : 0;
}

// The footprint and panel-fit maths live in ./sizing, which needs the derived
// bill of materials from ./bom.

// ── Transformer banding ──────────────────────────────────────────────────────

/** The minimum P-CSS size band a transformer rating forces. */
export function trBand(rating: number | null): TrBand | null {
  const r = Number(rating);
  if (!r) return null;
  if (r <= 500) return "500";
  if (r <= 1000) return "1000";
  return "1500";
}

/** PRAL enclosures are single-voltage; everything else offers the full MV range. */
export function allowedVoltages(sel: Selection): string[] {
  if (sel.rmu === "pral12") return ["12"];
  if (sel.rmu === "pral24") return ["24"];
  return MV_VOLTAGES;
}

/** Which side of the transformer is locked to 0.4 kV, and what the other side may be. */
export function voltageSides(sel: Selection): {
  primaryLocked: boolean;
  secondaryLocked: boolean;
  options: string[];
} {
  const options = allowedVoltages(sel);
  if (sel.trConn === "stepup") return { primaryLocked: true, secondaryLocked: options.length === 1, options };
  if (sel.trConn === "stepdown") return { primaryLocked: options.length === 1, secondaryLocked: true, options };
  return { primaryLocked: true, secondaryLocked: true, options: [] };
}

/** Usable width of a given panel, in mm. */
export function panelEmptyMm(lv: LvPanelId | null): number | null {
  const p = LV_PANELS.find((x) => x.id === lv);
  return p ? p.emptyMm : null;
}

// ── Blueprint compatibility ──────────────────────────────────────────────────

/** A design's series must be at least the band the transformer needs. */
export function meetsMinSeriesBand(sel: Selection, d: Design): boolean {
  const band = trBand(sel.trRating);
  if (!band) return true;
  const req = TR_BAND_RANK[band];
  const cap = SERIES_RANK[d.series];
  if (!req || !cap) return true;
  return cap >= req;
}

export function checkDesignCompatibility(sel: Selection, d: Design): boolean {
  if (!meetsMinSeriesBand(sel, d)) return false;
  if (sel.rmu === "pral24") return d.name === "P-CSS 16ST-V";
  if (sel.rmu === "murge" && sel.cfg === "2+1+M") return d.name === "P-CSS 16ST-V";
  if (sel.rmu === "lucy" && sel.cfg === "2+1+M") return d.name === "P-CSS 16ST-V";
  if (!sel.rmu || !sel.cfg) return false;

  const compat = d[sel.rmu];
  if (!compat || compat[sel.cfg] !== 1) return false;

  if (sel.rmu === "psec50") {
    if (sel.cfg === "2+1+M") return d.name === "P-CSS 16ST-V";
    if (d.name === "P-CSS 5ST-A") return false;
    return true;
  }
  if (sel.rmu === "psec375") {
    if (d.name === "P-CSS 5ST-A") return false;
    if (sel.cfg !== "2+1+M") return d.name === "P-CSS 16ST-V";
    return true;
  }
  if (sel.rmu === "murge" || sel.rmu === "lucy") {
    if (d.name === "P-CSS 5ST-A" || d.name === "P-CSS 16ST-U") return false;
    return true;
  }
  return true;
}

// ── EEHC metering ────────────────────────────────────────────────────────────

/** First metering band at or above the transformer rating. */
export function getMeteringForRating(rating: number | null): MeteringRow | null {
  const r = Number(rating);
  if (!r) return null;
  return METERING_DATABASE.find((m) => m.trRating >= r) ?? METERING_DATABASE[METERING_DATABASE.length - 1];
}

/** The breaker frame the metering table implies for the main incoming. */
export function recommendedMainIncomingId(rating: number | null): string | null {
  const m = getMeteringForRating(rating);
  if (!m) return null;
  const xt = m.model.match(/^XT(\d)/);
  if (xt) return "xt" + xt[1];
  if (m.model.includes("E2.2")) return "emax22";
  if (m.model.includes("E4.2")) return "emax42";
  if (m.model.includes("E6.2")) return "emax42"; // largest frame the standard list carries
  return "emax12";
}

/**
 * The catalogue line for a main-incoming frame.
 *
 * Follows the metering table: same model where the brand allows it, and the
 * same ampere rating. The original tool just took the first row of the frame,
 * which put an XT7 main incoming on the bill of materials at 800 A / XT7N when
 * the metering table called for 1000 A / XT7S right above it.
 */
export function mainIncomingCatalogRow(frameId: string, brand: Brand, rating: number | null) {
  const frameNum = frameId.replace(/^xt/, "");
  const rows = MCCB_CATALOG.filter((r) => r.brand === brand && r.model.startsWith("XT" + frameNum));
  if (!rows.length) return null;

  const m = getMeteringForRating(rating);
  if (!m) return rows[0];

  // Prefer the exact model the metering table names (only ABB is listed there).
  const sameModel = rows.filter((r) => r.model === m.model);
  const pool = sameModel.length ? sameModel : rows;
  return pool.find((r) => r.amp === m.amp) ?? pool.find((r) => r.amp >= m.amp) ?? pool[pool.length - 1];
}

// ── Power factor correction ──────────────────────────────────────────────────

export function getPfForRating(rating: number | null): PfRow | null {
  const r = Number(rating);
  if (!r) return null;
  return PF_DATABASE.find((p) => r >= p.min && r <= p.max) ?? null;
}

/** What the bank actually delivers on a 400 V system. */
export function pfEffectiveKvar(pf: PfRow): number {
  return Math.round(pf.steps * CAP_STEP_EFFECTIVE_400 * 10) / 10;
}

export function pfStepConfigLabel(pf: PfRow): string {
  return `${pf.steps} × ${CAP_STEP_RATED_525} kVAr@525V (${CAP_STEP_EFFECTIVE_400} kVAr@400V each)`;
}

// ── Catalogue cascade ────────────────────────────────────────────────────────

/**
 * Splits a combined trip string into its options, e.g.
 * "TMA / Ekip DIP LS/I" -> ["TMA", "Ekip DIP LS/I"]. A bare suffix inherits
 * the leading words of the first option.
 */
export function mccbSplitTrips(tripStr: string): string[] {
  const parts = tripStr.split(" / ").map((t) => t.trim());
  if (parts.length <= 1) return parts;
  const firstWords = parts[0].split(" ");
  const sharedPrefix = firstWords.slice(0, -1).join(" ");
  return parts.map((p, idx) => {
    if (idx === 0) return p;
    if (!p.includes(" ") && sharedPrefix) return sharedPrefix + " " + p;
    return p;
  });
}

export const mccbBrands = (): Brand[] => [...new Set(MCCB_CATALOG.map((r) => r.brand))];

export const mccbAmps = (brand: string): number[] =>
  [...new Set(MCCB_CATALOG.filter((r) => r.brand === brand).map((r) => r.amp))].sort((a, b) => a - b);

export const mccbScLevels = (brand: string, amp: number): string[] => [
  ...new Set(MCCB_CATALOG.filter((r) => r.brand === brand && r.amp === amp).map((r) => r.sc)),
];

export const mccbTrips = (brand: string, amp: number, sc: string): string[] => {
  const out = new Set<string>();
  for (const r of MCCB_CATALOG.filter((x) => x.brand === brand && x.amp === amp && x.sc === sc)) {
    for (const t of mccbSplitTrips(r.trip)) out.add(t);
  }
  return [...out];
};

export const mccbModels = (brand: string, amp: number, sc: string, trip: string): string[] => [
  ...new Set(
    MCCB_CATALOG.filter(
      (r) => r.brand === brand && r.amp === amp && r.sc === sc && mccbSplitTrips(r.trip).includes(trip),
    ).map((r) => r.model),
  ),
];

// ── Completeness ─────────────────────────────────────────────────────────────

export const PROJECT_REQUIRED_FIELDS: { key: keyof Selection; label: string }[] = [
  { key: "projectName", label: "Project name" },
  { key: "customer", label: "Customer" },
  { key: "qtnNo", label: "Quotation no." },
  { key: "revisionNo", label: "Revision no." },
  { key: "optyNo", label: "Opportunity no." },
  { key: "projectDate", label: "Date" },
  { key: "supportEngineer", label: "Sales support engineer" },
  { key: "salesPerson", label: "Sales person" },
];

export function missingProjectFields(sel: Selection): string[] {
  return PROJECT_REQUIRED_FIELDS.filter((f) => !sel[f.key]).map((f) => f.label);
}

export const isProjectDataComplete = (sel: Selection) => missingProjectFields(sel).length === 0;

export const isSmartEligible = (sel: Selection) => !!sel.rmu && SMART_ELIGIBLE_RMUS.includes(sel.rmu);

/** Everything except "are there actually any breakers in the panel" — see ./sizing. */
export function isSelectionComplete(sel: Selection): boolean {
  const smartOk = !isSmartEligible(sel) || !!sel.smartType;
  const projectOk = isProjectDataComplete(sel);

  if (sel.trPresence === "without") {
    return !!(projectOk && sel.rmu && sel.cfg && smartOk && sel.trRating && sel.iec && sel.lvConfig);
  }
  return !!(
    projectOk &&
    sel.rmu &&
    sel.cfg &&
    smartOk &&
    sel.trPresence === "with" &&
    sel.trBrand &&
    sel.trType &&
    sel.trConn &&
    sel.trRating &&
    sel.primaryV &&
    sel.secondaryV &&
    sel.iec &&
    sel.lvConfig
  );
}
