// QTN data layer for the LV section. Each QTN is a quotation workspace (Project /
// Pricing / Panels / Technical / Commercial / Material). Storage is the backend
// (per signed-in user) via /api/qtns — the functions below are async wrappers
// that also apply forward-compatible state normalization + the client-computed
// summary the server stores alongside the JSON state.
import { api, type QtnSummaryInput, type QtnStatus, type QtnRecordDto } from "../api";
import {
  initialState,
  newSparePanel,
  grandTotals,
  meteringBeforeOutgoings,
  DEFAULT_GENERAL_NOTES,
  DEFAULT_COMMERCIAL_TERMS,
  DEFAULT_COMMERCIAL_TERMS_AR,
  type LvState,
} from "./store";
import { DEFAULT_FACTORS, findCellEnclosure } from "./catalog";

export interface QtnRecord {
  id: string;
  number: string; // e.g. "QTN-26-0001"
  createdAt: string;
  updatedAt: string;
  submitted: boolean;
  /** Approval state. The server computes it — never derive it on the client. */
  status: QtnStatus;
  /** True while the content is frozen (waiting / approved / submitted). */
  locked: boolean;
  approverEmail: string;
  approvedAt: string | null;
  returnReason: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  /** Co-Work: everyone sharing this quotation with the owner (any number). */
  coOwners: { id: string; email: string; name: string }[];
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
  /** Project-tab Revision No. (0 = original) — drives the "-N" suffix in History. */
  revisionNo?: number;
  submitted?: boolean;
  status: QtnStatus;
  locked: boolean;
  ownerEmail: string;
  ownerName: string;
  coOwners?: { id: string; email: string; name: string }[];
  approverEmail: string;
  /** Set only on hidden quotations — they appear only when the owner asks to see them. */
  removedAt?: string | null;
  removedBy?: string;
}

/** Client-computed summary stored next to the JSON state (so listing/stats need
 *  no pricing logic on the server). */
function summaryOf(state: LvState): QtnSummaryInput {
  // One malformed panel is enough to turn the pricing chain into NaN, which
  // JSON.stringify writes as null — and the server rejects the whole request
  // ("Expected number, received null"). Since the save is fire-and-forget, that
  // silently stops every autosave and the estimator loses work with no warning.
  // The summary is only a listing convenience, so never let it fail the save.
  const total = grandTotals(state).incl;
  return {
    projectName: state.project.name,
    customer: state.project.customer,
    panelsCount: state.panels.length,
    totalEgp: Number.isFinite(total) ? total : 0,
    // Denormalized so the History list can show the revision suffix without the state.
    revisionNo: parseInt(String(state.project.revisionNo ?? "").replace(/\D/g, ""), 10) || 0,
  };
}

