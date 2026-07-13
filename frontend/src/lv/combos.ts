// Circuit-combination generators (RPT-03). Each returns editable line items —
// "All auto-selected components are default recommendations only."

import { COMBOS, COMPONENTS, findByName, type DbComponent } from "./catalog";

export interface ComboLine {
  qty: number;
  baseQty?: number;      // per-unit qty (before the combination multiplier); defaults to qty
  desc: string;          // template description (display)
  comp?: DbComponent;    // resolved DB component (price/ref) when found
  groupLabel: string;    // e.g. "Source (1)"
}

// ── ATS ──────────────────────────────────────────────────────────────────────
export const ATS_TYPES = [
  { id: "1oo2", label: "1 Out of 2", incomers: 2, available: true },
  { id: "2oo3", label: "2 Out of 3", incomers: 3, available: true },
  { id: "2oo4", label: "2 Out of 4", incomers: 4, available: false }, // template data pending (Phase 3)
] as const;
export type AtsTypeId = (typeof ATS_TYPES)[number]["id"];

/** Frames that have an ATS template, in selector order. */
export const ATS_FRAMES = ["XT1", "XT2", "XT3", "XT4", "XT5", "XT6", "XT7", "E1.2", "E2.2", "E4.2", "E6.2"];

/** Detect the ATS frame key from a chosen breaker. On the flat Phase-01 database
 *  the family field is just the type word ("MCCB"/"ACB"), so the frame is read
 *  from the name — e.g. "MCCB XT1B 16A…" → XT1, "ACB E1.2B 800A…" → E1.2. */
export function frameOf(c: DbComponent): string | null {
  const hay = ` ${c.f || ""} ${c.n || ""} `.toUpperCase();
  const e = /\bE([1246])\.2/.exec(hay); // ACB E1.2 / E2.2 / E4.2 / E6.2
  if (e) return `E${e[1]}.2`;
  const x = /\bXT([1-7])/.exec(hay); // MCCB XT1 … XT7
  if (x) return `XT${x[1]}`;
  return null;
}

/** Breakers eligible as ATS incomers (MCCB/ACB with a detectable frame). */
export function atsBreakerPool(): DbComponent[] {
  return COMPONENTS.filter((c) => (c.t === "MCCB" || c.t === "ACB") && frameOf(c));
}

