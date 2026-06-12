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
  tpl.forEach((g) => {
    g.items.forEach((it) => {
      // template "C.B (n)" placeholders become the chosen breakers
      const cbMatch = /^C\.B \((\d)\)$/.exec(it.desc.trim());
      if (cbMatch) {
        const idx = +cbMatch[1] - 1;
        const b = breakers[idx] ?? breakers[0];
        if (b) out.push({ qty: it.qty, desc: b.n, comp: b, groupLabel: g.group });
        return;
      }
      out.push({ qty: it.qty, desc: it.desc, comp: findByName(it.desc), groupLabel: g.group });
    });
  });
  return out;
}

// ── Photocell ────────────────────────────────────────────────────────────────
export const PHOTOCELL_RATINGS = COMBOS.photocell.ratings.map((r) => r.a);

export function buildPhotocell(ratingA: number, cb?: DbComponent): ComboLine[] {
  const row = COMBOS.photocell.ratings.find((r) => r.a === ratingA);
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

export function buildMcc(kind: string, kw: string, type: number, withControl: boolean): ComboLine[] {
  const row = COMBOS.mcc.combos.find((m) => m.kind === kind && m.kw === kw && m.type === type);
  if (!row) return [];
  const out: ComboLine[] = row.parts.map((p) => ({
    qty: 1,
    desc: p,
    comp: findByName(p),
    groupLabel: `${kind} ${kw} (Type ${type})`,
  }));
  if (withControl) {
    COMBOS.mcc.control.forEach((c) =>
      out.push({ qty: c.qty, desc: c.desc, comp: findByName(c.desc), groupLabel: "MCC control acc." })
    );
  }
  return out;
}

// ── PFC (Phase 1: 400 V, 25/50 kVAR steps only — RPT-03) ─────────────────────
export interface PfcInput {
  kvar: number;
  fixedSteps: number;
  fixedKvar: 25 | 50;
  var1Steps: number;
  var1Kvar: 25 | 50;
  var2Steps: number;
  var2Kvar: 25 | 50;
}
export const PFC_DEFAULT: PfcInput = {
  kvar: 600, fixedSteps: 1, fixedKvar: 25, var1Steps: 3, var1Kvar: 25, var2Steps: 10, var2Kvar: 50,
};

const CAP_25 = "25 KVAR";
const fuseFor = (k: 25 | 50) => (k === 25 ? "HRC 63A" : "HRC 125A");
const contactorFor = (k: 25 | 50) =>
  k === 25 ? "CONTACTOR FOR CAPACITOR- 30 KVAR 220-230V 50Hz" : "CONTACTOR FOR CAPACITOR- 50 KVAR  220-230V 50Hz";

export function pfcTotalKvar(i: PfcInput): number {
  return i.fixedSteps * i.fixedKvar + i.var1Steps * i.var1Kvar + i.var2Steps * i.var2Kvar;
}

/** Per the database sheet: capacitors are counted as 25 kVAR units (a 50 kVAR step = 2×25),
 *  3 fuses + 3 bases per step, one contactor per variable step, controller(s) by variable steps. */
export function buildPfc(i: PfcInput): ComboLine[] {
  const out: ComboLine[] = [];
  const block = (label: string, steps: number, kv: 25 | 50, withContactor: boolean) => {
    if (steps <= 0) return;
    const capUnits = steps * (kv === 50 ? 2 : 1);
    out.push({ qty: capUnits, desc: CAP_25, comp: findByName(CAP_25), groupLabel: label });
    out.push({ qty: steps * 3, desc: fuseFor(kv), comp: findByName(fuseFor(kv)), groupLabel: label });
    out.push({ qty: steps * 3, desc: "Fuse Base 160A", comp: findByName("Fuse Base 160A"), groupLabel: label });
    if (withContactor)
      out.push({ qty: steps, desc: contactorFor(kv), comp: findByName(contactorFor(kv)), groupLabel: label });
  };
  block("Fixed steps", i.fixedSteps, i.fixedKvar, false);
  block("Variable steps 1", i.var1Steps, i.var1Kvar, true);
  block("Variable steps 2", i.var2Steps, i.var2Kvar, true);

  const varSteps = i.var1Steps + i.var2Steps;
  const ctl: string[] = [];
  if (varSteps > 0 && varSteps <= 6) ctl.push("Power Factor Controller 6 step RVT-6");
  else if (varSteps <= 12) ctl.push("Power Factor Controller 12 step RVT-12");
  else ctl.push("Power Factor Controller 6 step RVT-6", "Power Factor Controller 12 step RVT-12");
  ctl.forEach((c) => out.push({ qty: 1, desc: c, comp: findByName(c), groupLabel: "Controller" }));
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
