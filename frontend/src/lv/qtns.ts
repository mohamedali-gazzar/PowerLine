// QTN data layer for the LV section. Each QTN is a quotation workspace (Project /
// Pricing / Panels / Technical / Commercial / Material). Storage is the backend
// (per signed-in user) via /api/qtns — the functions below are async wrappers
// that also apply forward-compatible state normalization + the client-computed
// summary the server stores alongside the JSON state.
import { api, type QtnSummaryInput } from "../api";
import {
  initialState,
  grandTotals,
  meteringBeforeOutgoings,
  DEFAULT_GENERAL_NOTES,
  DEFAULT_COMMERCIAL_TERMS,
  DEFAULT_COMMERCIAL_TERMS_AR,
  type LvState,
} from "./store";

export interface QtnRecord {
  id: string;
  number: string; // e.g. "QTN-26-0001"
  createdAt: string;
  updatedAt: string;
  submitted: boolean;
  state: LvState;
}

export interface QtnListItem {
  id: string;
  number: string;
  updatedAt: string;
  projectName: string;
  customer: string;
  panels: number;
  totalEgp: number;
  submitted?: boolean;
}

/** Client-computed summary stored next to the JSON state (so listing/stats need
 *  no pricing logic on the server). */
function summaryOf(state: LvState): QtnSummaryInput {
  return {
    projectName: state.project.name,
    customer: state.project.customer,
    panelsCount: state.panels.length,
    totalEgp: grandTotals(state).incl,
  };
}

/** Forward-compatible defaults for a state loaded from the server. */
function normalize(state: LvState): LvState {
  state.notesGeneral ??= [...DEFAULT_GENERAL_NOTES];
  state.notesAdditional ??= [];
  state.abbItemDiscounts ??= {};
  if (!Array.isArray(state.commercialTerms))
    state.commercialTerms = DEFAULT_COMMERCIAL_TERMS.map((x) => ({ ...x }));
  if (!Array.isArray(state.commercialTermsAr))
    state.commercialTermsAr = DEFAULT_COMMERCIAL_TERMS_AR.map((x) => ({ ...x }));
  state.panels.forEach((p) => {
    p.code ??= "";
    p.shortCircuit ??= "";
    p.busbarPoles ??= 3;
    p.sellFactor ??= 0;
    if (Array.isArray(p.sections)) p.sections = meteringBeforeOutgoings(p.sections);
    // "Other" is no longer a default section — drop it from existing panels when empty.
    if (Array.isArray(p.sections) && p.sections.includes("Other") &&
        !p.components?.some((c) => c.section === "Other")) {
      p.sections = p.sections.filter((s) => s !== "Other");
      if (p.activeSection === "Other") p.activeSection = p.sections[0] ?? "Main Incoming";
    }
    // P.F.C is its own section beside Outgoings (a dedicated cap-bank cubicle) — not a group.
    // Un-fold any P.F.C that was stored as a GROUP inside another section back into a flat
    // standalone section, and make sure every P.F.C section a component references exists in
    // the list, inserted right after Outgoings. Existing P.F.C sections keep their position.
    if (Array.isArray(p.sections) && Array.isArray(p.components)) {
      const isPfc = (s?: string): boolean => !!s && /^p\.?f\.?c/i.test(s.replace(/\s+/g, ""));
      p.components.forEach((c) => {
        if (isPfc(c.group)) { c.section = c.group as string; c.group = undefined; }
      });
      const missing = Array.from(new Set(
        p.components.filter((c) => isPfc(c.section) && !p.sections.includes(c.section)).map((c) => c.section)
      ));
      if (missing.length) {
        const oi = p.sections.indexOf("Outgoings");
        p.sections = oi >= 0
          ? [...p.sections.slice(0, oi + 1), ...missing, ...p.sections.slice(oi + 1)]
          : [...p.sections, ...missing];
      }
    }
    // Indication Lamps, Photocell and WD kit are flat items — drop their groups so they show
    // no header. Named labels below are Lamps/Photocell; WD kit uses dynamic
    // "WD <frame> fixed/moving part" labels (regex). MCC keeps "… (Type N)", ATS keeps
    // "Source (1)" etc.
    if (Array.isArray(p.components)) {
      const FLAT_GROUPS = new Set([
        "Indication Lamps",
        "Circuit Breaker", "Contactor (auto)", "Aux contact (auto)", "Fixed components",
      ]);
      const isWdGroup = (s: string) => /^WD .+ (fixed|moving) part$/i.test(s);
      p.components.forEach((c) => { if (c.group && (FLAT_GROUPS.has(c.group) || isWdGroup(c.group))) c.group = undefined; });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p.panelItems = ((p as any).panelItems ?? []).map((it: any, i: number) => ({
      ...it,
      qty: 1,
      slot: it.slot ?? (i === 0 ? 1 : 2),
    }));
  });
  return state;
}

const toRecord = (r: {
  id: string;
  number: string;
  createdAt: string;
  updatedAt: string;
  submitted: boolean;
  state: unknown;
}): QtnRecord => ({
  id: r.id,
  number: r.number,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  submitted: r.submitted,
  state: normalize(r.state as LvState),
});

export async function listQtns(): Promise<QtnListItem[]> {
  return api.qtns.list();
}

export async function getQtn(id: string): Promise<QtnRecord | null> {
  try {
    return toRecord(await api.qtns.get(id));
  } catch {
    return null;
  }
}

export async function createQtn(number: string): Promise<QtnRecord> {
  const state = initialState();
  return toRecord(await api.qtns.create(number.trim(), state, summaryOf(state)));
}

export async function saveQtn(id: string, state: LvState): Promise<void> {
  await api.qtns.update(id, state, summaryOf(state));
}

export async function renameQtn(
  id: string,
  number: string
): Promise<{ ok: boolean; error?: string }> {
  if (!number.trim()) return { ok: false, error: "QTN number can't be empty." };
  try {
    return await api.qtns.rename(id, number);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteQtn(id: string): Promise<void> {
  await api.qtns.remove(id);
}

export async function duplicateQtn(id: string): Promise<QtnRecord | null> {
  try {
    return toRecord(await api.qtns.duplicate(id));
  } catch {
    return null;
  }
}

export async function nextQtnNumber(): Promise<string> {
  try {
    return (await api.qtns.nextNumber()).suggestion;
  } catch {
    return "";
  }
}

export async function submitQtn(id: string): Promise<void> {
  await api.qtns.submit(id);
}