// ATS accessory aliases — the Combinations file names accessories verbosely while
// the Phase-01 component DB uses terser names, so findByName can't match them.
// Each verbose description maps to its exact component name (verified 2026-07).
const ATS_ACCESSORY_ALIAS: Record<string, string> = {
  "UVR - Under Voltage Release Uncabled 220-240Vac-220-250Vdc- XT1..XT4 F/P": "UVR-C XT1..XT4 F/P 220-240Vac-220-250Vdc",
  "MOD - Motor Operator with Direct Action 220...250V ac/dc- XT1-XT3": "MOD XT1-XT3 220...250V ac/dc",
  "MIR-H - Frame unit horizontal interlock- XT1..XT4": "MIR-HR XT1..XT4",
  "MIR-P - Mechanical Interlock plate for- XT1 Fixed": "MIR-P x XT1 F",
  "MOE - Stored energy motor operator 220…250Vac/dc- XT2-XT4 F/P/W*": "MOE XT2-XT4 220...250V ac/dc",
  "MIR-P - Mechanical Interlock plate- XT2 Fixed": "MIR-P x XT2 F",
  "MIR-P - Mechanical Interlock plate for- XT3 Fixed": "MIR-P x XT3 F",
  "Plate for mechanical interlock of XT4 F": "MIR-P x XT4 F",
  "YU (Under Voltage Release Uncabled) 220-240Vac -220-250Vdc-XT5-XT6 F/P": "YU-C XT5-XT6 F/P 220..240Vac-220..250Vdc",
  "MOE (Stored Energy Motor Operator) 220-250Vac/dc-XT5": "MOE XT5 220...250V AC/DC",
  "MIR-H XT5 Chassis for interlocking between XT4-XT5 & XT5-XT5": "MIR-H XT5 MECH,LOCK REAR HO. 2 C.BREAKER",
  "Plate for mechanical interlock of XT5 F with XT5 F": "MIR-P x XT5 F",
  "MOE (Stored Energy Motor Operator) 220-250Vac/dc-XT6": "MOE XT6 220...250V AC/DC",
  "MIR-H XT6 Chassis for interlocking between XT5-XT6 & XT6-XT6": "MIR-H XT6 MECH,LOCK REAR HO. 2 C.BREAKER",
  "YU (Under Voltage Release Uncabled) 220-240Vac/Vdc-XT7-XT7M-E1.2…E6.2": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC",
  "YC - Shunt Closing release Uncabled 220-240 Vac/dc- XT7-XT7M-E1.2..E6.2": "YC E1.2..E6.2-XT7M 220-240 VAC/DC",
  "AUX 4Q (Aux. Contact Uncabled) 400Vac-4 Op/Cls C/O-XT7-XT7M-E1.2 F/W": "AUX 4Q 400V E1.2-XT7-XT7M",
  "M (Spring Charging Motor Operator) 220-250 Vac/dc-XT7M": "M XT7M 220-250 V AC/DC",
  "Cables for mechanical interlock Type A horizontal- XT7-E1.2...E6.2 [Group 1]": "Cable interlock A - HR E1.2..E6.2-XT7/M",
  "Sup. fixed Type A E1.2-XT7/M floor mount": "Support fixed Type A E1.2-XT7/M floor mount",
  "M - Motor operator 220-250 Vac/dc- E1.2": "M  E1.2 220-250 VAC/DC",
  "M - Motor operator 220-250 Vac/dc- E2.2...E6.2": "M  E2.2...E6.2 220-250 VAC/DC",
  "Lever for mechanical interlock of fixed circuit-breaker or mobile part- E2.2 3P[Group 2]*": "Lever interlock E2.2",
  "Lever for mechanical interlock of fixed circuit-breaker or mobile part- E4.2 3P [Group 2]*": "Lever interlock E4.2",
};
const _atsAliasNorm: Record<string, string> = {};
for (const [k, v] of Object.entries(ATS_ACCESSORY_ALIAS)) _atsAliasNorm[k.replace(/\s+/g, " ").trim().toLowerCase()] = v;
/** Map a verbose ATS accessory description to its component name (unchanged if none). */
function atsAlias(desc: string): string {
  return _atsAliasNorm[desc.replace(/\s+/g, " ").trim().toLowerCase()] ?? desc;
}

