// Circuit-combination generators (RPT-03). Each returns editable line items —
// "All auto-selected components are default recommendations only."

import { COMBOS, COMPONENTS, findByName, type DbComponent } from "./catalog";

export interface ComboLine {
  qty: number;
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

/** Detect the ATS frame key from a chosen breaker's family. */
export function frameOf(c: DbComponent): string | null {
  const f = (c.f || "").toUpperCase().replace(/\s/g, "");
  for (const fr of ATS_FRAMES) if (f === fr.toUpperCase() || f.startsWith(fr.toUpperCase())) return fr;
  // families like "E2.2N" → E2.2
  const m = /^E(\d)\.2/.exec(f);
  if (m) return `E${m[1]}.2`;
  const x = /^XT(\d)/.exec(f);
  if (x) return `XT${x[1]}`;
  return null;
}

/** Breakers eligible as ATS incomers (MCCB/ACB with a detectable frame). */
export function atsBreakerPool(): DbComponent[] {
  return COMPONENTS.filter((c) => (c.t === "MCCB" || c.t === "ACB") && frameOf(c));
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
      out.push({ qty: it.qty, desc: it.desc, comp: findByName(it.desc), groupLabel: atsGroup(g.group) });
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

export function buildMcc(kind: string, kw: string, type: number, withControl: boolean, qty = 1): ComboLine[] {
  const row = COMBOS.mcc.combos.find((m) => m.kind === kind && m.kw === kw && m.type === type);
  if (!row) return [];
  const n = Math.max(1, qty); // RPT-1: combination quantity multiplies every part
  const label = `${kind} ${kw} (Type ${type})${n > 1 ? ` ×${n}` : ""}`;
  const out: ComboLine[] = row.parts.map((p) => ({
    qty: n,
    desc: p,
    comp: findByName(p),
    groupLabel: label,
  }));
  if (withControl) {
    COMBOS.mcc.control.forEach((c) =>
      out.push({ qty: c.qty * n, desc: c.desc, comp: findByName(c.desc), groupLabel: label })
    );
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
  kvar: 600, cbRating: 0, fixedSteps: 1, fixedKvar: 25, var1Steps: 3, var1Kvar: 25, var2Steps: 10, var2Kvar: 50,
};

const CAP_25 = "25 KVAR";
const fuseFor = (k: 25 | 50) => (k === 25 ? "HRC 63A" : "HRC 125A");
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