/** Forward-compatible defaults for a state loaded from the server. */
function normalize(state: LvState): LvState {
  // STRUCTURAL DEFAULTS FIRST. The server is deliberately lenient — it stores
  // `state ?? {}` and hands back `{}` for a row it cannot parse — so any of these
  // can be missing, and each one is dereferenced further down (state.panels
  // .forEach, state.project.name in summaryOf, state.factors.vat while pricing).
  // A missing key used to throw during load and the quotation opened as a blank
  // white page, which looks exactly like the work has been lost.
  const base = initialState();
  state.project ??= base.project;
  state.factors ??= base.factors;
  if (!Array.isArray(state.panels)) state.panels = [];

  // Merge in any factor key added since this QTN was saved. Without this a new
  // key is `undefined` on every server-loaded quotation and turns the whole
  // calculation chain into NaN — critical now that factors can change centrally.
  // Existing values always win, so a quotation keeps the rates it was made with.
  state.factors = { ...DEFAULT_FACTORS, ...state.factors };
  state.notesGeneral ??= [...DEFAULT_GENERAL_NOTES];
  state.notesAdditional ??= [];
  state.abbItemDiscounts ??= {};
  state.summaryNotes ??= [];
  state.recordResults ??= "";
  // Safety factor is now a % markup (selling × (1 + safetyFactor)); default 0 (no change).
  // The old default was 1 (a ÷ divisor) — reset it to 0 so it doesn't double the price.
  if (state.factors.safetyFactor == null || state.factors.safetyFactor === 1) state.factors.safetyFactor = 0;
  // QTN kind: legacy QTNs (no kind) are panel quotations. "spare" and "edms" are
  // the explicit kinds and must survive the round-trip — anything else normalises
  // to "panels". Adding a kind means listing it here, or it is silently downgraded
  // on the next load and every check against it stops matching.
  if (state.kind !== "spare" && state.kind !== "edms") state.kind = "panels";
  // Technical-Offer divider pages: default to none, and drop any whose panel is gone.
  state.offerSeparators = (Array.isArray(state.offerSeparators) ? state.offerSeparators : [])
    .filter((sep) => Array.isArray(state.panels) && state.panels.some((p) => p.id === sep.beforePanelId));
  if (!Array.isArray(state.commercialTerms))
    state.commercialTerms = DEFAULT_COMMERCIAL_TERMS.map((x) => ({ ...x }));
  if (!Array.isArray(state.commercialTermsAr))
    state.commercialTermsAr = DEFAULT_COMMERCIAL_TERMS_AR.map((x) => ({ ...x }));
  state.panels.forEach((p) => {
    // Freeze cell prices onto quotations saved before rows carried them, using
    // today's catalogue — exactly the value the old live lookup was producing —
    // so the quotation total stays identical while becoming immune to later edits.
    if (p.cellConfig && Array.isArray(p.cellConfig.rows)) {
      for (const r of p.cellConfig.rows) {
        if (r.eur == null && r.egp == null) {
          const e = findCellEnclosure(p.cellConfig.type, r.desc);
          if (e) {
            r.eur = e.eur;
            r.egp = e.egp;
          }
        }
      }
    }
    p.code ??= "";
    p.shortCircuit ??= "";
    p.busbarPoles ??= 3;
    // Pillars busbar = 3P + N (100%) + E (25%) = 4.25 bar-equivalents. 3 is only the
    // legacy default and is never a valid pillar value, so lift old pillar panels to 4.25.
    if (p.panelsSizing?.family === "Pillars" && p.busbarPoles === 3) p.busbarPoles = 4.25;
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
    // Indication Lamps, Push Buttons, Photocell and WD kit are flat items — drop their groups so
    // they show no header. Named labels below are Lamps/Push Buttons/Photocell; WD kit uses dynamic
    // "WD <frame> fixed/moving part" labels (regex). MCC keeps "… (Type N)", ATS keeps
    // "Source (1)" etc.
    if (Array.isArray(p.components)) {
      const FLAT_GROUPS = new Set([
        "Indication Lamps", "Push Buttons",
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

const toRecord = (r: QtnRecordDto): QtnRecord => ({
  id: r.id,
  number: r.number,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  submitted: r.submitted,
  // Old servers mid-rollout won't send these; fall back to the legacy flag so the
  // page still renders rather than showing an undefined status.
  status: r.status ?? (r.submitted ? "SUBMITTED" : "DRAFT"),
  locked: r.locked ?? Boolean(r.submitted),
  approverEmail: r.approverEmail ?? "",
  approvedAt: r.approvedAt ?? null,
  returnReason: r.returnReason ?? "",
  ownerId: r.ownerId ?? "",
  ownerEmail: r.ownerEmail ?? "",
  ownerName: r.ownerName ?? "",
  coOwners: r.coOwners ?? [],
  state: normalize(r.state as LvState),
});

/** My quotations — every status, including drafts. */
export async function listQtns(): Promise<QtnListItem[]> {
  return api.qtns.list();
}

/** Every non-draft quotation across all users (LV Offers History).
 *  `includeRemoved` also brings back the hidden ones — the server only honours it
 *  for access.manage, so asking for them is never enough to see them.
 *  `includeDrafts` adds work still in progress, which History leaves out by default. */
export async function listAllQtns(
  opts: { includeRemoved?: boolean; includeDrafts?: boolean } = {},
): Promise<QtnListItem[]> {
  return api.qtns.listAll(opts);
}

/** Put a hidden quotation back on the lists. Owner only. */
export async function restoreQtn(id: string): Promise<void> {
  await api.qtns.restore(id);
}

/** Quotations waiting for approval — only for users who may approve. */
export async function listApprovalQueue(): Promise<QtnListItem[]> {
  return api.qtns.queue();
}

/** Move a quotation through the workflow. Throws with the server's message so the
 *  caller can show WHY a transition was refused instead of failing silently. */
export async function transitionQtn(id: string, to: QtnStatus, note?: string) {
  return api.qtns.transition(id, to, note);
}

export async function qtnEvents(id: string) {
  return api.qtns.events(id);
}

/** Users a quotation can be handed over to (excludes the current user). */
export async function listAssignees() {
  return (await api.qtns.assignees()).users;
}

/** Hand a quotation to another user (transfer ownership). Throws the server's message. */
export async function reassignQtn(id: string, toUserId: string, note?: string) {
  return api.qtns.reassign(id, toUserId, note);
}

/** Co-Work: replace who shares this quotation with its owner (empty list ends
 *  co-work). Throws the server's message. */
export async function setCoWorkers(id: string, coOwnerIds: string[], note?: string) {
  return api.qtns.cowork(id, coOwnerIds, note);
}

export async function getQtn(id: string): Promise<QtnRecord | null> {
  try {
    return toRecord(await api.qtns.get(id));
  } catch {
    return null;
  }
}

export async function createQtn(
  number: string,
  kind: "panels" | "edms" | "spare" = "panels"
): Promise<QtnRecord> {
  const state = initialState();
  state.kind = kind;
  if (kind === "edms") {
    // Standard EDMS quotes to a fixed house standard. Seeding the Specs tab (rather
    // than a panel) is what makes it stick: every panel added later is created
    // through withProjectSpecs, so it starts on these values.
    state.projectSpecs = { ...state.projectSpecs, copperType: "Raychem", ambTemp: "40°C" };
    // …and to its own selling factor (cost ÷ factor = price), not the global 0.7.
    // It is a starting value, not a lock — Pricing Settings still edits it.
    state.factors = { ...state.factors, factor: 0.6 };
  }
  if (kind === "spare") {
    // A spare-parts QTN opens with its single "Spare parts" cell, selected.
    const sp = newSparePanel();
    state.panels = [sp];
    state.selectedId = sp.id;
  }
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

export async function unsubmitQtn(id: string): Promise<void> {
  await api.qtns.unsubmit(id);
}

// ── Amendments / revisions ───────────────────────────────────────────────────
// A revision is a trailing "-<n>" appended after the QTN's 5-digit serial, e.g.
// "QTN-26-01010-2" → base "QTN-26-01010", rev 2. A plain number is revision 0.
export function parseRevision(number: string): { base: string; rev: number } {
  const m = (number || "").trim().match(/^(.*\d{3,})-(\d{1,3})$/);
  return m ? { base: m[1], rev: parseInt(m[2], 10) } : { base: (number || "").trim(), rev: 0 };
}

/** The QTN numbers superseded (cancelled) by a higher revision of the same base. */
export function supersededNumbers(numbers: string[]): Set<string> {
  const maxRev = new Map<string, number>();
  const parsed = numbers.map((n) => ({ n, ...parseRevision(n) }));
  for (const p of parsed) maxRev.set(p.base, Math.max(maxRev.get(p.base) ?? 0, p.rev));
  const out = new Set<string>();
  for (const p of parsed) if (p.rev < (maxRev.get(p.base) ?? 0)) out.add(p.n);
  return out;
}

/** Amend a QTN: create the next revision (a copy renamed to "…-N+1") and return it.
 *  The source is thereby superseded — a higher revision now exists. */
export async function amendQtn(id: string, sourceNumber: string): Promise<QtnRecord | null> {
  const { base } = parseRevision(sourceNumber);
  let maxRev = parseRevision(sourceNumber).rev;
  try {
    const list = await listQtns();
    for (const q of list) { const p = parseRevision(q.number); if (p.base === base) maxRev = Math.max(maxRev, p.rev); }
  } catch { /* fall back to the source's own revision */ }
  const target = `${base}-${maxRev + 1}`;
  const copy = await duplicateQtn(id);
  if (!copy) return null;
  const res = await renameQtn(copy.id, target);
  return res.ok ? { ...copy, number: target } : copy;
}