/** Build the full ATS BOM for a frame: per-incomer accessories + interlock + control. */
export function buildAts(type: AtsTypeId, frame: string, breakers: DbComponent[]): ComboLine[] {
  const tpl = (COMBOS.ats as any)[type]?.[frame] as { group: string; items: { qty: number; desc: string }[] }[] | undefined;
  if (!tpl) return [];
  const out: ComboLine[] = [];
  // RPT-1: standardise ATS section headers → Source 1 / Source 2 / Interlock / Control CT.
  const atsGroup = (raw: string): string => {
    const m = raw.match(/source\s*\(?\s*(\d+)/i);
    if (m) return `Source ${m[1]}`;
    if (/interlock/i.test(raw)) return "Interlock";
    if (/control/i.test(raw)) return "Control CT";
    return raw;
  };
  tpl.forEach((g) => {
    g.items.forEach((it) => {
      // template "C.B (n)" placeholders become the chosen breakers
      const cbMatch = /^C\.B \((\d)\)$/.exec(it.desc.trim());
      if (cbMatch) {
        const idx = +cbMatch[1] - 1;
        const b = breakers[idx] ?? breakers[0];
        if (b) out.push({ qty: it.qty, desc: b.n, comp: b, groupLabel: atsGroup(g.group) });
        return;
      }
      out.push({ qty: it.qty, desc: it.desc, comp: findByName(atsAlias(it.desc)), groupLabel: atsGroup(g.group) });
    });
  });
  return out;
}

// ── Photocell ────────────────────────────────────────────────────────────────
export const PHOTOCELL_RATINGS = COMBOS.photocell.ratings.map((r) => r.a);

/** Breakers selectable as the photocell circuit breaker (any MCB / MCCB / ACB). */
export function breakerPool(): DbComponent[] {
  return COMPONENTS.filter((c) => c.t === "MCCB" || c.t === "MCB" || c.t === "ACB");
}
/** Ampere rating parsed from a breaker's rating/name, e.g. "…160A-36kA…" → 160. */
export function breakerAmps(c: DbComponent): number {
  const m = `${c.r || ""} ${c.n || ""}`.match(/(\d+)\s*A\b/i);
  return m ? parseInt(m[1], 10) : 0;
}

export function buildPhotocell(ratingA: number, cb?: DbComponent): ComboLine[] {
  // Size the contactor/aux to the rating: smallest ladder value >= rating (else largest).
  const rows = [...COMBOS.photocell.ratings].sort((a, b) => a.a - b.a);
  const row = rows.find((r) => r.a >= ratingA) ?? rows[rows.length - 1];
  const out: ComboLine[] = [];
  if (cb) out.push({ qty: 1, desc: cb.n, comp: cb, groupLabel: "Circuit Breaker" });
  if (row) {
    out.push({ qty: 1, desc: row.contactor, comp: findByName(row.contactor), groupLabel: "Contactor (auto)" });
    if (row.aux) out.push({ qty: 1, desc: row.aux, comp: findByName(row.aux), groupLabel: "Aux contact (auto)" });
  }
  COMBOS.photocell.fixed.forEach((f) =>
    out.push({ qty: f.qty, desc: f.desc, comp: findByName(f.desc), groupLabel: "Fixed components" })
  );
  return out;
}

// ── MCC ──────────────────────────────────────────────────────────────────────
export const MCC_KINDS = [...new Set(COMBOS.mcc.combos.map((m) => m.kind))];
export const mccKws = (kind: string) => [...new Set(COMBOS.mcc.combos.filter((m) => m.kind === kind).map((m) => m.kw))];
export const mccTypes = (kind: string, kw: string) =>
  [...new Set(COMBOS.mcc.combos.filter((m) => m.kind === kind && m.kw === kw).map((m) => m.type))].sort();

// Some MCC template descriptions don't match the component-DB names verbatim
// (verbose contactor names, "Signal" vs "Signaling", the CAL side block). Map them
// for the price lookup ONLY — the clean template text stays as the display name.
const MCC_ALIAS: Record<string, string> = {
  "SK1-11 Signal contact": "SK1-11 Signaling Contact",
  "CAL4-11 (1 N.O+1 N.C) - Side": "CAL4-11 Auxiliary Contact Block - Side (AF09..96)",
};
/** Resolve an MCC part description to a DB-matchable name (price lookup only). */
export function mccAlias(desc: string): string {
  const d = desc.trim();
  if (MCC_ALIAS[d]) return MCC_ALIAS[d];
  // "Contactor# AF09-30-10-13" → "AF09-30-10-13" (the DB contactor name contains the code).
  const m = /^contactor#\s*(.+)$/i.exec(d);
  if (m) return m[1].trim();
  return d;
}

export function buildMcc(kind: string, kw: string, type: number, withControl: boolean, qty = 1): ComboLine[] {
  const row = COMBOS.mcc.combos.find((m) => m.kind === kind && m.kw === kw && m.type === type);
  if (!row) return [];
  const n = Math.max(1, qty); // RPT-1: combination quantity multiplies every part
  // The multiplier lives in the combination qty (qty ÷ baseQty), NOT in the label —
  // so the header ×N, the "Combination qty" field, and item qtys stay in sync.
  const label = `${kind} ${kw} (Type ${type})`;
  // One side-mounted auxiliary contact block (CAL…) is fitted per contactor, so its
  // quantity follows the contactor count — e.g. Star-Delta has 3 contactors → 3 blocks.
  const contactors = row.parts.filter((p) => /^contactor#/i.test(p.trim())).length;
  const perUnit = (p: string) => (/^CAL\d/i.test(p.trim()) && contactors > 0 ? contactors : 1);
  const out: ComboLine[] = row.parts.map((p) => ({
    qty: n * perUnit(p),
    baseQty: perUnit(p), // per-unit qty → combination qty = n
    desc: p,
    comp: findByName(mccAlias(p)),
    groupLabel: label,
  }));
  if (withControl) {
    const isStarDelta = /star\s*delta/i.test(kind);
    const SD_TIMER = "CT-ERC.12 Time relay, ON-delay 1c/o, 24-48VDC/24-240VAC";
    COMBOS.mcc.control.forEach((c) => {
      out.push({ qty: c.qty * n, baseQty: c.qty, desc: c.desc, comp: findByName(mccAlias(c.desc)), groupLabel: label });
      // Star-Delta needs an ON-delay timer for the Y→Δ transition — placed right after
      // the 3-position selector (between the selector and Relay 14).
      if (isStarDelta && /selector 3 position/i.test(c.desc)) {
        out.push({ qty: n, baseQty: 1, desc: SD_TIMER, comp: findByName(mccAlias(SD_TIMER)), groupLabel: label });
      }
    });
  }
  return out;
}

// ── PFC (Phase 1: 400 V, 25/50 kVAR steps only — RPT-03) ─────────────────────
export interface PfcInput {
  kvar: number;
  cbRating: number; // RPT-1: main P.F.C. circuit-breaker rating (A) — mandatory
  fixedSteps: number;
  fixedKvar: 25 | 50;
  var1Steps: number;
  var1Kvar: 25 | 50;
  var2Steps: number;
  var2Kvar: 25 | 50;
}
export const PFC_DEFAULT: PfcInput = {
  kvar: 300, cbRating: 0, fixedSteps: 1, fixedKvar: 50, var1Steps: 5, var1Kvar: 50, var2Steps: 0, var2Kvar: 50,
};

const CAP_25 = "25 KVAR";
const fuseFor = (k: 25 | 50) => (k === 25 ? "HRC Fuse 63A" : "HRC Fuse 125A");
const contactorFor = (k: 25 | 50) =>
  k === 25 ? "CONTACTOR FOR CAPACITOR- 30 KVAR 220-230V 50Hz" : "CONTACTOR FOR CAPACITOR- 50 KVAR  220-230V 50Hz";

export function pfcTotalKvar(i: PfcInput): number {
  return i.fixedSteps * i.fixedKvar + i.var1Steps * i.var1Kvar + i.var2Steps * i.var2Kvar;
}

/** RPT-1: dynamic P.F.C. header, e.g.
 *  "P.F.C. [(4 × 25) KVAR Fixed + (4 × 50) + (2 × 100) KVAR Variable] = 500 KVAR".
 *  Any section with zero/blank steps or kVAR is omitted; if no variable steps are
 *  used the whole Variable section is dropped. */
export function pfcHeader(i: PfcInput): string {
  const fixed = i.fixedSteps > 0 && i.fixedKvar > 0 ? `(${i.fixedSteps} × ${i.fixedKvar}) KVAR Fixed` : "";
  const v1 = i.var1Steps > 0 && i.var1Kvar > 0 ? `(${i.var1Steps} × ${i.var1Kvar})` : "";
  const v2 = i.var2Steps > 0 && i.var2Kvar > 0 ? `(${i.var2Steps} × ${i.var2Kvar})` : "";
  const varInner = [v1, v2].filter(Boolean).join(" + ");
  const variable = varInner ? `${varInner} KVAR Variable` : "";
  const inner = [fixed, variable].filter(Boolean).join(" + ");
  return `P.F.C. [${inner}] = ${pfcTotalKvar(i)} KVAR`;
}

/** Per the database sheet: capacitors are counted as 25 kVAR units (a 50 kVAR step = 2×25),
 *  3 fuses + 3 bases per step, one contactor per variable step, controller(s) by variable steps. */
export function buildPfc(i: PfcInput, cb?: DbComponent): ComboLine[] {
  const out: ComboLine[] = [];
  // RPT-1: every P.F.C. line is grouped under the generated header.
  const header = pfcHeader(i);
  // RPT-1: mandatory main P.F.C. circuit breaker — the chosen catalogue breaker
  // (with its price/ref) when selected, else a generic line from the entered rating.
  if (cb) {
    out.push({ qty: 1, desc: cb.n, comp: cb, groupLabel: header });
  } else if (i.cbRating > 0) {
    const cbName = `P.F.C. Circuit Breaker ${i.cbRating}A`;
    out.push({ qty: 1, desc: cbName, comp: findByName(cbName), groupLabel: header });
  }
  const block = (steps: number, kv: 25 | 50, withContactor: boolean) => {
    if (steps <= 0) return;
    const capUnits = steps * (kv === 50 ? 2 : 1);
    out.push({ qty: capUnits, desc: CAP_25, comp: findByName(CAP_25), groupLabel: header });
    out.push({ qty: steps * 3, desc: fuseFor(kv), comp: findByName(fuseFor(kv)), groupLabel: header });
    out.push({ qty: steps * 3, desc: "Fuse Base 160A", comp: findByName("Fuse Base 160A"), groupLabel: header });
    if (withContactor)
      out.push({ qty: steps, desc: contactorFor(kv), comp: findByName(contactorFor(kv)), groupLabel: header });
  };
  block(i.fixedSteps, i.fixedKvar, false);
  block(i.var1Steps, i.var1Kvar, true);
  block(i.var2Steps, i.var2Kvar, true);

  const varSteps = i.var1Steps + i.var2Steps;
  const ctl: string[] = [];
  if (varSteps > 0 && varSteps <= 6) ctl.push("Power Factor Controller 6 step RVT-6");
  else if (varSteps <= 12) ctl.push("Power Factor Controller 12 step RVT-12");
  else if (varSteps > 12) ctl.push("Power Factor Controller 6 step RVT-6", "Power Factor Controller 12 step RVT-12");
  ctl.forEach((c) => out.push({ qty: 1, desc: c, comp: findByName(c), groupLabel: header }));
  // P.F.C. cubicle ventilation — always add 1 fan + 2 filters + 1 thermostat by default.
  for (const [qty, name] of [[1, "Fan 25*25"], [2, "Filter 25*25"], [1, "Thermostat"]] as const)
    out.push({ qty, desc: name, comp: findByName(name), groupLabel: header });
  return out;
}

// ── WD (withdrawable kits) ───────────────────────────────────────────────────
export const WD_OPTIONS = COMBOS.wd.map((w) => ({
  key: `${w.frame}-${w.poles}`,
  label: `${w.frame} · ${w.poles === "3P-Air" ? "Air 3P" : w.poles}`,
  ...w,
}));

export function buildWd(key: string): ComboLine[] {
  const w = WD_OPTIONS.find((o) => o.key === key);
  if (!w) return [];
  const out: ComboLine[] = [];
  if (w.fp) out.push({ qty: 1, desc: w.fp, comp: findByName(w.fp), groupLabel: `WD ${w.frame} fixed part` });
  if (w.mp) out.push({ qty: 1, desc: w.mp, comp: findByName(w.mp), groupLabel: `WD ${w.frame} moving part` });
  return out;
}

// ── Indication Lamps ─────────────────────────────────────────────────────────
// Fixed three-lamp signalling set: Red / Green / Yellow pilot lights (LED 230 V AC).
export const INDICATION_LAMPS: { qty: number; desc: string }[] = [
  { qty: 1, desc: "Pilot Light Red LED 230V AC" },
  { qty: 1, desc: "Pilot Light Green LED 230V AC" },
  { qty: 1, desc: "Pilot Light Yellow LED 230V AC" },
];

export function buildIndicationLamps(): ComboLine[] {
  return INDICATION_LAMPS.map((l) => ({
    qty: l.qty,
    desc: l.desc,
    comp: findByName(l.desc),
    groupLabel: "Indication Lamps",
  }));
}
