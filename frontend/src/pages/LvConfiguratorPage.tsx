import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getQtn, saveQtn, renameQtn, transitionQtn, reassignQtn, setCoWorkers, listQtns, supersededNumbers, type QtnRecord } from "../lv/qtns";
import ReassignQtnModal from "../components/ReassignQtnModal";
import CoWorkModal from "../components/CoWorkModal";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { useStaff, SALES_MANAGER } from "../staff";
import PanelsBulkImport, { type ImportedPanel } from "../components/PanelsBulkImport";
import {
  AMB_TEMPS, NEUTRAL_EARTH, COPPER_TYPES, INCOMING_CABLES, OUTGOING_CABLES, FORMS,
  PANEL_SYSTEMS, CELL_SYSTEMS, PANELS_MAX_INCOMER_A, DOUBLE_FAMILIES,
  COMPONENTS, ENCLOSURES, componentPriceEgp, enclosurePriceEgp, fmtEgp,
  findByName, externalNeutralCT, copperTypeFactor,
  type DbComponent, type DbEnclosure,
} from "../lv/catalog";
import {
  newPanel, newSparePanel, duplicatePanel, nextDuplicateName, uniquePanelName, panelNameOwner, panelNameClashMessage, blankSpareNames, blankSpareMessage, DEFAULT_SECTIONS, FIXED_SECTIONS, toPanelComponent, freeComponent, uid,
  lcpGroupComponents, LCP_GROUP_PARTS, KWHM_CONTENTS, kwhmAutoSize, kwhmBuilds, kwhmContentCfg, SPARE_KIND_ICONS, lcpAutoSize, lcpBuilds, LCP_MAX_ROWS, lcpBoxOf, lcpBox2Of, lcpEnclosureDbPrice, lcpSizes, lcpRealBox,
  lcpNamedBoxes, lcpEnclByRef, lcpEnclosureEgp, parseEnclDims,
  spacerComponent, isSpacer, DEFAULT_COMMERCIAL_TERMS, DEFAULT_COMMERCIAL_TERMS_AR,
  initialState, calcPanel, grandTotals, buildMaterialList, searchComponents, mainBusbarAuto, mainBusbarAutoRaw, busbarAreaMm2, panelHeightMm, buswayCopperMult, BUSWAY_COPPER_FACTOR, abbKey, itemPriceEgp, exportBlockers, repriceToCatalog,
  withProjectSpecs, YES_NO, defaultSpecs, STD_TR_KVA_EDMS, STD_TR_KVA_DEFAULT, STD_OUTGOINGS,
  type LvState, type LvPanel, type PanelComponent, type MatRow, type PanelCalc, type PanelTypeItem, type TermsSection, type ExportCheck, type SummaryNote,
  type SpecNote, type SpecSubNote, type ProjectSpecKey,
} from "../lv/store";
import {
  ATS_TYPES, atsBreakerPool, frameOf, buildAts,
  buildSync, type SyncUnit,
  breakerPool, breakerAmps, buildPhotocell,
  MCC_KINDS, mccKws, mccTypes, buildMcc,
  PFC_DEFAULT, pfcTotalKvar, pfcHeader, buildPfc,
  WD_OPTIONS, buildWd, wdKeyFor, WD_ACCESSORIES, wdAccessoryName,
  MOTORIZED_FRAMES, buildMotorized, motorizedFrameKey,
  buildIndicationLamps, buildPushButtons, buildFire,
  type ComboLine, type AtsTypeId,
} from "../lv/combos";
import { rankSearchOptions } from "../lv/search";
import { materialAoa, type MatBlock } from "../lv/materialExcel";
import { buildErpItemsCsv, erpItemCount } from "../lv/erpCsv";
import {
  getToken, api, MAX_ATTACHMENT_BYTES, QTN_STATUS_LABEL, QTN_STATUS_STYLE,
  type CatalogChanges, type CatalogChangeItem, type QtnAttachmentDto, type QtnStatus,
} from "../api";
import { checkCatalogUpdates, catalogVersion } from "../lv/catalogSource";
import ReturnForRevisionModal, { type ReturnComment } from "../components/ReturnForRevisionModal";
import EdmsStandardWarningModal from "../components/EdmsStandardWarningModal";
import { useDialogs, type ConfirmOptions } from "../components/ConfirmModal";
import { useAuth } from "../auth/AuthContext";
import wdFldImg from "../assets/wd-fld.png";
import wdRhdImg from "../assets/wd-rhd.png";
import wdRheImg from "../assets/wd-rhe.png";
// Guide photos for the W.D operating-mechanism accessories (shown when picked).
const WD_ACC_IMG: Record<string, string> = { fld: wdFldImg, rhd: wdRhdImg, rhe: wdRheImg };
import * as XLSX from "xlsx";
import {
  PRO_E_DEPTHS, PRO_E_THICKNESS, PRO_E_IPS, IS2_DEPTHS, PLP_DEPTHS,
  proEIp31Disabled, retable, defaultCellConfig, cellTable, type CellType,
} from "../lv/cells";
import {
  COPPER_RATINGS, csaFor, copperWeight, copperTotal,
} from "../lv/copper";
import { panelPoles, POLE_CM, POLE_KINDS, GROUP_LABEL, KIND_LABEL, type PoleGroup, type PoleKind } from "../lv/poles";
import { stdPanel, applyStdPanel, STD_EDMS_KVA } from "../lv/standardEdms";
import { stdAts, applyStdAts, stdAtsRatings, atsBreakersFor, type StdAtsVariant } from "../lv/standardAtsEdms";

type Tab = "project" | "pricing" | "specs" | "panels" | "technical" | "commercial" | "material" | "spare" | "selectivity" | "summary";
const TABS: Tab[] = ["project", "pricing", "specs", "panels", "technical", "commercial", "material", "spare", "selectivity"];

/** Effective combination group per component (id → group). A component keeps its
 *  own group; an ungrouped one sitting between two same-group items (in the same
 *  section) inherits that group — so moving an item into a Source 1 run joins it. */
function effectiveGroups(comps: PanelComponent[]): Map<string, string> {
  const out = new Map<string, string>();
  comps.forEach((c, i) => {
    if (!isSpacer(c) && c.group) { out.set(c.id, c.group); return; }
    // Ungrouped rows — and spacers — inherit a combination only when the SAME group
    // brackets them on both sides. So a spacer dropped inside a combination stays part
    // of it (one header, blank row in the middle), while a separator sitting between two
    // different groups (or after a group) stays ungrouped ("").
    let prev = "", next = "";
    for (let j = i - 1; j >= 0; j--) { if (comps[j].section !== c.section) break; const g = comps[j].group; if (g) { prev = g; break; } }
    for (let j = i + 1; j < comps.length; j++) { if (comps[j].section !== c.section) break; const g = comps[j].group; if (g) { next = g; break; } }
    out.set(c.id, prev && prev === next ? prev : "");
  });
  return out;
}

// Cross-panel clipboard for Copy/Paste of a whole combination (module-level so it survives
// switching between panels; not persisted to the quotation).
let comboClipboard: { label: string; comps: PanelComponent[] } | null = null;

// ── Keyboard field navigation (arrow keys move between fields by layout) ───────
type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
/** Visible, enabled input/select fields within a container. */
function navigableFields(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>("input, select")].filter((el) => {
    const inp = el as HTMLInputElement;
    if (inp.disabled || inp.readOnly) return false;
    if (el.tagName === "INPUT" && ["hidden", "checkbox", "radio", "button", "submit", "range"].includes(inp.type)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  });
}
/** The nearest field from `cur` in the pressed direction (by geometry). */
function nearestField(cur: HTMLElement, list: HTMLElement[], key: ArrowKey): HTMLElement | null {
  const a = cur.getBoundingClientRect();
  const cx = a.left + a.width / 2, cy = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
    let inDir = false, along = 0, perp = 0;
    if (key === "ArrowRight") { inDir = dx > 1; along = dx; perp = Math.abs(dy); }
    else if (key === "ArrowLeft") { inDir = dx < -1; along = -dx; perp = Math.abs(dy); }
    else if (key === "ArrowDown") { inDir = dy > 1; along = dy; perp = Math.abs(dx); }
    else { inDir = dy < -1; along = -dy; perp = Math.abs(dx); }
    if (!inDir) continue;
    const score = along + perp * 2; // closest in-line, then best-aligned
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

// ── tiny UI atoms (match the app theme) ──────────────────────────────────────
function L({ children }: { children: React.ReactNode }) {
  return <label className="label">{children}</label>;
}
// Shared "jump to the linked view" arrow — the same icon marks a panel (→ its Technical-Offer
// page) and each Technical-Offer page (→ its panel), so both directions carry one icon.
function JumpArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}
function Sel<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: readonly T[]; className?: string;
}) {
  return (
    <select className={`input cursor-pointer ${className ?? ""}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
// Watt-hour-meter icon for KWHM cells — a compact SVG (scales with font-size).
function KwhmIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" className="inline-block shrink-0 align-[-0.22em]" aria-hidden="true">
      <rect x="3" y="2.5" width="18" height="19" rx="2.6" fill="#3f434d" />
      <rect x="5" y="4.5" width="14" height="10.5" rx="1.4" fill="#f5f5f7" />
      <rect x="6.4" y="6.4" width="8.7" height="4.4" rx="0.7" fill="#20262f" />
      <rect x="15.4" y="6.4" width="2.4" height="4.4" rx="0.7" fill="#e5484d" />
      <rect x="6.4" y="12" width="11.4" height="1.3" rx="0.6" fill="#b6bac2" />
      <g fill="#9297a1">
        <rect x="6.2" y="16.6" width="2.2" height="2.7" rx="0.4" />
        <rect x="9.2" y="16.6" width="2.2" height="2.7" rx="0.4" />
        <rect x="12.2" y="16.6" width="2.2" height="2.7" rx="0.4" />
        <rect x="15.2" y="16.6" width="2.2" height="2.7" rx="0.4" />
      </g>
    </svg>
  );
}
/** Icon for a spare/aux cell — the KWHM meter SVG, else the kind's emoji. */
function SpareKindIcon({ kind }: { kind?: string }) {
  if (kind === "kwhm") return <KwhmIcon />;
  return <>{SPARE_KIND_ICONS[kind ?? "spare"] ?? "🧰"}</>;
}
/** Searchable dropdown (RPT-01: enclosure family + sizing must be searchable). */
function SearchSelect({ value, placeholder, options, onPick, heightMatch }: {
  value: string; placeholder: string;
  options: { key: string; label: string; hint?: string }[];
  onPick: (key: string) => void;
  heightMatch?: boolean; // enclosure Sizing: a pure-number query matches the HEIGHT only
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  // Live, flexible filter+rank — see rankSearchOptions (lv/search.ts). For enclosure
  // Sizing (heightMatch), a pure-number query filters by the enclosure HEIGHT (the
  // first dimension in the name) so "1000" shows only 1000-high boxes, not every row
  // that happens to contain 1000 (a width/depth/price). Non-dimensioned families and
  // any non-numeric query fall back to the normal full-text search.
  const shown = useMemo(() => {
    const digits = q.trim();
    if (heightMatch && /^\d+$/.test(digits) && options.some((o) => encDims(o.label) != null)) {
      return options.filter((o) => { const h = encDims(o.label)?.H; return h != null && String(h).startsWith(digits); });
    }
    return rankSearchOptions(options, q);
  }, [q, options, heightMatch]);
  const sel = options.find((o) => o.key === value);
  // Keyboard nav: first option auto-highlighted; ↑/↓ move, Enter picks the highlight.
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // On open with no query, land on the currently-selected option (so the list shows
  // what's already chosen); while typing, highlight the top match.
  useEffect(() => {
    if (open && !q && value) {
      const idx = shown.findIndex((o) => o.key === value);
      setActiveIdx(idx >= 0 ? idx : 0);
    } else {
      setActiveIdx(0);
    }
  }, [q, open]);
  useEffect(() => { (listRef.current?.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [activeIdx, open]);
  // Close when a click lands outside the dropdown (input + list).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div ref={rootRef} className="relative">
      <input
        className="input"
        placeholder={placeholder}
        value={open ? q : sel?.label ?? ""}
        onFocus={() => { setOpen(true); setQ(""); }}
        onClick={() => { if (!open) { setOpen(true); setQ(""); } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (!open) { if (e.key === "ArrowDown" || e.key === "Enter") { setOpen(true); setQ(""); } return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); const o = shown[activeIdx]; if (o) { onPick(o.key); setOpen(false); } }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div ref={listRef} className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-white shadow-lift">
          {shown.length === 0 && <div className="px-3 py-2 text-xs text-muted">No matches</div>}
          {shown.map((o, i) => (
            <button key={o.key} type="button"
              className={`block w-full px-3 py-1.5 text-left text-sm ${i === activeIdx ? "bg-brand-light" : "hover:bg-brand-tint"}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={() => { onPick(o.key); setOpen(false); }}>
              {o.label}
              {o.hint && <span className="ml-1 text-[11px] text-muted">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// The QTN workspace — one quotation holding project data, pricing settings,
// panels and the generated Technical / Commercial offers + Material List.
// Panel-field changes that do NOT raise the EDMS "recheck" warning: pure navigation,
// identity/labels, and the standard-panel picker selections (choosing TR-kVA / P.F.C /
// Outgoings and pressing "Build this panel" is how the panel is BUILT, not edited).
// Every other change — components added/removed/changed, sizing, copper, … — warns.
const EDMS_IGNORE_KEYS = new Set<string>([
  "activeSection", "name", "fedFrom", "code",
  "stdTrKva", "stdPfc", "stdOutgoings",
  // UI-only markers — not a change to the panel's contents/sizing.
  "highlight", "draft", "edmsEdited",
]);

export default function LvConfiguratorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  /**
   * Pin the quotation header (number, price, status, actions) to the top so it
   * stays visible while scrolling a long panel list. Remembered per browser, the
   * same way the sidebar pin is. Off by default — pinned, it costs ~90px of
   * height on every screen, which not everyone wants.
   *
   * The tab strip below is sticky already; while the header is pinned it gives up
   * its own stickiness so the two cannot stack on top of each other.
   */
  const [headerPinned, setHeaderPinned] = useState(() => {
    try { return localStorage.getItem("pl.qtnHeaderPin") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("pl.qtnHeaderPin", headerPinned ? "1" : "0"); } catch { /* ignore */ }
  }, [headerPinned]);

  // Themed stand-ins for window.confirm / alert / prompt. `confirmModal` is
  // rendered once, near the bottom of this component; it portals to document.body.
  const { confirm: askConfirm, prompt: askFor, notify: askNotify, dialogs: confirmModal } = useDialogs();
  // Async-loaded from the backend (per signed-in user). `rec` is null until loaded.
  const [rec, setRec] = useState<QtnRecord | null>(null);
  const [loading, setLoading] = useState(true);
  // RPT-1: history-aware state (Undo/Redo). Starts on a placeholder so the hooks
  // below stay unconditional, then is replaced once the quotation loads.
  const [hist, setHist] = useState<{ past: LvState[]; present: LvState; future: LvState[] }>(
    () => ({ past: [], present: initialState(), future: [] })
  );
  const s = hist.present;
  // Restore the last tab this QTN was on (per-QTN), else the default view.
  const tabKey = `lv-tab-${id}`;
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem(tabKey) as Tab | null;
    return saved && TABS.includes(saved) ? saved : "project";
  });
  const [matAbbOnly, setMatAbbOnly] = useState(false);
  // RPT-1: the QTN number is editable after creation (kept unique per user).
  const [qtnNum, setQtnNum] = useState("");
  // Where this quotation sits in the approval workflow. The server owns it; the
  // client only renders it and offers the moves the server will accept.
  const [status, setStatus] = useState<QtnStatus>("DRAFT");
  const [wf, setWf] = useState<{ approverEmail: string; returnReason: string; ownerId: string; ownerEmail: string }>(
    { approverEmail: "", returnReason: "", ownerId: "", ownerEmail: "" }
  );
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [wfError, setWfError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The missing-copper / empty-panel / no-cells etc. warnings, surfaced when sending for
  // approval so the approver sees them before the quotation is locked. Null = no modal.
  const [approvalWarns, setApprovalWarns] = useState<ExportCheck[] | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [coWorkOpen, setCoWorkOpen] = useState(false);
  const { user } = useAuth();
  // EDMS standard-panel warning: which panel tripped it + the snapshot to revert to.
  // edmsWarnedRef remembers panels already warned this session (once per panel).
  const [edmsWarn, setEdmsWarn] = useState<{ panelId: string; snapshot: LvPanel } | null>(null);
  const edmsWarnedRef = useRef<Set<string>>(new Set());
  // The same warning, shown a second time as an extra confirmation when a changed
  // standard (EDMS) quotation is sent for approval.
  const [edmsSendConfirm, setEdmsSendConfirm] = useState(false);
  const [sendingOffers, setSendingOffers] = useState(false);
  // Cancelled = this revision was superseded by a newer amendment (a higher revision of
  // the same base exists). Derived from the QTN list; makes the revision read-only.
  const [cancelled, setCancelled] = useState(false);

  // Load the quotation from the backend on mount (redirect to the list if gone).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getQtn(id)
      .then((r) => {
        if (!alive) return;
        if (!r) { navigate("/lv", { replace: true }); return; }
        setRec(r);
        setHist({ past: [], present: r.state, future: [] });
        setQtnNum(r.number);
        setStatus(r.status);
        setWf({
          approverEmail: r.approverEmail, returnReason: r.returnReason,
          ownerId: r.ownerId, ownerEmail: r.ownerEmail,
        });
        if (!localStorage.getItem(tabKey)) {
          if (r.state.kind === "spare") setTab("spare");
          else if (r.state.panels.length) setTab("panels");
        }
        setLoading(false);
      })
      .catch(() => { if (alive) navigate("/lv", { replace: true }); });
    return () => { alive = false; };
  }, [id, navigate, tabKey]);
  // A revision is cancelled once a higher revision of the same base exists.
  useEffect(() => {
    if (!qtnNum) return;
    let alive = true;
    listQtns()
      .then((list) => { if (alive) setCancelled(supersededNumbers(list.map((q) => q.number)).has(qtnNum)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [qtnNum]);
  // What the signed-in user may do. Server-computed on every load — the JWT lives
  // for 30 days, so it must never be the source of this.
  useEffect(() => {
    let alive = true;
    api.access.me()
      .then((a) => { if (alive) setMyPerms(a.perms); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Content is frozen while the quotation is under review, approved or submitted —
  // and separately when this revision has been superseded.
  const lockedByStatus = status === "WAITING_APPROVAL" || status === "APPROVED" || status === "SUBMITTED";
  const canEditWaiting = status === "WAITING_APPROVAL" && myPerms.includes("qtn.editWaiting");
  const readOnly = (lockedByStatus && !canEditWaiting) || cancelled;

  // Renames the QTN on the backend (unique, non-empty). Edited from the Project tab.
  const renameQtnNumber = async (n: string): Promise<{ ok: boolean; error?: string }> => {
    if (!rec) return { ok: false, error: "Quotation not found." };
    if (readOnly) {
      return {
        ok: false,
        error: cancelled ? "Cancelled revision — read-only." : `${QTN_STATUS_LABEL[status]} — cannot be renamed.`,
      };
    }
    const res = await renameQtn(rec.id, n);
    if (res.ok) setQtnNum(n.trim());
    return res;
  };

  /** Move the quotation through the workflow. Surfaces the server's reason on
   *  refusal — the old submit/reopen handlers swallowed every error, so a rejected
   *  action looked like nothing happened at all. */
  const doTransition = async (
    to: QtnStatus,
    opts?: { confirm?: ConfirmOptions; note?: string },
  ) => {
    if (!rec) return;
    // Themed dialog rather than window.confirm — the browser's own says
    // "powerline-chi.vercel.app says", cannot be styled, and reads like a warning
    // from something other than the app.
    if (opts?.confirm && !(await askConfirm(opts.confirm))) return;
    setSubmitting(true);
    setWfError("");
    try {
      await transitionQtn(rec.id, to, opts?.note);
      setStatus(to);
      if (to === "RETURNED") setWf((w) => ({ ...w, returnReason: opts?.note ?? "" }));
      if (to === "DRAFT") setWf((w) => ({ ...w, returnReason: "" }));
    } catch (e) {
      setWfError((e as Error).message || "That action was refused.");
    } finally {
      setSubmitting(false);
    }
  };

  // The actual transition. When the pre-approval warnings modal is what confirmed the
  // send, it carries its own "Send anyway" button and its own note, so the plain confirm
  // is skipped to avoid a second dialog saying the same thing.
  const runSendForApproval = (skipConfirm = false) =>
    void doTransition("WAITING_APPROVAL", skipConfirm ? undefined : {
      confirm: {
        title: "Send for approval",
        message: "You won't be able to edit this quotation while it is under review.",
        confirmLabel: "Send for approval",
      },
    });
  // Everything shown before a quotation is locked for review. It starts from the same
  // checks the offer export runs (empty panels, zero price, NO CELLS chosen, MISSING
  // COPPER on a cells panel, LCP cables, duplicate names) and adds the pre-send checks
  // asked for on top:
  //   • mandatory fields not filled — panel name and busbar rating (panelInvalid);
  //   • a panel whose TYPE & SIZING was never chosen (sizingMode still "none");
  //   • prices that have fallen behind the published price list.
  const approvalWarnings = (): ExportCheck[] => {
    const required: string[] = []; // mandatory fields left blank
    const noSizing: string[] = []; // panel type & sizing never chosen
    s.panels.forEach((p, i) => {
      if (p.spare) return; // spare cells have no sizing / rating rules
      const label = `Panel ${i + 1}${p.name.trim() ? ` (${p.name.trim()})` : ""}`;
      for (const m of panelInvalid(p)) required.push(`${label}: ${m}`);
      if (p.sizingMode === "none") noSizing.push(`${label}: panel type & sizing not chosen`);
    });
    const head: ExportCheck[] = [];
    if (required.length) head.push({ title: "Required fields not filled", items: required });
    if (noSizing.length) head.push({ title: "Panel type & sizing not chosen", items: noSizing });
    // Out of date: would repricing to today's published list actually move anything?
    // repriceToCatalog doesn't mutate — it just reports what a refresh would change.
    const { changed, removed } = repriceToCatalog(s);
    const tail: ExportCheck[] = [];
    if (changed + removed > 0) {
      const bits: string[] = [];
      if (changed) bits.push(`${changed} line${changed === 1 ? "" : "s"} would change price`);
      if (removed) bits.push(`${removed} item${removed === 1 ? "" : "s"} no longer in the price list`);
      tail.push({
        title: "Prices are out of date with the price list",
        items: [`${bits.join(" · ")} — press “⟳ Check for updates” on this quotation to bring it up to date.`],
      });
    }
    return [...head, ...exportBlockers(s), ...tail];
  };
  // Sales support engineer is mandatory — it prints on the offer and routes the approval.
  // Block sending until it's picked, surfacing why and jumping to the Project tab. Then
  // show every other missing thing (see approvalWarnings) before the quotation is locked,
  // so the approver sees it rather than discovering it at export time.
  // Past the EDMS confirmation: the offer's own checks, then the transition.
  const proceedSend = () => {
    const warns = approvalWarnings();
    if (warns.length) { setApprovalWarns(warns); return; } // the modal confirms the send
    runSendForApproval();
  };
  const sendForApproval = () => {
    if (!s.project.supportEngineer.trim()) {
      setWfError("Select a Sales support engineer on the Project tab before sending for approval.");
      setTab("project");
      return;
    }
    // A STANDARD (EDMS) quotation whose panel was changed gets the recheck warning a
    // second time here, as an extra confirmation — but only when something was changed.
    if (isEdmsQtn && s.panels.some((p) => p.edmsEdited)) { setEdmsSendConfirm(true); return; }
    proceedSend();
  };
  // "Send to <sales person>" — compose the offer e-mail in Outlook via a mailto link.
  // Recipient is the sales person's e-mail from the Project tab (empty To when none is
  // chosen, so the user picks it). Subject is "<QTN> (<Project>)"; the body greets the
  // sales person, cites the selling factor, and signs off with the sales-support name.
  // A mailto can't carry attachments, so the Technical & Commercial PDFs are attached
  // by hand after Outlook opens.
  const salesMailSubject = () => `${qtnNum} (${s.project.name.trim()})`;
  const salesMailBody = () => [
    `Dear ${s.project.salesPerson.trim() || "Sales"},`,
    "Please find attached the Technical and Commercial offers",
    `on factor "${s.factors.factor}"`,
    "",
    "Best regards,",
    s.project.supportEngineer.trim() || user?.name || "",
  ].join("\r\n");
  const salesMailtoHref = () =>
    `mailto:${s.project.salesEmail.trim()}?subject=${encodeURIComponent(salesMailSubject())}&body=${encodeURIComponent(salesMailBody())}`;
  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  // Build both offer PDFs. Each offer only renders on its own tab, so flip there,
  // capture the PDF, then restore the tab. Shared by the Outlook and WhatsApp senders
  // so both attach exactly the same two files.
  const buildOfferPdfs = async (): Promise<{ toBlob: Blob | null; coBlob: Blob | null; toName: string; coName: string }> => {
    const waitFor = (sel: string, ms = 5000) => new Promise<HTMLElement | null>((resolve) => {
      const start = Date.now();
      const tick = () => {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) resolve(el);
        else if (Date.now() - start > ms) resolve(null);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    const original = tab;
    const rev = s.project.revisionNo;
    const toName = `${offerTitle("TO", qtnNum, rev)}.pdf`;
    const coName = `${offerTitle("CO", qtnNum, rev)}.pdf`;
    const { exportTechnicalPdf, exportSheetsPdf } = await import("../lv/technicalPdf");
    setTab("technical");
    const tArea = await waitFor("[data-pdf-root]");
    const toBlob = (tArea ? await exportTechnicalPdf({ printArea: tArea, filename: toName, asBlob: true }) : null) || null;
    setTab("commercial");
    const cArea = await waitFor("[data-co-root]");
    const coBlob = (cArea ? await exportSheetsPdf({ printArea: cArea, filename: coName, asBlob: true }) : null) || null;
    setTab(original);
    return { toBlob, coBlob, toName, coName };
  };

  // Send-to-sales → OUTLOOK / e-mail. When Outlook (Microsoft 365) is configured, build
  // a DRAFT with both PDFs ATTACHED and open it to send. Otherwise fall back: Windows
  // share sheet, or download the two PDFs + open a prefilled mailto (a mailto can't
  // carry attachments). To = the sales person's e-mail from the Project tab; subject =
  // "<QTN> (<Project>)".
  const sendToSales = async () => {
    if (sendingOffers) return;
    const original = tab;
    setSendingOffers(true);
    try {
      const { graphConfigured, createOutlookDraft } = await import("../lv/outlookGraph");
      const { toBlob, coBlob, toName, coName } = await buildOfferPdfs();

      if (graphConfigured()) {
        const attachments = [
          toBlob ? { name: toName, blob: toBlob } : null,
          coBlob ? { name: coName, blob: coBlob } : null,
        ].filter(Boolean) as { name: string; blob: Blob }[];
        const link = await createOutlookDraft({
          to: s.project.salesEmail.trim(), subject: salesMailSubject(), body: salesMailBody(), attachments,
        });
        if (link) window.open(link, "_blank", "noopener");
        return;
      }
      // Microsoft 365 isn't configured, so we can't build a ready-made Outlook draft with
      // the two PDFs already attached. A mailto is the only thing that reliably fills the
      // RECIPIENT and the SUBJECT in whatever mail app opens — desktop Outlook, new
      // Outlook, or Outlook on the web — so open that, and download the two PDFs so they
      // are ready to attach by hand (a mailto can't carry files). The Windows share sheet
      // used to run here instead, but it carries neither a recipient nor a subject —
      // exactly what was missing.
      if (toBlob) downloadBlob(toBlob, toName);
      if (coBlob) downloadBlob(coBlob, coName);
      window.location.href = salesMailtoHref();
    } catch (e) {
      setTab(original);
      setWfError(`Couldn't build the offer e-mail — ${(e as Error).message || "please try again"}.`);
    } finally {
      setSendingOffers(false);
    }
  };

  // Send-to-sales → WHATSAPP. A wa.me link can't carry files, so the two offer PDFs are
  // downloaded (ready to drag into the chat) and WhatsApp opens with the message
  // prefilled: the QTN number, the project name, then the default message. Number comes
  // from the Project tab, normalised to international digits — an Egyptian local number
  // starting "0" becomes "20…", a "00…" international prefix is dropped.
  const salesWaDigits = (raw: string): string => {
    let d = (raw || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("00")) d = d.slice(2);       // 00-prefixed international dialling
    if (d.startsWith("0")) d = `20${d.slice(1)}`; // local Egyptian 0-number → +20
    return d;
  };
  // WhatsApp message = the SAME wording as the Outlook e-mail (owner's request). Outlook
  // splits into a subject and a body; WhatsApp has no subject line, so the subject
  // ("<QTN> (<Project>)") goes on top, then the identical e-mail body underneath.
  const salesWaText = () => `${salesMailSubject()}\n\n${salesMailBody()}`;
  const sendViaWhatsApp = async () => {
    if (sendingOffers) return;
    const digits = salesWaDigits(s.project.salesMobile);
    if (!digits) {
      void askNotify({
        title: "No WhatsApp number",
        message: "This sales person has no phone number on the Project tab. Add one there, then try again.",
      });
      return;
    }
    const original = tab;
    setSendingOffers(true);
    try {
      const { toBlob, coBlob, toName, coName } = await buildOfferPdfs();
      // wa.me cannot attach files — download them so they are ready to attach in the chat.
      if (toBlob) downloadBlob(toBlob, toName);
      if (coBlob) downloadBlob(coBlob, coName);
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(salesWaText())}`, "_blank", "noopener");
    } catch (e) {
      setTab(original);
      setWfError(`Couldn't prepare the WhatsApp message — ${(e as Error).message || "please try again"}.`);
    } finally {
      setSendingOffers(false);
    }
  };
  const isOwner = !wf.ownerId || wf.ownerId === rec?.ownerId;
  const canApprove = myPerms.includes("qtn.approve");
  const canReturn = canApprove || myPerms.includes("qtn.return");
  const canReopen = myPerms.includes("qtn.reopen");
  // Hand-over: a manager (qtn.reassign) can move anyone's; the owner can hand off their own.
  // A co-owner is neither — hide it from them (the server would 403 anyway).
  const isCoOwnerHere = !!rec?.coOwners?.some((c) => c.id === user?.id);
  const canReassign = (myPerms.includes("qtn.reassign") || isOwner) && !isCoOwnerHere;
  const doReassign = async (toUserId: string, note: string) => {
    if (!rec) return;
    await reassignQtn(rec.id, toUserId, note); // throws → the modal shows the message
    setReassignOpen(false);
    navigate("/lv"); // ownership moved — the ex-owner leaves the (now read-only-to-them) QTN
  };
  // Co-Work: only the primary owner (or a manager) may add/change/remove a co-owner.
  const canCoWork = user?.id === rec?.ownerId || myPerms.includes("qtn.reassign");
  const doSetCoWorkers = async (coOwnerIds: string[], note: string) => {
    if (!rec) return;
    const res = await setCoWorkers(rec.id, coOwnerIds, note); // throws → the modal shows the message
    setRec({ ...rec, coOwners: res.coOwners });
    setCoWorkOpen(false);
  };

  // Return for revision: a structured, per-panel comment modal (replaces the old
  // single-line prompt). The collected comments are serialised into the return
  // reason, which the estimator sees in the RETURNED banner (whitespace-pre-wrap).
  const submitReturn = (items: ReturnComment[]) => {
    setReturnOpen(false);
    if (!items.length) return;
    const note = items.map((c) => `• ${c.label}\n${c.comment}`).join("\n\n");
    void doTransition("RETURNED", { note });
  };

  const apply = (updater: (old: LvState) => LvState) =>
    setHist((h) => {
      const next = updater(h.present);
      return next === h.present ? h : { past: [...h.past, h.present].slice(-60), present: next, future: [] };
    });
  const undo = () =>
    setHist((h) => (!readOnly && h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future].slice(0, 60) } : h));
  const redo = () =>
    setHist((h) => (!readOnly && h.future.length ? { past: [...h.past, h.present].slice(-60), present: h.future[0], future: h.future.slice(1) } : h));
  const canUndo = !readOnly && hist.past.length > 0;
  const canRedo = !readOnly && hist.future.length > 0;
  // "Apply changes" from the price-list changelog: re-price this quotation to the
  // current published catalogue (component + cell prices; the estimator's qty,
  // adjustments and notes are kept). Returns how many priced lines moved.
  const applyCatalogPrices = (): { changed: number; removed: number } => {
    const { next, changed, removed } = repriceToCatalog(s);
    // Stamp the version even when nothing moved: the estimator reviewed it against
    // this list, so it earns the "prices updated" mark and drops off the stale count.
    apply(() => ({ ...next, pricesAppliedVersion: catalogVersion() }));
    return { changed, removed };
  };
  // ERP upload: download the QTN's panels as an ERPNext "Bulk Edit Items" CSV
  // (one row per panel — see lv/erpCsv.ts).
  const erpCount = erpItemCount(s);
  const exportErpCsv = async () => {
    const def = `Items-${(qtnNum || "export").replace(/\s+/g, "")}`;
    const name = await askFor({
      title: "Export ERP items",
      message: "Name the CSV file.",
      defaultValue: def,
      confirmLabel: "Export",
    });
    if (name === null) return; // cancelled
    const trimmed = name.trim() || def;
    const blob = new Blob([buildErpItemsCsv(s)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = /\.csv$/i.test(trimmed) ? trimmed : `${trimmed}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Debounced live-save to the backend (replaces the previous localStorage save).
  //
  // Every save ships the ENTIRE quotation — hundreds of kilobytes for a real one — so what
  // this does NOT send matters as much as what it does. On 23 Aug 2026 the database's
  // data-transfer quota ran out and took the live site down completely, autosave being one
  // of the three big contributors. Two rules keep the volume honest:
  //
  //   1. Never send a payload identical to the one already stored. React hands us a new
  //      state object for any change at all, including ones that alter nothing (a re-render,
  //      an undo back to where you were, re-picking the same value), and each of those used
  //      to be a full write.
  //
  //   2. Clicking between panels changes only `selectedId`. That is navigation, not content,
  //      and it used to send the whole quotation to record which tab you were on. It is
  //      still saved, so reopening returns you to the same panel — just on a long delay, so
  //      clicking through ten panels is one write instead of ten.
  //
  // saveRef holds the latest pending payload so the final edit is never lost, and is cleared
  // only once a save has actually SUCCEEDED — a failure keeps it queued for the next attempt.
  const CONTENT_SAVE_MS = 800; // unchanged: a real edit still lands as quickly as before
  const SELECTION_SAVE_MS = 8000; // navigation only — collapse a burst of clicks
  const saveRef = useRef<{ id: string; state: LvState } | null>(null);
  const sentRef = useRef(""); // the exact payload the server last accepted
  const sentContentRef = useRef(""); // …the same, ignoring which panel was selected

  // One place that writes, so a flush and a debounce can never double-send.
  const commit = useRef((_id: string, _state: LvState) => {});
  commit.current = (id: string, state: LvState) => {
    const payload = JSON.stringify(state);
    if (payload === sentRef.current) return; // already stored — writing it again is waste
    const contentKey = JSON.stringify({ ...state, selectedId: "" });
    saveQtn(id, state)
      .then(() => {
        sentRef.current = payload;
        sentContentRef.current = contentKey;
        saveRef.current = null;
      })
      .catch(() => {
        // Keep saveRef so the edit is retried on the next change, on hide, or on unmount.
      });
  };

  useEffect(() => {
    if (!rec || loading) return;
    const payload = JSON.stringify(s);
    if (payload === sentRef.current) return; // nothing to write
    saveRef.current = { id: rec.id, state: s };
    // Blanking selectedId tells content changes apart from navigation between panels.
    const contentKey = JSON.stringify({ ...s, selectedId: "" });
    const selectionOnly = sentContentRef.current !== "" && contentKey === sentContentRef.current;
    const t = setTimeout(() => commit.current(rec.id, s), selectionOnly ? SELECTION_SAVE_MS : CONTENT_SAVE_MS);
    return () => clearTimeout(t);
  }, [rec, s, loading]);

  // Flush a pending save when the tab is hidden. This runs while the page is still alive,
  // so an ordinary fetch still works — unlike an unload handler, which cannot carry the
  // Authorization header. It is what makes the longer navigation delay safe.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && saveRef.current) {
        commit.current(saveRef.current.id, saveRef.current.state);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // …and on unmount, so leaving the screen never drops the last edit.
  useEffect(
    () => () => { if (saveRef.current) commit.current(saveRef.current.id, saveRef.current.state); },
    []
  );
  // RPT-1: keyboard — Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y or Shift+Z = redo (ignored while
  // typing in a field so native text-undo still works there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => grandTotals(s), [s]);
  const sel = s.panels.find((p) => p.id === s.selectedId) ?? null;
  const isSpareQtn = s.kind === "spare";
  // ── Co-Work ────────────────────────────────────────────────────────────────
  // Any number of sales-support share one QTN, split BY PANEL: each edits only the
  // panels they own, and the shared tabs (Project / Pricing / Terms) belong to the
  // owner alone. `coWork` is on once at least one co-worker is set; ownership then
  // splits. A panel with no ownerId (legacy / pre-co-work) counts as the owner's.
  // The server merge is the real guard — this only shapes the UI so edits to someone
  // else's panel don't silently vanish on the next save.
  const coOwners = useMemo(() => rec?.coOwners ?? [], [rec]);
  const coWork = coOwners.length > 0;
  const isPrimary = !coWork || user?.id === rec?.ownerId;
  const panelOwnerOf = (p?: LvPanel | null) => p?.ownerId || rec?.ownerId || "";
  const canEditPanel = (p?: LvPanel | null) => !coWork || panelOwnerOf(p) === user?.id;
  // The shared tabs are read-only for a co-worker (the owner owns them). Panel
  // edits are gated per-panel in `upPanel`; reorder is gated in `up`.
  const sharedReadOnly = readOnly || (coWork && !isPrimary);
  // Resolve a panel-owner id to a display name / initials for the co-work badges.
  const ownerNameById = (id?: string | null) => {
    if (!id) return "";
    if (id === rec?.ownerId) return rec?.ownerName || rec?.ownerEmail || "Owner";
    const c = coOwners.find((x) => x.id === id);
    return c ? c.name || c.email : "";
  };
  const initialsOf = (name: string) =>
    name.trim().split(/[\s@._-]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const panelBadge = coWork
    ? (p: LvPanel) => { const id = panelOwnerOf(p); const name = ownerNameById(id); return { text: initialsOf(name), title: name, mine: id === user?.id }; }
    : undefined;
  // "You + Alaa + Sara" / "Mohamed + Alaa + you" — the whole team, you last if you're
  // not the owner, so the banner reads the same way for everybody.
  const nameOrYou = (id: string, name: string) => (id === user?.id ? "you" : name);
  const teamLabel = [
    nameOrYou(rec?.ownerId ?? "", rec?.ownerName || rec?.ownerEmail || "Owner"),
    ...coOwners.map((c) => nameOrYou(c.id, c.name || c.email)),
  ].join(" + ");
  const selPanelOwnerName = coWork && sel ? ownerNameById(panelOwnerOf(sel)) : "";

  // ── Live sync ──────────────────────────────────────────────────────────────
  // Nothing can push from the server (the API runs as serverless functions), so
  // poll. Two things arrive this way: the workflow status — so an approval or a
  // return you didn't make is reflected without a reload — and, when co-working,
  // the OTHER owner's panels.
  //
  // The merge is deliberately one-sided: your own panels are never read from the
  // server, so nothing you are typing can be overwritten. Only panels that belong
  // to the other person are replaced, added or dropped. A co-owner additionally
  // takes the shared tabs from the server, since the primary owner owns those and
  // the co-owner cannot edit them anyway.
  const [freshPanels, setFreshPanels] = useState<Set<string>>(new Set());
  const theirsRef = useRef<string | null>(null); // their panels as last seen on the server
  const syncFromServer = async () => {
    if (!rec || loading) return;
    const r = await getQtn(rec.id);
    if (!r) return;

    if (r.status !== status) setStatus(r.status);
    const teamSig = (x: { coOwners?: { id: string }[] }) => (x.coOwners ?? []).map((c) => c.id).sort().join(",");
    setRec((old) =>
      !old || (teamSig(old) === teamSig(r) && old.status === r.status && old.returnReason === r.returnReason)
        ? old
        : { ...old, status: r.status, locked: r.locked, returnReason: r.returnReason,
            approverEmail: r.approverEmail, coOwners: r.coOwners },
    );

    const mine = user?.id;
    if (!r.coOwners.length || !mine) { theirsRef.current = null; return; } // not co-worked
    const ownerOnServer = (p: LvPanel) => p.ownerId || r.ownerId;
    const theirs = r.state.panels.filter((p) => ownerOnServer(p) !== mine);

    // What moved on THEIR side since the last poll, so your own edits never count as
    // "arrived". Before the first poll the baseline is whatever is already on screen —
    // seeding it empty would let the first batch slip in without a marker.
    const sig = JSON.stringify(theirs);
    if (sig !== theirsRef.current) {
      const baseline: LvPanel[] = theirsRef.current !== null
        ? (JSON.parse(theirsRef.current) as LvPanel[])
        : s.panels.filter((p) => ownerOnServer(p) !== mine);
      const before = new Map(baseline.map((p) => [p.id, JSON.stringify(p)]));
      const moved = theirs.filter((p) => before.get(p.id) !== JSON.stringify(p)).map((p) => p.id);
      if (moved.length) {
        setFreshPanels((old) => new Set([...old, ...moved]));
        setTimeout(() => setFreshPanels((old) => {
          const kept = new Set(old); moved.forEach((k) => kept.delete(k)); return kept;
        }), 6000);
      }
      theirsRef.current = sig;
    }

    const theirIds = new Set(theirs.map((p) => p.id));
    const iAmPrimary = mine === r.ownerId;
    setHist((h) => {
      const cur = h.present;
      // Keep all of mine untouched; keep theirs only while it still exists remotely.
      const merged = cur.panels
        .filter((p) => ownerOnServer(p) === mine || theirIds.has(p.id))
        .map((p) => (ownerOnServer(p) === mine ? p : theirs.find((x) => x.id === p.id) ?? p));
      const have = new Set(merged.map((p) => p.id));
      theirs.forEach((p) => { if (!have.has(p.id)) merged.push(p); }); // panels they added
      const base = iAmPrimary ? cur : { ...r.state, selectedId: cur.selectedId };
      const next = { ...base, panels: merged };
      if (JSON.stringify(next) === JSON.stringify(cur)) return h;
      // Someone else's edit isn't yours to undo — swap the present, leave history be.
      return { ...h, present: next };
    });
  };
  useAutoRefresh(() => syncFromServer(), 15_000);
  // Standard EDMS quotations quote panels only — no Spare Parts / LCP / KWHM cells,
  // so the "Auxiliary Panels" menu is not offered on them.
  const isEdmsQtn = s.kind === "edms";
  // The tabs this QTN kind actually has. A spare-parts QTN swaps Panels for Spare
  // Parts and has no Specs/Selectivity; Standard EDMS carries no coordination study.
  const tabs: [Tab, string][] = isSpareQtn
    ? [["project", "Project"], ["pricing", "Pricing Settings"], ["spare", "Spare Parts"], ["technical", "Technical Offer"], ["commercial", "Commercial Offer"], ["material", "Material List"], ["summary", "Summary"]]
    : [["project", "Project"], ["pricing", "Pricing Settings"], ["specs", "Specs"], ["panels", "Panels"], ["technical", "Technical Offer"], ["commercial", "Commercial Offer"], ["material", "Material List"],
       ...(isEdmsQtn ? [] : [["selectivity", "Selectivity"] as [Tab, string]]),
       ["summary", "Summary"]];
  // The remembered tab can be one this QTN doesn't have (a QTN opened on
  // Selectivity and later turned into an EDMS one, or a kind whose tab set
  // changed). Fall back rather than render a blank page.
  const activeTab: Tab = tabs.some(([t]) => t === tab) ? tab : "project";
  // RPT-1: block every offer/output tab until each panel has its mandatory fields,
  // plus the mandatory project-level fields (the Sales support engineer prints on the
  // offer). Spare cells carry no rating/enclosure, so they're exempt from the panel checks.
  const panelLabel = (p: LvPanel, i: number) => `Panel ${i + 1}${p.name.trim() ? ` (${p.name.trim()})` : ""}`;
  // Two panels under one name is checked across EVERY panel, spare cells included —
  // the auxiliary cells are where guaranteed duplicates came from.
  //
  // Only a quotation whose offer has ALREADY LEFT is exempt: submitted, or cancelled.
  // Not `readOnly` — that also covers "Waiting for approval" and "Approved", where
  // nothing has been sent yet and the approver is precisely the person who should see
  // two identical panels before saying yes. It is also permission-dependent, so the
  // same quotation would block for the owner and not for a sales engineer. On a
  // genuinely sent offer the clash still shows in the pre-export warnings and on the
  // panel list, but its own tabs stay open — nobody could correct it there anyway.
  const offerAlreadySent = status === "SUBMITTED" || cancelled;
  const blankSpares = blankSpareNames(s.panels);
  const nameIssues = offerAlreadySent ? [] : [
    ...s.panels.flatMap((p, i) => {
      // The later panel of the pair reports it, so one clash reads as one problem.
      const twin = panelNameOwner(p.name, s.panels, p.id);
      return twin && s.panels.indexOf(twin) < i ? [`${panelLabel(p, i)}: ${panelNameClashMessage(twin, s.panels)}`] : [];
    }),
    ...(blankSpares.length ? [blankSpareMessage(blankSpares, s.panels)] : []),
  ];
  const offerIssues = [
    ...(s.project.name.trim() ? [] : ["Project name is required — fill it on the Project tab."]),
    ...(s.project.customer.trim() ? [] : ["Customer is required — fill it on the Project tab."]),
    ...(qtnNum.trim() ? [] : ["QTN number is required — set it on the Project tab."]),
    ...(s.project.supportEngineer.trim() ? [] : ["Sales support engineer is required — pick one on the Project tab."]),
    ...s.panels.flatMap((p, i) =>
      p.spare ? [] : panelInvalid(p).map((msg) => `${panelLabel(p, i)}: ${msg}`)),
    ...nameIssues,
  ];

  // Once submitted the QTN is read-only. Content edits are frozen, but pure navigation
  // is still allowed so a submitted offer can be reviewed: selecting a panel (selectedId)
  // and switching a panel's section (activeSection) pass through.
  const isNavOnly = (patch: object, key: string) => Object.keys(patch).length === 1 && key in patch;
  // immutable update helpers
  const up = (patch: Partial<LvState>) => {
    if (readOnly && !isNavOnly(patch, "selectedId")) return;
    // Co-Work: the shared tabs (Project / Pricing / Terms) and panel reorder belong
    // to the primary owner; a co-owner may still navigate between panels.
    if (coWork && !isPrimary && !isNavOnly(patch, "selectedId")) return;
    apply((old) => ({ ...old, ...patch }));
  };
  const upPanel = (id: string, patch: Partial<LvPanel>) => {
    if (readOnly && !isNavOnly(patch, "activeSection")) return;
    // Co-Work: you may edit only the panels you own (opening a panel's section is
    // navigation, always allowed). Guards the UI; the server merge is the backstop.
    if (coWork && !isNavOnly(patch, "activeSection")) {
      const cur = s.panels.find((p) => p.id === id);
      if (panelOwnerOf(cur) !== user?.id) return;
    }
    // Standard EDMS panels are pre-approved. The first time this session a panel is
    // *edited* — a component added/removed/changed, sizing, copper, anything but
    // navigation/labels — snapshot it and warn. Building from the standard
    // (applyStdPanel rewrites components + copper together) is NOT an edit, so it is
    // excluded and never warns.
    let next = patch;
    if (isEdmsQtn) {
      const isBuild = "components" in patch && "copperTool" in patch;
      const meaningful = Object.keys(patch).some((k) => !EDMS_IGNORE_KEYS.has(k));
      if (!isBuild && meaningful) {
        // Persisted mark so the send-for-approval recheck confirmation (#2) survives a
        // reload — set on every protected edit, cleared by rebuild/revert.
        if (patch.edmsEdited === undefined) next = { ...patch, edmsEdited: true };
        // First protected edit of this panel this session → snapshot + warn (#1).
        if (!edmsWarnedRef.current.has(id)) {
          const cur = s.panels.find((p) => p.id === id);
          if (cur) { edmsWarnedRef.current.add(id); setEdmsWarn({ panelId: id, snapshot: cur }); }
        }
      }
    }
    apply((old) => ({ ...old, panels: old.panels.map((p) => (p.id === id ? { ...p, ...next } : p)) }));
  };
  // "Revert changes" on the EDMS warning: restore the panel to the snapshot taken
  // when the warning first fired (undoes every protected change made since).
  const revertEdmsPanel = () => {
    if (!edmsWarn) return;
    const { panelId, snapshot } = edmsWarn;
    apply((old) => ({ ...old, panels: old.panels.map((p) => (p.id === panelId ? snapshot : p)) }));
    setEdmsWarn(null);
  };

  const addPanel = () => {
    if (readOnly) return;
    // A new panel starts from whatever was chosen on the Specs tab, so the
    // project-wide fields don't have to be re-picked for every panel.
    const p = withProjectSpecs(newPanel(s.panels.length + 1), s.projectSpecs);
    if (coWork && user?.id) p.ownerId = user.id; // co-work: a new panel belongs to its creator
    apply((old) => ({ ...old, panels: [...old.panels, p], selectedId: p.id }));
    setTab("panels");
  };

  // Bulk import from Excel: map each parsed record to a real panel (a fresh
  // newPanel with the project-wide specs, then the imported fields on top) and
  // APPEND them all in one write. Existing panels are untouched. A dropdown value
  // is snapped to its canonical option when it matches; otherwise the raw text is
  // kept (it shows on the panel and can be fixed there). Components aren't built
  // here — an imported panel comes in with its details, then its parts are added.
  const importPanels = (imported: ImportedPanel[]) => {
    if (readOnly || !imported.length) return;
    const norm = (x: string) => x.toLowerCase().replace(/[°˚º]/g, "°").replace(/\s+/g, "");
    const toOption = (raw: unknown, opts: readonly string[]): string => {
      const v = String(raw ?? "").trim();
      if (!v) return "";
      return opts.find((o) => norm(o) === norm(v)) ?? v;
    };
    const toFamily = (raw?: string): string | null => {
      const v = String(raw ?? "").trim();
      if (!v) return null;
      const key = v.toLowerCase();
      if (/^local(\s*\(sheet metal\))?$/.test(key) || key === "sheet metal") return "Local (Sheet Metal)";
      return PANEL_SYSTEMS.find((f) => f.toLowerCase() === key) ?? null;
    };
    // Resolve components by REFERENCE (descriptions vary and can't be matched).
    const byRef = new Map<string, DbComponent>();
    for (const c of COMPONENTS) if (c.ref) byRef.set(c.ref.trim().toLowerCase(), c);
    // The chosen enclosure box, as a Panels-mode item. Dimension-named families
    // (SR-Basic / Unikit / Local, e.g. 1400×800×300) match on H×W×D. Reference-named
    // families (Minicenter / Primo / Pillars) carry no dimensions, so their box is
    // matched by NAME instead ("24 line" → "24 line - 160A RAL 7035"). Null if the
    // size isn't given or doesn't resolve (the family stays selected, box left unpicked).
    const enclosureItem = (fam: string, sizeStr?: string): PanelTypeItem | null => {
      const raw = String(sizeStr ?? "").trim();
      if (!raw) return null;
      const famEnc = ENCLOSURES.filter((e) => e.fam === fam);
      let best: DbEnclosure | undefined;
      const dims = parseEnclDims(raw);
      if (dims) {
        for (const e of famEnc) {
          const d = parseEnclDims(e.name);
          if (!d || d.H !== dims.H || d.W !== dims.W || d.D !== dims.D) continue;
          if (!best || /^\d/.test((e.name || "").trim())) best = e;
        }
      }
      if (!best) {
        // No dimensions — match the box name (spacing-insensitive), exact first then
        // by prefix, so a short "24 line" still finds "24 line - 160A RAL 7035".
        const q = raw.toLowerCase().replace(/\s+/g, "");
        best = famEnc.find((e) => (e.name || "").toLowerCase().replace(/\s+/g, "") === q)
            ?? famEnc.find((e) => (e.name || "").toLowerCase().replace(/\s+/g, "").startsWith(q));
      }
      if (!best) return null;
      return { id: uid(), slot: 1, fam: best.fam, name: best.name, ref: best.ref, ip: String((best as { ip?: unknown }).ip ?? ""), eur: best.eur, egp: best.egp, qty: 1 };
    };
    apply((old) => {
      const panels = [...old.panels];
      let selectedId = old.selectedId;
      for (const rec of imported) {
        const p = withProjectSpecs(newPanel(), old.projectSpecs);
        if (rec.panelName) p.name = uniquePanelName(String(rec.panelName), panels);
        if (rec.quantity !== undefined && String(rec.quantity) !== "") {
          const q = Number(String(rec.quantity).replace(/[^\d.]/g, ""));
          if (Number.isFinite(q) && q > 0) p.qty = q;
        }
        if (rec.fedFrom) p.fedFrom = String(rec.fedFrom);
        if (rec.shortCircuit) p.shortCircuit = String(rec.shortCircuit);
        if (rec.copper) p.copperType = toOption(rec.copper, COPPER_TYPES);
        if (rec.incomingCables) p.incomingCables = toOption(rec.incomingCables, INCOMING_CABLES);
        if (rec.outgoingCables) p.outgoingCables = toOption(rec.outgoingCables, OUTGOING_CABLES);
        if (rec.ambTemp) p.ambTemp = toOption(rec.ambTemp, AMB_TEMPS);
        if (rec.neutral) p.neutral = toOption(rec.neutral, NEUTRAL_EARTH);
        if (rec.earth) p.earth = toOption(rec.earth, NEUTRAL_EARTH);
        if (rec.form) p.form = toOption(rec.form, FORMS);
        if (rec.busbarRating) {
          const amps = (String(rec.busbarRating).match(/(\d[\d,]*)\s*a\b/i) || [])[1];
          if (amps) { const n = Number(amps.replace(/,/g, "")); if (Number.isFinite(n) && n > 0) p.ratingA = n; }
        }
        // Panel type / enclosure — select it, so the panel isn't left "unsized".
        // A Panels-mode family (SR-Basic, Unikit, Local …) sets sizingMode "panels"
        // + family + layout, and the chosen box if it resolves. A cell type
        // (Pro-E / IS2 / PLP) switches to Cells with that type.
        const famRaw = String(rec.panelType ?? "").trim();
        const fam = toFamily(famRaw);
        const cellTypeRaw = String(rec.cellType || famRaw).trim();
        const cellType = CELL_SYSTEMS.find((t) => t.toLowerCase() === cellTypeRaw.toLowerCase());
        if (cellType) {
          // Cells mode: build the cell table for the type/depth/IP and fill the
          // quantities from the file (matched by cell-size label, spacing-tolerant).
          const depth = rec.cellDepth ?? (cellType === "IS2" ? 60 : 70);
          const ip = rec.cellIp || (cellType === "Pro-E" ? "IP65" : "IP54");
          const normDesc = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
          const qtyByDesc = new Map((rec.cells ?? []).map((c) => [normDesc(c.desc), c.qty]));
          const rows = cellTable(cellType as CellType, depth, "1.5", ip).map((r) => {
            if (r.locked) return { ...r };
            const q = qtyByDesc.get(normDesc(r.desc));
            return q != null ? { ...r, qty: q } : r;
          });
          p.sizingMode = "cells";
          p.cellConfig = { type: cellType as CellType, depth, thickness: "1.5", ip, rows };
        } else if (fam) {
          const isDouble = rec.layout === "Double";
          p.sizingMode = "panels";
          p.panelsSizing = { ...p.panelsSizing, family: fam, layout: isDouble ? "Double" : "Single" };
          const item = enclosureItem(fam, rec.enclosureSize);
          // Double layout has a second enclosure slot — mirror the first box into it.
          if (item) p.panelItems = isDouble ? [item, { ...item, id: uid(), slot: 2 }] : [item];
        }
        // Main-busbar copper from the Copper Tool sheet (cell panels) — sets the copper
        // lengths and the resulting busbar weight.
        if (cellType && rec.busbarCopper && Object.keys(rec.busbarCopper).length) {
          p.copperTool = { ...rec.busbarCopper };
          p.mainBusbarKg = Math.round(copperTotal(cellType as CellType, rec.busbarCopper) * 10) / 10;
          p.mainBusbarOverride = false;
        }
        // Component list: resolve each by reference (price/brand from the catalogue);
        // an unknown or blank reference becomes a free line — kept, never dropped.
        if (rec.components && rec.components.length) {
          const secs = [...p.sections];
          const comps: PanelComponent[] = [];
          for (const ic of rec.components) {
            const sec = String(ic.section ?? "").trim() || "Main Incoming";
            if (!secs.includes(sec)) secs.push(sec);
            const q = Number(String(ic.qty).replace(/[^\d.]/g, "")) || 1;
            const ref = String(ic.reference ?? "").trim().toLowerCase();
            const db = ref ? byRef.get(ref) : undefined;
            comps.push(db ? toPanelComponent(db, sec, q) : freeComponent(String(ic.description || ic.reference || "(component)"), sec, q));
          }
          if (comps.length) { p.sections = secs; p.components = comps; p.activeSection = comps[0].section; }
        }
        if (coWork && user?.id) p.ownerId = user.id;
        panels.push(p);
        selectedId = p.id;
      }
      return { ...old, panels, selectedId };
    });
    setTab("panels");
  };

  // Known component REFERENCES for the import's unknown-component check (matched by
  // reference, not description — descriptions vary and can't be matched reliably).
  const knownComponentRefs = useMemo(() => {
    const s = new Set<string>();
    for (const c of COMPONENTS) if (c.ref) s.add(c.ref);
    return [...s];
  }, []);

  // Add a "Spare parts" cell — both from a spare QTN's list and from a panels QTN
  // ("+ Add spare parts"). It selects the new cell so its Spare editor shows at once,
  // staying on whichever list tab is active.
  const addSpareCell = (kind = "spare") => {
    if (readOnly) return;
    const c = newSparePanel(kind);
    if (coWork && user?.id) c.ownerId = user.id; // co-work: a new cell belongs to its creator
    apply((old) => {
      // These cells arrive pre-named from a fixed label ("Spare parts" / "LCP" /
      // "KWHM"), so a second one of a kind used to be an exact duplicate of the first
      // with nothing typed at all. The app named it, so the app resolves it — "LCP-1",
      // the same "<base>-N" scheme a duplicated panel uses. The section keeps the plain
      // label; only the printed panel name is suffixed.
      const named = { ...c, name: uniquePanelName(c.name, old.panels) };
      return { ...old, panels: [...old.panels, named], selectedId: named.id };
    });
    setTab(isSpareQtn ? "spare" : "panels");
  };
  const removePanel = (id: string) => {
    if (readOnly) return;
    // Co-Work: you can delete only your own panels.
    if (coWork && panelOwnerOf(s.panels.find((p) => p.id === id)) !== user?.id) return;
    apply((old) => {
      const panels = old.panels.filter((p) => p.id !== id);
      return { ...old, panels, selectedId: panels[0]?.id ?? null };
    });
  };
  const clonePanel = (id: string) => {
    if (readOnly) return;
    // Co-Work: you can duplicate only your own panels; the copy is yours too.
    if (coWork && panelOwnerOf(s.panels.find((p) => p.id === id)) !== user?.id) return;
    apply((old) => {
      const src = old.panels.find((p) => p.id === id);
      if (!src) return old;
      const copy = duplicatePanel(src, nextDuplicateName(src.name, old.panels));
      if (coWork && user?.id) copy.ownerId = user.id;
      const i = old.panels.findIndex((p) => p.id === id);
      const panels = [...old.panels];
      panels.splice(i + 1, 0, copy);
      return { ...old, panels, selectedId: copy.id };
    });
  };

  // Per-tab memory: remember each tab's scroll position (and the last active tab
  // for this QTN), and restore them when you return — instead of resetting.
  const scrollByTab = useRef<Record<string, number>>({});
  const jumpPanelRef = useRef<string | null>(null); // panel to reveal after switching to the Technical Offer
  const goToTab = (t: Tab) => {
    scrollByTab.current[tab] = window.scrollY; // remember where we were on this tab
    localStorage.setItem(tabKey, t);
    setTab(t);
  };
  // "Open in Technical Offer" from a panel: switch to the offer tab, then scroll that panel's page into view.
  const openPanelInOffer = (panelId: string) => { jumpPanelRef.current = panelId; goToTab("technical"); };
  // "Back to panel" from a Technical-Offer page: select that panel and switch to the
  // Panels tab (or the Spare Parts editor on a spare-parts QTN).
  const openPanelInPanels = (panelId: string) => { up({ selectedId: panelId }); goToTab(isSpareQtn ? "spare" : "panels"); };
  useLayoutEffect(() => {
    const jump = jumpPanelRef.current;
    if (jump && tab === "technical") {
      jumpPanelRef.current = null;
      const el = document.querySelector<HTMLElement>(`[data-offer-panel="${CSS.escape(jump)}"]`);
      if (el) { window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 76)); return; } // 76px ≈ sticky tab header
    }
    window.scrollTo(0, scrollByTab.current[tab] ?? 0); // restore the entered tab's position
  }, [tab]);

  // Arrow-key navigation between form fields, based on their on-screen layout —
  // fast keyboard data entry. Left/Right move the text cursor first (navigate
  // only at the start/end); Up/Down navigate. For a CLOSED dropdown (<select>)
  // the arrows navigate too and the native value-cycling is suppressed — the
  // value only changes once the dropdown is opened (Alt+Down / click), after
  // which the OS popup handles the arrows (this handler no longer fires).
  const navRef = useRef<HTMLDivElement>(null);

  // The QTN loads asynchronously, so every hook above must run on every render;
  // only now — after the last hook — may we early-return the loading state.
  if (loading || !rec) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  const onFieldArrowNav = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return; // Alt+Down opens the select natively
    const el = document.activeElement as HTMLElement | null;
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "SELECT")) return;
    const isSelect = el.tagName === "SELECT";
    // Enter advances to the next field in reading order (Excel-style).
    if (e.key === "Enter") {
      const fields = navigableFields(navRef.current);
      const idx = fields.indexOf(el);
      if (idx >= 0 && idx < fields.length - 1) {
        e.preventDefault();
        const next = fields[idx + 1] as HTMLInputElement;
        next.focus();
        if (next.tagName === "INPUT" && typeof next.selectionStart === "number") next.select();
      }
      return;
    }
    const key = e.key as ArrowKey;
    if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight") return;
    const horiz = key === "ArrowLeft" || key === "ArrowRight";
    if (!isSelect && horiz) {
      const inp = el as HTMLInputElement;
      if (typeof inp.selectionStart === "number") { // textual input → move cursor first
        const atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
        const atEnd = inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length;
        if (key === "ArrowLeft" && !atStart) return;
        if (key === "ArrowRight" && !atEnd) return;
      }
    }
    const target = nearestField(el, navigableFields(navRef.current), key);
    // On a closed dropdown, always suppress the native value change — even when
    // there is no neighbouring field to move to.
    if (isSelect) e.preventDefault();
    if (!target) return;
    e.preventDefault();
    target.focus();
    if (target.tagName === "INPUT" && typeof (target as HTMLInputElement).selectionStart === "number") (target as HTMLInputElement).select();
  };

  return (
    <div>
      <div className={`mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-up no-print ${
        headerPinned ? "sticky top-0 z-40 -mx-4 border-b border-line/60 bg-surface px-4 py-3 sm:-mx-6 sm:px-6" : ""
      }`}>
        <div>
          <div className="flex items-center gap-3">
            <Link to="/lv" className="text-xs font-semibold text-brand hover:underline">← All QTNs</Link>
            <button
              type="button"
              onClick={() => setHeaderPinned((v) => !v)}
              aria-pressed={headerPinned}
              title={headerPinned
                ? "Unpin — let this bar scroll away with the page"
                : "Pin — keep the number, price and buttons visible while you scroll"}
              className={`text-xs font-semibold hover:underline ${headerPinned ? "text-brand" : "text-muted"}`}
            >
              {headerPinned ? "📌 Pinned" : "📌 Pin"}
            </button>
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
            <span className="code-chip">{qtnNum}</span>
            {s.project.name || "LV Quotation"}
          </h1>
          <p className="text-sm text-muted">
            {fmtEgp(totals.sell)} EGP excl. VAT
            {totals.sell > 0 && <> · <strong className="text-ink">{fmtEgp(totals.incl)}</strong> incl. {Math.round(s.factors.vat * 100)}% VAT</>}
          </p>
          {/* Workflow stage, under the price — it belongs with the quotation's own
              details rather than among the buttons that act on it. */}
          {/* text-sm (14px) rather than text-xs (12px) — the 2px the owner asked for. */}
          <span className={`mt-2 inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-bold ${QTN_STATUS_STYLE[status]}`}
            title={`Workflow stage: ${QTN_STATUS_LABEL[status]}`}>
            {QTN_STATUS_LABEL[status]}
          </span>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* The action buttons and the Share dropdown form their own group, sized by
              `w-max` to the buttons' natural width — so the dropdown below spans exactly
              their combined width. It has to be a separate group: the ERP / Check-for-
              updates row underneath is wider, and would otherwise stretch the dropdown
              past the buttons. Widths are not fixed per button because the set changes
              with the workflow stage. */}
          <div className="flex w-max flex-col items-stretch gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="btn-ghost" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
            <button className="btn-ghost" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
            {/* Only the moves this user may actually make. */}
            {!cancelled && (status === "DRAFT" || status === "RETURNED") && (
              <button className="btn-primary" disabled={submitting} onClick={sendForApproval}>
                {submitting ? "Sending…" : "Send for approval"}
              </button>
            )}
            {!cancelled && status === "WAITING_APPROVAL" && canApprove && (
              <button className="btn-primary" disabled={submitting} onClick={() => doTransition("APPROVED", {
                confirm: {
                  title: "Approve this quotation",
                  message: "The creator will be notified that it is ready to submit.",
                  confirmLabel: "Approve",
                },
              })}>
                ✓ Approve
              </button>
            )}
            {!cancelled && status === "APPROVED" && (
              <button className="btn-primary" disabled={submitting} onClick={() => doTransition("SUBMITTED", {
                confirm: {
                  title: "Submit this quotation",
                  message: "This is final. The quotation becomes read-only and can only be changed by reopening it.",
                  confirmLabel: "Submit",
                  tone: "danger",
                },
              })}>
                {submitting ? "Submitting…" : "✓ Submit"}
              </button>
            )}
            {status === "SUBMITTED" && (
              // One primary control, two ways out: Outlook e-mail or WhatsApp. Modelled
              // on the Share dropdown below so the header stays consistent; it never
              // holds a value — picking an option fires that sender and snaps back.
              <select
                value=""
                disabled={sendingOffers}
                title="Send the Technical & Commercial offers to the sales person — by Outlook e-mail or WhatsApp"
                className="btn-primary cursor-pointer disabled:opacity-60"
                onChange={(e) => {
                  const v = e.target.value;
                  e.target.value = "";
                  if (v === "outlook") void sendToSales();
                  if (v === "whatsapp") void sendViaWhatsApp();
                }}
              >
                <option value="">
                  {sendingOffers ? "Preparing offers…" : `➤ Send to ${s.project.salesPerson.trim().split(/\s+/)[0] || "Sales"}…`}
                </option>
                <option value="outlook">📧 Outlook — e-mail, with the two PDFs</option>
                <option value="whatsapp">🟢 WhatsApp — message, with the two PDFs</option>
              </select>
            )}
          </div>
          {/* Hand over and Co-Work both answer "give this to someone else", so they
              share one dropdown, on its own line under the action buttons and matching
              their width. It stays on its placeholder — picking an entry opens that
              dialog rather than setting a value. Only the options the user is allowed
              to use are listed, so the permissions behave exactly as before. */}
          {!cancelled && (canReassign || canCoWork) && status !== "SUBMITTED" && (
            <select
              className={`btn-ghost w-0 min-w-full cursor-pointer ${coWork ? "text-brand-dark" : ""}`}
              value=""
              title="Hand this quotation to someone else, or build it together"
              onChange={(e) => {
                if (e.target.value === "handover") setReassignOpen(true);
                if (e.target.value === "cowork") setCoWorkOpen(true);
              }}
            >
              <option value="">{coWork ? "👥 Shared ✓" : "👥 Share…"}</option>
              {canReassign && <option value="handover">⇄ Hand over — give it to someone else</option>}
              {canCoWork && <option value="cowork">👥 Co-Work{coWork ? " ✓" : ""} — build it together, split by panel</option>}
            </select>
          )}
          </div>
          {/* Second row: the secondary workflow moves — Return for revision, Withdraw,
              Reopen — alongside the file/refresh actions. Keeping them out of the top
              row means it is always the same three controls (Undo, Redo, and the one
              main action for this stage) with Share spanning them, whatever the
              workflow stage. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!cancelled && status === "WAITING_APPROVAL" && canReturn && (
              <button className="btn-ghost" disabled={submitting} onClick={() => setReturnOpen(true)}>
                ↩ Return for revision
              </button>
            )}
            {!cancelled && status === "WAITING_APPROVAL" && isOwner && (
              <button className="btn-ghost" disabled={submitting} onClick={() => doTransition("DRAFT", {
                confirm: {
                  title: "Withdraw from approval",
                  message: "It goes back to draft and you can edit it again. Whoever was reviewing it will no longer see it in their queue.",
                  confirmLabel: "Withdraw",
                },
              })}>
                Withdraw
              </button>
            )}
            {status === "SUBMITTED" && canReopen && (
              <button className="btn-ghost" disabled={submitting} onClick={() => doTransition("DRAFT", {
                confirm: {
                  title: "Reopen for editing",
                  message: "This submitted quotation goes back to draft so it can be changed. The offer already sent to the customer is not affected.",
                  confirmLabel: "Reopen",
                },
              })}>
                🔓 Reopen
              </button>
            )}
            {erpCount > 0 && (
              <button onClick={exportErpCsv}
                title={`Download ${erpCount} panel${erpCount > 1 ? "s" : ""} as an ERPNext "Bulk Edit Items" CSV for your ERP`}
                className="rounded-full border border-brand bg-white px-4 py-1.5 text-xs font-bold text-brand-dark hover:bg-brand-light no-print">
                ⬇ ERP CSV
              </button>
            )}
            <CatalogUpdateCheck onApply={readOnly ? undefined : applyCatalogPrices} />
          </div>
        </div>
      </div>

      {/* Cancellation and workflow status are INDEPENDENT. They used to be an
          either/or, so a cancelled+submitted quotation showed only the red banner
          and lost its reopen action entirely — unrecoverable through the UI. */}
      {cancelled && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 no-print animate-fade-up">
          <p className="text-sm font-semibold text-red-800">
            🚫 This revision was cancelled by a newer amendment — read-only.
          </p>
        </div>
      )}
      {wfError && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 no-print animate-fade-up">
          <p className="text-sm font-semibold text-red-800">⚠ {wfError}</p>
        </div>
      )}
      {/* Themed replacement for window.confirm — renders only while one is open. */}
      {confirmModal}
      {/* The offer-export warnings, shown before a quotation is sent for approval. */}
      {approvalWarns && (
        <ExportWarnModal
          checks={approvalWarns}
          title="Review before sending for approval"
          subtitle="These are the same checks the offer runs. You won't be able to edit this quotation while it is under review — fix them first, or send anyway."
          proceedLabel="Send anyway"
          onClose={() => setApprovalWarns(null)}
          onProceed={() => { setApprovalWarns(null); runSendForApproval(true); }}
        />
      )}
      <ReturnForRevisionModal
        open={returnOpen}
        title={`${qtnNum}${s.project?.name ? ` · ${s.project.name}` : ""}`}
        panels={s.panels.map((p) => ({ id: p.id, name: p.name }))}
        onCancel={() => setReturnOpen(false)}
        onReturn={submitReturn}
      />
      <EdmsStandardWarningModal
        open={!!edmsWarn}
        userName={user?.name}
        onRevert={revertEdmsPanel}
        onAcknowledge={() => setEdmsWarn(null)}
      />
      {/* Second appearance: the extra recheck confirmation on Send for approval. */}
      <EdmsStandardWarningModal
        open={edmsSendConfirm}
        userName={user?.name}
        subtitle={<>You changed a <strong>standard</strong> panel. Before it goes for approval, recheck the sizing, copper and EDMS approval.</>}
        revertLabel="Not yet"
        acknowledgeLabel="Send for approval"
        onClose={() => setEdmsSendConfirm(false)}
        onRevert={() => setEdmsSendConfirm(false)}
        onAcknowledge={() => { setEdmsSendConfirm(false); proceedSend(); }}
      />
      <ReassignQtnModal
        open={reassignOpen}
        qtnNumber={qtnNum}
        onCancel={() => setReassignOpen(false)}
        onReassign={doReassign}
      />
      <CoWorkModal
        open={coWorkOpen}
        qtnNumber={qtnNum}
        current={coOwners}
        onCancel={() => setCoWorkOpen(false)}
        onSet={doSetCoWorkers}
      />
      {status === "RETURNED" && wf.returnReason && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 no-print animate-fade-up">
          <p className="text-sm font-bold text-red-800">↩ Returned for revision</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-red-800">{wf.returnReason}</p>
          {wf.approverEmail && <p className="mt-1 text-[11px] text-red-700">— {wf.approverEmail}</p>}
        </div>
      )}
      {status === "WAITING_APPROVAL" && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 no-print animate-fade-up">
          <p className="text-sm font-semibold text-amber-800">
            🔒 Waiting for approval — locked while it is under review.
          </p>
        </div>
      )}
      {status === "APPROVED" && (
        <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 no-print animate-fade-up">
          <p className="text-sm font-semibold text-sky-800">
            ✓ Approved{wf.approverEmail ? ` by ${wf.approverEmail}` : ""} — ready for final submission.
          </p>
        </div>
      )}
      {status === "SUBMITTED" && (
        <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 no-print animate-fade-up">
          <p className="text-sm font-semibold text-green-800">
            🔒 Submitted and read-only.{canReopen ? " Reopen it to make changes." : ""}
          </p>
        </div>
      )}

      {/* Tabs — sticky header so sections are reachable without scrolling up.
          Negative margins let the bg band span the full content width; py keeps a
          solid band so content scrolls cleanly underneath. */}
      {/* Sticky on its own, but not while the header above is pinned — two sticky
          bars at top-0 would sit on top of each other. */}
      <div className={`-mx-4 mb-4 flex flex-wrap gap-1.5 border-b border-line/60 bg-surface px-4 py-2.5 no-print sm:-mx-6 sm:px-6 ${
        headerPinned ? "" : "sticky top-0 z-30"
      }`}>
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => goToTab(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              activeTab === t ? "border-brand bg-brand text-white shadow-soft" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {coWork && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand-tint/60 px-4 py-3 text-sm no-print">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">Co-Work</span>
            <span className="font-semibold text-ink">{teamLabel}</span>
            <span className="text-muted">
              {isPrimary
                ? "You edit the shared tabs and your own panels — each panel is tagged with its owner."
                : "You edit only your own panels; the shared tabs (Project, Pricing, Specs, Terms) belong to the owner."}
            </span>
          </div>
          {sel && !canEditPanel(sel) && !readOnly && (activeTab === "panels" || activeTab === "spare") && (
            <div className="mt-1.5 font-medium text-brand-dark">
              The selected panel belongs to {selPanelOwnerName || "someone else"} — read-only for you.
            </div>
          )}
        </div>
      )}

      <div ref={navRef} onKeyDown={onFieldArrowNav}>
        {activeTab === "project" && <ProjectTab s={s} up={up} qtnNum={qtnNum} onRenameQtn={renameQtnNumber} />}
        {activeTab === "pricing" && <PricingTab s={s} up={up} />}
        {activeTab === "specs" && <SpecsTab s={s} up={up} qtnId={rec?.id ?? ""} readOnly={sharedReadOnly} />}
        {activeTab === "panels" && (
          <PanelsTab s={s} sel={sel} up={up} upPanel={upPanel} panelBadge={panelBadge} freshIds={freshPanels}
            onAdd={addPanel} onDel={removePanel} onClone={clonePanel} onOpenInOffer={openPanelInOffer}
            onAddSpare={isEdmsQtn ? undefined : addSpareCell}
            onImport={readOnly ? undefined : importPanels} knownComponentRefs={knownComponentRefs} />
        )}
        {activeTab === "spare" && (
          <PanelsTab s={s} sel={sel} up={up} upPanel={upPanel} panelBadge={panelBadge} freshIds={freshPanels}
            onAdd={() => addSpareCell("spare")} onDel={removePanel} onClone={clonePanel} onOpenInOffer={openPanelInOffer}
            addLabel="+ Add cell" emptyLabel="No spare cells yet." emptyAddLabel="+ Add your first cell" />
        )}
        {activeTab === "technical" && (offerIssues.length ? <OfferBlocked issues={offerIssues} /> : <TechnicalTab s={s} qtnNo={qtnNum} up={up} onBackToPanel={openPanelInPanels} />)}
        {activeTab === "commercial" && (offerIssues.length ? <OfferBlocked issues={offerIssues} /> : <CommercialTab s={s} qtnNo={qtnNum} up={up} />)}
        {activeTab === "material" && (offerIssues.length ? <OfferBlocked issues={offerIssues} /> : <MaterialTab s={s} qtnNo={qtnNum} abbOnly={matAbbOnly} setAbbOnly={setMatAbbOnly} up={up} />)}
        {activeTab === "selectivity" && <SelectivityTab s={s} upPanel={upPanel} />}
        {activeTab === "summary" && <SummaryTab s={s} up={up} />}
      </div>
    </div>
  );
}

// dd/mm/yyyy display for an ISO yyyy-mm-dd date string (RPT-1).
function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

// RPT-1: a panel needs a name and an incoming C.B rating before any output.
function panelInvalid(p: LvPanel): string[] {
  const out: string[] = [];
  if (!p.name.trim()) out.push("Panel name is required");
  if (!p.ratingA || p.ratingA <= 0) out.push("Busbar Rating is required");
  return out;
}
// A name a PERSON typed is never rewritten or refused mid-word — being overruled while
// typing is worse than being told. The field goes red and says whose name it already is,
// and the offer tabs stay blocked until it is changed, so the clash cannot reach paper.
const nameClashOf = (s: LvState, p: LvPanel) => panelNameOwner(p.name, s.panels, p.id);
function PanelNameClash({ s, p }: { s: LvState; p: LvPanel }) {
  const twin = nameClashOf(s, p);
  if (!twin) return null;
  return <p className="mt-1 text-[11px] font-semibold text-red-600">⚠ {panelNameClashMessage(twin, s.panels)}</p>;
}
function OfferBlocked({ issues }: { issues: string[] }) {
  return (
    <div className="card border-amber-300 bg-amber-50 p-6 animate-fade-up">
      <p className="font-bold text-amber-800">⚠ Complete the required fields before generating any offer.</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-700">
        {issues.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </div>
  );
}

// ── Specs ───────────────────────────────────────────────────────────────────
// The project's specification, in one place: the panel fields that are normally
// identical across a job, the written spec, the client's comments, and the
// client's files. Everything here is saved with the QTN, so whoever opens the
// quotation sees the same data.

/** The panel fields the Specs tab drives project-wide, with their option lists. */
const SPEC_FIELDS: readonly (readonly [ProjectSpecKey, string, readonly string[]])[] = [
  ["ambTemp", "Amb. temp", AMB_TEMPS],
  ["form", "Form", FORMS],
  ["neutral", "Neutral", NEUTRAL_EARTH],
  ["earth", "Earth", NEUTRAL_EARTH],
  ["copperType", "Copper", COPPER_TYPES],
  ["incomingCables", "Incoming cables", INCOMING_CABLES],
  ["outgoingCables", "Outgoing cables", OUTGOING_CABLES],
];
// The value a brand-new panel starts with — the fallback shown before anything is
// chosen here and while a QTN still has no panels.
const SPEC_FALLBACK = newPanel();

/** Human file size for the attachments list. */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
/** A picked file as plain base64 — FileReader yields a data: URL, so drop its prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

/** A two-level add / edit / remove list: headers, each holding sub-titles.
 *  "Specs" and "Comments of Client" behave identically, so they share this.
 *  `defaults` (Specs only) offers the standard headers with one press. */
function SpecNoteList({ heading, hint, addLabel, headerPlaceholder, notes, onChange, readOnly, defaults }: {
  heading: string; hint: string; addLabel: string; headerPlaceholder: string;
  notes: SpecNote[]; onChange: (next: SpecNote[]) => void; readOnly: boolean;
  defaults?: () => SpecNote[];
}) {
  const add = () => onChange([...notes, { id: uid(), title: "", text: "", items: [] }]);
  const patch = (id: string, p: Partial<SpecNote>) =>
    onChange(notes.map((n) => (n.id === id ? { ...n, ...p } : n)));
  const remove = (id: string) => onChange(notes.filter((n) => n.id !== id));
  // Sub-titles live on their header, so every sub edit is a patch of that header.
  const subs = (n: SpecNote) => n.items ?? [];
  const addSub = (n: SpecNote) => patch(n.id, { items: [...subs(n), { id: uid(), title: "", text: "" }] });
  const patchSub = (n: SpecNote, sid: string, p: Partial<SpecSubNote>) =>
    patch(n.id, { items: subs(n).map((it) => (it.id === sid ? { ...it, ...p } : it)) });
  const removeSub = (n: SpecNote, sid: string) =>
    patch(n.id, { items: subs(n).filter((it) => it.id !== sid) });
  // Appends only the standard headers not already in the list — never replaces
  // what is there, so pressing it twice is harmless.
  const addDefaults = () => {
    if (!defaults) return;
    const have = new Set(notes.map((n) => n.title.trim().toLowerCase()));
    const missing = defaults().filter((d) => !have.has(d.title.trim().toLowerCase()));
    if (missing.length) onChange([...notes, ...missing]);
  };
  const defaultsBtn = defaults && (
    <button type="button" onClick={addDefaults} disabled={readOnly}
      title={`Add the standard headers (${defaults().map((d) => d.title).join(", ")}) that aren't listed yet`}
      className="btn-ghost shrink-0 disabled:opacity-40">+ Standard headers</button>
  );
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="sec-head mb-0">{heading}</h2>
          <p className="mt-1 text-xs text-muted">{hint}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {defaultsBtn}
          <button type="button" onClick={add} disabled={readOnly}
            className="btn-ghost shrink-0 disabled:opacity-40">{addLabel}</button>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="mt-3 rounded-lg bg-surface p-6 text-center text-sm text-muted">
          Nothing yet — press <b>{addLabel}</b>{defaults ? <> or <b>+ Standard headers</b></> : null}.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {notes.map((n, i) => (
            <li key={n.id} className="rounded-lg border border-line bg-surface/40 p-3">
              {/* Header */}
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-xs font-bold text-muted">{i + 1}.</span>
                <input className="input flex-1 font-bold" value={n.title} disabled={readOnly}
                  placeholder={headerPlaceholder} onChange={(e) => patch(n.id, { title: e.target.value })} />
                <button type="button" onClick={() => addSub(n)} disabled={readOnly}
                  title="Add a sub-title under this header"
                  className="shrink-0 rounded px-2 py-1 text-[11px] font-bold text-brand hover:bg-white disabled:opacity-40">+ Sub-title</button>
                <button type="button" onClick={() => remove(n.id)} disabled={readOnly}
                  title="Remove this header and everything under it"
                  className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-white hover:text-red-600 disabled:opacity-40">✕</button>
              </div>
              {/* The header's own note — kept for entries written before sub-titles
                  existed, so it only appears once it holds text. */}
              {n.text && (
                <div className="mt-2 pl-7">
                  <AutoTextarea value={n.text} disabled={readOnly}
                    onChange={(v) => patch(n.id, { text: v })} />
                </div>
              )}
              {/* Sub-titles */}
              {subs(n).length > 0 && (
                <ol className="mt-2 space-y-1.5 pl-7">
                  {subs(n).map((it, j) => (
                    <li key={it.id} className="rounded-md border border-line/70 bg-white p-2">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-[11px] font-bold text-muted">{i + 1}.{j + 1}</span>
                        <input className="input flex-1" value={it.title} disabled={readOnly}
                          placeholder="Sub-title" onChange={(e) => patchSub(n, it.id, { title: e.target.value })} />
                        <button type="button" onClick={() => removeSub(n, it.id)} disabled={readOnly}
                          title="Remove this sub-title"
                          className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-surface hover:text-red-600 disabled:opacity-40">✕</button>
                      </div>
                      <div className="mt-1.5 pl-8">
                        <AutoTextarea value={it.text} disabled={readOnly} placeholder="Write the specification…"
                          onChange={(v) => patchSub(n, it.id, { text: v })} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The client's files. These live in their own table on the server (not in the
 *  QTN state, which is re-saved on every keystroke), so they are fetched and
 *  uploaded separately from everything else on this tab. */
function AttachmentsCard({ qtnId, readOnly }: { qtnId: string; readOnly: boolean }) {
  const { confirm, dialogs } = useDialogs();
  const [files, setFiles] = useState<QtnAttachmentDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!qtnId) return;
    let alive = true;
    api.qtns.attachments
      .list(qtnId)
      .then((r) => { if (alive) setFiles(r); })
      .catch(() => { if (alive) { setFiles([]); setError("Could not load the attachments."); } });
    return () => { alive = false; };
  }, [qtnId]);

  const onPicked = async (picked: FileList | null) => {
    if (!picked?.length || !qtnId) return;
    setBusy(true);
    setError("");
    // One at a time: each file is its own request, and the first failure (usually
    // "too large") should not lose the ones that already went up.
    for (const f of Array.from(picked)) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${f.name}" is ${fmtBytes(f.size)} — the limit is ${fmtBytes(MAX_ATTACHMENT_BYTES)} per file.`);
        continue;
      }
      try {
        const data = await fileToBase64(f);
        const row = await api.qtns.attachments.upload(qtnId, {
          name: f.name, mime: f.type || "application/octet-stream", data,
        });
        setFiles((prev) => [...(prev ?? []), row]);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not upload "${f.name}".`);
      }
    }
    setBusy(false);
    if (pick.current) pick.current.value = ""; // so re-picking the same file fires onChange
  };

  const remove = async (f: QtnAttachmentDto) => {
    if (
      !(await confirm({
        title: "Remove this file",
        message: `"${f.name}" is removed from this quotation.`,
        confirmLabel: "Remove",
        tone: "danger",
      }))
    )
      return;
    try {
      await api.qtns.attachments.remove(qtnId, f.id);
      setFiles((prev) => (prev ?? []).filter((x) => x.id !== f.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the file.");
    }
  };

  return (
    <div className="card p-5">
      {dialogs}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="sec-head mb-0">Attachments</h2>
          <p className="mt-1 text-xs text-muted">
            Client specifications, drawings, e-mails — saved with the QTN, so they open with it.
            Up to {fmtBytes(MAX_ATTACHMENT_BYTES)} per file.
          </p>
        </div>
        <button type="button" onClick={() => pick.current?.click()} disabled={readOnly || busy || !qtnId}
          className="btn-ghost shrink-0 disabled:opacity-40">{busy ? "Uploading…" : "+ Upload files"}</button>
        <input ref={pick} type="file" multiple className="hidden"
          onChange={(e) => onPicked(e.target.files)} />
      </div>
      {error && (
        <p className="mt-3 rounded-md border border-red-400/50 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-600">
          {error}
        </p>
      )}
      {files === null ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : files.length === 0 ? (
        <p className="mt-3 rounded-lg bg-surface p-6 text-center text-sm text-muted">
          No files attached yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <a href={api.qtns.attachments.link(qtnId, f.id)} target="_blank" rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-semibold text-ink hover:text-brand-dark hover:underline"
                title={`Open ${f.name}`}>
                {f.name}
              </a>
              <span className="shrink-0 text-xs text-muted">{fmtBytes(f.size)}</span>
              <span className="hidden shrink-0 text-xs text-muted sm:inline">
                {f.byEmail || "—"} · {fmtDate(String(f.createdAt).slice(0, 10))}
              </span>
              <a href={api.qtns.attachments.link(qtnId, f.id, true)} download={f.name}
                title="Download" className="shrink-0 rounded p-1 text-muted hover:bg-surface hover:text-brand-dark">⬇</a>
              <button type="button" onClick={() => remove(f)} disabled={readOnly}
                title="Remove this file"
                className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-surface hover:text-red-600 disabled:opacity-40">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpecsTab({ s, up, qtnId, readOnly }: {
  s: LvState; up: (p: Partial<LvState>) => void; qtnId: string; readOnly: boolean;
}) {
  const targets = s.panels.filter((p) => !p.spare); // spare cells carry no specs
  // What a field reads project-wide: the explicit choice made here, else the value
  // every panel already agrees on, else what a new panel would start with.
  const shared = (key: ProjectSpecKey): string | null => {
    const live = targets.map((p) => p[key]);
    return live.length && live.every((v) => v === live[0]) ? live[0] : null;
  };
  const valueOf = (key: ProjectSpecKey) =>
    s.projectSpecs?.[key] ?? shared(key) ?? (SPEC_FALLBACK[key] as string);
  // Choosing a value applies it to every panel at once. Each panel can still be
  // changed on its own afterwards in Panel details.
  const setSpec = (key: ProjectSpecKey, v: string) =>
    up({
      projectSpecs: { ...(s.projectSpecs ?? {}), [key]: v },
      panels: s.panels.map((p) => (p.spare ? p : { ...p, [key]: v })),
    });
  // "Apply to" — push the value shown here onto CHOSEN panels instead of all of
  // them. Picking from the dropdown already sets every panel; this is how you put
  // the project value back on a few panels that were overridden in Panel details.
  const [applyOpen, setApplyOpen] = useState<ProjectSpecKey | null>(null);
  const [applySel, setApplySel] = useState<Set<string>>(() => new Set());
  const applyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!applyOpen) return;
    const onDown = (e: MouseEvent) => { if (applyRef.current && !applyRef.current.contains(e.target as Node)) setApplyOpen(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [applyOpen]);
  const doApply = (key: ProjectSpecKey) => {
    const val = valueOf(key);
    up({ panels: s.panels.map((p) => (applySel.has(p.id) ? { ...p, [key]: val } : p)) });
    setApplyOpen(null);
  };
  // One panel-backed field. Called for the first four and the last three
  // separately, so Selectivity can sit between them (it opens row 2).
  const panelField = ([key, label, options]: (typeof SPEC_FIELDS)[number], alignRight = false) => {
    const mixed = targets.length > 1 && shared(key) === null;
    const open = applyOpen === key;
    const allOn = targets.length > 0 && targets.every((p) => applySel.has(p.id));
    return (
      <div key={key} className="relative">
        <div className="flex items-baseline justify-between gap-1.5">
          <L>{label}</L>
          <span className="flex shrink-0 items-baseline gap-1.5">
            {mixed && (
              <span title="Panels currently have different values — picking one here sets them all"
                className="text-[10px] font-bold text-amber-600">mixed</span>
            )}
            {targets.length > 0 && !readOnly && (
              <button type="button" onClick={() => { setApplySel(new Set()); setApplyOpen(open ? null : key); }}
                title={`Put this ${label} on chosen panels only`}
                className="text-[10px] font-bold text-brand hover:underline">Apply to</button>
            )}
          </span>
        </div>
        <Sel value={valueOf(key)} options={options}
          onChange={(v) => { if (!readOnly) setSpec(key, v); }} />
        {open && (
          <div ref={applyRef} className={`absolute ${alignRight ? "right-0" : "left-0"} top-full z-30 mt-1 w-56 rounded-lg border border-line bg-white p-2 text-left shadow-lift`}>
            <p className="mb-1 px-0.5 text-[11px] font-bold text-ink">Apply {label} to…</p>
            <label className="flex items-center gap-1.5 border-b border-line/60 px-0.5 pb-1.5 text-xs font-semibold text-ink">
              <input type="checkbox" className="accent-brand" checked={allOn}
                onChange={() => setApplySel(allOn ? new Set() : new Set(targets.map((p) => p.id)))} />
              All panels
            </label>
            <div className="max-h-40 overflow-auto py-1">
              {targets.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 px-0.5 py-0.5 text-xs text-ink">
                  <input type="checkbox" className="accent-brand" checked={applySel.has(p.id)}
                    onChange={() => setApplySel((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                  <span className="truncate">{s.panels.indexOf(p) + 1}. {p.name.trim() || "(unnamed)"}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-1.5 border-t border-line/60 pt-1.5">
              <button type="button" onClick={() => setApplyOpen(null)}
                className="rounded px-2 py-0.5 text-[11px] font-semibold text-muted hover:text-ink">Cancel</button>
              <button type="button" disabled={applySel.size === 0} onClick={() => doApply(key)}
                className="rounded bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-brand-dark disabled:opacity-40">Apply ({applySel.size})</button>
            </div>
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="card p-5">
        <h2 className="sec-head">Project specifications</h2>
        <p className="mb-3 text-xs text-muted">
          Applied to <b>all {targets.length || ""} panel{targets.length === 1 ? "" : "s"}</b> the moment you pick a
          value — including panels added later. A single panel can still be changed on its own in <b>Panels →
          Panel details</b>, and <b>Apply to</b> puts the value shown here back on just the panels you choose.
        </p>
        {/* 4 per row — row 1: Amb. temp · Form · Neutral · Earth
                        row 2: Selectivity · Copper · Incoming · Outgoing cables */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SPEC_FIELDS.slice(0, 4).map((f, i) => panelField(f, i === 3))}
          {/* Project-wide only — a coordination study is a job requirement, not a
              per-panel setting, so this one is not copied onto the panels. */}
          <div>
            <L>Selectivity</L>
            <Sel value={s.selectivityRequired ?? "No"} options={YES_NO}
              onChange={(v) => { if (!readOnly) up({ selectivityRequired: v }); }} />
          </div>
          {SPEC_FIELDS.slice(4).map((f, i) => panelField(f, i === 2))}
        </div>
      </div>

      <SpecNoteList heading="Specs" hint="The project's specification — a header per item, with sub-titles under it."
        addLabel="+ Specs" headerPlaceholder="Header — e.g. MCB" defaults={defaultSpecs}
        notes={s.specs ?? []} onChange={(next) => up({ specs: next })} readOnly={readOnly} />

      <SpecNoteList heading="Comments of Client" hint="What the client asked for, in their words."
        addLabel="+ Comments of Client" headerPlaceholder="Header"
        notes={s.clientComments ?? []} onChange={(next) => up({ clientComments: next })} readOnly={readOnly} />

      <AttachmentsCard qtnId={qtnId} readOnly={readOnly} />
    </div>
  );
}

// ── Offer documents (the configurator's main output) ────────────────────────

// Export name: prefix the document kind to the QTN number ("QTN-26-0001" →
// "TO-QTN-26-0001") and append the 2-digit revision. Used for the TO/CO print
// filename (document.title) and the Material List Excel filename ("ML-…").
function offerTitle(kind: "TO" | "CO" | "ML", qtnNo: string, rev: string): string {
  return `${kind}-${qtnNo} Rev ${String(rev ?? "").padStart(2, "0")}`;
}

function PrintBar({ label, docTitle, blockers, exportFn }: { label: string; docTitle?: string; blockers?: ExportCheck[]; exportFn?: () => Promise<void> | void }) {
  const { notify, dialogs } = useDialogs();
  // Set the document title right before printing so the saved PDF / print job is
  // named after the offer; restore it once the dialog closes (afterprint).
  const [modal, setModal] = useState(false);
  const [acked, setAcked] = useState(false); // remember the user accepted the warning
  const [busy, setBusy] = useState(false); // jsPDF export in flight (async)
  const issues = blockers ?? [];
  const count = issues.reduce((n, c) => n + c.items.length, 0);
  const doPrint = async () => {
    // Technical offer builds a real multi-page PDF (jsPDF) instead of window.print().
    if (exportFn) {
      setBusy(true);
      try { await exportFn(); }
      catch (e) { console.error("PDF export failed", e); void notify({ title: "The PDF could not be generated", message: "Sorry — something went wrong making that file. Please try again." }); }
      finally { setBusy(false); }
      return;
    }
    if (!docTitle) return window.print();
    const prev = document.title;
    document.title = docTitle;
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };
  // Pre-export gate: warn (once) if any check fails; the user can accept and proceed.
  const onExport = () => (count > 0 && !acked ? setModal(true) : void doPrint());
  const proceed = () => { setAcked(true); setModal(false); void doPrint(); };
  return (
    <>
      {dialogs}
      <div className="mb-3 flex items-center justify-between gap-2 no-print">
        <p className="text-xs text-muted">{label}</p>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <button type="button" onClick={() => setModal(true)}
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-200"
              title="Review the export warnings">
              ⚠ {count} warning{count > 1 ? "s" : ""}
            </button>
          )}
          <button className="btn-primary" onClick={onExport} disabled={busy}>{busy ? "Generating…" : "⬇ PDF / Print"}</button>
        </div>
      </div>
      {modal && <ExportWarnModal checks={issues} onClose={() => setModal(false)} onProceed={proceed} />}
    </>
  );
}

/** Validation warning — lists the failing checks; the user can fix them or accept and
 *  proceed. Shared by the offer export and by "Send for approval" (the wording of the
 *  heading, the note and the proceed button change per caller). */
function ExportWarnModal({
  checks, onClose, onProceed,
  title = "Review before exporting",
  subtitle = "These issues were found. Fix them, or export anyway.",
  proceedLabel = "Export anyway",
}: {
  checks: ExportCheck[]; onClose: () => void; onProceed: () => void;
  title?: string; subtitle?: string; proceedLabel?: string;
}) {
  // Portal to <body>: the offer tabs sit inside an animate-fade-up wrapper whose
  // lingering transform would otherwise capture `position: fixed`, pushing the
  // dialog down the tall page. Anchored near the top so it's visible without scrolling.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="relative w-full max-w-lg rounded-xl2 border border-line bg-white p-6 shadow-lift animate-pop">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl">⚠</div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="max-h-[50vh] space-y-3 overflow-auto">
          {checks.map((c) => (
            <div key={c.title} className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-sm font-bold text-amber-800">{c.title} <span className="font-normal text-amber-600">· {c.items.length}</span></p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink">
                {c.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onProceed}>{proceedLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** LSIG breaker → offer its matching external-neutral current sensor. Shown right
 *  after a 3-pole LSIG breaker is added; "Add sensor" drops the sensor beside it. */
function NeutralPromptModal({ breaker, sensor, onAdd, onClose }: { breaker: string; sensor: string; onAdd: () => void; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Add external neutral sensor"
        className="relative w-full max-w-lg rounded-xl2 border border-line bg-white p-6 shadow-lift animate-pop">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xl">⚡</div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-ink">External neutral sensor</h2>
            <p className="text-sm text-muted">A 3-pole LSIG breaker senses the neutral outside the breaker.</p>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3 text-[13px] leading-relaxed text-ink">
          <p><b>{breaker}</b> is a 3-pole LSIG breaker — its ground-fault (G) protection needs an external neutral current sensor.</p>
          <p className="mt-2">Add <b className="text-brand-dark">{sensor}</b> to this section?</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Skip</button>
          <button className="btn-primary" onClick={onAdd} autoFocus>Add sensor</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Technical Offer — one document page per panel, in the reference layout:
 *  red item bar (Item No. | name | Item Qty.), red-label spec grid, then the
 *  components table (Qty | Description | Reference | Brand | Poles).
 *  Printing exports ALL panels as one PDF, one page each. */
const TRED = "#F16722"; // brand orange — drives item bar, spec labels & table header
// ── Shared branded offer cover (used by both Technical & Commercial offers) ──
const coverTel = (phone: string) => {
  const d = phone.replace(/[^\d+]/g, "");
  return d.startsWith("+") ? `tel:${d}` : `tel:+20${d.replace(/^0/, "")}`;
};
const CoverPhoneI = () => (
  <svg viewBox="0 0 24 24" className="mr-1 inline-block h-3 w-3 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);
const CoverMailI = () => (
  <svg viewBox="0 0 24 24" className="mr-1 inline-block h-3 w-3 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
  </svg>
);
/**
 * "Check for updates" — the price list is edited centrally and published, so an
 * offer can be started on a catalogue that has since moved. This re-reads the
 * published catalogue and says what changed: prices, brands, descriptions, new
 * items. Available to every role — it only swaps what this browser quotes from
 * and never writes to the price list, unlike the price-admin catalogue tools.
 */
/** Audit field name → how it reads in the changelog. */
const CHANGE_FIELD_LABEL: Record<string, string> = {
  price: "price", brand: "brand", description: "description", type: "type",
  family: "family", rating: "rating", poles: "poles", stock: "stock",
  "weight/panel/pole": "copper weight", "weight/cell/pole": "copper weight",
  __created: "added", __retired: "removed", __restored: "restored",
};

// ── Changelog formatting ─────────────────────────────────────────────────────
// Audit values are stored as text ("0 EUR / 3248 EGP"). Read the money back out
// so a price can be shown in the ONE currency it is actually priced in, rounded,
// and with the percentage move — "3,248 EGP → 978 EGP (−70%)".
const parseMoney = (v: string | null): { eur: number; egp: number } | null => {
  const m = String(v ?? "").match(/(-?[\d.]+)\s*EUR\s*\/\s*(-?[\d.]+)\s*EGP/i);
  if (!m) return null;
  return { eur: parseFloat(m[1]) || 0, egp: parseFloat(m[2]) || 0 };
};
/** EGP whole, EUR to 2dp — rounding a €2.29 list price to €2 would be worse than
 *  the float tail it is meant to hide. */
const money1 = (m: { eur: number; egp: number } | null): string => {
  if (!m) return "—";
  if (m.eur > 0) return `${Number(m.eur.toFixed(2)).toLocaleString("en-US")} EUR`;
  return `${Math.round(m.egp).toLocaleString("en-US")} EGP`;
};
const moneyValue = (m: { eur: number; egp: number } | null): number => (m ? (m.eur > 0 ? m.eur : m.egp) : 0);
const pctMove = (from: number, to: number): string =>
  from > 0 ? `${to >= from ? "+" : "−"}${Math.abs(((to - from) / from) * 100).toFixed(0)}%` : "";
/** The ABB discount reaches an item only when it is ABB-branded AND priced in EUR. */
const discountable = (brand: string | undefined, eur: number | undefined) =>
  (brand ?? "").trim() === "ABB" && (eur ?? 0) > 0;
const numOrText = (v: string | null) => {
  const n = Number(v);
  if (v != null && v !== "" && Number.isFinite(n)) return Number(n.toFixed(3)).toLocaleString("en-US");
  return v && v.trim() ? v : "—";
};

function CatalogUpdateCheck({ onApply }: { onApply?: () => { changed: number; removed: number } }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [warn, setWarn] = useState(false);
  const [changes, setChanges] = useState<CatalogChanges | null>(null);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setBusy(true);
    setMsg("");
    setChanges(null);
    setOpen(false);
    const before = catalogVersion();
    const u = await checkCatalogUpdates(getToken());
    if (!u.ok) {
      setBusy(false);
      setWarn(true);
      setMsg("Couldn’t reach the price list — still quoting on the catalogue already loaded.");
      return;
    }
    setWarn(false);
    // Ask what actually changed. Behind → everything since; already current → the
    // most recent upload, so "what came in last time?" is always answerable.
    let c: CatalogChanges | null = null;
    try {
      c = await api.catalog.lvChanges(before || undefined);
    } catch {
      /* changelog is a nicety — the refresh above already did the important part */
    }
    setBusy(false);
    setChanges(c);
    const headline = u.changed ? `Updated to version ${u.version}` : `Up to date — version ${u.version}`;
    if (!c || !c.total) {
      setMsg(`${headline}. No item changes recorded.`);
      return;
    }
    const parts = Object.entries(c.counts)
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `${n} ${CHANGE_FIELD_LABEL[f] ?? f}${n === 1 ? "" : "s"}`);
    setMsg(`${headline} · ${parts.join(" · ")}`);
  };

  return (
    <div className="flex flex-col items-end gap-1 no-print">
      <button onClick={run} disabled={busy}
        title="Re-read the published price list and show what changed in the latest upload"
        className="rounded-full border border-line bg-white px-4 py-1.5 text-xs font-bold text-ink hover:border-brand/50 hover:text-brand-dark disabled:opacity-60">
        {busy ? "Checking…" : "⟳ Check for updates"}
      </button>
      {msg && (
        <span className={`max-w-[26rem] text-right text-[11px] leading-snug ${warn ? "font-semibold text-red-700" : "text-muted"}`}>
          {msg}
          {!!changes?.total && (
            <>
              {" "}
              <button onClick={() => setOpen(true)} className="font-semibold text-brand-dark underline underline-offset-2">
                see {changes.total} change{changes.total === 1 ? "" : "s"}
              </button>
            </>
          )}
        </span>
      )}
      {open && changes && <ChangeLogDialog changes={changes} onApply={onApply} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The changelog, as its own dismissible panel rather than a dropdown under the button. */
function ChangeLogDialog({ changes, onApply, onClose }: { changes: CatalogChanges; onApply?: () => { changed: number; removed: number }; onClose: () => void }) {
  const { confirm, dialogs } = useDialogs();
  const [applied, setApplied] = useState<{ changed: number; removed: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doApply = async () => {
    if (!onApply) return;
    if (
      !(await confirm({
        title: "Update to the current price list",
        message:
          "Component and cell prices are brought up to today's list, and any item discontinued from the list is removed.\n" +
          "Your quantities, per-line adjustments and notes are kept, and you can Undo this afterwards.",
        confirmLabel: "Update prices",
      }))
    )
      return;
    setApplied(onApply());
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />
      {dialogs}
      <div role="dialog" aria-modal="true"
        className="relative flex max-h-[86vh] w-full max-w-3xl flex-col rounded-xl2 border border-line bg-white p-5 shadow-lift animate-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="sec-head">What changed in the price list</h2>
            <p className="-mt-1 text-xs text-muted">
              Version {changes.version}
              {changes.from < changes.version - 1 ? ` (since version ${changes.from})` : ""}
              {changes.publishedBy ? ` · ${changes.publishedBy}` : ""}
              {changes.note ? ` · ${changes.note}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onApply && applied === null && (
              <button onClick={doApply} className="btn-primary"
                title="Update this quotation's component & cell prices to the current list">
                Apply changes
              </button>
            )}
            {applied !== null && (
              <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-300">
                ✓ {applied.changed === 0 && applied.removed === 0
                  ? "Already up to date"
                  : [
                      applied.changed > 0 ? `${applied.changed} price${applied.changed === 1 ? "" : "s"} updated` : "",
                      applied.removed > 0 ? `${applied.removed} discontinued removed` : "",
                    ].filter(Boolean).join(" · ")}
              </span>
            )}
            <button onClick={onClose} className="btn-ghost" title="Close (Esc)">✕ Close</button>
          </div>
        </div>

        <div className="mt-3 flex-1 overflow-auto rounded-lg border border-line">
          <ul className="divide-y divide-line">
            {changes.items.map((it, i) => <ChangeRow key={i} it={it} />)}
          </ul>
        </div>
        {changes.total > changes.items.length && (
          <p className="mt-1 text-[11px] text-muted/80">
            Showing the {changes.items.length} most recent of {changes.total} changes.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One changelog entry, described according to what actually changed. */
function ChangeRow({ it }: { it: CatalogChangeItem }) {
  const d = it.detail ?? undefined;
  const name = it.label || d?.d || d?.name || d?.ref || "item";
  const Head = (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-[13px] font-semibold text-ink">{name}</span>
      {d?.ref && <span className="font-mono text-[10px] text-muted">{d.ref}</span>}
    </div>
  );

  // Added / removed / restored → describe the whole item, not one field.
  if (it.field === "__created" || it.field === "__retired" || it.field === "__restored") {
    const verb = it.field === "__created" ? "Added" : it.field === "__retired" ? "Removed" : "Restored";
    const spec: [string, string][] = d
      ? ([
          ["Reference", d.ref || "—"],
          ["Description", d.d || d.name || "—"],
          ["Type", d.t || "—"], ["Family", d.f || d.fam || "—"], ["Rating", d.r || "—"],
          ["Brand", d.brand || "—"], ["Poles", d.poles != null ? String(d.poles) : "—"],
          ["Price", money1({ eur: d.eur ?? 0, egp: d.egp ?? 0 })],
          ["ABB discount", discountable(d.brand, d.eur) ? "Yes" : "No"],
          ["Weight/Panel/Pole", d.cuP ? String(d.cuP) : "—"],
          ["Weight/Cell/Pole", d.cuC ? String(d.cuC) : "—"],
          ["Stock", d.stock || "—"],
          ["IP", d.ip || "—"], ["Mounting", d.mount || "—"], ["RAL", d.ral || "—"],
        ].filter(([, v]) => v !== "—" || true) as [string, string][])
      : [];
    return (
      <li className="px-3 py-2">
        {Head}
        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: TRED }}>{verb}</div>
        {!!spec.length && (
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
            {spec.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-muted">{k}</span>
                <span className="text-right font-medium text-ink">{v}</span>
              </div>
            ))}
          </div>
        )}
      </li>
    );
  }

  // Price → one currency, rounded, with the percentage move.
  if (it.field === "price") {
    const a = parseMoney(it.oldValue);
    const b = parseMoney(it.newValue);
    const pct = pctMove(moneyValue(a), moneyValue(b));
    const up = moneyValue(b) >= moneyValue(a);
    return (
      <li className="px-3 py-2">
        {Head}
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <span className="text-muted">Price</span>
          <span className="text-muted line-through">{money1(a)}</span>
          <span className="font-bold text-ink">→ {money1(b)}</span>
          {pct && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${up ? "bg-amber-100 text-amber-800" : "bg-surface text-muted"}`}>
              {pct}
            </span>
          )}
        </div>
      </li>
    );
  }

  // Brand → also say whether it turned the ABB discount on or off.
  if (it.field === "brand") {
    const was = discountable(it.oldValue ?? "", d?.eur);
    const now = discountable(it.newValue ?? "", d?.eur);
    return (
      <li className="px-3 py-2">
        {Head}
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <span className="text-muted">Brand</span>
          <span className="text-muted line-through">{it.oldValue || "—"}</span>
          <span className="font-bold text-ink">→ {it.newValue || "—"}</span>
        </div>
        {was !== now && (
          <div className="mt-0.5 text-[11px]">
            <span className="text-muted">ABB discount</span>{" "}
            <span className="text-muted line-through">{was ? "Yes" : "No"}</span>{" "}
            <span className="font-bold text-ink">→ {now ? "Yes" : "No"}</span>
          </div>
        )}
      </li>
    );
  }

  // Description → the full text, before and after.
  if (it.field === "description") {
    return (
      <li className="px-3 py-2">
        {Head}
        <div className="mt-0.5 text-[12px]">
          <div className="text-muted line-through">{it.oldValue || "—"}</div>
          <div className="font-bold text-ink">→ {it.newValue || "—"}</div>
        </div>
      </li>
    );
  }

  // Anything else → the field, before and after.
  return (
    <li className="px-3 py-2">
      {Head}
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px]">
        <span className="text-muted">{CHANGE_FIELD_LABEL[it.field] ?? it.field}</span>
        <span className="text-muted line-through">{numOrText(it.oldValue)}</span>
        <span className="font-bold text-ink">→ {numOrText(it.newValue)}</span>
      </div>
    </li>
  );
}

/** Cover icons — drawn, not raster, so they stay sharp through the PDF export the
 *  covers go through. All five are traced from photographs of the real products and
 *  share a 32-unit box, a 1.25 stroke, and charcoal at 6% / 12% / 50% for the greys.
 *  The orange marks the element that identifies the product — the live indicator,
 *  the mimic band, the nameplate — so it carries meaning rather than decorating. */
const ORANGE = "#F16722";
/** Pilot-light colours on the LV panel icon — green / red / yellow, as on the real
 *  door. The ONLY departure from the three-colour brand palette on the cover; swap
 *  this line for charcoal tints to bring it back inside the guidelines:
 *    ["rgba(88,88,89,0.55)", "rgba(88,88,89,0.35)", "rgba(88,88,89,0.18)"]  */
const PANEL_LAMPS = ["#2FA84F", "#D64545", "#E8B93A"];

/** The product range printed on the offer covers. Edit here — it is the same strip on
 *  the Technical and Commercial covers, which are one component.
 *
 *  `href` makes the icon and title a link to that product's page. A category with no
 *  href simply is not a link — better than guessing a URL that 404s on a document
 *  already sent to a customer. */
const COVER_RANGE: { title: string; items: string[]; icon: React.ReactNode; href?: string }[] = [
  {
    title: "LV Enclosures",
    items: ["PLP MAX", "PLP CORE", "PLP MINI"],
    href: "https://www.powerlinei.com/low-voltage",
    // LV control panel drawn from the supplied photograph: metering row, pilot
    // lights, rotary selector, nameplate — the door's actual reading order.
    //
    // The lamps are the one place this cover leaves the three-colour palette. Green,
    // red and yellow are the real indication colours on the door, kept at the owner's
    // instruction; PANEL_LAMPS is the single switch back to a palette-only version.
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.25"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5.5" y="2.5" width="21" height="27" rx="1.2" fill="rgba(88,88,89,0.06)" />
        {/* 1 — metering: each with a needle, swung to a different reading so the row
            reads as three live instruments rather than three identical blocks */}
        {[
          { x: 8, tip: -1.15 },
          { x: 13.5, tip: 0 },
          { x: 19, tip: 1.15 },
        ].map(({ x, tip }) => (
          <g key={x}>
            <rect x={x} y="6.9" width="5" height="4.2" rx="0.5" fill="rgba(88,88,89,0.5)" stroke="none" />
            <line x1={x + 2.5} y1="10.2" x2={x + 2.5 + tip} y2="8.3" stroke="#fff" strokeWidth="0.9" />
          </g>
        ))}
        {/* 2 — pilot lights: green, red, yellow */}
        {PANEL_LAMPS.map((c, i) => (
          <circle key={c} cx={11 + i * 5} cy="15.4" r="1.5" fill={c} stroke="none" />
        ))}
        {/* 3 — rotary selector. With the nameplate gone the three rows are re-centred
            in the door rather than left sitting in its top half. */}
        <circle cx="16" cy="21.9" r="2.5" fill={ORANGE} stroke="none" />
        <line x1="16" y1="21.9" x2="16" y2="20.2" stroke="#fff" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    title: "Transformers",
    items: ["PDTR"],
    href: "https://www.powerlinei.com/products/dry-type-transformers",
    // Cast-resin DRY-TYPE transformer, drawn from the supplied photograph — the three
    // exposed coil limbs between a clamping beam and the base frame. That silhouette
    // is what says "dry type" rather than the oil tank it replaces, so the coils take
    // the orange and everything structural stays charcoal.
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.06"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* Drawn 4.3→27.2 tall, then scaled to the 2.5→29.5 the other icons occupy, so
            the five sit at one height in the strip. Stroke widths are pre-divided by
            the 1.179 factor to come out at the set's 1.25 after scaling. */}
        <g transform="translate(-2.865 -2.57) scale(1.179)">
        {/* clamping beam with the nameplate */}
        <rect x="3.6" y="4.3" width="24.8" height="2.9" rx="0.5" fill="rgba(88,88,89,0.55)" stroke="none" />
        <rect x="12.4" y="5.1" width="7.2" height="1.3" rx="0.25" fill="rgba(255,255,255,0.9)" stroke="none" />
        {/* three cast-resin coil limbs */}
        {[5.4, 13.2, 21].map((x) => (
          <g key={x}>
            <rect x={x} y="8.1" width="5.6" height="14.8" rx="2.4" fill={ORANGE} stroke="none" />
            <rect x={x + 1.7} y="7.2" width="2.2" height="1.5" rx="0.3" fill="rgba(88,88,89,0.7)" stroke="none" />
          </g>
        ))}
        {/* HV connection bars — the delta: each limb's top to the next limb's bottom.
            The long return bar from limb 3 back to limb 1 is what crosses the other
            two and gives the X you see on the real unit. Bolted at every terminal. */}
        <g stroke="#585859" strokeWidth="1.19">
          <line x1="8.2" y1="11" x2="16" y2="20" />
          <line x1="16" y1="11" x2="23.8" y2="20" />
          <line x1="23.8" y1="11" x2="8.2" y2="20" />
        </g>
        {[8.2, 16, 23.8].flatMap((cx) => [11, 20].map((cy) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill="rgba(88,88,89,0.9)" stroke="none" />
        )))}
        {/* base frame and skid */}
        <rect x="3.6" y="23" width="24.8" height="2.7" rx="0.5" fill="rgba(88,88,89,0.55)" stroke="none" />
        <rect x="6.6" y="25.7" width="4.4" height="1.5" rx="0.3" fill="rgba(88,88,89,0.35)" stroke="none" />
        <rect x="21" y="25.7" width="4.4" height="1.5" rx="0.3" fill="rgba(88,88,89,0.35)" stroke="none" />
        </g>
      </svg>
    ),
  },
  {
    title: "Secondary Switchgear",
    items: ["PRAL", "PSEC", "AEGIS PLUS"],
    href: "https://www.powerlinei.com/secondary-switchgear",
    // RMU line-up drawn from the supplied photograph. The orange mimic band running
    // across the middle is what identifies this product on sight, so it carries the
    // accent — three cubicles, instruments above, cable compartments below.
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.157"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* Drawn 3.4→28.4 tall, then scaled to the 2.5→29.5 the other icons occupy.
            Stroke widths pre-divided by the 1.08 factor to land on the set's 1.25. */}
        <g transform="translate(-1.28 -1.172) scale(1.08)">
        <rect x="4.2" y="3.4" width="23.6" height="25" rx="1" fill="rgba(88,88,89,0.06)" />
        {/* instrument compartments */}
        {[8.13, 16, 23.87].map((cx) => (
          <rect key={`m${cx}`} x={cx - 1.7} y="5.6" width="3.4" height="2.7" rx="0.4"
            fill="rgba(88,88,89,0.5)" stroke="none" />
        ))}
        {/* the mimic band — the product's signature */}
        <rect x="4.2" y="10.6" width="23.6" height="5.6" fill={ORANGE} stroke="none" />
        {[8.13, 16, 23.87].map((cx) => (
          <g key={`s${cx}`} stroke="#fff" strokeWidth="0.787">
            <circle cx={cx} cy="12.6" r="0.85" />
            <line x1={cx} y1="13.45" x2={cx} y2="14.9" />
          </g>
        ))}
        {/* cable compartments */}
        <line x1="12.07" y1="16.2" x2="12.07" y2="26.6" />
        <line x1="19.93" y1="16.2" x2="19.93" y2="26.6" />
        {[8.13, 16, 23.87].map((cx) => (
          <rect key={`w${cx}`} x={cx - 1.5} y="17.6" width="3" height="1.7" rx="0.3"
            fill="rgba(88,88,89,0.55)" stroke="none" />
        ))}
        {/* base rail */}
        <rect x="4.2" y="26.6" width="23.6" height="1.8" rx="0.3" fill="rgba(88,88,89,0.5)" stroke="none" />
        </g>
      </svg>
    ),
  },
  {
    title: "Primary Switchgear",
    items: ["PLGEAR"],
    href: "https://www.powerlinei.com/primary-switchgear",
    // MV cubicle drawn from the supplied photograph, distilled to what identifies it
    // at 28px: the protection-relay row, the dark control plate carrying the breaker
    // mimic, and the cable compartment below.
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.25"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5.5" y="2.5" width="21" height="27" rx="1.2" fill="rgba(88,88,89,0.06)" />
        {/* relay / metering row */}
        <rect x="7.6" y="4.6" width="16.8" height="5" rx="0.7" fill="rgba(88,88,89,0.12)" />
        <rect x="9" y="6.1" width="3.4" height="2" rx="0.4" fill={ORANGE} stroke="none" />
        <rect x="13.8" y="6.1" width="3.4" height="2" rx="0.4" fill={ORANGE} stroke="none" />
        <rect x="18.6" y="6.1" width="3.4" height="2" rx="0.4" fill={ORANGE} stroke="none" />
        {/* control plate with the breaker mimic */}
        <rect x="8.6" y="12" width="14.8" height="9" rx="0.8" fill="rgba(88,88,89,0.82)" stroke="none" />
        <circle cx="16" cy="15.4" r="1.5" stroke="#fff" strokeWidth="1" />
        <line x1="16" y1="16.9" x2="16" y2="18.9" stroke="#fff" strokeWidth="1" />
        {/* cable compartment */}
        <rect x="7.6" y="23.4" width="16.8" height="4.6" rx="0.7" fill="rgba(88,88,89,0.12)" />
        <rect x="13.6" y="24.9" width="4.8" height="1.8" rx="0.3" fill="rgba(88,88,89,0.45)" stroke="none" />
      </svg>
    ),
  },
  {
    title: "Kiosk",
    items: ["PCSS"],
    href: "https://www.powerlinei.com/products/pcss",
    // PCSS drawn from the supplied photograph: the gabled roof cap with its
    // nameplate, the double doors on their centre seam, and the dark plinth. The
    // nameplate takes the orange — on the real kiosk that plate IS the brand mark.
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.088"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* Drawn 4.6→28.1 tall, then scaled to the 2.5→29.5 the other icons occupy.
            Stroke widths pre-divided by the 1.149 factor to land on the set's 1.25. */}
        <g transform="translate(-2.383 -2.785) scale(1.149)">
        {/* gabled roof cap */}
        <path d="M3.8 10.6 L16 4.6 L28.2 10.6 Z" fill="rgba(88,88,89,0.12)" />
        <rect x="12.6" y="7.6" width="6.8" height="2.1" rx="0.35" fill={ORANGE} stroke="none" />
        {/* body: double doors on a centre seam */}
        <rect x="5.4" y="10.6" width="21.2" height="15.2" rx="0.6" fill="rgba(88,88,89,0.06)" />
        <line x1="16" y1="10.6" x2="16" y2="25.8" />
        <rect x="15.2" y="16.6" width="1.6" height="3" rx="0.4" fill="rgba(88,88,89,0.6)" stroke="none" />
        <line x1="14.6" y1="13.4" x2="17.4" y2="13.4" strokeWidth="0.87" />
        <line x1="14.6" y1="22.6" x2="17.4" y2="22.6" strokeWidth="0.87" />
        {/* plinth */}
        <rect x="4.6" y="25.8" width="22.8" height="2.3" rx="0.4" fill="rgba(88,88,89,0.5)" stroke="none" />
        </g>
      </svg>
    ),
  },
];

function OfferCover({ s, qtnNo, kind }: { s: LvState; qtnNo: string; kind: "Technical" | "Commercial" }) {
  const [staff] = useStaff();
  const mgr = staff.salesManagers.find((m) => m.name === SALES_MANAGER);
  const revNum = parseInt((s.project.revisionNo || "").replace(/\D/g, ""), 10) || 0;
  const qtnRef = revNum > 0 ? `${qtnNo}-${revNum}` : qtnNo;
  const coverContacts = [
    { role: "Sales", name: s.project.salesPerson, phone: s.project.salesMobile, email: s.project.salesEmail },
    { role: "Manager", name: s.project.salesManager || mgr?.name || SALES_MANAGER, phone: mgr?.mobile || "", email: mgr?.email || "" },
    { role: "Support", name: s.project.supportEngineer, phone: "", email: "" },
  ].filter((c) => c.name);
  return (
    <section data-pdf-cover className="a4-sheet flex flex-col overflow-hidden" style={{ breakAfter: "page" }}>
      <div className="absolute inset-y-0 left-0 w-[10px]" style={{ background: TRED }} />
      {/* pb-14: the address once sat 7px off the trimmed edge, inside the margin a real
          trim would eat. The slack now lives ABOVE the range strip (mt-auto there
          rather than on the footer), so the strip sits low on the page and the footer
          rides up with it, instead of the two being separated by a dead band. */}
      <div className="flex flex-1 flex-col px-12 pb-14 pt-12">
        <div className="flex items-center justify-between">
          <img src="/brand/logo-horizontal.png" alt="PowerLine" className="h-32" />
          {s.project.date && (
            <span className="rounded-full bg-surface px-5 py-2 text-sm font-bold tracking-wide text-charcoal">{fmtDate(s.project.date)}</span>
          )}
        </div>
        <div className="mt-8">
          <div className="font-display text-7xl font-extrabold leading-[1.04] tracking-tight text-ink">{kind}</div>
          <div className="font-display text-7xl font-extrabold leading-[1.04] tracking-tight" style={{ color: TRED }}>Offer</div>
          <div className="mt-5 h-[6px] w-28 rounded-full" style={{ background: TRED }} />
          <p className="mt-6 text-xl text-muted">Egyptian electrification solutions · ABB-certified assembler</p>
          {(qtnNo || s.project.name) && (
            <div className="mt-6 space-y-0.5">
              {qtnRef && <div className="text-[18px] font-bold" style={{ color: TRED }}>{qtnRef}</div>}
              {s.project.optyNo && <div className="mb-2 text-[14px] font-semibold text-muted">{s.project.optyNo}</div>}
              {s.project.name && <div className="text-base text-ink">{s.project.name}</div>}
              {s.project.customer && <div className="mb-3 text-base text-muted">{s.project.customer}</div>}
            </div>
          )}
        </div>

        {/* Contacts and the range strip share the band between the customer line and
            the footer rule. justify-evenly gives three EQUAL gaps — above the contacts,
            between contacts and strip, and below the strip — so neither block hugs the
            text above it. Both were previously pinned: the contacts to the customer
            line, the strip to the footer, leaving one dead band in the middle. */}
        <div className="flex flex-1 flex-col justify-evenly">
          {coverContacts.length > 0 && (
            <div className="grid w-fit grid-cols-[4rem_auto_auto_auto] items-baseline gap-x-4 gap-y-1 text-left text-[12px] text-muted">
              {coverContacts.map((c) => (
                <div key={c.role} className="contents">
                  <span className="inline-block w-16 text-[12px] font-semibold text-ink">{c.role}:</span>
                  <span className="whitespace-nowrap">{c.name}</span>
                  <span className="whitespace-nowrap">{c.phone && <a href={coverTel(c.phone)} className="text-inherit no-underline"><CoverPhoneI />{c.phone}</a>}</span>
                  <span className="whitespace-nowrap">{c.email && <a href={`mailto:${c.email}`} className="text-inherit no-underline"><CoverMailI />{c.email}</a>}</span>
                </div>
              ))}
            </div>
          )}
        {/* What Powerline supplies. Hairline-ruled columns, no boxes: the cover already
            carries a 7xl title, an orange rule and a full-bleed orange bar, so this reads
            as evidence rather than a second headline. Category labels in Nexa (display),
            the product lines in Poppins — the brand's display/body split. */}
        <div className="grid grid-cols-5">
          {COVER_RANGE.map((col, i) => (
            <div key={col.title} className={`px-4 ${i === 0 ? "pl-0" : "border-l border-line"}`}>
              {/* Icon + title are one link to the product page. data-pdf-link carries the
                  URL into the PDF export, which rasterises each page — without it the
                  anchor would be a picture of a link in the file customers receive. */}
              {(() => {
                const head = (
                  <>
                    <div className="mb-2.5">{col.icon}</div>
                    {/* Two-line box, bottom-aligned: "Secondary Switchgear" wraps and the
                        others do not, so without it their rules and product lists sat at
                        different heights. Titles hang from the same baseline instead. */}
                    <div className="flex h-[25px] items-end font-display text-[10px] font-bold uppercase leading-tight tracking-[0.13em] text-charcoal">
                      <span>{col.title}</span>
                    </div>
                  </>
                );
                return col.href ? (
                  <a href={col.href} target="_blank" rel="noopener noreferrer" data-pdf-link={col.href}
                    className="block text-inherit no-underline" title={`Open ${col.title} on powerlinei.com`}>
                    {head}
                  </a>
                ) : head;
              })()}
              <div className="mt-2 mb-3 h-[2px] w-7 rounded-full" style={{ background: TRED }} />
              <ul className="space-y-1.5">
                {col.items.map((it) => (
                  <li key={it} className="text-[13px] font-medium leading-tight text-charcoal">{it}</li>
                ))}
              </ul>
            </div>
          ))}
          </div>
        </div>
        {/* No top margin: the justify-evenly band above owns the spacing, so a margin
            here would push the strip off its centre. */}
        <div data-cover-footer>
          <div className="h-[3px] w-[calc(100%+3rem)] rounded" style={{ background: TRED }} />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {[
              { name: "ISO 9001", url: "https://drive.google.com/file/d/1D2GThbsl9FDr7rnhdFl7jsnWKXyOc8KY/view" },
              { name: "ISO 14001", url: "https://drive.google.com/file/d/1yqz35dDFJDZ18X2fURFwufHtzg7c50rZ/view" },
              { name: "ISO 45001", url: "https://drive.google.com/file/d/1nzbbwg3CLKqUkYY6RBXhcFTI0PJpToMG/view" },
            ].map((b) => (
              <a key={b.name} href={b.url} target="_blank" rel="noopener noreferrer"
                className="rounded-full bg-surface px-5 py-2 text-sm font-bold text-charcoal transition-colors hover:bg-brand-light hover:text-brand-darker">
                {b.name}
              </a>
            ))}
            <a href="https://drive.google.com/file/d/16I86eVMca56UUUiMsLusKEb1G4R6iYD6/view" target="_blank" rel="noopener noreferrer"
              className="rounded-full px-5 py-2 text-sm font-extrabold transition-opacity hover:opacity-80" style={{ background: "#FEF3ED", color: TRED }}>ABB CERTIFIED</a>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-muted">
              <a href="https://maps.app.goo.gl/kqZBxFo286ps7qBP8" target="_blank" rel="noopener noreferrer" className="text-inherit no-underline hover:text-brand">20 Ammar Ibn Yasser, Heliopolis, Cairo</a>
              {" · "}
              <a href="tel:+202262215022" className="text-inherit no-underline hover:text-brand">+2 02262215022</a>
              {" · "}
              <a href="mailto:info@powerline.com.eg" className="text-inherit no-underline hover:text-brand">info@powerline.com.eg</a>
            </p>
            <div className="flex items-center gap-2.5">
              {[
                { label: "Website", url: "https://powerlinei.com/", icon: (
                  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" />
                    <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
                  </svg>
                ) },
                { label: "Facebook", url: "https://www.facebook.com/Powerline.ABB", icon: (
                  <svg viewBox="0 0 320 512" className="h-[18px] w-[18px]" fill="currentColor">
                    <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-49.84 52.24-49.84h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" />
                  </svg>
                ) },
                { label: "LinkedIn", url: "https://www.linkedin.com/login/?session_redirect=%2Fcompany%2F9288669", icon: (
                  <svg viewBox="0 0 448 512" className="h-[18px] w-[18px]" fill="currentColor">
                    <path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z" />
                  </svg>
                ) },
              ].map((sl) => (
                <a key={sl.label} href={sl.url} target="_blank" rel="noopener noreferrer" aria-label={sl.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-opacity hover:opacity-85" style={{ background: TRED }}>
                  {sl.icon}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Running page header on every non-cover offer page (logo + project name + QTN · customer).
function PageHeader({ s, qtnRef }: { s: LvState; qtnRef: string }) {
  return (
    <div data-pdf-header className="mb-3 flex items-center justify-between gap-4 border-b pb-2" style={{ borderColor: "#E7E7EB" }}>
      <img src="/brand/logo-horizontal.png" alt="PowerLine" className="h-14" />
      <div className="text-right">
        {s.project.name && <div className="text-base font-bold leading-tight text-ink">{s.project.name}</div>}
        <div className="text-[13px] text-muted">{[qtnRef, s.project.customer].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
  );
}
// "Page X" footer, centered, no border/label, pinned to the bottom of the sheet (mt-auto).
// Browser print can't count pages via CSS, so the number is computed per sheet in React.
function PageFooter({ n }: { n: number }) {
  return <div className="mt-auto pt-3 text-center text-[10.5px] font-semibold text-muted">Page {n}</div>;
}

// A Technical-Offer divider page — a full themed sheet with one large centred title
// (e.g. "Building A"), inserted before a panel to group the offer into sections.
function SeparatorPage({ text, onChange, onRemove }: { text: string; onChange: (t: string) => void; onRemove: () => void }) {
  return (
    <section data-pdf-separator className="a4-sheet relative flex flex-col items-center justify-center px-16" style={{ breakAfter: "page" }}>
      {/* left accent bar — matches the offer cover */}
      <div className="absolute inset-y-0 left-0 w-[10px]" style={{ background: TRED }} />
      <button type="button" onClick={onRemove} title="Remove this divider page"
        className="no-print absolute right-6 top-6 rounded-full px-3 py-1 text-xs font-semibold text-muted transition hover:bg-red-50 hover:text-red-600">✕ Remove page</button>
      <textarea value={text} onChange={(e) => onChange(e.target.value)} rows={2}
        placeholder="Type a title (e.g. Building A)…"
        className="w-full resize-none overflow-hidden bg-transparent text-center font-display text-6xl font-extrabold leading-[1.12] tracking-tight outline-none placeholder:text-2xl placeholder:font-semibold placeholder:text-muted/40"
        style={{ color: "#26262a" }} />
      <div className="mt-8 h-[6px] w-32 rounded-full" style={{ background: TRED }} />
    </section>
  );
}

type NotesKey = "notesGeneral" | "notesAdditional";
function TechnicalTab({ s, qtnNo, up, onBackToPanel }: { s: LvState; qtnNo: string; up: (patch: Partial<LvState>) => void; onBackToPanel: (id: string) => void }) {
  // Editable notes page (after the cover): edit / add / remove lines.
  const notesOf = (k: NotesKey) => s[k] ?? [];
  const setNotes = (k: NotesKey, a: string[]) => up(k === "notesGeneral" ? { notesGeneral: a } : { notesAdditional: a });
  const editNote = (k: NotesKey, i: number, v: string) => { const a = [...notesOf(k)]; a[i] = v; setNotes(k, a); };
  const removeNote = (k: NotesKey, i: number) => setNotes(k, notesOf(k).filter((_, j) => j !== i));
  const addNote = (k: NotesKey) => setNotes(k, [...notesOf(k), ""]);
  // Divider pages: full themed pages inserted before a chosen panel (e.g. "Building A").
  const separators = s.offerSeparators ?? [];
  const addSeparator = (beforePanelId: string) => up({ offerSeparators: [...separators, { id: uid(), beforePanelId, text: "" }] });
  const editSeparator = (id: string, text: string) => up({ offerSeparators: separators.map((x) => (x.id === id ? { ...x, text } : x)) });
  const removeSeparator = (id: string) => up({ offerSeparators: separators.filter((x) => x.id !== id) });
  // Eye toggle to hide the Brand column from the technical offer (and its PDF, since the
  // PDF is captured from this DOM). Hidden by default — a customer-facing offer does
  // not normally name the supplier, so showing it is the deliberate act.
  const [hideBrand, setHideBrand] = useState(true);
  if (!s.panels.length) {
    return <div className="card p-10 text-center text-sm text-muted animate-fade-up">Add panels first — the Technical Offer is generated from them.</div>;
  }
  const specOf = (p: LvPanel) => {
    if (p.sizingMode === "cells") {
      const cc = p.cellConfig;
      return {
        // RPT-1: panel type shows the type only — sizing (depth/thickness) removed.
        panelType: `${cc.type} cell`,
        ip: cc.ip.replace(/^IP/, ""),
        mount: "Floor standing",
        ral: "7035",
      };
    }
    const pItems = p.panelItems ?? [];
    const it = pItems[0];
    const enc = it ? ENCLOSURES.find((e) => e.ref === it.ref && e.name === it.name) : undefined;
    return {
      // RPT-1: panel type shows the family only — sizing (enclosure name) removed.
      panelType: it ? it.fam : "—",
      ip: it?.ip || "—",
      mount: enc?.mount || "—",
      ral: enc?.ral || "—",
    };
  };
  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <td className="whitespace-nowrap border px-2 py-1 font-display text-[11px] font-bold leading-[15px]" style={{ color: TRED, background: "#fdf0e9", borderColor: "#E7E7EB" }}>{children}</td>
  );
  const Val = ({ children }: { children?: React.ReactNode }) => (
    <td className="whitespace-nowrap border px-2 py-1 text-[12px] leading-[15px]" style={{ borderColor: "#E7E7EB" }}>{children}</td>
  );
  // Revision is folded into the QTN number: rev 00 → unchanged, rev 01 → "-1", rev 02 → "-2", …
  const revNum = parseInt((s.project.revisionNo || "").replace(/\D/g, ""), 10) || 0;
  const qtnRef = revNum > 0 ? `${qtnNo}-${revNum}` : qtnNo;
  const exportPdf = async () => {
    const printArea = document.querySelector<HTMLElement>("[data-pdf-root]");
    if (!printArea) return;
    // Lazy-load html2canvas + jsPDF only on export. The PDF is built by capturing the
    // on-screen offer HTML (so Arabic / RTL render exactly like the preview) and
    // paginating it across A4 pages with a repeated header + "Page X of Y" footer.
    const { exportTechnicalPdf } = await import("../lv/technicalPdf");
    await exportTechnicalPdf({ printArea, filename: offerTitle("TO", qtnNo, s.project.revisionNo) });
  };
  return (
    <div className="animate-fade-up">
      <PrintBar label={`${s.panels.length} panel${s.panels.length > 1 ? "s" : ""} → multi-page PDF (tables flow across pages).`}
        docTitle={offerTitle("TO", qtnNo, s.project.revisionNo)} blockers={exportBlockers(s)} exportFn={exportPdf} />
      <div className="no-print mb-2 flex justify-end">
        <button type="button" onClick={() => setHideBrand((v) => !v)}
          title={hideBrand ? "Brand column is hidden in the offer — click to show it" : "Brand column is shown in the offer — click to hide it"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-brand/40 hover:text-brand">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
            {hideBrand && <line x1="3" y1="3" x2="21" y2="21" />}
          </svg>
          {hideBrand ? "Show brand" : "Hide brand"}
        </button>
      </div>
      <div className="offer-workspace">
      <div data-pdf-root className="print-area space-y-6">
        {/* Cover page (shared branded title page) — no footer on the cover */}
        <OfferCover s={s} qtnNo={qtnNo} kind="Technical" />
        {/* Notes page (editable: edit / add / remove lines) — after the cover */}
        <section className="a4-sheet flex flex-col px-8 pb-3 pt-6" style={{ breakAfter: "page" }}>
          <PageHeader s={s} qtnRef={qtnRef} />
          <div data-pdf-notes>
          {([["General Notes :-", "notesGeneral"], ["Additional Notes :-", "notesAdditional"]] as [string, NotesKey][]).map(([title, key]) => (
            // An empty group keeps its heading on screen — that is how you add the
            // first note — but is marked no-print so the export doesn't carry a
            // bare "Additional Notes :-" with nothing under it. The PDF builder
            // strips .no-print from its clone, so this covers the PDF and printing.
            <div key={key} className={`mt-5 ${notesOf(key).length === 0 ? "no-print" : ""}`}>
              <h3 className="mb-2 text-lg font-bold italic underline" style={{ color: TRED }}>{title}</h3>
              <ol className="space-y-1">
                {notesOf(key).map((n, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-px w-6 shrink-0 text-right text-[13px] font-semibold" style={{ color: TRED }}>{i + 1}-</span>
                    <input value={n} onChange={(e) => editNote(key, i, e.target.value)} placeholder="Write a note…"
                      className="flex-1 border-b border-transparent bg-transparent px-1 text-[13px] text-ink outline-none hover:border-line focus:border-brand" />
                    <button type="button" onClick={() => removeNote(key, i)} title="Remove"
                      className="no-print px-1 text-base leading-none text-muted hover:text-red-500">×</button>
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => addNote(key)}
                className="no-print mt-2 ml-8 text-xs font-semibold text-brand hover:underline">+ Add note</button>
            </div>
          ))}
          </div>
          <PageFooter n={2} />
        </section>
        {s.panels.map((p, pi) => {
          const sp = specOf(p);
          const seps = separators.filter((sep) => sep.beforePanelId === p.id);
          const sepsBefore = separators.filter((sep) => { const j = s.panels.findIndex((pp) => pp.id === sep.beforePanelId); return j >= 0 && j <= pi; }).length;
          return (
            <Fragment key={p.id}>
              {seps.map((sep) => (
                <SeparatorPage key={sep.id} text={sep.text}
                  onChange={(t) => editSeparator(sep.id, t)} onRemove={() => removeSeparator(sep.id)} />
              ))}
              {/* Insert a divider page before this panel (screen only) */}
              <div className="no-print -mb-3 flex w-[210mm] max-w-full">
                <button type="button" onClick={() => addSeparator(p.id)}
                  title={`Insert a divider page before “${p.name}”`}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed bg-white px-3.5 py-1.5 text-xs font-bold shadow-sm transition hover:bg-[#FEF3ED]"
                  style={{ borderColor: TRED, color: TRED }}>
                  <span className="text-sm leading-none">＋</span> Page
                </button>
              </div>
              <div data-pdf-panel data-offer-panel={p.id} className="a4-sheet flex flex-col px-8 pb-3 pt-6"
                style={pi < s.panels.length - 1 ? { breakAfter: "page" } : undefined}>
              <PageHeader s={s} qtnRef={qtnRef} />
              {/* Back to this panel in the Panels tab (screen only — stripped from the PDF) */}
              <div className="no-print -mt-1 mb-1 flex justify-end">
                <button type="button" onClick={() => onBackToPanel(p.id)} title={`Back to “${p.name}” in Panels`}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm transition hover:bg-[#FEF3ED]"
                  style={{ borderColor: TRED, color: TRED }}>
                  <JumpArrow /> Panel
                </button>
              </div>
              {/* panel-data table — rounded bordered frame */}
              <div data-pdf-specblock className="overflow-hidden rounded-lg border isolate" style={{ borderColor: "#d4d4da" }}>
              {/* item bar */}
              <table className="w-full table-fixed border-separate border-spacing-0">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[51%]" />
                  <col className="w-[18%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <tbody>
                  <tr style={{ background: TRED }} className="text-white font-display">
                    <td className="border-r border-white/40 px-3 text-sm font-bold leading-[26px]">Item No. {pi + 1}</td>
                    <td className="px-3 text-center text-sm font-bold leading-[26px]">{p.name}</td>
                    <td className="border-l border-white/40 px-3 text-left text-sm font-bold leading-[26px]">Item Qty.</td>
                    <td className="border-l border-white/40 px-3 text-center text-sm font-bold leading-[26px]">{p.qty}</td>
                  </tr>
                </tbody>
              </table>
              {/* spec grid — 2 label/value pairs per row, like the reference.
                  A spare-parts cell has no specs, so only its item bar shows. */}
              {!p.spare && (
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[51%]" />
                  <col className="w-[18%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <tbody>
                  {([
                    ["Panel Type", sp.panelType, "IP", sp.ip],
                    ["Mounting", sp.mount, "Rating", p.ratingA ? `${p.ratingA} A` : ""],
                    ["RAL", sp.ral, "Amb. Temp.", p.ambTemp],
                    ["Copper", p.copperType, "Neutral", p.neutral],
                    ["Incoming Cables", p.incomingCables, "Earth", p.earth],
                    ["Outgoing Cables", p.outgoingCables, "Form", p.form],
                    ["Short Circuit", p.shortCircuit, "Fed From", p.fedFrom],
                  ] as [string, React.ReactNode, string, React.ReactNode][]).map(([l1, v1, l2, v2]) => (
                    <tr key={l1}>
                      <Lbl>{l1}</Lbl>
                      <Val>{v1}</Val>
                      <Lbl>{l2}</Lbl>
                      <Val>{v2}</Val>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
              </div>{/* /panel-data frame */}
              <div className="h-3" aria-hidden />{/* white space between the two tables */}
              {/* components table — rounded bordered frame. overflow-hidden clips the corners; note
                  it also stops Chrome repeating <thead>/<tfoot> across print pages, so a panel that
                  overflows shows its header + page-number footer on its last page (not each page). */}
              <div className="overflow-hidden rounded-lg border isolate" style={{ borderColor: "#d4d4da" }}>
              <table data-pdf-comptable className="w-full table-fixed border-separate border-spacing-0">
                <colgroup>
                  <col className="w-[9%]" />
                  <col className={hideBrand ? "w-[76%]" : "w-[67%]"} />
                  <col className="w-[7%]" />
                  {!hideBrand && <col className="w-[9%]" />}
                  <col className="w-[8%]" />
                </colgroup>
                <thead>
                  <tr style={{ background: TRED }} className="text-white font-display">
                    <th className="px-2 text-center py-1 text-[12px] font-bold leading-[17px]">Qty</th>
                    <th className="px-2 text-center py-1 text-[12px] font-bold leading-[17px]">Description</th>
                    <th className="px-2 text-center py-1 text-[12px] font-bold leading-[17px]">ADJ</th>
                    {/* Header carries no control. The eye used to sit here, inside the
                        orange header row — document content, not UI — so it printed in
                        the offer and was baked into the exported PDF. The toggle lives
                        above the offer instead; this column just obeys it. */}
                    {!hideBrand && (
                      <th className="px-2 text-left py-1 text-[12px] font-bold leading-[17px]">Brand</th>
                    )}
                    <th className="px-2 text-left py-1 text-[12px] font-bold leading-[17px]">NOTE</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let secs = p.sections.filter((sec) => p.components.some((c) => c.section === sec));
                    // Quotations saved before the KWHM section fix carry components
                    // filed under a section their panel does not have, so nothing
                    // matched and the panel printed empty while still being charged
                    // for. Falling back to the sections the components actually claim
                    // repairs those on load — no migration, and their totals are
                    // untouched. Only "no components at all" now prints empty.
                    if (secs.length === 0 && p.components.length > 0)
                      secs = [...new Set(p.components.map((c) => c.section).filter(Boolean))];
                    if (secs.length === 0)
                      return (
                        <tr><td colSpan={5} className="px-2 py-5 text-center text-sm text-muted">No components.</td></tr>
                      );
                    // RPT: the orange group sub-labels (Circuit Breaker, Contactor…) only
                    // appear when the panel has MORE THAN ONE section; a single-section
                    // panel prints a clean flat component list under its section header.
                    const multiSection = secs.length > 1;
                    const effGroup = effectiveGroups(p.components);
                    return secs.flatMap((sec) => {
                      const comps = p.components.filter((c) => c.section === sec);
                      const order: string[] = [];
                      const byG = new Map<string, PanelComponent[]>();
                      comps.forEach((c) => {
                        const k = effGroup.get(c.id) || "";
                        if (!byG.has(k)) { byG.set(k, []); order.push(k); }
                        byG.get(k)!.push(c);
                      });
                      const rows: JSX.Element[] = [];
                      let dataRow = 0; // zebra counter — shade every other component row (per section)
                      // Section header shows for multi-section panels, and whenever the
                      // section has combination sub-groups (Source 1 / 2 …) so the section
                      // context (e.g. Main Incoming) is never lost above the sub-headers.
                      if (multiSection || order.some((g) => g))
                        rows.push(
                          <tr key={`s-${sec}`} data-pdf-head style={{ breakInside: "avoid", breakAfter: "avoid" }}>
                            {sec.length > 40 ? (
                              // long name (e.g. P.F.C.) — span all columns so it fits on one line
                              <td colSpan={5} className="border-y px-2 py-1 text-center font-display text-[12px] font-bold capitalize tracking-wide leading-[15px] whitespace-nowrap" style={{ background: "#d6d6dc", borderColor: "#c4c4cc" }}>{sec}</td>
                            ) : (
                              // short name — centred in the Description column, aligned with the "Description" header
                              <>
                                <td className="border-y" style={{ background: "#d6d6dc", borderColor: "#c4c4cc" }} />
                                <td className="border-y px-2 py-1 text-center font-display text-[12px] font-bold capitalize tracking-wide leading-[15px]" style={{ background: "#d6d6dc", borderColor: "#c4c4cc" }}>{sec}</td>
                                <td colSpan={3} className="border-y" style={{ background: "#d6d6dc", borderColor: "#c4c4cc" }} />
                              </>
                            )}
                          </tr>
                        );
                      for (const g of order) {
                        // Combination sub-header (Source 1 / Source 2 / …) under the section.
                        if (g) {
                          // Derive the combination multiplier (qty ÷ baseQty) so the offer
                          // sub-header still shows ×N, in sync with the editor.
                          const gf = byG.get(g)!.find((c) => !isSpacer(c));
                          const gbase = gf ? (gf.baseQty ?? gf.qty) : 0;
                          const gcq = gf && gbase > 0 ? Math.max(1, Math.round(gf.qty / gbase)) : 1;
                          // Match the panels editor: MCC (by name) + custom combinations (flagged) show "QTY (N) each contain:".
                          const gScalable = /\(Type \d+\)/.test(g) || !!byG.get(g)!.find((c) => !isSpacer(c))?.comboScalable;
                          rows.push(
                            // Group sub-header styled like the panels editor. break-after: avoid keeps it
                            // with its first rows so it's never stranded at the bottom of a page. The empty
                            // first cell starts the header at the Description column, aligned with its items;
                            // every sub-header uses one font size (13.5px) regardless of name length.
                            <tr key={`g-${sec}-${g}`} data-pdf-head style={{ breakInside: "avoid", breakAfter: "avoid" }}>
                              <td className="py-1" />
                              <td colSpan={hideBrand ? 3 : 4} className="px-2 py-1 text-left font-display font-normal leading-[20px] text-[13.5px] underline underline-offset-2" style={{ color: TRED }}><span className="uppercase">{g}</span>{gScalable ? <span className="font-bold">, QTY ({gcq}) each contain:</span> : ""}</td>
                            </tr>
                          );
                        }
                        for (const c of byG.get(g)!)
                          rows.push(isSpacer(c) ? (
                            <tr key={c.id}>
                              <td colSpan={hideBrand ? 4 : 5} className="px-2 py-0.5 text-[12.5px] leading-[12.5px]">&nbsp;</td>
                            </tr>
                          ) : (
                            <tr key={c.id} style={{ breakInside: "avoid" }} className={`align-middle ${dataRow++ % 2 === 1 ? "bg-[#f4f4f6]" : ""}`}>
                              <td className="px-2 py-1 text-center text-[12.5px] font-semibold leading-[15px]">{c.baseQty ?? c.qty}</td>
                              <td className="px-2 py-1 text-[12.5px] leading-[15px]">
                                {c.name}
                                {c.comment && <div className="mt-0.5 text-[11px] italic leading-tight text-muted">{c.comment}</div>}
                              </td>
                              <td className="px-2 py-1 text-center text-[12.5px] leading-[15px]">{c.adj}</td>
                              {!hideBrand && <td className="px-2 py-1 text-[12.5px] leading-[15px]">{c.brand}</td>}
                              <td className="px-2 py-1 text-[11.5px] text-muted leading-[15px]">{c.note}</td>
                            </tr>
                          ));
                      }
                      return rows;
                    });
                  })()}
                </tbody>
              </table>
              </div>
              {/* Page number below the table, pinned to the bottom of the page (mt-auto), centered. */}
              <div className="mt-auto pt-3 text-center text-[10.5px] font-semibold text-muted">Page {3 + pi + sepsBefore}</div>
              </div>
            </Fragment>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/** Commercial Offer — panel prices at the current Pricing Settings. */
// Auto-growing borderless textarea (the section body).
function AutoTextarea({ value, onChange, rtl, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; rtl?: boolean; placeholder?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={1} dir={rtl ? "rtl" : undefined}
      placeholder={placeholder} disabled={disabled}
      className={`w-full resize-none whitespace-pre-wrap border-0 bg-transparent p-0 text-[12px] leading-relaxed text-ink outline-none placeholder:text-muted/60 ${rtl ? "text-right" : ""}`} />
  );
}

// Editable Terms & Conditions — each section has a bold/larger title + body. Add / remove / edit.
function TermsEditor({ value, onSave, rtl }: { value: TermsSection[]; onSave: (v: TermsSection[]) => void; rtl?: boolean }) {
  const edit = (i: number, patch: Partial<TermsSection>) => onSave(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onSave(value.filter((_, j) => j !== i));
  const add = () => onSave([...value, { title: "", body: "" }]);
  return (
    <div className="space-y-3" dir={rtl ? "rtl" : undefined}>
      {value.map((sec, i) => (
        <div key={i} className={`relative ${rtl ? "pl-5" : "pr-5"}`}>
          <input value={sec.title} onChange={(e) => edit(i, { title: e.target.value })} placeholder="Section title" dir={rtl ? "rtl" : undefined}
            className={`w-full border-0 bg-transparent p-0 font-display text-[14px] font-bold text-ink outline-none ${rtl ? "text-right" : ""}`} />
          <AutoTextarea value={sec.body} onChange={(v) => edit(i, { body: v })} rtl={rtl} />
          <button type="button" onClick={() => remove(i)} title="Remove section"
            className={`no-print absolute top-0 px-1 text-base leading-none text-muted hover:text-red-500 ${rtl ? "left-0" : "right-0"}`}>×</button>
        </div>
      ))}
      <button type="button" onClick={add} className="no-print text-xs font-semibold text-brand hover:underline">+ Add section</button>
    </div>
  );
}

function CommercialTab({ s, qtnNo, up }: { s: LvState; qtnNo: string; up: (patch: Partial<LvState>) => void }) {
  const { confirm, dialogs } = useDialogs();
  // RPT-1: selling currency — default USD; EGP-based prices convert via the Pricing rate.
  // Stored on the quotation, not in this tab, so the ERP export quotes in the same
  // currency the customer was quoted in.
  const cur = s.offerCurrency ?? "USD";
  const setCur = (c: "USD" | "EGP") => up({ offerCurrency: c });
  if (!s.panels.length) {
    return <div className="card p-10 text-center text-sm text-muted animate-fade-up">Add panels first — the Commercial Offer is generated from them.</div>;
  }
  const calcs: [LvPanel, PanelCalc][] = s.panels.map((p) => [p, calcPanel(p, s.factors, s.abbItemDiscounts)]);
  const subtotal = calcs.reduce((t, [, c]) => t + c.totalSell, 0);
  const vat = subtotal * s.factors.vat;
  const rate = cur === "USD" ? (s.factors.usd || 1) : 1; // EGP per unit of display currency
  const m = (egp: number) => fmtEgp(egp / rate);
  const revNum = parseInt((s.project.revisionNo || "").replace(/\D/g, ""), 10) || 0;
  const qtnRef = revNum > 0 ? `${qtnNo}-${revNum}` : qtnNo;
  const exportPdf = async () => {
    const printArea = document.querySelector<HTMLElement>("[data-co-root]");
    if (!printArea) return;
    const { exportSheetsPdf } = await import("../lv/technicalPdf");
    await exportSheetsPdf({ printArea, filename: offerTitle("CO", qtnNo, s.project.revisionNo) });
  };
  return (
    <div className="animate-fade-up">
      {dialogs}
      <PrintBar label="Prices follow the Pricing Settings tab (rates, ABB discount, factor) live."
        docTitle={offerTitle("CO", qtnNo, s.project.revisionNo)} blockers={exportBlockers(s)} exportFn={exportPdf} />
      <div className="mb-3 flex items-center gap-2 no-print">
        <span className="text-xs font-semibold text-muted">Currency</span>
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {(["USD", "EGP"] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCur(c)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${cur === c ? "bg-brand text-white" : "text-muted hover:text-brand"}`}>{c}</button>
          ))}
        </div>
      </div>
      <div className="offer-workspace">
      <div data-co-root className="print-area space-y-6">
        {/* Cover page — same branded cover as the Technical Offer */}
        <OfferCover s={s} qtnNo={qtnNo} kind="Commercial" />
        <section className="a4-sheet flex flex-col space-y-5 px-10 pb-10 pt-12">
        <PageHeader s={s} qtnRef={qtnRef} />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-brand text-left text-[12px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-2 w-10">Item</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2 text-center w-14">Qty</th>
              <th className="py-1.5 pr-2 text-right w-32">Unit price ({cur})</th>
              <th className="py-1.5 text-right w-32">Total ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {calcs.map(([p, c], i) => (
              <tr key={p.id} className="border-b border-line/60 align-top">
                <td className="py-1.5 pr-2 font-bold text-muted">{i + 1}</td>
                <td className="py-1.5 pr-2"><b>{p.name}</b></td>
                <td className="py-1.5 pr-2 text-center font-semibold">{p.qty}</td>
                <td className="py-1.5 pr-2 text-right">{m(c.sellUnit)}</td>
                <td className="py-1.5 text-right font-semibold">{m(c.totalSell)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto w-72 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal (excl. VAT)</span><b>{m(subtotal)}</b></div>
          <div className="flex justify-between"><span className="text-muted">VAT {Math.round(s.factors.vat * 100)}%</span><b>{m(vat)}</b></div>
          <div className="flex justify-between border-t-2 border-brand pt-1 text-base"><span className="font-bold">Total ({cur})</span><b className="text-brand-dark">{m(subtotal + vat)}</b></div>
        </div>
        </section>
        {/* General Terms & Conditions (English) — its own A4 page; <thead> logo repeats per printed page. */}
        <section className="a4-sheet px-10 pb-10 pt-12" style={{ breakAfter: "page" }}>
          <table className="w-full">
            <thead>
              <tr><td className="pb-3">
                <div className="flex items-center border-b pb-2" style={{ borderColor: "#E7E7EB" }}>
                  <img src="/brand/logo-horizontal.png" alt="PowerLine" className="h-14" />
                </div>
              </td></tr>
            </thead>
            <tbody>
              <tr><td>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="font-display text-xl font-bold" style={{ color: TRED }}>General Terms &amp; Conditions</h2>
                  <button type="button" title="Reset to the default terms"
                    onClick={async () => { if (await confirm({ title: "Reset the Terms & Conditions", message: "They go back to the standard wording, and your edits are lost.", confirmLabel: "Reset them", tone: "danger" })) up({ commercialTerms: DEFAULT_COMMERCIAL_TERMS.map((t) => ({ ...t })) }); }}
                    className="no-print shrink-0 rounded-lg border border-line px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-brand/40 hover:bg-brand-tint hover:text-brand">
                    ↺ Reset to default
                  </button>
                </div>
                <TermsEditor key={qtnNo} value={Array.isArray(s.commercialTerms) ? s.commercialTerms : DEFAULT_COMMERCIAL_TERMS} onSave={(v) => up({ commercialTerms: v })} />
              </td></tr>
            </tbody>
          </table>
        </section>
        {/* Arabic Terms & Conditions — starts on a new page. */}
        <section className="a4-sheet px-10 pb-10 pt-12">
          <table className="w-full">
            <thead>
              <tr><td className="pb-3">
                <div className="flex items-center border-b pb-2" style={{ borderColor: "#E7E7EB" }}>
                  <img src="/brand/logo-horizontal.png" alt="PowerLine" className="h-14" />
                </div>
              </td></tr>
            </thead>
            <tbody>
              <tr><td>
                <div className="mb-3 flex items-center justify-between gap-4" dir="rtl">
                  <h2 className="font-display text-xl font-bold" style={{ color: TRED }}>الشروط والأحكام العامة</h2>
                  <button type="button" title="إعادة التعيين إلى الافتراضي"
                    onClick={async () => { if (await confirm({ title: "إعادة تعيين الشروط والأحكام", message: "ستعود إلى الصيغة الافتراضية وستفقد تعديلاتك.", confirmLabel: "إعادة التعيين", cancelLabel: "إلغاء", tone: "danger" })) up({ commercialTermsAr: DEFAULT_COMMERCIAL_TERMS_AR.map((t) => ({ ...t })) }); }}
                    className="no-print shrink-0 rounded-lg border border-line px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-brand/40 hover:bg-brand-tint hover:text-brand">
                    ↺ إعادة التعيين
                  </button>
                </div>
                <TermsEditor key={`${qtnNo}-ar`} rtl value={Array.isArray(s.commercialTermsAr) ? s.commercialTermsAr : DEFAULT_COMMERCIAL_TERMS_AR} onSave={(v) => up({ commercialTermsAr: v })} />
              </td></tr>
            </tbody>
          </table>
        </section>
      </div>
      </div>
    </div>
  );
}

// ── Project tab (RPT-01) ─────────────────────────────────────────────────────
function ProjectTab({ s, up, qtnNum, onRenameQtn }: {
  s: LvState; up: (p: Partial<LvState>) => void;
  qtnNum: string; onRenameQtn: (n: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const pr = s.project;
  const upPr = (patch: Partial<LvState["project"]>) => up({ project: { ...pr, ...patch } });
  const [staff, setStaff] = useStaff();
  const pickSales = (name: string) => {
    // Known registry name → auto-fill their contact. A custom (typed) name keeps
    // whatever phone/email is there so the user can enter it in the now-editable fields.
    const sp = staff.salesPeople.find((x) => x.name === name);
    upPr(sp ? { salesPerson: name, salesMobile: sp.mobile, salesEmail: sp.email } : { salesPerson: name });
  };
  // A registry name auto-fills (and locks) the contact; a custom name makes it editable.
  const knownSales = staff.salesPeople.some((x) => x.name === pr.salesPerson);
  // Sales manager is fixed (Ali Kamal); his contact comes from the shared registry.
  const mgr = staff.salesManagers.find((m) => m.name === SALES_MANAGER);
  const [newSales, setNewSales] = useState({ name: "", mobile: "", email: "" });
  const [newEng, setNewEng] = useState("");
  // QTN number — editable here; commits to the registry on blur / Enter (kept unique).
  const [qtnDraft, setQtnDraft] = useState(qtnNum);
  const [qtnErr, setQtnErr] = useState("");
  useEffect(() => { setQtnDraft(qtnNum); }, [qtnNum]);
  const commitQtn = async () => {
    if (qtnDraft.trim() === qtnNum.trim()) { setQtnErr(""); return; }
    const res = await onRenameQtn(qtnDraft);
    setQtnErr(res.ok ? "" : res.error || "Invalid QTN number.");
  };

  return (
    <div className="grid max-w-4xl gap-5 animate-fade-up">
      <div className="card p-5">
        <h2 className="sec-head">Project</h2>
        <p className="mb-3 text-xs text-muted">Used to generate the Technical & Commercial offer cover pages.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Row 1: Project name | Customer */}
          <div><L>Project name <span className="text-red-500">*</span></L><input className={`input ${pr.name.trim() ? "" : "ring-1 ring-red-400"}`} value={pr.name} onChange={(e) => upPr({ name: e.target.value })} /></div>
          <div><L>Customer <span className="text-red-500">*</span></L><input className={`input ${pr.customer.trim() ? "" : "ring-1 ring-red-400"}`} value={pr.customer} onChange={(e) => upPr({ customer: e.target.value })} /></div>
          {/* Row 2 left (spans the Project-name column): QTN No. + Revision No. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <L>QTN No. <span className="text-red-500">*</span></L>
              <input className={`input ${qtnDraft.trim() ? "" : "ring-1 ring-red-400"}`} value={qtnDraft}
                onChange={(e) => { setQtnDraft(e.target.value); setQtnErr(""); }}
                onBlur={commitQtn}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setQtnDraft(qtnNum); setQtnErr(""); } }} />
              {qtnErr && <p className="mt-1 text-[11px] font-semibold text-red-600">{qtnErr}</p>}
            </div>
            <div><L>Revision No.</L><input className="input" value={pr.revisionNo} onChange={(e) => upPr({ revisionNo: e.target.value })} /></div>
          </div>
          {/* Row 2 right: OPTY No. */}
          <div><L>OPTY No.</L><input className="input" value={pr.optyNo} onChange={(e) => upPr({ optyNo: e.target.value })} /></div>
          <div>
            <L>Sales support engineer <span className="text-red-500">*</span></L>
            <select className={`input cursor-pointer ${pr.supportEngineer ? "" : "ring-1 ring-red-400"}`} value={pr.supportEngineer} onChange={(e) => upPr({ supportEngineer: e.target.value })}>
              <option value="">— select —</option>
              {staff.supportEngineers.map((p) => <option key={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div><L>Date</L><input className="input" type="date" value={pr.date} onChange={(e) => upPr({ date: e.target.value })} /></div>
          {/* Sales manager — name + phone side by side, email full width below */}
          <div className="grid content-start gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><L>Sales manager</L><input className="input bg-surface" value={SALES_MANAGER} readOnly /></div>
              <div><L>Phone no.</L><input className="input bg-surface" value={mgr?.mobile ?? ""} readOnly /></div>
            </div>
            <div><L>Manager email</L><input className="input bg-surface" value={mgr?.email ?? ""} readOnly /></div>
          </div>
          {/* Sales person — pick from the registry OR type a custom name; a custom name
              opens the phone/email fields so their contact can be entered. */}
          <div className="grid content-start gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <L>Sales person</L>
                <input className="input" list="lv-sales-people" value={pr.salesPerson}
                  placeholder="Select or type a name…" onChange={(e) => pickSales(e.target.value)} />
                <datalist id="lv-sales-people">
                  {staff.salesPeople.filter((p) => p.name !== SALES_MANAGER).map((p) => <option key={p.name} value={p.name} />)}
                </datalist>
              </div>
              <div>
                <L>Phone no.</L>
                <input className={`input ${knownSales ? "bg-surface" : ""}`} value={pr.salesMobile} readOnly={knownSales}
                  placeholder={knownSales ? "" : "Type phone no.…"} onChange={(e) => upPr({ salesMobile: e.target.value })} />
              </div>
            </div>
            <div>
              <L>Sales person email</L>
              <input className={`input ${knownSales ? "bg-surface" : ""}`} value={pr.salesEmail} readOnly={knownSales}
                placeholder={knownSales ? "" : "Type email…"} onChange={(e) => upPr({ salesEmail: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="sec-head">Staff lists</h2>
        <L>Sales people</L>
        <div className="mb-2 max-h-44 overflow-auto rounded-lg border border-line">
          {staff.salesPeople.map((p) => (
            <div key={p.name} className="flex items-center justify-between border-b border-line/60 px-3 py-1 text-sm last:border-0">
              <span>{p.name} <span className="text-[11px] text-muted">{p.mobile} · {p.email}</span></span>
              <button className="text-red-500 hover:underline"
                onClick={() => setStaff({ ...staff, salesPeople: staff.salesPeople.filter((x) => x.name !== p.name) })}>remove</button>
            </div>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <input className="input h-9 w-36" placeholder="Name" value={newSales.name} onChange={(e) => setNewSales({ ...newSales, name: e.target.value })} />
          <input className="input h-9 w-36" placeholder="Mobile" value={newSales.mobile} onChange={(e) => setNewSales({ ...newSales, mobile: e.target.value })} />
          <input className="input h-9 w-48" placeholder="Email" value={newSales.email} onChange={(e) => setNewSales({ ...newSales, email: e.target.value })} />
          <button className="btn-ghost h-9" onClick={() => {
            if (!newSales.name.trim()) return;
            setStaff({ ...staff, salesPeople: [...staff.salesPeople, { ...newSales, name: newSales.name.trim() }] });
            setNewSales({ name: "", mobile: "", email: "" });
          }}>+ Add</button>
        </div>
        <L>Sales support engineers</L>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {staff.supportEngineers.map((e) => (
            <span key={e.name} className="chip bg-surface text-ink">
              {e.name}
              <button className="ml-1.5 text-red-500" onClick={() => setStaff({ ...staff, supportEngineers: staff.supportEngineers.filter((x) => x.name !== e.name) })}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input h-9 w-56" placeholder="New engineer name" value={newEng} onChange={(e) => setNewEng(e.target.value)} />
          <button className="btn-ghost h-9" onClick={() => {
            if (newEng.trim()) { setStaff({ ...staff, supportEngineers: [...staff.supportEngineers, { name: newEng.trim(), mobile: "", email: "" }] }); setNewEng(""); }
          }}>+ Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Pricing tab (RPT-01: Pricing Settings replaces "Panels Section") ─────────
function PricingTab({ s, up }: { s: LvState; up: (p: Partial<LvState>) => void }) {
  const f = s.factors;
  const upF = (k: string, v: number) => up({ factors: { ...f, [k]: v } });
  const fx = useLiveRates();
  // Your USD/EUR rate must stay at or above the live rate — enforced as a field minimum.
  const liveUsd = liveRate2dp(fx.rates?.usd);
  const liveEur = liveRate2dp(fx.rates?.eur);
  // plain function (NOT a nested component) so inputs keep focus across re-renders
  const num = (k: "euro" | "usd" | "safetyFactor" | "copper" | "sheetMetal" | "operations" | "factor" | "abbDiscount" | "vat",
    label: string, opts?: { step?: number; pct?: boolean; hint?: string; min?: number; max?: number }) => {
    const capMax = (v: number) => (opts?.max != null ? Math.min(opts.max, v) : v);         // enforce max as you type
    const clamp = (v: number) => Math.min(opts?.max ?? Infinity, Math.max(opts?.min ?? -Infinity, v)); // full clamp on blur
    return (
      <div key={k}>
        <L>{label}</L>
        <input className="input" type="number" step={opts?.step ?? 0.01} min={opts?.min} max={opts?.max}
          value={(opts?.pct ? Math.round(f[k] * 10000) / 100 : f[k]) || ""}
          onChange={(e) => { const d = capMax(parseFloat(e.target.value) || 0); upF(k, opts?.pct ? d / 100 : d); }}
          onBlur={(e) => { const d = clamp(parseFloat(e.target.value) || 0); upF(k, opts?.pct ? d / 100 : d); }} />
        {opts?.hint && <p className="mt-1 text-[11px] text-muted">{opts.hint}</p>}
      </div>
    );
  };
  return (
    <div className="flex flex-col items-start gap-4 animate-fade-up lg:flex-row">
      <div className="card w-full max-w-3xl p-5">
        <h2 className="sec-head">Pricing Settings</h2>
        <p className="mb-3 text-xs text-muted">
          Exchange rates, material costs, operations and margins — drives the EGP selling price live.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {num("factor", "Selling factor", { hint: "cost ÷ factor = selling price" })}
          {num("copper", "Copper (EGP/KG)", { step: 1 })}
          {num("sheetMetal", "Sheet metal (EGP/KG)", { step: 1 })}
          {num("euro", "EUR → EGP", { min: liveEur, hint: liveEur ? `must be ≥ live ${liveEur}` : undefined })}
          {num("usd", "USD → EGP", { min: liveUsd, hint: liveUsd ? `must be ≥ live ${liveUsd}` : undefined })}
          {num("safetyFactor", "Safety Factor (%)", { pct: true, min: 0, max: 10, hint: "0–10% only · 2% → ×1.02 · 0% = no change" })}
          {num("operations", "Operations (%)", { pct: true })}
          {num("abbDiscount", "ABB discount (%)", { pct: true, hint: "Applied to ABB products ONLY (RPT-01)" })}
          {num("vat", "VAT (%)", { pct: true })}
        </div>
      </div>
      <LiveFxCard s={s} fx={fx} onApply={upF} />
      <div className="card flex w-full flex-1 flex-col self-stretch p-5 lg:min-w-[15rem]">
        <h2 className="sec-head mb-2">Record Results</h2>
        <textarea className="input min-h-[220px] w-full flex-1 resize-y text-[13px]" placeholder="Record results, notes, decisions…"
          value={s.recordResults ?? ""} onChange={(e) => up({ recordResults: e.target.value })} />
      </div>
    </div>
  );
}

// Live FX (EGP) for USD & EUR — fetched client-side from a free, no-key, CORS-enabled
// source (with a fallback). Shared so the Pricing fields' minimum and the LiveFxCard
// both read the same rates without double-fetching.
function useLiveRates() {
  const [rates, setRates] = useState<null | { usd: number; eur: number; updated: string }>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const load = async () => {
    setStatus("loading");
    // Base USD → rates.EGP is USD→EGP; EUR→EGP = rates.EGP / rates.EUR.
    for (const url of ["https://open.er-api.com/v6/latest/USD", "https://api.exchangerate-api.com/v4/latest/USD"]) {
      try {
        const j = await (await fetch(url)).json();
        const egp = j?.rates?.EGP, eurPerUsd = j?.rates?.EUR;
        if (!egp || !eurPerUsd) continue;
        setRates({ usd: egp, eur: egp / eurPerUsd, updated: j.time_last_update_utc || j.date || "" });
        setStatus("ok");
        return;
      } catch { /* try next source */ }
    }
    setStatus("error");
  };
  useEffect(() => { load(); }, []);
  return { rates, status, load };
}
type LiveRates = ReturnType<typeof useLiveRates>;
/** 2-decimal live rate for a currency, or undefined until loaded. */
const liveRate2dp = (v?: number) => (v && v > 0 ? Math.round(v * 100) / 100 : undefined);
// Card comparing the live market rate against the manual Pricing-Settings rate, with
// one-click "Use". The fetch is shared (see useLiveRates) and passed in as `fx`.
function LiveFxCard({ s, fx, onApply }: { s: LvState; fx: LiveRates; onApply: (k: "usd" | "euro", v: number) => void }) {
  const f = s.factors;
  const { rates, status, load } = fx;
  const rows: { code: string; key: "usd" | "euro"; live?: number; cur: number }[] = [
    { code: "USD", key: "usd", live: rates?.usd, cur: f.usd },
    { code: "EUR", key: "euro", live: rates?.eur, cur: f.euro },
  ];
  // Project selling in USD: LEFT uses the project's own rates; RIGHT re-prices the
  // whole project at the LIVE rates (live EUR→EGP for cost, live USD→EGP to convert).
  const fmtUsd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const sellUsdOwn = f.usd > 0 ? grandTotals(s).sell / f.usd : 0;
  // Warn if a "your rate" is below the live rate (it must be equal or bigger).
  const warnCodes = rows.filter((r) => r.live != null && r.cur < Math.round(r.live * 100) / 100).map((r) => r.code);
  return (
    <div className="flex w-full flex-col gap-3 self-stretch lg:max-w-md">
      <div className="card flex w-full flex-1 flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="sec-head mb-0">Live Exchange Rates</h2>
        <button type="button" onClick={load} disabled={status === "loading"} title="Refresh live rates"
          className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-brand/40 hover:text-brand-dark disabled:opacity-40">
          {status === "loading" ? "…" : "↻ Refresh"}
        </button>
      </div>
      <p className="mb-3 mt-3 text-xs text-muted">Market mid-rates in EGP — compare with your settings, or apply.</p>
      <div className="flex-1">
      {status === "error" ? (
        <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
          Couldn't load live rates. <button type="button" onClick={load} className="font-semibold text-brand hover:underline">Retry</button>
        </div>
      ) : (
        <table className="h-full w-full text-[13px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="py-1.5">Currency</th>
              <th className="py-1.5 text-right">Live (EGP)</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const live = r.live != null ? Math.round(r.live * 100) / 100 : null;
              return (
                <tr key={r.code} className="border-t border-line/70">
                  <td className="py-1.5"><b className="text-ink">{r.code}</b> <span className="text-muted">→ EGP</span></td>
                  <td className="py-1.5 text-right font-bold text-ink">{status === "loading" ? "…" : (live?.toFixed(2) ?? "—")}</td>
                  <td className="py-1.5 text-right">
                    <button type="button" disabled={live == null || live === r.cur}
                      onClick={() => live != null && onApply(r.key, live)}
                      title={live != null ? `Set ${r.code} → EGP to ${live.toFixed(2)}` : ""}
                      className="rounded border border-brand bg-white px-2 py-0.5 text-[11px] font-bold text-brand-dark hover:bg-brand-light disabled:opacity-30">
                      Use
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      </div>{/* /flex-1 table area */}
      {status === "ok" && warnCodes.length > 0 && (
        <p className="mt-2 rounded-md border border-red-400/50 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-500">
          ⚠ Your rate is below the live rate for {warnCodes.join(" & ")} — check Pricing Settings.
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted">
        Source: open.er-api.com{rates?.updated ? ` · updated ${rates.updated}` : ""}
      </p>
      </div>{/* /Live Exchange Rates card */}
      {/* Project selling in USD at your (Pricing-Settings) rates. */}
      <div className="card border-brand/40 bg-brand-light/50 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Project selling · USD</p>
        <p className="mt-0.5 text-lg font-extrabold text-brand-dark">{fmtUsd(sellUsdOwn)}</p>
        <p className="text-[10px] text-muted">EUR {f.euro} · ÷ {f.usd} EGP/USD · excl. VAT</p>
      </div>
    </div>
  );
}

// ── Panels tab ───────────────────────────────────────────────────────────────
// ── Spare Parts cell editor ──────────────────────────────────────────────────
// The stripped editor for a spare-parts QTN's single "Spare parts" cell: a name,
// two search bars (components · panels & cells / enclosures) that add priced rows,
// and a manual copper weight (kg × the copper rate). No sizing, copper tool or
// panel details. Its price flows through calcPanel into every offer + the totals.
function spareEnclosureRow(e: DbEnclosure): PanelComponent {
  return {
    id: uid(), section: "Spare parts", name: `${e.fam} — ${e.name}`, desc: e.name, ref: e.ref,
    type: "Enclosure", brand: e.fam, rating: e.ip || "", eur: e.eur, egp: e.egp, poles: 0,
    cuP: 0, cuC: 0, stock: "", qty: 1, adj: "", comment: "", note: "",
  };
}
// Enclosure search bar — a twin of ComponentSearch (same dropdown, arrow-nav, price
// badge) but over the enclosure catalog (panels & cells).
function EnclosureSearch({ factors, onPick, placeholder, inputRef }: {
  factors: LvState["factors"]; onPick: (e: DbEnclosure) => void; placeholder?: string; inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [q, setQ] = useState("");
  const hits = useMemo(
    () => (q.trim()
      ? rankSearchOptions(ENCLOSURES.map((e) => ({ label: `${e.fam} — ${e.name}`, hint: `${e.ref} ${e.ip}`, e })), q, 40).map((o) => o.e)
      : []),
    [q],
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setActiveIdx(0); }, [q]);
  useEffect(() => { (listRef.current?.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [activeIdx]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setQ(""); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const pick = (e: DbEnclosure) => { onPick(e); setQ(""); };
  return (
    <div ref={wrapRef} className="relative">
      <input ref={inputRef} className="input" placeholder={placeholder ?? "Search enclosures (family / name / reference)…"}
        value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (!q) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); const en = hits[activeIdx]; if (en) pick(en); }
          else if (e.key === "Escape") setQ("");
        }} />
      {q && (
        <div ref={listRef} className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white shadow-lift">
          {hits.length === 0 && <div className="px-3 py-2 text-xs text-muted">No matches</div>}
          {hits.map((en, i) => (
            <button key={en.ref + en.name} type="button"
              className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${i === activeIdx ? "bg-brand-light" : "hover:bg-brand-tint"}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={() => pick(en)}>
              <b className="w-24 shrink-0 whitespace-nowrap text-left text-brand-dark">EGP {fmtEgp(enclosurePriceEgp(en, factors))}</b>
              <span className="min-w-0 flex-1 truncate">
                <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{en.fam}</span>
                {en.name}
                <span className="ml-1 text-[11px] text-muted">{en.ref}{en.ip ? ` · ${en.ip}` : ""}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function SpareEditor({ s, p, upPanel }: { s: LvState; p: LvPanel; upPanel: (id: string, patch: Partial<LvPanel>) => void }) {
  const f = s.factors;
  const u = (patch: Partial<LvPanel>) => upPanel(p.id, patch);
  const calc = calcPanel(p, s.factors, s.abbItemDiscounts);
  const priceOf = (c: PanelComponent) => componentPriceEgp(c, f);

  // Picking a result opens a small qty popup before the row is added — the same flow
  // as the panel's component search. preventScroll keeps the page from jumping, and
  // focus returns to the bar that was used so the next item can be typed right away.
  const [pending, setPending] = useState<PanelComponent | null>(null);
  const [pendQty, setPendQty] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const encRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (pending) { qtyRef.current?.focus({ preventScroll: true }); qtyRef.current?.select(); } }, [pending]);
  const pickComp = (c: DbComponent) => { setPending(toPanelComponent(c, "Spare parts", 1)); setPendQty(""); };
  const pickEnc = (e: DbEnclosure) => { setPending(spareEnclosureRow(e)); setPendQty(""); };
  const confirmAdd = () => {
    if (!pending) return;
    const wasEnc = pending.type === "Enclosure";
    u({ components: [...p.components, { ...pending, qty: Math.max(1, parseInt(pendQty, 10) || 1) }] });
    setPending(null); setPendQty("");
    requestAnimationFrame(() => (wasEnc ? encRef.current : searchRef.current)?.focus({ preventScroll: true }));
  };
  const cancelAdd = () => { setPending(null); setPendQty(""); };
  const setQty = (id: string, n: number) => u({ components: p.components.map((c) => (c.id === id ? { ...c, qty: Math.max(1, Math.round(n) || 1) } : c)) });
  const delRow = (id: string) => u({ components: p.components.filter((c) => c.id !== id) });

  const rows = p.components;
  return (
    <div className="space-y-4 animate-fade-up">
      {/* Header + name */}
      <div className="card p-5">
        <h2 className="sec-head flex items-center gap-2">🧰 Spare Parts</h2>
        <div className="mt-3 max-w-sm">
          <L>Name</L>
          <input className={`input ${nameClashOf(s, p) ? "border-red-400 bg-red-50/40" : ""}`} value={p.name}
            placeholder="Spare parts" onChange={(e) => u({ name: e.target.value })} />
          <PanelNameClash s={s} p={p} />
        </div>
      </div>

      {/* Two search bars: components · panels & cells — same bar as the panel editor. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <L>Add component</L>
          <ComponentSearch inputRef={searchRef} factors={f} onPick={pickComp} placeholder="Search components (name / reference / type / rating)…" />
        </div>
        <div className="card p-4">
          <L>Add panel / cell (enclosure)</L>
          <EnclosureSearch inputRef={encRef} factors={f} onPick={pickEnc} placeholder="Search enclosures (family / name / reference)…" />
        </div>
      </div>

      {/* Qty popup — opened when a component/enclosure is picked, before it's added. */}
      {pending && (
        <div className="rounded-lg border border-brand/50 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs">
            <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{pending.type === "Enclosure" ? "Enclosure" : pending.type || "Item"}</span>
            <span className="font-bold text-ink">{pending.name}</span>
            <span className="ml-1 text-[11px] text-muted">{pending.ref}{pending.brand ? ` · ${pending.brand}` : ""} · {fmtEgp(priceOf(pending))} EGP</span>
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted">Qty</label>
            <input ref={qtyRef} inputMode="numeric" className="input h-9 w-24" placeholder="1" value={pendQty}
              onChange={(e) => setPendQty(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") cancelAdd(); }} />
            <button type="button" className="btn-primary h-9 px-4 text-sm" onClick={confirmAdd}>Add</button>
            <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={cancelAdd}>Cancel</button>
          </div>
        </div>
      )}

      {/* Item list */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <colgroup><col className="w-[46%]" /><col className="w-[18%]" /><col className="w-[12%]" /><col className="w-[10%]" /><col className="w-[12%]" /><col className="w-8" /></colgroup>
          <thead>
            <tr className="border-b border-line bg-surface text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Description</th>
              <th className="px-3 py-2 font-semibold">Reference</th>
              <th className="px-3 py-2 font-semibold">Type / Brand</th>
              <th className="px-2 py-2 text-center font-semibold">Qty</th>
              <th className="px-3 py-2 text-right font-semibold">Line total</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No spare items yet — search above to add components or enclosures.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line/50 last:border-0">
                <td className="px-3 py-1.5 font-medium text-ink">{c.name}</td>
                <td className="px-3 py-1.5 text-muted">{c.ref || "—"}</td>
                <td className="px-3 py-1.5 text-muted">{c.type === "Enclosure" ? c.brand : c.brand || c.type || "—"}</td>
                <td className="px-2 py-1.5 text-center">
                  <input className="input h-7 w-14 px-1.5 text-center text-xs" inputMode="numeric" value={c.qty}
                    onChange={(e) => setQty(c.id, parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 1)} />
                </td>
                <td className="px-3 py-1.5 text-right font-semibold text-ink">{fmtEgp(priceOf(c) * c.qty)}</td>
                <td className="px-1 py-1.5 text-center">
                  <button onClick={() => delRow(c.id)} title="Remove" className="rounded p-0.5 text-red-500 hover:bg-red-50">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Copper by weight + cost breakdown */}
      <div className="card p-5">
        <h2 className="sec-head">Copper &amp; totals</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <L>Copper (KG)</L>
            <input className="input" type="number" min={0} step={0.5} value={p.mainBusbarKg || ""} placeholder="0"
              onChange={(e) => u({ mainBusbarKg: parseFloat(e.target.value) || 0 })} />
            <p className="mt-1 text-[11px] text-muted">× {fmtEgp(f.copper)} EGP/KG</p>
          </div>
          <div className="rounded-lg bg-surface p-2.5 text-sm">Components<br /><b>{fmtEgp(calc.compCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5 text-sm">Copper<br /><b>{fmtEgp(calc.busbarCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5 text-sm">Unit cost<br /><b>{fmtEgp(calc.unitCost)} EGP</b></div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-brand-light p-2.5 text-sm text-brand-dark">Selling (÷ {p.sellFactor > 0 ? p.sellFactor : f.factor})<br /><b>{fmtEgp(calc.sellUnit)} EGP</b></div>
          <div className="rounded-lg bg-brand p-2.5 text-sm text-white">Selling (USD)<br /><b>{fmtEgp(f.usd > 0 ? calc.sellUnit / f.usd : 0)} USD</b></div>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Generate the itemised list, prices and procurement from the Technical, Commercial and Material tabs above.
        </p>
      </div>
    </div>
  );
}

// ── LCP (Lighting Control Panel) editor ─────────────────────────────────────────
// A local control panel: SR-Basic enclosure auto-sized from the number of control
// groups. "No. Groups" auto-fills the component list (pilot lights / pushbuttons /
// terminals × G) and recommends the box (H × W × D). Cost = Components + Enclosure +
// A freely-typeable selling-factor input. It keeps a text "draft" while you edit,
// so partial decimals ("0.", "0.7156852") and clearing hold instead of snapping back
// to the global factor mid-typing. `value` is the per-panel override (0 = follow the
// global Pricing-Settings factor, shown as the placeholder).
function FactorInput({ value, global, onChange, className, title }: {
  value: number;
  global: number;
  onChange: (n: number) => void;
  className?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null ? draft : value > 0 ? String(value) : "";
  return (
    <input
      className={className ?? "input"}
      type="text"
      inputMode="decimal"
      value={shown}
      placeholder={String(global)}
      title={title}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return; // digits + a single dot only
        setDraft(raw);
        const n = parseFloat(raw);
        onChange(raw.trim() === "" || isNaN(n) ? 0 : n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

// Kits (10 % of the enclosure) + Cables → Unit cost → Factor → Unit selling.
function LcpEditor({ s, p, upPanel }: { s: LvState; p: LvPanel; upPanel: (id: string, patch: Partial<LvPanel>) => void }) {
  const f = s.factors;
  const u = (patch: Partial<LvPanel>) => upPanel(p.id, patch);
  const calc = calcPanel(p, s.factors, s.abbItemDiscounts);
  const priceOf = (c: PanelComponent) => componentPriceEgp(c, f);
  const G = p.noGroups || 0;
  // The same editor drives the LCP and KWHM auxiliary panels — same formula, different labels.
  const isKwhm = p.spareKind === "kwhm";
  const titleLabel = isKwhm ? "KWHM — kWh Meter Panel" : "LCP — Lighting Control Panel";
  const countLabel = isKwhm ? "No. KWHM" : "No. Groups";
  const unitWord = isKwhm ? "KWHM" : "group";
  const unitPlural = isKwhm ? "KWHM" : "groups";
  const perRow = isKwhm ? "KWHM/row" : "groups-per-row";

  const isDouble = p.panelsSizing?.layout === "Double";
  const fam = p.panelsSizing?.family ?? "SR-Basic";   // enclosure family (SR-Basic by default)
  const content = p.content ?? KWHM_CONTENTS[0];
  // Auto-size + the family actually used. KWHM tries its family (Local by default) and falls
  // back to SR-Basic when that family has no box tall enough; LCP just uses the cheapest box.
  const autoBoxFam = (g: number, family: string, cont = content): { box?: { H: number; W: number; D: number }; family: string } => {
    if (!isKwhm) return { box: lcpAutoSize(g, family) ?? undefined, family };
    // kwhmAutoSize returns the cheapest box across the family AND SR-Basic (which stocks
    // every width), plus the family that box belongs to — so a width the panel family
    // lacks (e.g. 60 cm for 4 KWHM in Local) is filled from SR-Basic and switches to it.
    const r = kwhmAutoSize(g, cont, family);
    return { box: r.box ?? undefined, family: r.family };
  };
  const applyBox = (patch: Partial<LvPanel>, g: number, family: string, cont = content) => {
    if (isDouble) return;                                   // Double: sizes are manual
    if (!(g > 0)) { patch.lcpBox = undefined; return; }
    const r = autoBoxFam(g, family, cont);
    patch.lcpBox = r.box;
    if (r.family !== family) patch.panelsSizing = { ...(patch.panelsSizing ?? p.panelsSizing), family: r.family };
  };
  // Entering the count auto-sizes the box (Single only). LCP also re-seeds its group
  // components (preserving hand-added rows); KWHM components stay manual.
  const setGroups = (n: number) => {
    const g = Math.max(0, Math.round(n) || 0);
    const patch: Partial<LvPanel> = { noGroups: g };
    if (!isKwhm) {
      const groupNames = new Set(LCP_GROUP_PARTS.map((gp) => gp.name));
      const extras = p.components.filter((c) => !groupNames.has(c.name));
      patch.components = [...lcpGroupComponents(g), ...extras];
    }
    applyBox(patch, g, fam);
    u(patch);
  };
  const setFamily = (family: string) => {
    const patch: Partial<LvPanel> = { panelsSizing: { ...p.panelsSizing, family } };
    applyBox(patch, G, family);
    u(patch);
  };
  const setContent = (cont: string) => {
    const patch: Partial<LvPanel> = { content: cont };
    applyBox(patch, G, fam, cont);
    u(patch);
  };
  const setQty = (id: string, n: number) =>
    u({ components: p.components.map((c) => (c.id === id ? { ...c, qty: Math.max(1, Math.round(n) || 1) } : c)) });

  // Component rows are editable like a panel: add (search), change (✎) and remove (✕).
  const [pending, setPending] = useState<PanelComponent | null>(null);
  const [pendQty, setPendQty] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (pending) { qtyRef.current?.focus({ preventScroll: true }); qtyRef.current?.select(); } }, [pending]);
  // This editor serves LCP *and* KWHM panels. Hardcoding "LCP" filed every KWHM
  // component under a section its panel does not have, so the Technical Offer found
  // nothing to print and fell through to "No components." — while the cost and the
  // Material List read the components directly and charged for them anyway.
  const ownSection = p.sections[0] ?? "LCP";
  const pickComp = (c: DbComponent) => { setPending(toPanelComponent(c, ownSection, 1)); setPendQty(""); };
  const confirmAdd = () => {
    if (!pending) return;
    u({ components: [...p.components, { ...pending, qty: Math.max(1, parseInt(pendQty, 10) || 1) }] });
    setPending(null); setPendQty("");
    requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  };
  const cancelAdd = () => { setPending(null); setPendQty(""); };
  const changeComp = (id: string, c: DbComponent) => {
    const nc = toPanelComponent(c, ownSection, 1);
    u({ components: p.components.map((r) => (r.id === id ? { ...nc, id: r.id, qty: r.qty } : r)) });
    setEditId(null);
  };
  const delRow = (id: string) => u({ components: p.components.filter((c) => c.id !== id) });
  // Drag-to-reorder component rows (grip handle).
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dropRow = (targetId: string) => {
    const dId = dragId;
    setDragId(null); setOverId(null);
    if (!dId || dId === targetId) return;
    const arr = [...p.components];
    const from = arr.findIndex((c) => c.id === dId);
    const to = arr.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    u({ components: arr });
  };

  const box = lcpBoxOf(p);
  const box2 = lcpBox2Of(p);
  const overCeiling = !isDouble && G > 0 && !box;   // beyond a single panel (> ~75 groups)
  const rows = p.components;
  const factor = p.sellFactor > 0 ? p.sellFactor : f.factor;
  const enclEgp = lcpEnclosureEgp(p, f);   // one box, or two (Double); honours a reference pick
  const cablesMissing = !((p.cablesEgp ?? 0) > 0);
  // Sizing dropdown — the family's boxes, priced from the catalogue. Families that name their
  // boxes by capacity (Primo "3PH-E-KWHM", Minicenter, Pro-E, IS2) carry no H×W×D at all, so
  // they are listed by name and addressed by catalogue reference instead of by size.
  const sizeOptions = [
    ...lcpSizes(fam).map((sz) => ({
      key: `${sz.H}x${sz.W}x${sz.D}`,
      label: `${sz.H} × ${sz.W} × ${sz.D} mm`,
      hint: `${fmtEgp(lcpEnclosureDbPrice(sz, f, fam))} EGP`,
    })),
    ...lcpNamedBoxes(fam).map((e) => ({
      key: `ref:${e.ref}`,
      label: e.name,
      hint: `${fmtEgp(enclosurePriceEgp(e, f))} EGP`,
    })),
  ];
  const refBox = lcpEnclByRef(p.lcpEnclRef);    // reference-picked box (non-dimensioned family)
  const refBox2 = lcpEnclByRef(p.lcpEnclRef2);
  // Auto-sizing candidates + which one is chosen. KWHM uses its meter-per-row rule; LCP the
  // groups-per-row rule. Both pick the lowest-priced candidate box.
  const kwhmMode = isKwhm && !!kwhmContentCfg(content);
  const WIDTH_CM = [40, 60, 80, 100];
  const GROUPS_PER_ROW = [2, 3, 4, 5];
  const sizeBuilds = kwhmMode
    ? kwhmBuilds(G, content, fam).map((b) => ({ key: b.W, widthCm: b.W / 10, perRow: b.perRow, N: b.N, H: b.H, W: b.W, D: b.D, price: lcpEnclosureDbPrice({ H: b.H, W: b.W, D: b.D }, f, b.fam) }))
    : lcpBuilds(G).map((b) => {
        const s = lcpRealBox({ H: b.H, W: b.W, D: b.D }, fam);
        return { key: b.base, widthCm: WIDTH_CM[b.base], perRow: GROUPS_PER_ROW[b.base], N: b.N, H: s.H, W: s.W, D: s.D, price: lcpEnclosureDbPrice(s, f, fam) };
      });
  const chosenKey = sizeBuilds.length ? sizeBuilds.reduce((m, b) => (b.price < m.price ? b : m)).key : undefined;
  const cbCfg = kwhmMode ? kwhmContentCfg(content) : null;   // breaker section (fixed + per-row)
  const cbDesc = cbCfg
    ? [cbCfg.cbFixed > 0 ? `${cbCfg.cbFixed / 10} cm (CB)` : "", cbCfg.cbPerRow > 0 ? `${cbCfg.cbPerRow / 10} cm/row (CB)` : ""].filter(Boolean).join(" + ")
    : "";
  const keyOfBox = (b: { H: number; W: number; D: number } | null) => (b ? `${b.H}x${b.W}x${b.D}` : "");
  const parseBox = (key: string) => { const m = key.match(/(\d+)x(\d+)x(\d+)/); return m ? { H: +m[1], W: +m[2], D: +m[3] } : null; };
  // The two ways of addressing a box are mutually exclusive — picking one clears the other,
  // so the panel never carries a stale size next to a reference (or the reverse).
  const sizeValue = p.lcpEnclRef ? `ref:${p.lcpEnclRef}` : keyOfBox(box);
  const sizeValue2 = p.lcpEnclRef2 ? `ref:${p.lcpEnclRef2}` : keyOfBox(box2);
  const pickSize = (key: string) => {
    if (key.startsWith("ref:")) { u({ lcpEnclRef: key.slice(4), lcpBox: undefined }); return; }
    const b = parseBox(key); if (b) u({ lcpBox: b, lcpEnclRef: undefined });
  };
  const pickSize2 = (key: string) => {
    if (key.startsWith("ref:")) { u({ lcpEnclRef2: key.slice(4), lcpBox2: undefined }); return; }
    const b = parseBox(key); if (b) u({ lcpBox2: b, lcpEnclRef2: undefined });
  };
  return (
    <div className="space-y-4 animate-fade-up">
      {/* Header */}
      <div className="card p-5">
        <h2 className="sec-head flex items-center gap-2"><SpareKindIcon kind={p.spareKind} /> {titleLabel}</h2>
      </div>

      {/* Panel Cost (Live) — first table; updates live as the panel below is configured */}
      <div className="card p-5">
        <h2 className="sec-head mb-3">Panel Cost (Live)</h2>
        {isKwhm ? (
          /* KWHM — one aligned 5-col grid with the Cu connections tile. */
          <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Row 1 */}
            <div className="flex flex-col justify-center rounded-lg bg-surface p-2.5 text-sm">Components<br /><b>{fmtEgp(calc.compCost)} EGP</b></div>
            <div className="flex flex-col justify-center rounded-lg bg-surface p-2.5 text-sm">
              Enclosure{isDouble ? " (2)" : ""}<br /><b>{fmtEgp(enclEgp)} EGP</b>
              <span className="block text-[10px] font-normal text-muted">
                {isDouble
                  ? `${box ? `${box.H}×${box.W}×${box.D}` : "—"} + ${box2 ? `${box2.H}×${box2.W}×${box2.D}` : "pick size 2"}`
                  : box ? `${box.H}×${box.W}×${box.D} mm` : "—"}
              </span>
            </div>
            <div className="flex flex-col justify-center rounded-lg bg-surface p-2.5 text-sm">Kits <span className="text-[10px] text-muted">(10%)</span><br /><b>{fmtEgp(calc.kits)} EGP</b></div>
            {/* Row 2 */}
            <div className="flex flex-col justify-center rounded-lg bg-surface p-2.5 text-sm">Cu connections<br /><b>{fmtEgp(calc.cuConnCost)} EGP</b>
              <span className="block text-[10px] font-normal text-muted">{calc.cuWeight.toFixed(1)} KG · × {fmtEgp(f.copper)}/KG</span>
            </div>
            <div className="flex flex-col justify-center">
              <L>Cables (EGP) <span className="text-red-500">*</span></L>
              <input className={`input ${cablesMissing ? "border-red-400 ring-1 ring-red-300" : ""}`} type="number" min={0}
                value={p.cablesEgp || ""} placeholder="required"
                onChange={(e) => u({ cablesEgp: parseFloat(e.target.value) || 0 })} />
              {cablesMissing && <p className="mt-1 text-[11px] font-semibold text-red-500">Cables cost is required</p>}
            </div>
            <div className="flex flex-col justify-center">
              <L>Factor</L>
              <FactorInput value={p.sellFactor || 0} global={f.factor} onChange={(n) => u({ sellFactor: n })} />
              <p className="mt-1 text-[11px] text-muted">÷ {factor}{p.sellFactor > 0 ? "" : " (global)"}</p>
            </div>
            {/* Row 3 */}
            <div className="flex flex-col justify-center rounded-lg bg-surface p-2.5 text-sm">Unit cost<br /><b>{fmtEgp(calc.unitCost)} EGP</b></div>
            <div className="flex flex-col justify-center rounded-lg bg-brand-light p-2.5 text-sm text-brand-dark">Unit selling (EGP)<br /><b>{fmtEgp(calc.sellUnit)} EGP</b></div>
            <div className="flex flex-col justify-center rounded-lg bg-brand p-2.5 text-sm text-white">Unit selling (USD)<br /><b>{fmtEgp(f.usd > 0 ? calc.sellUnit / f.usd : 0)} USD</b></div>
          </div>
        ) : (
          /* LCP — original layout (no Cu connections). */
          <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-surface p-2.5 text-sm">Components<br /><b>{fmtEgp(calc.compCost)} EGP</b></div>
            <div className="rounded-lg bg-surface p-2.5 text-sm">
              Enclosure{isDouble ? " (2)" : ""}<br /><b>{fmtEgp(enclEgp)} EGP</b>
              <span className="block text-[10px] font-normal text-muted">
                {isDouble
                  ? `${box ? `${box.H}×${box.W}×${box.D}` : "—"} + ${box2 ? `${box2.H}×${box2.W}×${box2.D}` : "pick size 2"}`
                  : box ? `${box.H}×${box.W}×${box.D} mm` : "—"}
              </span>
            </div>
            <div className="rounded-lg bg-surface p-2.5 text-sm">Kits <span className="text-[10px] text-muted">(10%)</span><br /><b>{fmtEgp(calc.kits)} EGP</b></div>
            <div>
              <L>Cables (EGP) <span className="text-red-500">*</span></L>
              <input className={`input ${cablesMissing ? "border-red-400 ring-1 ring-red-300" : ""}`} type="number" min={0}
                value={p.cablesEgp || ""} placeholder="required"
                onChange={(e) => u({ cablesEgp: parseFloat(e.target.value) || 0 })} />
              {cablesMissing && <p className="mt-1 text-[11px] font-semibold text-red-500">Cables cost is required</p>}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-surface p-2.5 text-sm">Unit cost<br /><b>{fmtEgp(calc.unitCost)} EGP</b></div>
            <div>
              <L>Factor</L>
              <FactorInput value={p.sellFactor || 0} global={f.factor} onChange={(n) => u({ sellFactor: n })} />
              <p className="mt-1 text-[11px] text-muted">÷ {factor}{p.sellFactor > 0 ? "" : " (global)"}</p>
            </div>
            <div className="rounded-lg bg-brand-light p-2.5 text-sm text-brand-dark">Unit selling (EGP)<br /><b>{fmtEgp(calc.sellUnit)} EGP</b></div>
            <div className="rounded-lg bg-brand p-2.5 text-sm text-white">Unit selling (USD)<br /><b>{fmtEgp(f.usd > 0 ? calc.sellUnit / f.usd : 0)} USD</b></div>
          </div>
          </>
        )}
        <p className="mt-3 text-[11px] text-muted">
          Enclosure is priced from the SR-Basic catalogue price list (the chosen box). Kits = 10 % of the enclosure. Cables are mandatory.
        </p>
      </div>

      {/* Panel details */}
      <div className="card p-5">
        <h2 className="sec-head mb-3">Panel details</h2>
        {isKwhm ? (
          /* KWHM — two columns: Name/Qty · Incoming/Outgoing · Content/No. KWHM */
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <L>Panel name</L>
              <input className={`input ${nameClashOf(s, p) ? "border-red-400 bg-red-50/40" : ""}`} value={p.name}
                placeholder="KWHM" onChange={(e) => u({ name: e.target.value })} />
              <PanelNameClash s={s} p={p} />
            </div>
            <div>
              <L>Quantity</L>
              <input className="input" type="number" min={1} value={p.qty}
                onChange={(e) => u({ qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
            </div>
            <div>
              <L>Incoming cables</L>
              <Sel value={p.incomingCables as any} onChange={(v) => u({ incomingCables: v })} options={INCOMING_CABLES as any} />
            </div>
            <div>
              <L>Outgoing cables</L>
              <Sel value={p.outgoingCables as any} onChange={(v) => u({ outgoingCables: v })} options={OUTGOING_CABLES as any} />
            </div>
            <div>
              <L>Content</L>
              <Sel value={content as any} onChange={(v) => setContent(v)} options={KWHM_CONTENTS as any} />
            </div>
            <div>
              <L>{countLabel}</L>
              <input className="input" type="number" min={0} value={p.noGroups ?? ""} placeholder="0"
                onChange={(e) => setGroups(parseInt(e.target.value, 10) || 0)} />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-2">
              <L>Panel name</L>
              <input className={`input ${nameClashOf(s, p) ? "border-red-400 bg-red-50/40" : ""}`} value={p.name}
                placeholder="LCP" onChange={(e) => u({ name: e.target.value })} />
              <PanelNameClash s={s} p={p} />
            </div>
            <div>
              <L>Quantity</L>
              <input className="input" type="number" min={1} value={p.qty}
                onChange={(e) => u({ qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
            </div>
            <div>
              <L>Incoming cables</L>
              <Sel value={p.incomingCables as any} onChange={(v) => u({ incomingCables: v })} options={INCOMING_CABLES as any} />
            </div>
            <div>
              <L>Outgoing cables</L>
              <Sel value={p.outgoingCables as any} onChange={(v) => u({ outgoingCables: v })} options={OUTGOING_CABLES as any} />
            </div>
            <div>
              <L>{countLabel}</L>
              <input className="input" type="number" min={0} value={p.noGroups ?? ""} placeholder="0"
                onChange={(e) => setGroups(parseInt(e.target.value, 10) || 0)} />
            </div>
          </div>
        )}
        {/* Enclosure sizing — auto-sized from No. Groups; the size stays editable. */}
        <div className="mt-4 grid gap-5 border-t border-line pt-4 lg:grid-cols-2">
          <div className="space-y-3">
          <div>
            <L>Layout</L>
            <div className="flex gap-1.5">
              {(["Single", "Double"] as const).map((l) => (
                <button key={l} onClick={() => u({ panelsSizing: { ...p.panelsSizing, layout: l } })}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-bold ${
                    p.panelsSizing?.layout === l ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted"
                  }`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <L>Enclosure family</L>
            <Sel value={fam as any} onChange={(v) => setFamily(v)}
              options={PANEL_SYSTEMS.filter((s) => s !== "Pillars" && s !== "Coffree") as any} />
          </div>
          <div>
            <L>{isDouble ? "Sizing (1)" : "Sizing"}</L>
            <SearchSelect value={sizeValue} placeholder="Search size — one selection…" options={sizeOptions} onPick={pickSize} heightMatch />
            {!isDouble && (refBox ? (
              <p className="mt-1 text-[11px] text-muted">{fam} “{refBox.name}” · {refBox.ref} — chosen from the catalogue, not auto-sized.</p>
            ) : overCeiling ? (
              <p className="mt-1 text-[11px] font-semibold text-red-600">
                {G} groups exceed a single panel (max ≈ {5 * LCP_MAX_ROWS}). Split into multiple LCP panels.
              </p>
            ) : G > 0 && box ? (
              <p className="mt-1 text-[11px] text-muted">
                Auto-sized from {G} group{G === 1 ? "" : "s"} · recommended {box.H} × {box.W} × {box.D} mm
                {!lcpSizes(fam).length && <> — {fam} has no sized boxes, so this one is priced from SR-Basic</>}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted">Enter {countLabel} above to auto-size, or pick a size.</p>
            ))}
          </div>
          {isDouble && (
            <div>
              <L>Sizing (2)</L>
              <SearchSelect value={sizeValue2} placeholder="Search size — one selection…" options={sizeOptions} onPick={pickSize2} heightMatch />
              <p className="mt-1 text-[11px] text-muted">
                {refBox2 ? <>{fam} “{refBox2.name}” · {refBox2.ref}</> : "Second enclosure — pick its size (not auto-recommended)."}
              </p>
            </div>
          )}
          </div>

          {/* Summary — how the auto-size chose this box */}
          <div className="rounded-lg border border-line bg-surface/50 p-4 text-sm">
            <h3 className="mb-1.5 font-bold text-ink">How the size is chosen</h3>
            {G <= 0 ? (
              <p className="text-xs leading-relaxed text-muted">
                Enter <b className="text-ink">{countLabel}</b> to auto-size the SR-Basic box. Each candidate width holds a fixed number
                of {perRow}; the box grows in rows, then the cheapest box that fits is chosen and priced from the catalogue.
              </p>
            ) : isKwhm && content === "KWHM" && G === 1 ? (
              <p className="text-xs leading-relaxed text-muted">1 KWHM meter → fixed box <b className="text-ink">400 × 300 × 150 mm</b>, priced from the catalogue.</p>
            ) : (
              <>
                <p className="mb-2 text-xs leading-relaxed text-muted">
                  {kwhmMode
                    ? <><b className="text-ink">meters = {G}</b> · N = ⌈meters ÷ per-row⌉ · zone = N × 40 cm · height = {`zone + ${cbDesc ? `${cbDesc} + ` : ""}30 cm`}, rounded up to a stocked box:</>
                    : <><b className="text-ink">G = {G}</b> · N = ⌈G ÷ {perRow}⌉ · H = [N + (N−1)] × 6 + 20 cm (rounded up to a standard height):</>}
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                      <th className="py-1 font-semibold">Width</th>
                      <th className="py-1 text-center font-semibold">{isKwhm ? "Per row" : "Grp/row"}</th>
                      <th className="py-1 text-center font-semibold">Rows</th>
                      <th className="py-1 text-right font-semibold">Box (H×W×D)</th>
                      <th className="py-1 text-right font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeBuilds.length === 0 && (
                      <tr><td colSpan={5} className="py-2 text-center font-semibold text-red-600">{kwhmMode ? "No stocked box fits — try a wider family or size manually." : `Over one panel (max ≈ ${5 * LCP_MAX_ROWS} groups) — split needed.`}</td></tr>
                    )}
                    {sizeBuilds.map((b) => {
                      const on = b.key === chosenKey;
                      return (
                        <tr key={b.key} className={`border-t border-line/50 ${on ? "font-bold text-brand-dark" : "text-muted"}`}>
                          <td className="py-1">{b.widthCm} cm</td>
                          <td className="py-1 text-center">{b.perRow}</td>
                          <td className="py-1 text-center">{b.N}</td>
                          <td className="py-1 text-right">{b.H}×{b.W}×{b.D}</td>
                          <td className="py-1 text-right">{fmtEgp(b.price)}{on ? "  ✓" : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Rule: {kwhmMode ? "each width fits more meters per 40 cm row" : `each width gives one stocked box that holds all ${G} ${unitPlural}`}; the box with the <b className="text-ink">lowest catalogue price</b> is chosen{box ? <> → <b className="text-ink">{box.H} × {box.W} × {box.D} mm</b></> : ""}.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Components — auto-filled from No. Groups; add / change / remove like a panel */}
      <div className="card p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2.5">
          <h2 className="text-sm font-bold text-ink">Components — {G} {unitWord}{!isKwhm && G !== 1 ? "s" : ""}</h2>
          <span className="text-[11px] text-muted">{isKwhm ? "search to add components" : "auto-filled from No. Groups · add or edit below"}</span>
        </div>
        {/* Add / change component search */}
        <div className="border-b border-line px-4 py-3">
          <L>{editId ? "Change component" : "Add component"}</L>
          <ComponentSearch inputRef={searchRef} factors={f}
            onPick={(c) => (editId ? changeComp(editId, c) : pickComp(c))}
            placeholder="Search components (name / reference / type / rating)…" />
          {editId && (
            <button type="button" onClick={() => setEditId(null)}
              className="mt-1 text-[11px] font-semibold text-muted hover:text-ink">Cancel change</button>
          )}
          {/* Qty popup for a newly-picked component */}
          {pending && (
            <div className="mt-2 rounded-lg border border-brand/50 bg-white p-3 shadow-sm">
              <p className="mb-2 text-xs">
                <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{pending.type || "Item"}</span>
                <span className="font-bold text-ink">{pending.name}</span>
                <span className="ml-1 text-[11px] text-muted">{pending.ref}{pending.brand ? ` · ${pending.brand}` : ""} · {fmtEgp(priceOf(pending))} EGP</span>
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted">Qty</label>
                <input ref={qtyRef} inputMode="numeric" className="input h-9 w-24" placeholder="1" value={pendQty}
                  onChange={(e) => setPendQty(e.target.value.replace(/[^\d]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") cancelAdd(); }} />
                <button type="button" className="btn-primary h-9 px-4 text-sm" onClick={confirmAdd}>Add</button>
                <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={cancelAdd}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <colgroup><col className="w-[4%]" /><col className="w-[34%]" /><col className="w-[15%]" /><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[6%]" /></colgroup>
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-1 py-2" />
              <th className="px-3 py-2 font-semibold">Description</th>
              <th className="px-3 py-2 font-semibold">Reference</th>
              <th className="px-3 py-2 font-semibold">Type / Brand</th>
              <th className="px-2 py-2 text-center font-semibold">Qty</th>
              <th className="px-3 py-2 text-right font-semibold">Unit cost</th>
              <th className="px-3 py-2 text-right font-semibold">Total cost</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">No components yet — set {countLabel} above or search to add.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id}
                onDragOver={(e) => { if (dragId && dragId !== c.id) { e.preventDefault(); if (overId !== c.id) setOverId(c.id); } }}
                onDragLeave={() => { if (overId === c.id) setOverId(null); }}
                onDrop={(e) => { e.preventDefault(); dropRow(c.id); }}
                className={`border-b border-line/50 last:border-0 ${editId === c.id ? "bg-brand-tint/40" : ""} ${dragId === c.id ? "opacity-40" : ""} ${overId === c.id ? "border-t-2 border-t-brand" : ""}`}>
                <td className="px-1 py-1.5 text-center">
                  <span draggable
                    onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", c.id); } catch {} }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                    title="Drag to reorder"
                    className="inline-flex cursor-grab select-none text-muted/50 transition-colors hover:text-brand active:cursor-grabbing">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
                      <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
                      <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
                    </svg>
                  </span>
                </td>
                <td className="px-3 py-1.5 font-medium text-ink">{c.name}</td>
                <td className="px-3 py-1.5 text-muted">{c.ref || "—"}</td>
                <td className="px-3 py-1.5 text-muted">{c.brand || c.type || "—"}</td>
                <td className="px-2 py-1.5 text-center">
                  <input className="input h-7 w-14 px-1.5 text-center text-xs" inputMode="numeric" value={c.qty}
                    onChange={(e) => setQty(c.id, parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 1)} />
                </td>
                <td className="px-3 py-1.5 text-right text-muted">{fmtEgp(priceOf(c))}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-ink">{fmtEgp(priceOf(c) * c.qty)}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button title="Change component"
                      onClick={() => { setPending(null); setPendQty(""); setEditId(c.id); requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true })); }}
                      className="grid h-5 w-5 place-items-center rounded text-xs leading-none text-ink/70 hover:bg-brand-light hover:text-brand-dark">✎</button>
                    <button title="Remove" onClick={() => delRow(c.id)}
                      className="grid h-5 w-5 place-items-center rounded text-xs leading-none text-red-500 hover:bg-red-100 hover:text-red-600">✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ── Selectivity ──────────────────────────────────────────────────────────────
// A coordination-study table — one row per panel. Name & Fed From are shared with the
// panel; Main Incoming & Adj are READ from the panel's Main-Incoming breaker (its
// description and its ADJ. value, as set in the Panels tab).
/** The panel's main incoming breaker — the first ACB/MCCB/MCB in a "Main Incoming" section. */
// ── Summary tab: project overview + interactive sticky-note board ────────────
const NOTE_COLORS: Record<string, string> = {
  amber: "bg-amber-100 border-amber-300",
  green: "bg-emerald-100 border-emerald-300",
  blue: "bg-sky-100 border-sky-300",
  pink: "bg-pink-100 border-pink-300",
  slate: "bg-slate-100 border-slate-300",
};
const NOTE_KEYS = Object.keys(NOTE_COLORS);
/** One draggable, resizable, editable, colourable sticky note. Live position/size
 *  are kept locally while dragging and committed to state on release (one save). */
function StickyNote({ note, onChange, onMove, onResize, onDelete }: {
  note: SummaryNote; onChange: (patch: Partial<SummaryNote>) => void; onMove: (x: number, y: number) => void; onResize: (w: number, h: number) => void; onDelete: () => void;
}) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const pos = drag ?? { x: note.x, y: note.y };
  const dim = size ?? { w: note.w ?? 224, h: note.h ?? 176 };
  // Generic pointer-drag helper: track from press, live-update via `set`, commit on release.
  const dragWith = (e: React.PointerEvent, set: (ev: PointerEvent) => void, commit: (ev: PointerEvent) => void) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => set(ev);
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); commit(ev);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
  };
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("textarea,button,[data-resize]")) return; // editing / colour / delete / resize — not a move
    const sx = e.clientX, sy = e.clientY, ox = note.x, oy = note.y;
    const at = (ev: PointerEvent) => ({ x: Math.max(0, ox + ev.clientX - sx), y: Math.max(0, oy + ev.clientY - sy) });
    dragWith(e, (ev) => setDrag(at(ev)), (ev) => { const p = at(ev); setDrag(null); onMove(p.x, p.y); });
  };
  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ow = note.w ?? 224, oh = note.h ?? 176;
    const at = (ev: PointerEvent) => ({ w: Math.max(160, ow + ev.clientX - sx), h: Math.max(96, oh + ev.clientY - sy) });
    dragWith(e, (ev) => setSize(at(ev)), (ev) => { const d = at(ev); setSize(null); onResize(d.w, d.h); });
  };
  return (
    <div style={{ left: pos.x, top: pos.y, width: dim.w, height: dim.h }}
      className={`absolute flex flex-col overflow-hidden rounded-md border shadow-soft ${NOTE_COLORS[note.color] ?? NOTE_COLORS.amber}`}>
      <div onPointerDown={startDrag} className="flex cursor-move items-center justify-between px-2 py-1">
        <div className="flex gap-1">
          {NOTE_KEYS.map((c) => (
            <button key={c} type="button" title={c} onClick={() => onChange({ color: c })}
              className={`h-3.5 w-3.5 rounded-full border ${NOTE_COLORS[c]} ${note.color === c ? "ring-2 ring-brand ring-offset-1" : ""}`} />
          ))}
        </div>
        <button type="button" onClick={onDelete} title="Delete note" className="px-1 text-base leading-none text-ink/40 hover:text-red-500">×</button>
      </div>
      <textarea value={note.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Type a note…"
        className="w-full flex-1 resize-none bg-transparent px-2 pb-2 text-[13px] leading-snug text-ink placeholder:text-ink/40 focus:outline-none" />
      <div data-resize onPointerDown={startResize} title="Drag to resize"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        style={{ backgroundImage: "linear-gradient(135deg, transparent 55%, rgb(0 0 0 / 0.28) 55%)" }} />
    </div>
  );
}
function SummaryTab({ s, up }: { s: LvState; up: (p: Partial<LvState>) => void }) {
  const notes = s.summaryNotes ?? [];
  const setNotes = (next: SummaryNote[]) => up({ summaryNotes: next });
  const addNote = () => {
    const n = notes.length;
    setNotes([...notes, { id: uid(), text: "", color: NOTE_KEYS[n % NOTE_KEYS.length], x: 16 + (n % 5) * 28, y: 16 + (n % 5) * 28, w: 224, h: 176 }]);
  };
  const updateNote = (id: string, patch: Partial<SummaryNote>) => setNotes(notes.map((nn) => (nn.id === id ? { ...nn, ...patch } : nn)));
  const removeNote = (id: string) => setNotes(notes.filter((nn) => nn.id !== id));
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="sec-head mb-0">Notes &amp; sticky board</h2>
            <p className="text-xs text-muted">Drag to arrange · click to edit · pick a colour. Saved with the QTN.</p>
          </div>
          <button type="button" onClick={addNote}
            className="shrink-0 rounded-full border border-brand bg-brand px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-dark">+ Add note</button>
        </div>
        <div className="relative mt-3 min-h-[460px] overflow-hidden rounded-lg border border-dashed border-line bg-surface/50"
          style={{ backgroundImage: "radial-gradient(rgb(128 128 128 / 0.15) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
          {notes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted">
              No notes yet — click “+ Add note” to jot reminders, decisions, customer requests…
            </div>
          )}
          {notes.map((n) => (
            <StickyNote key={n.id} note={n}
              onChange={(patch) => updateNote(n.id, patch)}
              onMove={(x, y) => updateNote(n.id, { x, y })}
              onResize={(w, h) => updateNote(n.id, { w, h })}
              onDelete={() => removeNote(n.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
function selMainIncomer(p: LvPanel): PanelComponent | undefined {
  const isBreaker = (c: PanelComponent) => /\b(ACB|MCCB|MCB)\b/i.test(c.type || "");
  return p.components.find((c) => !isSpacer(c) && isBreaker(c) && /incom/i.test(c.section || ""));
}
function SelectivityTab({ s, upPanel }: { s: LvState; upPanel: (id: string, patch: Partial<LvPanel>) => void }) {
  const [fedFilter, setFedFilter] = useState(""); // "Fed From" column filter — "" = all
  const panels = s.panels.filter((p) => !p.spare);
  // Distinct "Fed From" values seen across the panels → the header filter's options.
  const fedOptions = Array.from(new Set(panels.map((p) => p.fedFrom.trim()).filter(Boolean)));
  // Panel-by-name → look up the "Fed From" (feeding) panel to read its incomer for the
  // "Incoming of Feeder" column.
  const byName = new Map(panels.map((x) => [x.name.trim(), x]));
  // Filtering by a source shows every panel fed from it AND the source panel itself
  // (the panel whose name matches) — so the whole feeder group is visible together.
  const rows = panels.map((p, i) => ({ p, no: i + 1 }))
    .filter(({ p }) => !fedFilter || p.fedFrom.trim() === fedFilter || p.name.trim() === fedFilter);
  const cell = "border border-line px-2 py-1 align-middle";
  const inp = "w-full min-w-0 bg-transparent px-1 py-0.5 text-sm text-ink outline-none rounded focus:bg-brand-tint/50 placeholder:text-muted/50";
  return (
    <div className="animate-fade-up">
      <div className="card p-5">
        <h2 className="sec-head">Selectivity</h2>
        <p className="mb-3 text-xs text-muted">
          One row per panel — main incoming breaker &amp; its adjustment. Use the <b>Fed From</b> filter in the header to list all panels fed by one source.
        </p>
        {panels.length === 0 ? (
          <p className="rounded-lg bg-surface p-6 text-center text-sm text-muted">No panels yet — add panels first.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left font-bold text-white" style={{ background: "#1f4e79" }}>
                  <th className={`${cell} w-16 text-center`}>Item No.</th>
                  <th className={`${cell} w-56`}>Panel Name</th>
                  <th className={cell}>Main Incoming</th>
                  <th className={`${cell} w-56`}>
                    <div className="flex items-center gap-2">
                      <span>Fed From</span>
                      {/* Header filter — show only panels fed from the chosen source. */}
                      <select value={fedFilter} onChange={(e) => setFedFilter(e.target.value)}
                        title="Filter — show only panels fed from this source"
                        className={`ml-auto max-w-[130px] cursor-pointer rounded border-0 px-1.5 py-0.5 text-xs font-semibold text-ink outline-none ${fedFilter ? "bg-amber-200" : "bg-white/95"}`}>
                        <option value="">▾ All</option>
                        {fedOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </th>
                  <th className={cell}>Incoming of Feeder</th>
                  <th className={`${cell} w-48`}>Adj</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className={`${cell} py-4 text-center text-muted`}>No panels fed from “{fedFilter}”.</td></tr>
                ) : rows.map(({ p, no }) => {
                  // Main Incoming + Adj are read from THIS panel's main incoming breaker;
                  // Incoming of Feeder = the main incomer of the panel it is Fed From.
                  const inc = selMainIncomer(p);
                  const feeder = byName.get(p.fedFrom.trim());
                  const feederInc = feeder ? selMainIncomer(feeder) : null;
                  return (
                  <tr key={p.id}>
                    <td className={`${cell} text-center font-semibold text-muted`}>{no}</td>
                    {/* The same field as Panel details, so it carries the same rule.
                        It matters twice over here: the "Fed From" lookup below is by
                        name, so two panels sharing one make the upstream feeder a
                        coin-toss. Kept compact — a table cell has no room for a
                        sentence, so the full message is on hover. */}
                    <td className={cell}>
                      <input className={`${inp} ${nameClashOf(s, p) ? "bg-red-50 text-red-700 ring-1 ring-red-400" : ""}`}
                        value={p.name} placeholder="Panel name"
                        title={(() => { const t = nameClashOf(s, p); return t ? panelNameClashMessage(t, s.panels) : undefined; })()}
                        onChange={(e) => upPanel(p.id, { name: e.target.value })} />
                      {nameClashOf(s, p) && <span className="mt-0.5 block px-1 text-[10px] font-semibold text-red-600">Same name as another panel</span>}
                    </td>
                    <td className={`${cell} px-3 text-sm`} title="Read from this panel's Main Incoming breaker">{inc ? inc.name : <span className="text-muted/50">—</span>}</td>
                    <td className={cell}><input className={inp} value={p.fedFrom} placeholder="—" onChange={(e) => upPanel(p.id, { fedFrom: e.target.value })} /></td>
                    <td className={`${cell} px-3 text-sm`} title="The Main Incoming breaker of the panel in ‘Fed From’ (the upstream feeder)">{feederInc ? feederInc.name : <span className="text-muted/50">—</span>}</td>
                    <td className={`${cell} px-3 text-sm`} title="Read from the Main Incoming breaker's ADJ.">{inc?.adj?.trim() ? inc.adj : <span className="text-muted/50">—</span>}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// "Add spare parts" dropdown — the variants of spare cell. Their editor pages are
// designed separately; here we only add a cell tagged with the chosen kind.
const SPARE_KINDS: { kind: string; label: string }[] = [
  { kind: "spare", label: "Spare Parts" },
  { kind: "lcp", label: "LCP" },
  { kind: "kwhm", label: "KWHM" },
];
function AddSpareMenu({ onAddSpare, trigger, wrap = "" }: { onAddSpare: (kind: string) => void; trigger: string; wrap?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The trigger lives inside a card with overflow-hidden, so an absolutely-positioned
  // menu gets clipped. Render it in a portal at fixed coordinates instead.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onLeave = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onLeave);
    window.addEventListener("scroll", onLeave, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onLeave);
      window.removeEventListener("scroll", onLeave, true);
    };
  }, [open]);
  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 160) });
    setOpen((v) => !v);
  };
  return (
    <div className={wrap}>
      <button ref={btnRef} type="button" onClick={toggle} className={trigger}>🧰 Auxiliary Panels ▾</button>
      {open && pos && createPortal(
        <div ref={menuRef} style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 60 }}
          className="overflow-hidden rounded-lg border border-line bg-white shadow-lift">
          {SPARE_KINDS.map((o) => (
            <button key={o.kind} type="button"
              className="block w-full px-3 py-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-brand-tint"
              onClick={() => { setOpen(false); onAddSpare(o.kind); }}>{o.label}</button>
          ))}
        </div>, document.body)}
    </div>
  );
}

function PanelsTab({ s, sel, up, upPanel, onAdd, onDel, onClone, onOpenInOffer, onAddSpare, onImport, knownComponentRefs, panelBadge, freshIds, addLabel = "+ Add panel", emptyLabel = "No panels yet.", emptyAddLabel = "+ Add your first panel" }: {
  s: LvState; sel: LvPanel | null;
  up: (p: Partial<LvState>) => void;
  upPanel: (id: string, p: Partial<LvPanel>) => void;
  onAdd: () => void; onDel: (id: string) => void; onClone: (id: string) => void;
  onOpenInOffer: (id: string) => void;
  onAddSpare?: (kind: string) => void;
  /** Bulk import from Excel — appends parsed panels to the quote (panels QTNs only). */
  onImport?: (panels: ImportedPanel[]) => void;
  knownComponentRefs?: string[];
  /** Co-Work: owner tag for a panel row (initials + whether it's the current user's). */
  panelBadge?: (p: LvPanel) => { text: string; title: string; mine: boolean };
  /** Co-Work: panels that just arrived/changed from the other owner — flashed briefly. */
  freshIds?: Set<string>;
  addLabel?: string; emptyLabel?: string; emptyAddLabel?: string;
}) {
  // Drag-and-drop reorder state (hooks must precede the early return).
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  if (!s.panels.length) {
    return (
      <div className="card p-12 text-center animate-fade-up">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-2xl">⚡</div>
        <p className="text-muted">{emptyLabel}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button className="btn-primary" onClick={onAdd}>{emptyAddLabel}</button>
          {onAddSpare && (
            <AddSpareMenu onAddSpare={onAddSpare}
              trigger="rounded-lg border border-dashed border-brand/40 px-4 py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-tint" />
          )}
        </div>
        {onImport && (
          <div className="mx-auto mt-5 max-w-xs">
            <p className="mb-2 text-xs text-muted">…or bring several in at once from a quote workbook:</p>
            <PanelsBulkImport onImportPanels={onImport} knownComponentRefs={knownComponentRefs} />
          </div>
        )}
      </div>
    );
  }
  // Drop the dragged panel before the target; position-based numbering and the
  // saved order (autosaved to the QTN) follow automatically.
  const dropPanel = (targetId: string) => {
    const dId = dragId;
    setDragId(null); setOverId(null);
    if (!dId || dId === targetId) return;
    const arr = [...s.panels];
    const from = arr.findIndex((p) => p.id === dId);
    if (from < 0) return;
    const [moved] = arr.splice(from, 1);
    const to = arr.findIndex((p) => p.id === targetId);
    arr.splice(to < 0 ? arr.length : to, 0, moved);
    up({ panels: arr });
  };
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[260px_1fr] animate-fade-up">
      {/* panel list — sticks below the tab header, with its own scroll (independent of the editor) */}
      <div className="card p-3 lg:sticky lg:top-16 lg:max-h-[calc(100vh_-_5.5rem)] lg:overflow-y-auto no-scrollbar">
        {s.panels.map((p, i) => {
          const active = p.id === s.selectedId;
          return (
            <div key={p.id}
              onDragOver={(e) => { if (dragId && dragId !== p.id) { e.preventDefault(); if (overId !== p.id) setOverId(p.id); } }}
              onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); dropPanel(p.id); }}
              className={`mb-1.5 rounded-lg border px-2 py-1.5 transition-all duration-150 ${
                p.highlight
                  ? `bg-yellow-200 hover:bg-yellow-300 ${active ? "border-brand" : "border-yellow-400"}`
                  : active ? "border-brand bg-brand-light" : "border-line bg-white hover:bg-brand-tint"
              } ${dragId === p.id ? "scale-[0.98] opacity-40" : ""} ${overId === p.id ? "border-t-2 border-t-brand bg-brand-tint" : ""} ${
                freshIds?.has(p.id) ? "animate-flash-new" : ""
              }`}>
              {/* Icons sit inline after a short name; a long name pushes them to wrap onto a
                  second line, right-aligned (flex-wrap + ml-auto). */}
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                {/* name group — kept together; the name shows in full (wraps only if very long) */}
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    draggable
                    onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", p.id); } catch {} }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                    title="Drag to reorder"
                    className="shrink-0 cursor-grab select-none px-0.5 text-muted/50 transition-colors hover:text-brand active:cursor-grabbing">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
                      <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
                      <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
                    </svg>
                  </span>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${active ? "bg-brand text-white" : "bg-surface text-muted"}`}>{i + 1}</span>
                  {panelBadge && (() => { const b = panelBadge(p); return (
                    <span title={`Owner: ${b.title}${b.mine ? " (you)" : ""}`}
                      className={`grid h-5 min-w-[1.25rem] shrink-0 place-items-center rounded-full px-1 text-[10px] font-bold ${b.mine ? "bg-emerald-500 text-white" : "bg-amber-400 text-amber-950"}`}>
                      {b.text}
                    </span>
                  ); })()}
                  <button onClick={() => up({ selectedId: p.id })} title={p.name.trim() || "(unnamed panel)"} className="min-w-0 text-left">
                    <div className={`break-words text-sm font-bold ${active ? "text-brand-dark" : "text-ink"} ${!p.name.trim() ? "italic text-muted" : ""}`}>{p.spare && <><SpareKindIcon kind={p.spareKind} /> </>}{p.name.trim() || "(unnamed panel)"}</div>
                  </button>
                </div>
                {/* action icons (smaller) — inline when the name is short, else wrapped below-right */}
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button onClick={() => onOpenInOffer(p.id)} title="Open this panel in the Technical Offer"
                    className="shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-white hover:text-brand-dark">
                    <JumpArrow />
                  </button>
                  <button onClick={() => upPanel(p.id, { highlight: !p.highlight })}
                    title={p.highlight ? "Remove highlight" : "Highlight panel"}
                    className={`shrink-0 rounded p-0.5 transition-colors hover:bg-white ${p.highlight ? "text-yellow-600" : "text-muted hover:text-yellow-600"}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m9 11-6 6v3h9l3-3" />
                      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
                    </svg>
                  </button>
                  <button onClick={() => onClone(p.id)} title="Duplicate panel"
                    className="shrink-0 rounded p-0.5 text-sm text-muted transition-colors hover:bg-white hover:text-brand-dark">⧉</button>
                  <button onClick={() => onDel(p.id)} title="Delete panel"
                    className="shrink-0 rounded p-0.5 text-sm text-red-500 transition-colors hover:bg-white">✕</button>
                </div>
              </div>
              {/* A clash is a property of a PAIR, so it has to be visible from the list —
                  otherwise it is only found by opening each panel in turn. This is also
                  the only place a clash arriving from a co-worker's 15-second merge, or
                  carried in by a duplicated quotation, shows itself without hunting. */}
              {(() => { const twin = nameClashOf(s, p); return twin ? (
                <p className="mt-0.5 pl-1 text-[10px] font-bold text-red-600" title={panelNameClashMessage(twin, s.panels)}>
                  ⚠ Same name as Panel {s.panels.indexOf(twin) + 1}
                </p>
              ) : null; })()}
            </div>
          );
        })}
        <button className="btn-ghost mt-1 w-full" onClick={onAdd}>{addLabel}</button>
        {onAddSpare && (
          <AddSpareMenu onAddSpare={onAddSpare} wrap="mt-1 w-full"
            trigger="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand/40 px-3 py-1.5 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-tint" />
        )}
        {onImport && (
          <div className="mt-2 border-t border-line pt-2">
            <PanelsBulkImport onImportPanels={onImport} knownComponentRefs={knownComponentRefs} />
          </div>
        )}
      </div>

      {/* editor — its own scroll area so the panel list and editor scroll independently.
          LCP / KWHM cells use the LcpEditor; any other spare cell the stripped SpareEditor;
          every other cell the full PanelEditor. */}
      <div className="min-w-0 lg:sticky lg:top-16 lg:max-h-[calc(100vh_-_5.5rem)] lg:overflow-y-auto no-scrollbar">
        {sel && (sel.spareKind === "lcp" || sel.spareKind === "kwhm"
          ? <LcpEditor key={sel.id} s={s} p={sel} upPanel={upPanel} />
          : sel.spare
          ? <SpareEditor key={sel.id} s={s} p={sel} upPanel={upPanel} />
          : <PanelEditor key={sel.id} s={s} p={sel} up={up} upPanel={upPanel} />)}
      </div>
    </div>
  );
}

// Standard incoming C.B ratings (A) — the panel rating snaps to one of these.
const INCOMER_RATINGS = [80, 100, 125, 160, 250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300];

// Predict the Busbar Rating from the incoming C.B: take the largest breaker
// (ACB / MCCB / MCB) in the "Main Incoming" section, read its ampere frame, and snap
// UP to the nearest standard rating. Returns 0 (field stays empty) until an incoming
// C.B is added.
function predictIncomerRating(p: LvPanel): number {
  const isBreaker = (c: PanelComponent) => /\b(ACB|MCCB|MCB)\b/i.test(c.type || "");
  // Busbar rating follows the C.B's ampere FRAME ("… 160 AF …"), e.g.
  //   MCCB XT2N 63A-36kA 160 AF …  → 160   (frame, not the 63 A rated current)
  //   MCCB XT4N 200A-36kA 250 AF … → 250
  //   ACB  E2.2B 1600A-42kA 1600 AF → 1600
  // Fall back to the rated current only if a breaker has no frame in its name.
  const frameAmps = (c: PanelComponent) => {
    const hay = `${c.rating || ""} ${c.name || ""}`;
    const af = hay.match(/(\d+)\s*AF\b/i); // ABB "… 160 AF …" ampere frame
    if (af) return parseInt(af[1], 10);
    const t = hay.match(/\bT\d[A-Z]?\s+(\d{2,4})\b/i); // Tmax "T5H 400 …" — frame after the type
    if (t) return parseInt(t[1], 10);
    const inA = hay.match(/In\s*=?\s*(\d+)/i) || hay.match(/(\d+)\s*A\b/i); // last resort: rated current
    return inA ? parseInt(inA[1], 10) : 0;
  };
  // Predict only from the incoming C.B (breakers in the "Main Incoming" section), so
  // the field stays empty by default and only fills once an incomer has been added.
  const incoming = p.components.filter((c) => !isSpacer(c) && isBreaker(c) && /incom/i.test(c.section || ""));
  const a = incoming.reduce((mx, c) => Math.max(mx, frameAmps(c)), 0);
  if (!a) return 0;
  return INCOMER_RATINGS.find((r) => r >= a) ?? INCOMER_RATINGS[INCOMER_RATINGS.length - 1];
}

// Shortest exact form: drop trailing zeros and the decimal point for whole numbers,
// keep thousands separators (27.000→27, 1.500→1.5, 0.560→0.56, 166.500→166.5). The
// 4-dp cap matches the copper DB's real precision (cuP/cuC store ≤4 decimals, e.g.
// 0.1125), so nothing is rounded away and each row still reconciles (0.1125×3×5=1.6875).
// Shared by the copper breakdown window and the copper cost cells.
const fmtNum = (n: number) => (isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: 4 });

// Floating, minimizable window that explains how the "Main Busbar" and
// "Cu Connections" cost cells are calculated for the current panel. Portaled to
// <body> because the Panels tab's animate-fade-up transform would otherwise anchor
// a `fixed` element to the tab wrapper instead of the viewport.
function CopperBreakdownWindow({ which, p, calc, f, onClose }: {
  which: "busbar" | "cu"; p: LvPanel; calc: PanelCalc; f: LvState["factors"]; onClose: () => void;
}) {
  const [min, setMin] = useState(false);
  const rate = f.copper; // EGP / kg copper
  // Main-busbar pieces — mirror mainBusbarAuto() for display.
  const isAuto = mainBusbarAuto(p) !== null;
  const area = busbarAreaMm2(p);
  const slot1 = (p.panelItems ?? []).find((it) => (it.slot ?? 1) === 1) ?? null;
  const isPillar = p.panelsSizing?.family === "Pillars";
  const height = panelHeightMm(p); // Pillars → fixed 1000 mm; else parsed from Sizing (1)
  const poles = p.busbarPoles || 3;
  const plating = copperTypeFactor(p.copperType); // Bare 1 · Raychem 1.02 · Tin 1.05 · Silver 1.15
  const isDouble = p.panelsSizing?.layout === "Double";
  // Cu-connection contribution per component: (kg/pole) × poles × qty.
  const col: "cuP" | "cuC" = p.sizingMode === "cells" ? "cuC" : "cuP";
  const cuRows = p.components
    .filter((c) => !isSpacer(c))
    .map((c) => {
      const mult = buswayCopperMult(c.note); // ×BUSWAY_COPPER_FACTOR when the NOTE says "busway"
      return { name: c.name, poles: c.poles || 0, perPole: c[col] || 0, qty: c.qty, mult, kg: (c[col] || 0) * (c.poles || 0) * c.qty * mult };
    })
    .filter((r) => r.kg > 0)
    .sort((a, b) => b.kg - a.kg);

  const eq = "mt-1 rounded bg-surface px-2 py-1 font-mono text-[11.5px] text-ink";
  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-brand-tint px-3 py-2">
        <div className="flex items-center gap-1.5 truncate text-sm font-bold text-brand-dark">
          <span>🧮</span> {which === "busbar" ? "Main Busbar" : "Cu Connections"} <span className="truncate font-normal text-muted">· {p.name || "panel"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => setMin((m) => !m)} title={min ? "Restore" : "Minimize"}
            className="rounded px-1.5 py-0.5 text-muted hover:bg-white hover:text-ink">{min ? "▢" : "—"}</button>
          <button type="button" onClick={onClose} title="Close"
            className="rounded px-1.5 py-0.5 text-muted hover:bg-white hover:text-red-500">✕</button>
        </div>
      </div>
      {!min && (
        <div className="max-h-[62vh] overflow-auto px-3 py-3 text-[12.5px]">
          {which === "busbar" && (<>
          {/* ── Main Busbar ── */}
          <h4 className="mb-1 font-bold text-ink">Main Busbar · {fmtNum(calc.busbarKg)} KG · {fmtEgp(calc.busbarCost)} EGP</h4>
          {isAuto ? (
            <div className="space-y-0.5 text-muted">
              <div>Bar section <b className="text-ink">{area} mm²</b> — {isPillar ? "fixed pillar standard" : <>from incomer rating <b className="text-ink">{p.ratingA} A</b></>}</div>
              <div>Panel height <b className="text-ink">{height} mm</b> — {isPillar ? "fixed pillar height" : <>from Sizing (1) “{slot1?.name}”</>}</div>
              <div>Poles <b className="text-ink">{poles}</b> · copper density <b className="text-ink">0.000009</b> kg/mm³{isDouble && <> · <b className="text-ink">Double ×2</b></>}{plating !== 1 && <> · plating <b className="text-ink">{p.copperType} ×{plating}</b></>}</div>
              <div className={eq}>{area} × {height} × {poles} × 0.000009{isDouble ? " × 2" : ""}{plating !== 1 ? ` × ${plating}` : ""} = <b>{fmtNum(calc.busbarKg)} kg</b></div>
              <div className={eq}>{fmtNum(calc.busbarKg)} kg × {fmtEgp(rate)} EGP/kg = <b>{fmtEgp(calc.busbarCost)} EGP</b></div>
            </div>
          ) : (
            <div className="space-y-0.5 text-muted">
              <div>Manual value <b className="text-ink">{fmtNum(calc.busbarKg)} kg</b> — the auto rule applies only to SR-Basic / Unikit / Local / Pillars panels with a rating (Pillars use a fixed 1000 mm height; the others read it from Sizing (1)).</div>
              <div className={eq}>{fmtNum(calc.busbarKg)} kg × {fmtEgp(rate)} EGP/kg = <b>{fmtEgp(calc.busbarCost)} EGP</b></div>
            </div>
          )}
          </>)}
          {which === "cu" && (<>
          {/* ── Cu Connections ── */}
          <h4 className="mb-1 font-bold text-ink">Cu Connections · {fmtNum(calc.cuWeight)} KG · {fmtEgp(calc.cuConnCost)} EGP</h4>
          <p className="mb-1 text-[11.5px] text-muted">Each component adds <b className="text-ink">(kg/pole {col === "cuC" ? "· cell" : "· panel"} column) × poles × qty</b>, <b className="text-ink">×{BUSWAY_COPPER_FACTOR}</b> when the note says “busway”:</p>
          {cuRows.length ? (
            <table className="w-full text-[11.5px]">
              <thead className="text-left text-muted">
                <tr><th className="py-0.5 pr-2 font-semibold">Component</th><th className="px-1 py-0.5 text-right font-semibold">P</th><th className="px-1 py-0.5 text-right font-semibold">kg/P</th><th className="px-1 py-0.5 text-right font-semibold">Qty</th><th className="py-0.5 pl-1 text-right font-semibold">kg</th></tr>
              </thead>
              <tbody>
                {cuRows.map((r, i) => (
                  <tr key={i} className="border-t border-line/60">
                    <td className="py-0.5 pr-2">{r.name}{r.mult > 1 && <span className="ml-1 whitespace-nowrap rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">busway ×{BUSWAY_COPPER_FACTOR}</span>}</td>
                    <td className="px-1 py-0.5 text-right">{r.poles}</td>
                    <td className="px-1 py-0.5 text-right">{fmtNum(r.perPole)}</td>
                    <td className="px-1 py-0.5 text-right">{fmtNum(r.qty)}</td>
                    <td className="py-0.5 pl-1 text-right font-semibold text-ink">{fmtNum(r.kg)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line"><td className="py-0.5 pr-2 font-bold" colSpan={4}>Total copper</td><td className="py-0.5 pl-1 text-right font-bold text-ink">{fmtNum(calc.cuWeight)}</td></tr>
              </tfoot>
            </table>
          ) : <p className="text-[11.5px] text-muted">No components carry copper yet.</p>}
          <div className={eq}>{fmtNum(calc.cuWeight)} kg × {fmtEgp(rate)} EGP/kg = <b>{fmtEgp(calc.cuConnCost)} EGP</b></div>
          </>)}
          <p className="mt-2 text-[11px] text-muted">Copper rate <b className="text-ink">{fmtEgp(rate)} EGP/kg</b> — from Pricing Settings.</p>
        </div>
      )}
    </div>,
    document.body
  );
}

function PanelEditor({ s, p, up, upPanel }: {
  s: LvState; p: LvPanel;
  up: (patch: Partial<LvState>) => void;
  upPanel: (id: string, patch: Partial<LvPanel>) => void;
}) {
  const { confirm, dialogs } = useDialogs();
  const u = (patch: Partial<LvPanel>) => upPanel(p.id, patch);
  // Replace every catalogue instance (matched by reference + name) with `nc`, across the
  // given panels — keeps each instance's qty / adjustments / group / section and swaps only
  // the catalogue fields (name, ref, brand, price, poles, copper). Prices recompute.
  const replaceComponent = (matchRef: string, matchName: string, nc: DbComponent, panelIds: Set<string>) => {
    const swap = (x: PanelComponent): PanelComponent =>
      (!isSpacer(x) && x.ref === matchRef && x.name === matchName)
        ? { ...x, name: nc.n, desc: nc.d, ref: nc.ref, type: nc.t, brand: nc.brand, rating: nc.r,
            eur: nc.eur, egp: nc.egp, poles: nc.poles, cuP: nc.cuP, cuC: nc.cuC, stock: nc.stock }
        : x;
    up({ panels: s.panels.map((pp) => (panelIds.has(pp.id) ? { ...pp, components: pp.components.map(swap) } : pp)) });
  };
  // The "common" fields (ambient temp, form, neutral, earth, copper,
  // incoming/outgoing cables) are set for the whole job on the Specs tab, which
  // writes them onto every panel. Here they stay editable per panel — this is
  // where you override one panel without touching the rest.
  const commonField = (label: string, key: ProjectSpecKey, options: readonly string[]) => (
    <div>
      <L>{label}</L>
      <Sel value={p[key] as any} onChange={(v) => u({ [key]: v } as Partial<LvPanel>)} options={options as any} />
    </div>
  );
  const calc = calcPanel(p, s.factors, s.abbItemDiscounts);
  // Busbar Rating — auto-selected from the incoming C.B's ampere frame; still editable.
  // 0 (→ "— Select —") means no incoming C.B.
  const predictedRating = predictIncomerRating(p);
  const ratingOptions = p.ratingA && !INCOMER_RATINGS.includes(p.ratingA)
    ? [...INCOMER_RATINGS, p.ratingA].sort((a, b) => a - b) // keep a legacy custom value
    : INCOMER_RATINGS;
  // Whenever the incoming C.B changes (its ampere frame → a new predictedRating),
  // re-read it and snap the Busbar Rating to the suitable standard value — and clear
  // it when the incomer is removed. The ref starts equal to the current prediction, so
  // loading a panel (or switching panels) never overwrites its stored/manual rating;
  // only a live change to the incomer moves the field. A manual override then sticks
  // until the incomer changes again.
  const prevPredicted = useRef(predictedRating);
  useEffect(() => {
    if (predictedRating !== prevPredicted.current) u({ ratingA: predictedRating });
    prevPredicted.current = predictedRating;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictedRating]);
  // Collapsible cost summary — the open/closed state is remembered across panels.
  const [costOpen, setCostOpen] = useState(() => { try { return localStorage.getItem("lv-costcard-open") !== "0"; } catch { return true; } });
  const toggleCost = () => setCostOpen((o) => { try { localStorage.setItem("lv-costcard-open", o ? "0" : "1"); } catch { /* ignore */ } return !o; });
  const [detailsOpen, setDetailsOpen] = useState(() => { try { return localStorage.getItem("lv-detailscard-open") !== "0"; } catch { return true; } });
  const toggleDetails = () => setDetailsOpen((o) => { try { localStorage.setItem("lv-detailscard-open", o ? "0" : "1"); } catch { /* ignore */ } return !o; });
  // The open combination builder is owned here and shared between the cards — most
  // combos render in CombosCard; P.F.C renders inline in ComponentsCard.
  const [comboKind, setComboKind] = useState<ComboKind | null>(null);
  const [copperOpen, setCopperOpen] = useState<null | "busbar" | "cu">(null); // separate "how is this calculated?" windows

  return (
    <div className="space-y-4">
      {dialogs}
      {/* Panel details (left) + live cost (right) — one compact row.
          Details is a touch wider, cost a touch narrower, and both stretch to
          the same height so their bottoms line up. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      {/* Cost summary (live) */}
      <div className="card px-4 py-3 order-2 flex flex-col">
        <button type="button" onClick={toggleCost} className="flex w-full items-center justify-between gap-3 text-left">
          <h2 className="sec-head mb-0 flex items-center gap-1.5">
            <span className={`text-[11px] text-muted transition-transform ${costOpen ? "rotate-90" : ""}`}>▶</span>
            Panel cost (live)
          </h2>
          <span className="whitespace-nowrap text-sm font-bold text-brand-dark">{fmtEgp(calc.sellUnit)} EGP</span>
        </button>
        {costOpen && (
        <div className="mt-3 grid flex-1 auto-rows-fr grid-cols-2 gap-2 text-sm [&_b]:text-base sm:grid-cols-3">
          <div className="rounded-lg bg-surface p-2.5">Components<br /><b>{fmtEgp(calc.compCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">Enclosure<br /><b>{fmtEgp(calc.enclCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">Kits<br /><b>{fmtEgp(calc.kits)} EGP</b></div>
          <button type="button" onClick={() => setCopperOpen("busbar")} title="How is this calculated?"
            className="group relative rounded-lg bg-surface p-2.5 text-left transition hover:bg-brand-tint/60 hover:ring-1 hover:ring-brand/30">
            Main Busbar ({fmtNum(calc.busbarKg)} KG)<br /><b>{fmtEgp(calc.busbarCost)} EGP</b>
            <span className="absolute right-1.5 top-1.5 text-[10px] text-muted opacity-50 group-hover:opacity-100">ⓘ</span>
          </button>
          <button type="button" onClick={() => setCopperOpen("cu")} title="How is this calculated?"
            className="group relative rounded-lg bg-surface p-2.5 text-left transition hover:bg-brand-tint/60 hover:ring-1 hover:ring-brand/30">
            Cu Connections ({fmtNum(calc.cuWeight)} KG)<br /><b>{fmtEgp(calc.cuConnCost)} EGP</b>
            <span className="absolute right-1.5 top-1.5 text-[10px] text-muted opacity-50 group-hover:opacity-100">ⓘ</span>
          </button>
          <div className="rounded-lg bg-surface p-2.5">Total Copper (KG)<br /><b>{fmtNum(calc.cuWeight + calc.busbarKg)} KG</b></div>
          <div className="rounded-lg bg-surface p-2.5">Unit Cost<br /><b>{fmtEgp(calc.unitCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">
            Factor
            <FactorInput
              value={p.sellFactor || 0}
              global={s.factors.factor}
              onChange={(n) => u({ sellFactor: n })}
              className={`mt-0.5 block w-full rounded border px-1.5 py-0.5 text-sm font-bold focus:outline-none ${
                p.sellFactor > 0 ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-ink"
              }`}
              title={p.sellFactor > 0 ? "Custom — clear to follow Pricing Settings" : `Default from Pricing Settings (${s.factors.factor})`}
            />
          </div>
          <div className="rounded-lg bg-brand-light p-2.5 text-brand-dark">Unit Selling (EGP)<br /><b>{fmtEgp(calc.sellUnit)} EGP</b></div>
          <div className="rounded-lg bg-brand p-2.5 text-white">Unit Selling (USD)<br /><b>{fmtEgp(s.factors.usd > 0 ? calc.sellUnit / s.factors.usd : 0)} USD</b></div>
        </div>
        )}
      </div>

      {/* Panel details */}
      <div className="card px-4 py-3 order-1">
        <button type="button" onClick={toggleDetails} className="flex w-full items-center justify-between gap-3 text-left">
          <h2 className="sec-head mb-0 flex items-center gap-1.5">
            <span className={`text-[11px] text-muted transition-transform ${detailsOpen ? "rotate-90" : ""}`}>▶</span>
            Panel details
          </h2>
          {p.name.trim() && <span className="truncate text-base font-semibold text-brand">{p.name.trim()}</span>}
        </button>
        {detailsOpen && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><L>Panel name <span className="text-brand">*</span></L>
            <input className={`input ${!p.name.trim() || nameClashOf(s, p) ? "border-red-400 bg-red-50/40" : ""}`} value={p.name}
              placeholder="required" onChange={(e) => u({ name: e.target.value })} />
            <PanelNameClash s={s} p={p} /></div>
          <div><L>Fed from</L><input className="input" value={p.fedFrom} onChange={(e) => u({ fedFrom: e.target.value })} /></div>
          <div><L>Quantity</L><input className="input" inputMode="numeric" value={p.qty}
            onChange={(e) => u({ qty: Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, "")) || 1) })} /></div>
          <div><L>Busbar Rating <span className="text-brand">*</span></L>
            <select className={`input cursor-pointer ${!p.ratingA ? "border-red-400 bg-red-50/40 text-muted" : ""}`}
              value={p.ratingA || ""}
              onChange={(e) => u({ ratingA: parseInt(e.target.value, 10) || 0 })}>
              {/* Grey placeholder example from the incoming C.B (not committed until picked) */}
              <option value="">{predictedRating > 0 ? `${predictedRating} A` : "— Select —"}</option>
              {ratingOptions.map((r) => <option key={r} value={r}>{r} A</option>)}
            </select>
          </div>
          <div><L>Short circuit</L><input className="input" value={p.shortCircuit}
            placeholder="e.g. 50 kA" onChange={(e) => u({ shortCircuit: e.target.value })} /></div>
          {commonField("Amb. temp", "ambTemp", AMB_TEMPS)}
          {commonField("Form", "form", FORMS)}
          {commonField("Neutral", "neutral", NEUTRAL_EARTH)}
          {commonField("Earth", "earth", NEUTRAL_EARTH)}
          {commonField("Copper", "copperType", COPPER_TYPES)}
          {commonField("Incoming cables", "incomingCables", INCOMING_CABLES)}
          {commonField("Outgoing cables", "outgoingCables", OUTGOING_CABLES)}
          {(() => {
            const autoRaw = mainBusbarAutoRaw(p);   // family auto value, ignoring any override
            const isAutoFamily = autoRaw !== null;
            const overridden = !!p.mainBusbarOverride;
            const area = busbarAreaMm2(p);
            const startOverride = async () => {
              if (
                !(await confirm({
                  title: "Enter the busbar weight yourself",
                  message:
                    "It stops updating from the rating and height — you enter the KG by hand.\n" +
                    "You can switch back to automatic at any time.",
                  confirmLabel: "Enter it manually",
                }))
              )
                return;
              u({ mainBusbarOverride: true, mainBusbarKg: parseFloat((autoRaw ?? 0).toFixed(2)) });
            };
            return (
              <>
                <div>
                  <L>Main Busbar (KG)</L>
                  {isAutoFamily && !overridden ? (
                    <>
                      <input className="input bg-surface text-muted" value={autoRaw.toFixed(2)} readOnly tabIndex={-1} />
                      <div className="mt-1 flex items-start justify-between gap-2">
                        <p className="text-[11px] text-muted">
                          auto · {area} mm² × height × {p.busbarPoles || 3}P × 0.000009
                          {p.panelsSizing.layout === "Double" ? " × 2" : ""}
                        </p>
                        <button type="button" onClick={startOverride}
                          className="shrink-0 text-[11px] font-semibold text-brand hover:underline" title="Enter the weight manually (asks to confirm)">✎ Edit</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <input className="input" type="number" min={0} step={0.5} value={p.mainBusbarKg || ""}
                        placeholder="0" onChange={(e) => u({ mainBusbarKg: parseFloat(e.target.value) || 0 })} />
                      {isAutoFamily && overridden && (
                        <div className="mt-1 flex justify-end">
                          <button type="button" onClick={() => u({ mainBusbarOverride: false })}
                            className="shrink-0 text-[11px] font-semibold text-brand hover:underline" title={`Back to auto (${(autoRaw ?? 0).toFixed(2)} KG)`}>↺ Auto</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <L>Busbar poles</L>
                  <input type="number" min={1} step={0.25} value={p.busbarPoles || 3}
                    onChange={(e) => u({ busbarPoles: parseFloat(e.target.value) || 3 })}
                    className="input" title="Bar-equivalents = phases + neutral% + earth% (e.g. 3P + N 100% + E 25% = 4.25)" />
                </div>
              </>
            );
          })()}
          <div>
            <L>Designation</L>
            <input className="input" value={p.code} onChange={(e) => u({ code: e.target.value })} />
          </div>
        </div>
        )}
      </div>
      </div>{/* /details + cost row */}

      {copperOpen && <CopperBreakdownWindow which={copperOpen} p={p} calc={calc} f={s.factors} onClose={() => setCopperOpen(null)} />}

      {/* Components (section pills + circuit-combination sub-row live inside this card) */}
      <ComponentsCard s={s} p={p} u={u} replaceComponent={replaceComponent} comboKind={comboKind} setComboKind={setComboKind} />

      {/* Panel type — placed after Components (enclosure sizings as component-like items) */}
      <SizingCard p={p} u={u} factors={s.factors} />

      {/* No. of poles — its own standalone section (sizing summary, not part of Panel type) */}
      <div className="card p-5"><PolesSummary p={p} /></div>

      {/* RPT-1: per-panel Draft — notes & calculations, never included in outputs */}
      <div className="card p-5">
        <h2 className="sec-head">Draft <span className="text-[11px] font-normal text-muted">· notes &amp; calculations for this panel (not included in any offer)</span></h2>
        <textarea className="input min-h-[120px] w-full font-mono text-xs"
          placeholder="Scratchpad for this panel — calculations, reminders, notes…"
          value={p.draft ?? ""} onChange={(e) => u({ draft: e.target.value })} />
      </div>
    </div>
  );
}

// Enter in a Qty cell jumps to the next row's Qty (down the column), not across to Adj.
function qtyEnterNav(e: { key: string; preventDefault: () => void; currentTarget: HTMLInputElement }) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-qtyinput]"));
  const next = inputs[inputs.indexOf(e.currentTarget) + 1];
  if (next) { next.focus(); next.select(); }
}

// Enter in a Copper Tool cell moves down the same column (Phase / Neutral / Earth),
// not across to the next column in the row.
function copperEnterNav(e: { key: string; preventDefault: () => void; currentTarget: HTMLInputElement }) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const col = e.currentTarget.getAttribute("data-coppercol");
  if (!col) return;
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-coppercol="${col}"]`));
  const next = inputs[inputs.indexOf(e.currentTarget) + 1];
  if (next) { next.focus(); next.select(); }
}

// ── Standard Panels view (inside the Components card) ───────────────────────
// Pick TR kVA + P.F.C + Outgoings and the whole panel is built from the house
// standard: name, components, PLP cells and main-busbar copper.
function StandardPanelsView({ p, u, panels }: {
  p: LvPanel; u: (patch: Partial<LvPanel>) => void; panels: LvPanel[];
}) {
  const { confirm, dialogs } = useDialogs();
  const kva = p.stdTrKva ?? STD_TR_KVA_DEFAULT;
  const pfc = p.stdPfc ?? "No";
  const out = p.stdOutgoings ?? STD_OUTGOINGS[0];
  const std = stdPanel(kva, pfc, out);
  // Building writes the standard's OWN name ("MDB 1000A+5*250A+25kVAR"), so building the
  // same standard on two panels used to name both identically — the app choosing the
  // name, not the user, so the app resolves it. The suffix is announced in the
  // confirmation rather than applied behind the engineer's back.
  const stdName = std ? uniquePanelName(std.name, panels, p.id) : "";
  const renamed = !!std && stdName !== std.name;
  const apply = async () => {
    if (!std) return;
    if (
      (p.components.length || renamed) &&
      !(await confirm({
        title: `Build "${std.name}" from the standard`,
        message: (p.components.length ? "This panel's components, cells and copper are all replaced by the standard ones." : "")
          + (renamed ? `${p.components.length ? "\n\n" : ""}Another panel is already called “${std.name}”, so this one will be named “${stdName}”.` : ""),
        confirmLabel: "Build it",
        // Danger is for the replacement of existing work; a rename notice on an empty
        // panel is not a warning, it is information.
        tone: p.components.length ? "danger" : "brand",
      }))
    )
      return;
    // Building from the standard resets the panel to pristine, so it is no longer
    // "changed from standard" — clear the recheck mark.
    u({ ...applyStdPanel(p, std), name: stdName, edmsEdited: false });
  };
  return (
    <div className="space-y-2">
      {dialogs}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <L>TR: KVA</L>
          {/* This view is EDMS-only, so it always offers the EDMS sizes (incl. 300). */}
          <Sel value={kva} options={STD_TR_KVA_EDMS}
            onChange={(v) => u({ stdTrKva: v })} />
        </div>
        <div>
          <L>P.F.C</L>
          <Sel value={pfc} options={YES_NO} onChange={(v) => u({ stdPfc: v })} />
        </div>
        <div>
          <L>Outgoings</L>
          <Sel value={out} options={STD_OUTGOINGS} onChange={(v) => u({ stdOutgoings: v })} />
        </div>
      </div>

      {!std ? (
        // Same compact strip as the build bar below, so the row keeps its height
        // whether the selection lands on a standard or on a gap.
        <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1">
          <p className="text-xs font-semibold text-amber-800">
            No standard for <b>{kva} kVA · P.F.C {pfc} · {out}</b>
            {STD_EDMS_KVA.includes(kva)
              ? <> — outgoings need P.F.C set to <b>Yes</b>, or Outgoings <b>None</b>.</>
              : <> — standards exist for {STD_EDMS_KVA.join(", ")} kVA.</>}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand/40 bg-white px-2.5 py-1">
          <p className="text-xs font-bold text-ink">{std.name}</p>
          <button type="button" onClick={apply}
            className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-brand-dark">
            Build this panel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Standard ATS view (inside the Components card, Standard EDMS) ────────────
// Pick a rating (and breaker, where both MCCB and ACB exist) and the whole panel is
// built from the house ATS standard: name, components, enclosure (PLP cells or an
// SR-Basic box) and busbar copper. Every ATS is "1 out of 2".
function StandardAtsView({ p, u, panels }: {
  p: LvPanel; u: (patch: Partial<LvPanel>) => void; panels: LvPanel[];
}) {
  const { confirm, dialogs } = useDialogs();
  const [ratingA, setRatingA] = useState<number>(stdAtsRatings()[0] ?? 630);
  const breakers = atsBreakersFor(ratingA);
  const [breaker, setBreaker] = useState<string>(breakers[0] ?? "MCCB");
  // Keep the breaker valid when the rating changes (e.g. the ACB-only sizes).
  useEffect(() => {
    const opts = atsBreakersFor(ratingA);
    if (!opts.includes(breaker as "MCCB" | "ACB")) setBreaker(opts[0] ?? "MCCB");
  }, [ratingA]); // eslint-disable-line react-hooks/exhaustive-deps
  const variant: StdAtsVariant | undefined = stdAts(ratingA, breaker);
  const stdName = variant ? uniquePanelName(variant.name, panels, p.id) : "";
  const renamed = !!variant && stdName !== variant.name;
  const apply = async () => {
    if (!variant) return;
    if (
      (p.components.length || renamed) &&
      !(await confirm({
        title: `Build "${variant.name}" from the standard`,
        message: (p.components.length ? "This panel's components, enclosure and copper are all replaced by the standard ATS ones." : "")
          + (renamed ? `${p.components.length ? "\n\n" : ""}Another panel is already called “${variant.name}”, so this one will be named “${stdName}”.` : ""),
        confirmLabel: "Build it",
        tone: p.components.length ? "danger" : "brand",
      }))
    )
      return;
    u({ ...applyStdAts(p, variant), name: stdName, edmsEdited: false });
  };
  return (
    <div className="space-y-2">
      {dialogs}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <L>Rating (A)</L>
          <Sel value={String(ratingA)} options={stdAtsRatings().map(String)}
            onChange={(v) => setRatingA(parseInt(v, 10))} />
        </div>
        <div>
          <L>Breaker</L>
          <Sel value={breaker} options={breakers} onChange={(v) => setBreaker(v)} />
        </div>
      </div>

      {!variant ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1">
          <p className="text-xs font-semibold text-amber-800">
            No standard ATS for <b>{ratingA} A · {breaker}</b>.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand/40 bg-white px-2.5 py-1">
          <p className="text-xs font-bold text-ink">{variant.name}</p>
          <button type="button" onClick={apply}
            className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-brand-dark">
            Build this ATS
          </button>
        </div>
      )}
    </div>
  );
}

// ── Components card ──────────────────────────────────────────────────────────
function ComponentsCard({ s, p, u, replaceComponent, comboKind, setComboKind }: { s: LvState; p: LvPanel; u: (patch: Partial<LvPanel>) => void; replaceComponent: (matchRef: string, matchName: string, nc: DbComponent, panelIds: Set<string>) => void; comboKind: ComboKind | null; setComboKind: (k: ComboKind | null) => void }) {
  const { confirm, notify, dialogs } = useDialogs();
  const [q, setQ] = useState("");
  const [pasteMsg, setPasteMsg] = useState(""); // summary after a multi-item paste
  const [pastePreview, setPastePreview] = useState<null | { rows: { name: string; qty: number; match: DbComponent | null }[] }>(null);
  const [pfcTab, setPfcTab] = useState<"known" | "calc">("known"); // P.F.C window: known-data entry vs calculation
  const [pfcCalcKvar, setPfcCalcKvar] = useState<number | null>(null); // required kVAR from the calc tab → known tab
  const [replaceOpen, setReplaceOpen] = useState(false); // "Replace component" (across panels) window
  // The Standard Panels picker is a Standard EDMS feature only.
  const isEdmsPanel = s.kind === "edms";
  // Standard EDMS builds either a standard Panel or a standard ATS (toggle above the picker).
  const [edmsMode, setEdmsMode] = useState<"panel" | "ats">("panel");
  const hits = useMemo(() => searchComponents(q, 40), [q]);
  const effGroup = effectiveGroups(p.components); // combination grouping incl. inherited groups
  // Current combination multiplier for a group (from an item's qty ÷ its base qty).
  const comboQtyOf = (secComps: PanelComponent[], group: string): number => {
    const first = secComps.find((x) => !isSpacer(x) && (effGroup.get(x.id) || "") === group);
    if (!first) return 1;
    const base = first.baseQty ?? first.qty;
    return base > 0 ? Math.max(1, Math.round(first.qty / base)) : 1;
  };
  // The combination-instance id shared by a group's rows (for the whole-combo select-all).
  const groupComboId = (sec: string, group: string): string | undefined =>
    p.components.find((x) => x.section === sec && !isSpacer(x) && (effGroup.get(x.id) || "") === group && x.comboId)?.comboId;
  // Scale every item of a combination group to N units (qty = base × N).
  const setComboQty = (group: string, sec: string, n: number) => {
    const qn = Math.max(1, Math.round(n) || 1);
    u({ components: p.components.map((c) => {
      if (c.section !== sec || isSpacer(c) || (effGroup.get(c.id) || "") !== group) return c;
      const base = c.baseQty ?? c.qty;
      return { ...c, baseQty: base, qty: base * qn };
    }) });
  };
  // Move a whole group (its items) to another section, kept contiguous at the end there.
  const moveGroupToSection = (group: string, fromSec: string, toSec: string) => {
    if (toSec === fromSec || !p.sections.includes(toSec)) return;
    const inGroup = (c: PanelComponent) => c.section === fromSec && (effGroup.get(c.id) || "") === group;
    const moved = p.components.filter(inGroup).map((c) => ({ ...c, section: toSec }));
    if (!moved.length) return;
    const rest = p.components.filter((c) => !inGroup(c));
    let lastIdx = -1;
    rest.forEach((c, i) => { if (c.section === toSec) lastIdx = i; });
    u({ components: [...rest.slice(0, lastIdx + 1), ...moved, ...rest.slice(lastIdx + 1)], activeSection: toSec });
  };
  // Sort groups within a section: swap this group's block with the adjacent one.
  const reorderGroup = (group: string, sec: string, dir: -1 | 1) => {
    const blocks: { g: string; items: PanelComponent[] }[] = [];
    p.components.filter((c) => c.section === sec).forEach((c) => {
      const g = effGroup.get(c.id) || "";
      const last = blocks[blocks.length - 1];
      if (last && last.g === g) last.items.push(c);
      else blocks.push({ g, items: [c] });
    });
    const gi = blocks.findIndex((b) => b.g === group);
    const ti = gi + dir;
    if (gi < 0 || ti < 0 || ti >= blocks.length) return;
    [blocks[gi], blocks[ti]] = [blocks[ti], blocks[gi]];
    const reordered = blocks.flatMap((b) => b.items);
    let k = 0;
    u({ components: p.components.map((c) => (c.section === sec ? reordered[k++] : c)) });
  };
  // Rename a combination group — retags every member row's `group` to the new label.
  const renameGroup = (group: string, sec: string, name: string) => {
    const nm = name.trim();
    if (!nm || nm === group) return;
    u({ components: p.components.map((c) =>
      c.section === sec && !isSpacer(c) && (effGroup.get(c.id) || "") === group ? { ...c, group: nm } : c) });
  };
  // Duplicate a whole combination — clone every member (fresh ids) under a new unique
  // "<name> copy" label, inserted right after the original group.
  const duplicateGroup = (group: string, sec: string) => {
    const inGroup = (c: PanelComponent) => c.section === sec && (effGroup.get(c.id) || "") === group;
    const members = p.components.filter(inGroup);
    if (!members.length) return;
    const used = new Set(p.components.filter((c) => c.section === sec && !isSpacer(c)).map((c) => effGroup.get(c.id) || "").filter(Boolean));
    let name = `${group} copy`;
    for (let k = 2; used.has(name); k++) name = `${group} copy ${k}`;
    const clones = members.map((c) => ({ ...c, id: uid(), ...(isSpacer(c) ? {} : { group: name }) }));
    const arr = [...p.components];
    let lastIdx = -1;
    arr.forEach((c, i) => { if (inGroup(c)) lastIdx = i; });
    arr.splice(lastIdx + 1, 0, ...clones);
    u({ components: arr });
  };
  // Copy a combination to the cross-panel clipboard; Paste clones it (fresh ids + unique name)
  // into the active section of whatever panel is open — so a combo can move between panels.
  const [, bumpClip] = useState(0);
  const copyGroup = (group: string, sec: string) => {
    const members = p.components.filter((c) => c.section === sec && (effGroup.get(c.id) || "") === group);
    if (!members.length) return;
    comboClipboard = { label: group, comps: members.map((c) => ({ ...c })) };
    bumpClip((v) => v + 1);
  };
  const pasteCombo = () => {
    if (!comboClipboard) return;
    const sec = p.activeSection;
    const used = new Set(p.components.filter((c) => c.section === sec && !isSpacer(c)).map((c) => effGroup.get(c.id) || "").filter(Boolean));
    let name = comboClipboard.label;
    for (let k = 2; used.has(name); k++) name = `${comboClipboard.label} (${k})`;
    const cid = uid();
    const clones = comboClipboard.comps.map((c) => (isSpacer(c)
      ? { ...c, id: uid(), section: sec }
      : { ...c, id: uid(), section: sec, group: name, comboId: cid }));
    const arr = [...p.components];
    let lastIdx = -1;
    for (let i = 0; i < arr.length; i++) if (arr[i].section === sec) lastIdx = i;
    arr.splice(lastIdx + 1, 0, ...clones);
    u({ components: arr });
  };

  const [newSection, setNewSection] = useState("");
  const [preview, setPreview] = useState<ComboLine[]>([]); // active circuit-combination preview
  const [tag, setTag] = useState("");                       // combination name (from the builder)
  // Most circuit combinations are a GROUP inside the active section — each line keeps its
  // sub-group label (ATS → Source 1/2 / Interlock, MCC → its starter header); items carry
  // baseQty (per-unit) so the group's ×N combination-qty scales every row (qty = baseQty × ×N).
  // P.F.C is the exception: it's its OWN section beside Outgoings (a dedicated cap-bank cubicle),
  // named after its kVAR header, with flat items.
  const commitCombo = () => {
    if (!preview.length) return;
    if (comboKind === "pfc") {
      const base = (preview.find((l) => l.groupLabel)?.groupLabel || tag || "P.F.C").trim();
      const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${esc}(?:\\s*-\\s*(\\d+))?$`); // unique "<name>" / "<name>-N"
      let exists = false, max = 0;
      for (const sname of p.sections) { const m = sname.match(re); if (m) { exists = true; if (m[1]) max = Math.max(max, parseInt(m[1], 10)); } }
      const section = exists ? `${base}-${max + 1}` : base;
      const oi = p.sections.indexOf("Outgoings"); // place the P.F.C section right after Outgoings
      const sections = oi >= 0 ? [...p.sections.slice(0, oi + 1), section, ...p.sections.slice(oi + 1)] : [...p.sections, section];
      const items = preview.map((l) => {
        const c = l.comp ? toPanelComponent(l.comp, section, l.qty) : freeComponent(l.desc, section, l.qty);
        return { ...c, baseQty: l.baseQty ?? l.qty };
      });
      u({ sections, components: [...p.components, ...items], activeSection: section });
    } else {
      const sec = p.activeSection;
      const cid = uid(); // one instance id for the whole combination → single "select all" checkbox
      const items = preview.map((l) => {
        // Indication Lamps + Push Buttons + Photocell + WD kit → flat items (no group header).
        if (comboKind === "lamps" || comboKind === "pushbtn" || comboKind === "photocell" || comboKind === "wd") {
          return l.comp ? toPanelComponent(l.comp, sec, l.qty) : freeComponent(l.desc, sec, l.qty);
        }
        const grp = l.groupLabel || tag || "Combination";
        const c = l.comp ? toPanelComponent(l.comp, sec, l.qty, grp) : freeComponent(l.desc, sec, l.qty, grp);
        // Custom combinations + collected combo groups (e.g. "N Sources") carry a ×N combination-qty control.
        return { ...c, baseQty: l.baseQty ?? l.qty, comboId: cid, ...(comboKind === "custom" || l.scalable ? { comboScalable: true } : {}) };
      });
      u({ components: [...p.components, ...items] });
    }
    setPreview([]); setTag(""); setComboKind(null);
  };
  // Row-2 circuit combinations (smaller sub-row under the section pills). P.F.C is NOT here —
  // it's triggered from the sections row (beside Outgoings) since it builds its own section.
  const COMBOS = [["lamps", "Indication Lamps"], ["pushbtn", "Push Buttons"], ["fire", "Fire"], ["ats", "ATS"], ["sync", "Synchronization"], ["photocell", "Photocell"], ["mcc", "MCC starter"], ["motorized", "Motorized C.B"], ["wd", "WD kit"], ["custom", "New Combination"]] as const;
  // Word-style row inserter: drop an empty row (spacer) after a given component, or at
  // the top of the section when afterId is null.
  const insertSpacerAfter = (sec: string, afterId: string | null) => {
    const next = [...p.components];
    const spacer = spacerComponent(sec);
    if (afterId == null) {
      const firstIdx = next.findIndex((c) => c.section === sec);
      next.splice(firstIdx < 0 ? next.length : firstIdx, 0, spacer);
    } else {
      const idx = next.findIndex((c) => c.id === afterId);
      next.splice(idx < 0 ? next.length : idx + 1, 0, spacer);
    }
    u({ components: next });
  };
  // A zero-height row whose thin hit area reveals a centered "+" on hover (Word-style).
  const insertZone = (sec: string, afterId: string | null, key: string) => (
    <tr key={key} aria-hidden="true">
      <td colSpan={9} className="relative h-0 border-0 p-0">
        <div className="group/ins absolute inset-x-0 -top-1 z-10 flex h-2 items-center justify-start pl-1">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-muted/30 opacity-0 transition-opacity duration-150 group-hover/ins:opacity-100" />
          <button type="button" title="Insert an empty row here" onClick={() => insertSpacerAfter(sec, afterId)}
            className="relative grid h-4 w-4 place-items-center rounded-full border border-line bg-white text-[12px] font-bold leading-none text-muted opacity-0 shadow-sm transition-opacity duration-150 hover:border-muted hover:bg-surface hover:text-ink group-hover/ins:opacity-100">+</button>
        </div>
      </td>
    </tr>
  );
  const [editingSec, setEditingSec] = useState<string | null>(null); // custom-section rename
  const [editVal, setEditVal] = useState("");
  const [editGroup, setEditGroup] = useState<string | null>(null); // combination rename — "sec|group"
  const [editGroupVal, setEditGroupVal] = useState("");
  // "Add into an existing combination" — armed from a group's "+ Add" button; the next
  // component(s) picked from the search drop into this group instead of the section end.
  const [addTarget, setAddTarget] = useState<{ sec: string; group: string } | null>(null);
  useEffect(() => {
    if (!addTarget) return;
    const eg = effectiveGroups(p.components);
    if (!p.components.some((c) => c.section === addTarget.sec && !isSpacer(c) && (eg.get(c.id) || "") === addTarget.group)) setAddTarget(null);
  }, [p.components, addTarget]);
  const [editComp, setEditComp] = useState<string | null>(null); // row being re-selected
  // Picking a search result opens a small qty popup before the component is added.
  const [pending, setPending] = useState<DbComponent | null>(null);
  const [pendQty, setPendQty] = useState(""); // empty box — typed number becomes the qty (blank = 1)
  // Styled "add the external neutral sensor?" prompt shown after a 3-pole LSIG breaker
  // is added (the breaker is added immediately; this offers its matching sensor).
  const [neutralPrompt, setNeutralPrompt] = useState<null | { breaker: string; sensor: string; sec: string; qty: number; extra?: Partial<PanelComponent> }>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  // Close the search results (clear the query) when a click lands outside the box.
  useEffect(() => {
    if (!q || pending) return;
    const onDown = (e: MouseEvent) => { if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setQ(""); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [q, pending]);
  // When the qty popup opens, focus + select the field so the quantity can be typed
  // straight from the keyboard (type the number, then Enter to add).
  useEffect(() => { if (pending) { qtyRef.current?.focus({ preventScroll: true }); qtyRef.current?.select(); } }, [pending]);
  // Keyboard nav of the search results: first hit auto-highlighted; ↑/↓ move the
  // selection, Enter picks the highlighted component (then the qty popup opens).
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setActiveIdx(0); }, [q]);
  useEffect(() => { (listRef.current?.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [activeIdx]);
  // drag-and-drop: reorder rows and move them across sections
  const [dragId, setDragId] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);
  const [overSec, setOverSec] = useState<string | null>(null);

  const setComp = (id: string, patch: Partial<PanelComponent>) =>
    u({ components: p.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const delComp = (id: string) => u({ components: p.components.filter((c) => c.id !== id) });

  // ── Multi-row selection: checkbox column, running sum, floating action bar ──
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [lastPickId, setLastPickId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false); // "Move to section" dropdown in the selection action bar
  useEffect(() => setMoveOpen(false), [selected]); // close it whenever the selection changes
  const [hoverSum, setHoverSum] = useState<{ col: "qty" | "unit" | "total"; x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [barTop, setBarTop] = useState<number | null>(null); // action-bar y, just below the lowest selected row (card-relative)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null); // free viewport position once the bar is dragged
  const orderedIds = p.components.filter((c) => !isSpacer(c)).map((c) => c.id); // selectable rows in render order
  const toggleSelect = (id: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastPickId && lastPickId !== id) {
        const a = orderedIds.indexOf(lastPickId), b = orderedIds.indexOf(id);
        if (a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; for (let i = lo; i <= hi; i++) next.add(orderedIds[i]); }
      } else if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLastPickId(id);
  };
  // Drag-to-select: press-and-hold anywhere on a row body (grip is reserved for reorder) and drag.
  // The selection tracks the contiguous range between the start row and the row under the cursor —
  // dragging down grows it, dragging back up shrinks it (rows leaving the range are unchecked).
  // A press with no cross-row movement is a plain click (checkbox toggles; inputs/buttons act).
  const dragRef = useRef<{ anchorId: string; moved: boolean; onCheckbox: boolean; shift: boolean } | null>(null);
  const onRowDown = (id: string, onCheckbox: boolean, shift: boolean) => {
    dragRef.current = { anchorId: id, moved: false, onCheckbox, shift };
    const onUp = () => {
      const d = dragRef.current;
      if (d && !d.moved && d.onCheckbox) toggleSelect(d.anchorId, d.shift); // quick click on the checkbox → toggle / shift-range
      dragRef.current = null;
      document.body.style.userSelect = ""; // re-enable text selection
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mouseup", onUp);
  };
  const onRowEnter = (id: string) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) { d.moved = true; document.body.style.userSelect = "none"; window.getSelection()?.removeAllRanges(); } // drag begins on first cross-row move
    const a = orderedIds.indexOf(d.anchorId), b = orderedIds.indexOf(id);
    if (a < 0 || b < 0) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    setSelected(new Set(orderedIds.slice(lo, hi + 1))); // selection = the contiguous start→cursor range
    setLastPickId(id);
  };
  const setSectionSel = (sec: string, on: boolean) => {
    const ids = p.components.filter((c) => c.section === sec && !isSpacer(c)).map((c) => c.id);
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => (on ? next.add(id) : next.delete(id))); return next; });
  };
  // Select / clear an explicit set of ids — used by the whole-combination checkbox (a
  // combination can span several groups, e.g. Sync → Source 1 / Source 2 / Bus Coupler / Accessories).
  const setIdsSel = (ids: string[], on: boolean) =>
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => (on ? next.add(id) : next.delete(id))); return next; });
  const clearSel = () => { setSelected(new Set()); setLastPickId(null); };
  const selectedTotal = p.components.reduce((sum, c) => (selected.has(c.id) && !isSpacer(c) ? sum + itemPriceEgp(c, s) * c.qty : sum), 0);
  // The selection is a single existing combination when every selected row shares one non-empty group.
  const selGroupSet = new Set(p.components.filter((c) => selected.has(c.id) && !isSpacer(c)).map((c) => effGroup.get(c.id) || ""));
  const isSelCombo = selGroupSet.size === 1 && [...selGroupSet][0] !== "";
  // Column-aware sum over the selected rows (QTY / UNIT COST / TOTAL) for the hover tooltip.
  const colSum = (col: "qty" | "unit" | "total") =>
    p.components.reduce((acc, c) => {
      if (!selected.has(c.id) || isSpacer(c)) return acc;
      if (col === "qty") return acc + (c.baseQty ?? c.qty);
      if (col === "unit") return acc + itemPriceEgp(c, s);
      return acc + itemPriceEgp(c, s) * c.qty;
    }, 0);
  const duplicateSel = () => {
    if (!selected.size) return;
    // A fully-selected group duplicates as a NEW (renamed) group placed after the original.
    // Loose rows / partially-selected groups copy right below the original (same group) as before.
    const keyOf = (c: PanelComponent) => `${c.section}::${effGroup.get(c.id) || ""}`;
    const total = new Map<string, number>(), selCount = new Map<string, number>();
    for (const c of p.components) {
      if (isSpacer(c) || !(effGroup.get(c.id) || "")) continue;
      const k = keyOf(c);
      total.set(k, (total.get(k) || 0) + 1);
      if (selected.has(c.id)) selCount.set(k, (selCount.get(k) || 0) + 1);
    }
    const fullGroup = new Set<string>();
    total.forEach((t, k) => { if (selCount.get(k) === t) fullGroup.add(k); });
    // Existing group names per section → mint unique "<name> copy" labels for the new groups.
    const usedNames = new Map<string, Set<string>>();
    for (const c of p.components) {
      const g = effGroup.get(c.id) || "";
      if (isSpacer(c) || !g) continue;
      (usedNames.get(c.section) ?? usedNames.set(c.section, new Set()).get(c.section)!).add(g);
    }
    const uniqueName = (base: string, sec: string) => {
      const used = usedNames.get(sec) ?? usedNames.set(sec, new Set()).get(sec)!;
      let name = `${base} copy`;
      for (let k = 2; used.has(name); k++) name = `${base} copy ${k}`;
      used.add(name);
      return name;
    };
    const lastIdx = new Map<string, number>();
    p.components.forEach((c, i) => { if (!isSpacer(c) && fullGroup.has(keyOf(c))) lastIdx.set(keyOf(c), i); });

    const newIds = new Set<string>(), newName = new Map<string, string>(), stash = new Map<string, PanelComponent[]>();
    // Duplicated full groups become an independent combination — remap comboId (old → one fresh id),
    // so a whole-combo duplicate (several groups) stays unified while unlinking from the original.
    const remapCombo = new Map<string, string>();
    const freshCombo = (old?: string) => (old ? (remapCombo.get(old) ?? remapCombo.set(old, uid()).get(old)!) : undefined);
    const out: PanelComponent[] = [];
    p.components.forEach((c, i) => {
      out.push(c);
      if (isSpacer(c) || !selected.has(c.id)) return;
      const k = keyOf(c);
      if (fullGroup.has(k)) { // whole group → gather copies, flush as one new group after the original
        if (!newName.has(k)) newName.set(k, uniqueName(effGroup.get(c.id) || "Combination", c.section));
        const copy = { ...c, id: uid(), group: newName.get(k)!, comboId: freshCombo(c.comboId) };
        newIds.add(copy.id);
        (stash.get(k) ?? stash.set(k, []).get(k)!).push(copy);
        if (i === lastIdx.get(k)) stash.get(k)!.forEach((cp) => out.push(cp));
      } else { // loose / partial-group row → copy right below, same group
        const copy = { ...c, id: uid() };
        newIds.add(copy.id); out.push(copy);
      }
    });
    u({ components: out });
    setSelected(newIds); setLastPickId(null); // the duplicates become the new selection
  };
  const deleteSel = async () => {
    if (!selected.size) return;
    if (
      selected.size > 3 &&
      !(await confirm({
        title: `Delete ${selected.size} rows`,
        message: "The selected rows are removed from this panel. You can undo it afterwards.",
        confirmLabel: `Delete ${selected.size} rows`,
        tone: "danger",
      }))
    )
      return;
    u({ components: p.components.filter((c) => !selected.has(c.id)) });
    clearSel();
  };
  // Move the selected rows into another section — dropped in after that section's existing
  // rows. Selection clears on completion (like Delete), which closes the bar + dropdown.
  const moveSelTo = (target: string) => {
    if (!selected.size) return;
    const moved = p.components.filter((c) => selected.has(c.id)).map((c) => ({ ...c, section: target }));
    const rest = p.components.filter((c) => !selected.has(c.id));
    let insertAt = rest.length; // target section empty → append at the end
    for (let i = rest.length - 1; i >= 0; i--) { if (rest[i].section === target) { insertAt = i + 1; break; } }
    u({ components: [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)] });
    clearSel();
  };
  // Group the selected rows into one combination — retag them with a new unique group name
  // (comboScalable, so the group gets a "Combination qty ×N" control) in the first row's section.
  const combineSel = () => {
    const isSel = (c: PanelComponent) => selected.has(c.id) && !isSpacer(c);
    const selReal = p.components.filter(isSel);
    if (selReal.length < 2) return; // a combination needs 2+ rows
    const target = selReal[0].section;
    const used = new Set(p.components.filter((c) => c.section === target).map((c) => effGroup.get(c.id) || "").filter(Boolean));
    let name = "New Combination";
    for (let k = 2; used.has(name); k++) name = `New Combination ${k}`;
    const cid = uid(); // one instance id → the group's whole-combo select-all
    const moved = selReal.map((c) => ({ ...c, section: target, group: name, baseQty: c.baseQty ?? c.qty, comboScalable: true, comboId: cid }));
    const rest = p.components.filter((c) => !isSel(c));
    const firstIdx = p.components.findIndex(isSel);
    let insertAt = 0;
    for (let i = 0; i < firstIdx; i++) if (!isSel(p.components[i])) insertAt++;
    u({ components: [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)] });
    clearSel();
  };
  // Dissolve the selected combination(s) — clear the group on every row of any group the selection touches.
  const uncombineSel = () => {
    const groups = new Set(p.components.filter((c) => selected.has(c.id) && !isSpacer(c)).map((c) => effGroup.get(c.id) || "").filter(Boolean));
    if (!groups.size) return;
    u({ components: p.components.map((c) => (!isSpacer(c) && groups.has(effGroup.get(c.id) || "") ? { ...c, group: "", comboScalable: false, comboId: undefined } : c)) });
    clearSel();
  };
  useEffect(() => {
    if (!selected.size) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; // ignore while typing in a field
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) { e.preventDefault(); duplicateSel(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSel(); }
      else if (e.key === "Escape") clearSel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, p.components]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected.size) return;
    const onDown = (e: MouseEvent) => { // click outside any selectable row / the action bar → clear
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-selrow]") || t.closest("[data-selbar]")) return;
      if (t instanceof HTMLInputElement && t.type === "checkbox") return; // the section header select-all
      clearSel();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  // Anchor the action bar just below the bottom-most selected row (moves with the list on scroll).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!selected.size) { setBarTop(null); setDragPos(null); return; } // selection cleared → re-anchor next time
    if (!card) return;
    const measure = () => {
      const cardTop = card.getBoundingClientRect().top + card.clientTop;
      let maxBottom = -Infinity;
      card.querySelectorAll<HTMLElement>("tr[data-selrow][data-cid]").forEach((el) => {
        if (selected.has(el.dataset.cid || "")) maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom);
      });
      setBarTop(maxBottom === -Infinity ? null : maxBottom - cardTop + 8);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [selected, p.components]); // eslint-disable-line react-hooks/exhaustive-deps
  // Grab the grip and drag the action bar anywhere on the page (switches it to fixed positioning).
  const startBarDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const bar = (e.currentTarget as HTMLElement).closest("[data-selbar]") as HTMLElement | null;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top, w = r.width, h = r.height;
    const onMove = (ev: MouseEvent) => {
      const x = Math.max(4, Math.min(ev.clientX - dx, window.innerWidth - w - 4));
      const y = Math.max(4, Math.min(ev.clientY - dy, window.innerHeight - h - 4));
      setDragPos({ x, y });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Re-select a component from the database, keeping qty / adj / comment / note /
  // section / group; all technical + pricing fields update from the new component.
  const replaceComp = (id: string, c: DbComponent) =>
    u({ components: p.components.map((x) => (x.id === id ? {
      ...x, name: c.n, desc: c.d, ref: c.ref, type: c.t, brand: c.brand, rating: c.r,
      eur: c.eur, egp: c.egp, poles: c.poles, cuP: c.cuP, cuC: c.cuC, stock: c.stock,
    } : x)) });
  // Reorder whole sections — swaps with the adjacent VISIBLE section; the new
  // order flows straight into the Technical offer (which iterates p.sections).
  const moveSection = (sec: string, dir: -1 | 1) => {
    const visible = p.sections.filter((x) => p.components.some((c) => c.section === x));
    const target = visible[visible.indexOf(sec) + dir];
    if (!target) return;
    const arr = [...p.sections];
    const a = arr.indexOf(sec), b = arr.indexOf(target);
    [arr[a], arr[b]] = [arr[b], arr[a]];
    u({ sections: arr });
  };
  // Every section except the three fixed ones (Main Incoming / Outgoings /
  // Metering) can be renamed or removed — including "Other" and user-added ones.
  const isFixed = (sec: string) => FIXED_SECTIONS.includes(sec);
  const renameSection = (oldName: string, raw: string) => {
    const nn = raw.trim();
    if (isFixed(oldName) || !p.sections.includes(oldName)) return;
    if (!nn || nn === oldName || p.sections.includes(nn)) return;
    u({
      sections: p.sections.map((x) => (x === oldName ? nn : x)),
      components: p.components.map((c) => (c.section === oldName ? { ...c, section: nn } : c)),
      activeSection: p.activeSection === oldName ? nn : p.activeSection,
    });
  };
  const removeSection = async (sec: string) => {
    if (isFixed(sec) || !p.sections.includes(sec)) return;
    // A panel must always keep at least one section to hold its components.
    if (p.sections.length <= 1) {
      void notify({
        title: "That is the last section",
        message: "A panel needs at least one section — add another before removing this one.",
      });
      return;
    }
    const hasComps = p.components.some((c) => c.section === sec);
    if (
      hasComps &&
      !(await confirm({
        title: `Remove section "${sec}"`,
        message: "Its components are not lost — they move into another section of this panel.",
        confirmLabel: "Remove the section",
      }))
    )
      return;
    const sections = p.sections.filter((x) => x !== sec);
    // Prefer a remaining default as the new home; otherwise the first section left.
    const fallback = sections.find((x) => DEFAULT_SECTIONS.includes(x)) ?? sections[0];
    u({
      sections,
      components: p.components.map((c) => (c.section === sec ? { ...c, section: fallback } : c)),
      activeSection: p.activeSection === sec ? fallback : p.activeSection,
    });
  };
  // Duplicate a whole section together with its components (fresh ids, unique name).
  const duplicateSection = (sec: string) => {
    if (!p.sections.includes(sec)) return;
    const base = sec.replace(/\s*-\s*\d+\s*$/, "").trim(); // continue an existing "-N" series
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${esc}\\s*-\\s*(\\d+)$`);
    let max = 0;
    for (const x of p.sections) { const m = x.match(re); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    const newName = `${base}-${max + 1}`;
    // Clone this section's rows in order, preserving group / qty / notes, with new ids.
    const clones = p.components.filter((c) => c.section === sec).map((c) => ({ ...c, id: uid(), section: newName }));
    const idx = p.sections.indexOf(sec);
    const sections = [...p.sections.slice(0, idx + 1), newName, ...p.sections.slice(idx + 1)];
    u({ sections, components: [...p.components, ...clones], activeSection: newName });
  };

  // Drop a dragged row onto another row: it takes the target's section (move
  // across sections) and is inserted just before it (reorder).
  // When a loose row lands inside a scalable combination (a group with a ×N qty), give it the
  // group's ×N so a component added by dragging scales like the rest — same as the group's "+ Add".
  const applyGroupScaling = (arr: PanelComponent[], idx: number) => {
    const c = arr[idx];
    if (isSpacer(c) || c.group) return; // only loose rows adopt a group by position
    let prev = "", next = ""; // infer the group from same-section grouped neighbours (mirrors effectiveGroups)
    for (let j = idx - 1; j >= 0 && arr[j].section === c.section; j--) { if (isSpacer(arr[j])) continue; const g = arr[j].group; if (g) { prev = g; break; } }
    for (let j = idx + 1; j < arr.length && arr[j].section === c.section; j++) { if (isSpacer(arr[j])) continue; const g = arr[j].group; if (g) { next = g; break; } }
    const grp = prev && prev === next ? prev : "";
    if (!grp) return;
    const members = arr.filter((x) => x.section === c.section && !isSpacer(x) && x.group === grp);
    const cid = members.find((m) => m.comboId)?.comboId;       // the combination instance (whole-combo select-all)
    const scalable = /\(Type \d+\)/.test(grp) || members.some((x) => x.comboScalable);
    if (!scalable && !cid) return; // not a combination → inference already handles the display, nothing to apply
    const idPatch = cid ? { comboId: cid } : {};
    if (scalable) {
      const first = members[0];
      const fb = first?.baseQty ?? first?.qty ?? 1;
      const cq = fb > 0 ? Math.max(1, Math.round((first?.qty ?? 0) / fb)) : 1; // the group's current ×N
      const base = c.baseQty ?? c.qty;
      arr[idx] = { ...c, group: grp, baseQty: base, qty: base * cq, comboScalable: true, ...idPatch };
    } else {
      arr[idx] = { ...c, group: grp, ...idPatch }; // non-scalable combination — just join it
    }
  };
  const dropOnRow = (targetId: string) => {
    setOverRow(null);
    const dId = dragId;
    setDragId(null);
    if (!dId || dId === targetId) return;
    const arr = [...p.components];
    const from = arr.findIndex((c) => c.id === dId);
    const tgt = arr.find((c) => c.id === targetId);
    if (from < 0 || !tgt) return;
    const crossSection = arr[from].section !== tgt.section;
    // A cross-section move drops combination membership and lands loose at the END of the
    // target section — so it can't be absorbed into a combination it was dropped onto.
    const moved = crossSection
      ? { ...arr[from], section: tgt.section, group: "", comboScalable: false, comboId: undefined }
      : { ...arr[from], section: tgt.section };
    arr.splice(from, 1);
    if (crossSection) {
      let lastIdx = -1;
      for (let i = 0; i < arr.length; i++) if (arr[i].section === tgt.section) lastIdx = i;
      arr.splice(lastIdx + 1, 0, moved);
    } else {
      const tIdx = arr.findIndex((c) => c.id === targetId);
      arr.splice(tIdx, 0, moved);
      applyGroupScaling(arr, tIdx); // only a within-section drop can join a combination
    }
    u({ components: arr });
  };

  // Drop a dragged row onto a section tab/header: move it to the end of that section.
  const dropOnSection = (section: string) => {
    setOverSec(null);
    const dId = dragId;
    setDragId(null);
    if (!dId) return;
    const arr = [...p.components];
    const from = arr.findIndex((c) => c.id === dId);
    if (from < 0) return;
    // A cross-section move drops any combination membership — it becomes a loose row.
    const moved = arr[from].section !== section
      ? { ...arr[from], section, group: "", comboScalable: false, comboId: undefined }
      : { ...arr[from], section };
    arr.splice(from, 1);
    let lastIdx = -1;
    for (let i = 0; i < arr.length; i++) if (arr[i].section === section) lastIdx = i;
    if (lastIdx >= 0) arr.splice(lastIdx + 1, 0, moved);
    else arr.push(moved);
    u({ components: arr });
  };

  const refocusSearch = () => requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  // After an add, keep the view on the row that was just inserted (instead of the list
  // jumping back to the top) — wait a couple frames for the new <tr> to render, then reveal it.
  const revealRow = (id: string) =>
    requestAnimationFrame(() => requestAnimationFrame(() => {
      cardRef.current?.querySelector(`tr[data-cid="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
    }));
  // A 3-pole LSIG breaker senses the neutral OUTSIDE the breaker, so it needs an
  // external neutral current sensor — after adding one, offer to add the matching
  // sensor (frame + rating) to the same section. Returns the sensor to add, or null.
  // Sensor row: priced from the catalogue when the part exists, else a named 0-price
  // line (auto-prices once that part is catalogued under this name).
  const sensorRow = (name: string, sec: string, qty: number, extra?: Partial<PanelComponent>): PanelComponent => {
    const c = findByName(name);
    const row = c ? toPanelComponent(c, sec, qty) : freeComponent(name, sec, qty);
    return extra ? { ...row, ...extra } : row;
  };
  // Confirmed from the modal: add the neutral sensor next to its breaker (into the
  // combination group when the breaker joined one, else at the end of the section).
  const confirmNeutral = () => {
    if (!neutralPrompt) return;
    const { sensor, sec, qty, extra } = neutralPrompt;
    const row = sensorRow(sensor, sec, qty, extra);
    if (extra?.group) {
      const arr = [...p.components];
      let lastIdx = -1;
      arr.forEach((x, i) => { if (x.section === sec && !isSpacer(x) && (effGroup.get(x.id) || "") === extra.group) lastIdx = i; });
      if (lastIdx >= 0) arr.splice(lastIdx + 1, 0, row); else arr.push(row);
      u({ components: arr });
    } else {
      u({ components: [...p.components, row] });
    }
    setNeutralPrompt(null);
  };
  const add = (c: DbComponent, qty = 1) => {
    const base = Math.max(1, qty);
    const t = addTarget;
    if (t) {
      // Drop into an existing combination: same group label, inserted right after the
      // group's last row, and scaled to the group's current ×N if the combination is scalable.
      const scalable = /\(Type \d+\)/.test(t.group) || p.components.some((x) => x.section === t.sec && !isSpacer(x) && (effGroup.get(x.id) || "") === t.group && x.comboScalable);
      const cq = scalable ? comboQtyOf(p.components.filter((x) => x.section === t.sec), t.group) : 1;
      const cid = groupComboId(t.sec, t.group); // join the combination instance → whole-combo select-all covers it
      const nc: PanelComponent = { ...toPanelComponent(c, t.sec, base * cq, t.group), baseQty: base, ...(scalable ? { comboScalable: true } : {}), ...(cid ? { comboId: cid } : {}) };
      const arr = [...p.components];
      let lastIdx = -1;
      arr.forEach((x, i) => { if (x.section === t.sec && !isSpacer(x) && (effGroup.get(x.id) || "") === t.group) lastIdx = i; });
      if (lastIdx < 0) { setAddTarget(null); return; }
      arr.splice(lastIdx + 1, 0, nc);
      u({ components: arr });
      const sensor = externalNeutralCT(c.n);
      if (sensor) setNeutralPrompt({ breaker: c.n, sensor, sec: t.sec, qty: base * cq, extra: { baseQty: base, group: t.group, ...(scalable ? { comboScalable: true } : {}), ...(cid ? { comboId: cid } : {}) } });
      setQ("");
      refocusSearch();
      revealRow(nc.id);
      return;
    }
    const nc = toPanelComponent(c, p.activeSection, base);
    u({ components: [...p.components, nc] });
    const sensor = externalNeutralCT(c.n);
    if (sensor) setNeutralPrompt({ breaker: c.n, sensor, sec: p.activeSection, qty: base });
    setQ("");
    // Return focus to the search box so the next component can be typed without the mouse.
    refocusSearch();
    revealRow(nc.id);
  };
  // Bulk paste: one component per line, "<name/reference> <qty>" — tab- or comma-separated,
  // qty as the first or last field (no qty ⇒ 1). Excel two-column paste works directly.
  const parsePasteLine = (line: string): { name: string; qty: number } | null => {
    const t = line.trim();
    if (!t) return null;
    const parts = (t.includes("\t") ? t.split("\t") : t.split(",")).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (/^\d+$/.test(parts[parts.length - 1])) return { name: parts.slice(0, -1).join(" "), qty: parseInt(parts[parts.length - 1], 10) };
      if (/^\d+$/.test(parts[0])) return { name: parts.slice(1).join(" "), qty: parseInt(parts[0], 10) };
    }
    return { name: t, qty: 1 };
  };
  const addPasted = (text: string) => {
    const parsed = text.split(/\r?\n/).map(parsePasteLine).filter((x): x is { name: string; qty: number } => !!x);
    if (!parsed.length) return;
    setPasteMsg("");
    if (parsed.length === 1) { setQ(parsed[0].name); return; } // single → just search it in the dropdown, as before
    // Multiple → best-match each and show a review table (Add / Cancel) before inserting.
    setPastePreview({ rows: parsed.map(({ name, qty }) => ({ name, qty, match: searchComponents(name, 1)[0] ?? null })) });
  };
  const setPreviewQty = (i: number, v: string) => setPastePreview((pv) => pv && { rows: pv.rows.map((r, j) => (j === i ? { ...r, qty: Math.max(1, parseInt(v.replace(/[^\d]/g, ""), 10) || 1) } : r)) });
  const dropPreviewRow = (i: number) => setPastePreview((pv) => { const rows = (pv?.rows ?? []).filter((_, j) => j !== i); return rows.length ? { rows } : null; });
  const confirmPaste = () => {
    const rows = pastePreview?.rows ?? [];
    const matched = rows.filter((r) => r.match);
    const missing = rows.length - matched.length;
    const t = addTarget;
    if (t) {
      // Into a targeted combination — apply its ×N and group, inserted after the group's last row.
      const scalable = /\(Type \d+\)/.test(t.group) || p.components.some((x) => x.section === t.sec && !isSpacer(x) && (effGroup.get(x.id) || "") === t.group && x.comboScalable);
      const cq = scalable ? comboQtyOf(p.components.filter((x) => x.section === t.sec), t.group) : 1;
      const cid = groupComboId(t.sec, t.group); // join the combination instance → whole-combo select-all covers them
      const items = matched.map((r) => {
        const base = Math.max(1, r.qty);
        return { ...toPanelComponent(r.match!, t.sec, base * cq, t.group), baseQty: base, ...(scalable ? { comboScalable: true } : {}), ...(cid ? { comboId: cid } : {}) };
      });
      const arr = [...p.components];
      let lastIdx = -1;
      arr.forEach((x, i) => { if (x.section === t.sec && !isSpacer(x) && (effGroup.get(x.id) || "") === t.group) lastIdx = i; });
      if (lastIdx >= 0) arr.splice(lastIdx + 1, 0, ...items); else arr.push(...items);
      u({ components: arr });
      setPastePreview(null);
      setPasteMsg(`Added ${items.length} component${items.length === 1 ? "" : "s"} to combination “${t.group}”${missing ? ` · ${missing} skipped (not found)` : ""}`);
      refocusSearch();
      return;
    }
    const added = matched.map((r) => toPanelComponent(r.match!, p.activeSection, Math.max(1, r.qty)));
    if (added.length) u({ components: [...p.components, ...added] });
    setPastePreview(null);
    setPasteMsg(`Added ${added.length} component${added.length === 1 ? "" : "s"} to “${p.activeSection}”${missing ? ` · ${missing} skipped (not found)` : ""}`);
    refocusSearch();
  };
  // Shift+Enter in the search box drops a blank spacer row at the end of the active
  // section (Word-style separator) — same append behaviour as adding a component.
  const addSpacer = () => {
    u({ components: [...p.components, spacerComponent(p.activeSection)] });
    setQ("");
    requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div ref={cardRef} className="card relative p-5">
      {dialogs}
      <div className="-mx-5 -mt-5 mb-0 flex flex-wrap items-center justify-between gap-3 rounded-t-xl2 bg-brand-tint px-5 pb-3 pt-5">
        <h2 className="sec-head !mb-0">{isEdmsPanel ? "Standard Panels" : "Components"}</h2>
        <button type="button" onClick={() => setReplaceOpen(true)}
          title="Find a component used in this quotation and replace it across all / selected panels"
          className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-white px-3 py-1 text-[11px] font-bold text-brand-dark transition hover:border-brand hover:bg-brand-light">
          ⇄ Replace component
        </button>
      </div>
      {replaceOpen && <ReplaceComponentModal s={s} replaceComponent={replaceComponent} factors={s.factors} onClose={() => setReplaceOpen(false)} />}
      {neutralPrompt && <NeutralPromptModal breaker={neutralPrompt.breaker} sensor={neutralPrompt.sensor} onAdd={confirmNeutral} onClose={() => setNeutralPrompt(null)} />}

      {/* Standard EDMS only. The picker sits ABOVE the component body — the sections,
          search and editable list stay put, so a built panel can be adjusted straight away.
          Full-bleed tint so it joins the title row above and the tabs band below into one
          continuous orange header rather than a white gap between them. */}
      {isEdmsPanel && (
        <div className="-mx-5 bg-brand-tint px-5 py-3">
          <div className="mb-3 inline-flex rounded-lg border border-line bg-white p-0.5">
            {([["panel", "Standard Panel"], ["ats", "Standard ATS"]] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => setEdmsMode(m)}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                  edmsMode === m ? "bg-brand text-white" : "text-muted hover:text-brand"
                }`}>
                {label}
              </button>
            ))}
          </div>
          {edmsMode === "panel"
            ? <StandardPanelsView p={p} u={u} panels={s.panels} />
            : <StandardAtsView p={p} u={u} panels={s.panels} />}
        </div>
      )}

      {/* Sticky header: section tabs + search bar stay pinned below the tab bar while
          the component list scrolls; unpins automatically when this card ends. */}
      <div className="sticky top-16 z-20 -mx-5 mb-3 border-b border-line/60 bg-brand-tint px-5 pb-3 pt-1 lg:top-0">
      {/* sections */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {p.sections.map((sec) => {
          if (editingSec === sec) {
            return (
              <input key={sec} autoFocus className="input h-8 w-36 text-xs" value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { renameSection(sec, editVal); setEditingSec(null); }
                  else if (e.key === "Escape") setEditingSec(null);
                }}
                onBlur={() => { renameSection(sec, editVal); setEditingSec(null); }} />
            );
          }
          const active = p.activeSection === sec && comboKind !== "pfc"; // + P.F.C makes its own section → deselect sections while it's open
          return (
            <Fragment key={sec}>
            <span
              onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overSec !== sec) setOverSec(sec); } }}
              onDragLeave={() => setOverSec((x) => (x === sec ? null : x))}
              onDrop={(e) => { e.preventDefault(); dropOnSection(sec); }}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                overSec === sec ? "border-brand bg-brand-light text-brand ring-2 ring-brand/50"
                : active ? "border-brand bg-brand-light text-brand" : "border-line bg-white text-muted hover:border-brand/40"
              }`}>
              <button type="button" data-section={sec} onClick={() => { u({ activeSection: sec }); if (comboKind === "pfc") setComboKind(null); setAddTarget(null); }}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const idx = p.sections.indexOf(sec);
                  const next = p.sections[idx + (e.key === "ArrowRight" ? 1 : -1)];
                  if (!next) return;
                  u({ activeSection: next });
                  requestAnimationFrame(() => (document.querySelector(`button[data-section="${CSS.escape(next)}"]`) as HTMLElement | null)?.focus());
                }}
                title={dragId ? `Move component to “${sec}”` : sec}
                className="max-w-[160px] truncate text-left align-middle">{sec}</button>
              {!isFixed(sec) && (
                <span className="ml-1 inline-flex items-center gap-0.5 border-l border-line/70 pl-1">
                  <button type="button" title="Duplicate section with its components" onClick={() => duplicateSection(sec)}
                    className="grid h-5 w-5 place-items-center rounded text-xs leading-none text-ink/70 hover:bg-brand-light hover:text-brand-dark">⧉</button>
                  <button type="button" title="Rename section" onClick={() => { setEditVal(sec); setEditingSec(sec); }}
                    className="grid h-5 w-5 place-items-center rounded text-xs leading-none text-ink/70 hover:bg-brand-light hover:text-brand-dark">✎</button>
                  <button type="button" title="Remove section" onClick={() => removeSection(sec)}
                    className="grid h-5 w-5 place-items-center rounded text-xs leading-none text-red-500 hover:bg-red-100 hover:text-red-600">✕</button>
                </span>
              )}
            </span>
            {sec === "Outgoings" && (
              <button type="button" title="Add a P.F.C combination — its own section beside Outgoings"
                onClick={() => { setComboKind(comboKind === "pfc" ? null : "pfc"); setPfcTab("known"); setPreview([]); setTag(""); setAddTarget(null); }}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  comboKind === "pfc" ? "border-brand bg-brand-light text-brand" : "border-line bg-white text-muted hover:border-brand/40"
                }`}>
                + P.F.C
              </button>
            )}
            </Fragment>
          );
        })}
        <input className="input h-8 w-36 rounded-full text-xs" placeholder="New section…" value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newSection.trim()) {
              u({ sections: [...p.sections, newSection.trim()], activeSection: newSection.trim() });
              setNewSection("");
            }
          }} />
      </div>

      {/* Row 2 — circuit combinations (smaller, secondary). Each is inserted as a GROUP inside the active section. */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-wide text-brand">Combinations</span>
        {/* Standard EDMS uses the dedicated "Standard ATS" builder above, so the generic
            ATS combination is hidden there (it stays for normal, non-EDMS panels). */}
        {COMBOS.filter(([k]) => !(isEdmsPanel && k === "ats")).map(([k, label]) => (
          <button key={k} type="button" title={`Add a ${label} combination as a group inside “${p.activeSection}”`}
            onClick={() => { setComboKind(comboKind === k ? null : k); setPreview([]); setTag(""); setAddTarget(null); }}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              comboKind === k ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-surface text-muted hover:border-brand/40 hover:text-brand-dark"
            }`}>
            + {label}
          </button>
        ))}
        {comboClipboard && (
          <button type="button" onClick={pasteCombo}
            title={`Paste the copied “${comboClipboard.label}” into “${p.activeSection}”`}
            className="ml-1 rounded-full border border-brand/60 bg-brand-light px-2.5 py-1 text-[11px] font-bold text-brand-dark transition hover:bg-brand-tint">
            📋 Paste combination
          </button>
        )}
      </div>

      {/* search */}
      <div ref={searchWrapRef} className="relative">
        <input ref={searchRef} className="input" placeholder={addTarget ? `Search components → drop into combination “${addTarget.group}”` : `Search components (name / reference / type / rating) → adds to “${p.activeSection}”`}
          value={q} onChange={(e) => { setQ(e.target.value); if (pasteMsg) setPasteMsg(""); }}
          onPaste={(e) => { const text = e.clipboardData.getData("text"); if (/[\r\n\t]/.test(text)) { e.preventDefault(); addPasted(text); } }}
          onKeyDown={(e) => {
            if (pastePreview) { // paste review open → Enter adds the matched rows, Esc cancels
              if (e.key === "Enter") { e.preventDefault(); if (pastePreview.rows.some((r) => r.match)) confirmPaste(); }
              else if (e.key === "Escape") setPastePreview(null);
              return;
            }
            if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); if (!pending) addSpacer(); return; } // ⇧Enter → spacer row
            if (pending || !q) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); const c = hits[activeIdx]; if (c) { setPending(c); setPendQty(""); } }
            else if (e.key === "Escape") setQ("");
          }} />
        {q && !pending && (
          <div ref={listRef} className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white shadow-lift">
            {hits.length === 0 && <div className="px-3 py-2 text-xs text-muted">No matches</div>}
            {hits.map((c, i) => (
              <button key={c.ref + c.n} type="button"
                className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${i === activeIdx ? "bg-brand-light" : "hover:bg-brand-tint"}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={() => { setPending(c); setPendQty(""); }}>
                <b className="w-24 shrink-0 whitespace-nowrap text-left text-brand-dark">EGP {fmtEgp(componentPriceEgp(c, s.factors))}</b>
                <span className="min-w-0 flex-1 truncate">
                  <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{c.t}</span>
                  {c.n}
                  <span className="ml-1 text-[11px] text-muted">{c.ref} · {c.brand}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {/* qty popup — opened when a search result is picked */}
        {pending && (
          <div className="absolute z-30 mt-1 w-full rounded-lg border border-brand/50 bg-white p-3 shadow-lift">
            <p className="mb-2 text-xs">
              <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{pending.t}</span>
              <span className="font-bold text-ink">{pending.n}</span>
              <span className="ml-1 text-[11px] text-muted">{pending.ref} · {pending.brand} → {addTarget ? `combination “${addTarget.group}”` : `“${p.activeSection}”`}</span>
            </p>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted">Qty</label>
              <input ref={qtyRef} inputMode="numeric" className="input h-9 w-24" placeholder="1" value={pendQty}
                onChange={(e) => setPendQty(e.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") { add(pending, parseInt(pendQty, 10) || 1); setPending(null); } if (e.key === "Escape") setPending(null); }} />
              <button type="button" className="btn-primary h-9 px-4 text-sm" onClick={() => { add(pending, parseInt(pendQty, 10) || 1); setPending(null); }}>Add</button>
              <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
        {/* paste-many review — shows the best catalogue match for every pasted line before anything is added */}
        {pastePreview && (() => {
          const matched = pastePreview.rows.filter((r) => r.match).length;
          const missing = pastePreview.rows.length - matched;
          return (
            <div className="absolute z-40 mt-1 w-full rounded-lg border border-brand/50 bg-white p-3 shadow-lift"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matched > 0) confirmPaste(); } else if (e.key === "Escape") setPastePreview(null); }}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-ink">Review {pastePreview.rows.length} pasted components → {addTarget ? `combination “${addTarget.group}”` : `“${p.activeSection}”`}</p>
                <button type="button" onClick={() => setPastePreview(null)} title="Discard" className="px-1 text-muted hover:text-ink">✕</button>
              </div>
              <div className="max-h-60 overflow-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                      <th className="py-1 pr-2 font-semibold">Pasted</th>
                      <th className="py-1 pr-2 font-semibold">Matched component</th>
                      <th className="py-1 pr-2 text-right font-semibold">Qty</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {pastePreview.rows.map((r, i) => (
                      <tr key={i} className={`border-t border-line/60 ${r.match ? "" : "bg-red-50"}`}>
                        <td className="py-1 pr-2 align-top text-muted">{r.name}</td>
                        <td className="py-1 pr-2 align-top">
                          {r.match
                            ? <><span className="font-semibold text-ink">{r.match.n}</span> <span className="text-[11px] text-muted">{r.match.ref} · {r.match.brand}</span></>
                            : <span className="font-bold text-red-500">⚠ not found</span>}
                        </td>
                        <td className="py-1 pr-2 text-right align-top">
                          <input inputMode="numeric" value={r.qty} disabled={!r.match} onChange={(e) => setPreviewQty(i, e.target.value)}
                            className="w-14 rounded border border-line px-1.5 py-0.5 text-right disabled:bg-surface disabled:text-muted" />
                        </td>
                        <td className="py-1 text-right align-top">
                          <button type="button" onClick={() => dropPreviewRow(i)} title="Remove line" className="px-1 text-ink/40 hover:text-red-500">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missing > 0 && (
                <p className="mt-2 text-[11px] font-semibold text-red-500">⚠ {missing} not found — {matched > 0 ? "they’ll be skipped." : "nothing to add."}</p>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setPastePreview(null)} className="btn-ghost h-8 px-3 text-xs">Cancel</button>
                <button type="button" disabled={matched === 0} onClick={confirmPaste} className="btn-primary h-8 px-4 text-xs disabled:opacity-40">
                  Add {matched} component{matched === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          );
        })()}
      </div>
      {pasteMsg && <p className="mt-1.5 text-[11px] font-semibold text-brand-dark">{pasteMsg}</p>}
      {addTarget && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-light px-2 py-0.5 font-semibold text-brand-dark">
            ⊞ Adding into “{addTarget.group}”
            <button type="button" onClick={() => setAddTarget(null)} title="Stop adding to this combination"
              className="ml-0.5 rounded-full px-1 leading-none hover:bg-white">✕</button>
          </span>
          <span className="text-muted">each component you pick drops into this combination — click ✕ or another section to stop</span>
        </div>
      )}
      {/* Inline circuit-combination builder — pinned inside the sticky sub-header while open,
          so it stays visible until you generate or close it */}
      {comboKind && comboKind !== "pfc" && (
        <div className="mb-3 rounded-lg border border-brand/40 bg-brand-tint/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-brand-dark">
              {comboKind === "custom" ? "New Combination" : `${COMBOS.find(([k]) => k === comboKind)?.[1] ?? "Combination"} combination`}
              <span className="text-[11px] font-normal text-muted">{` — added as a group inside “${p.activeSection}”`}</span>
            </h3>
            <button type="button" onClick={() => { setComboKind(null); setPreview([]); setTag(""); }}
              className="text-xs font-semibold text-muted hover:text-red-600">✕ close</button>
          </div>
          {comboKind === "ats" && <AtsBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "sync" && <SyncBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "photocell" && <PhotocellBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "mcc" && <MccBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "wd" && <WdBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "motorized" && <MotorizedBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "lamps" && <LampsBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "pushbtn" && <PushButtonsBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "fire" && <FireBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {comboKind === "custom" && <CustomBuilder factors={s.factors} onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
          {preview.length > 0 && (
            <div className="mt-3 rounded-lg border border-line bg-white p-3">
              <div className="mb-1.5 text-xs font-bold text-ink">Preview — {preview.length} items{tag ? ` (${tag})` : ""}</div>
              <div className="max-h-52 overflow-auto">
                {preview.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3 border-t border-line/60 py-0.5 text-xs first:border-0">
                    <span>
                      {l.groupLabel && <span className="mr-1 rounded bg-surface px-1 text-[9px] font-bold text-muted">{l.groupLabel}</span>}
                      {l.desc}
                      {!l.comp && <span className="ml-1 text-amber-600" title="Not matched in component DB — added without price">⚠ no price</span>}
                    </span>
                    <span className="shrink-0 font-semibold">×{l.qty}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-primary mt-2" onClick={commitCombo}>{`Add to “${p.activeSection}” (${preview.length} items)`}</button>
            </div>
          )}
        </div>
      )}
      {/* P.F.C window — a modal with two tabs: enter a known/existing bank, or run the PF-correction calculator */}
      {comboKind === "pfc" && createPortal(
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 no-print"
          onKeyDown={(e) => { if (e.key === "Escape") { setComboKind(null); setPreview([]); setTag(""); } }}>
          <div className="fixed inset-0 bg-ink/50 animate-fade-in" onClick={() => { setComboKind(null); setPreview([]); setTag(""); }} />
          <div role="dialog" aria-modal="true" aria-label="P.F.C — Power Factor Correction"
            className="relative my-3 flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop">
            <div className="flex items-center justify-between gap-3 border-b border-line px-6 pt-4">
              <div className="pb-1">
                <h2 className="text-lg font-extrabold tracking-tight text-ink">P.F.C — Power Factor Correction</h2>
                <p className="text-xs text-muted">Added as its own P.F.C section beside Outgoings.</p>
                {/* tabs */}
                <div className="mt-3 flex gap-1">
                  {([["known", "Existing / known P.F.C"], ["calc", "P.F.C calculation"]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setPfcTab(k)}
                      className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-bold transition ${pfcTab === k ? "border-line bg-white text-brand-dark" : "border-transparent bg-transparent text-muted hover:text-brand-dark"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button className="self-start rounded-full px-2 text-2xl leading-none text-muted hover:text-ink"
                onClick={() => { setComboKind(null); setPreview([]); setTag(""); }} aria-label="Close">×</button>
            </div>

            <div className="overflow-auto px-6 py-4">
              {/* both tabs stay mounted so their state persists and the calc feeds the builder live */}
              <div className={pfcTab === "known" ? "" : "hidden"}>
                <p className="mb-3 text-[13px] text-muted">Enter a known / existing P.F.C bank — main breaker plus fixed &amp; variable steps — to add it directly to the quotation.</p>
                <PfcBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} syncKvar={pfcCalcKvar} />
                {preview.length > 0 && (
                  <div className="mt-3 rounded-lg border border-line bg-white p-3">
                    <div className="mb-1.5 text-xs font-bold text-ink">Preview — {preview.length} items{tag ? ` (${tag})` : ""}</div>
                    <div className="max-h-52 overflow-auto">
                      {preview.map((l, i) => (
                        <div key={i} className="flex justify-between gap-3 border-t border-line/60 py-0.5 text-xs first:border-0">
                          <span>
                            {l.groupLabel && <span className="mr-1 rounded bg-surface px-1 text-[9px] font-bold text-muted">{l.groupLabel}</span>}
                            {l.desc}
                            {!l.comp && <span className="ml-1 text-amber-600" title="Not matched in component DB — added without price">⚠ no price</span>}
                          </span>
                          <span className="shrink-0 font-semibold">×{l.qty}</span>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="btn-primary mt-2" onClick={commitCombo}>Add as P.F.C section ({preview.length} items)</button>
                  </div>
                )}
              </div>
              <div className={pfcTab === "calc" ? "" : "hidden"}>
                <PfcCalculator onResult={setPfcCalcKvar} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Single column header — shared by every section, pinned with this sticky block. */}
      {p.components.some((c) => !isSpacer(c)) && (
      <div className="mt-2 -mb-3 overflow-x-auto overflow-y-hidden">
        <table className="w-full table-fixed text-[13px]">
          <colgroup>
            <col style={{ width: 24 }} />
            <col />
            <col style={{ width: 132 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-brand">
              <th className="py-1"></th>
              <th className="py-1 pr-2">Description</th>
              <th className="py-1 pr-2">Ref</th>
              <th className="py-1 pr-2">Qty</th>
              <th className="py-1 pr-2">Adj.</th>
              <th className="py-1 pr-2">Note</th>
              <th className="py-1 pr-2 text-right">Unit cost</th>
              <th className="py-1 pr-2 text-right">Total</th>
              <th className="py-1 pr-1 text-right">
                {(() => {
                  // Select / clear ALL components across every section.
                  const ids = p.components.filter((c) => !isSpacer(c)).map((c) => c.id);
                  const sel = ids.filter((id) => selected.has(id)).length;
                  return (
                    <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-brand align-middle"
                      checked={ids.length > 0 && sel === ids.length}
                      ref={(el) => { if (el) el.indeterminate = sel > 0 && sel < ids.length; }}
                      onChange={(e) => setSelected(e.target.checked ? new Set(ids) : new Set())}
                      title="Select / clear all components" />
                  );
                })()}
              </th>
            </tr>
          </thead>
        </table>
      </div>
      )}
      </div>{/* /sticky header */}

      {/* table grouped by section */}
      {p.components.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
          No components — search above, or add a circuit combination from the row above.
        </p>
      ) : (
        p.sections.filter((sec) => p.components.some((c) => c.section === sec)).map((sec, si, arr) => (
          <div key={sec} className="mb-3">
            <div
              onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overSec !== sec) setOverSec(sec); } }}
              onDragLeave={() => setOverSec((x) => (x === sec ? null : x))}
              onDrop={(e) => { e.preventDefault(); dropOnSection(sec); }}
              className={`mb-1.5 flex items-center justify-between rounded-md border bg-brand-light py-1.5 pl-6 pr-2 text-[13px] font-bold capitalize tracking-wide text-brand-dark transition ${overSec === sec ? "border-brand ring-2 ring-brand/50" : "border-brand/20"}`}
            >
              <span>{sec}</span>
              <span className="flex items-center gap-0.5">
                {(() => {
                  // Select / clear every component in this section.
                  const ids = p.components.filter((c) => c.section === sec && !isSpacer(c)).map((c) => c.id);
                  const sel = ids.filter((id) => selected.has(id)).length;
                  return (
                    <input type="checkbox" className="mr-1 h-3.5 w-3.5 cursor-pointer accent-brand align-middle"
                      checked={ids.length > 0 && sel === ids.length}
                      ref={(el) => { if (el) el.indeterminate = sel > 0 && sel < ids.length; }}
                      onChange={(e) => setSectionSel(sec, e.target.checked)}
                      title="Select / clear all in this section" />
                  );
                })()}
                <button type="button" title="Move section up" disabled={si === 0}
                  onClick={() => moveSection(sec, -1)}
                  className="rounded px-1 text-sm leading-none text-brand-dark/60 hover:bg-white hover:text-brand-dark disabled:opacity-25">↑</button>
                <button type="button" title="Move section down" disabled={si === arr.length - 1}
                  onClick={() => moveSection(sec, 1)}
                  className="rounded px-1 text-sm leading-none text-brand-dark/60 hover:bg-white hover:text-brand-dark disabled:opacity-25">↓</button>
              </span>
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <table className="w-full table-fixed text-[13px]">
                {/* Shared column widths so every per-section table lines up (RPT-1) */}
                <colgroup>
                  <col style={{ width: 24 }} />
                  <col />
                  <col style={{ width: 132 }} />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 96 }} />
                </colgroup>
                <tbody>
                  {(() => {
                    const secComps = p.components.filter((c) => c.section === sec);
                    const renderRow = (c: PanelComponent) => isSpacer(c) ? (
                    <tr key={c.id}
                      onDragOver={(e) => { if (dragId && dragId !== c.id) { e.preventDefault(); if (overRow !== c.id) setOverRow(c.id); } }}
                      onDragLeave={() => setOverRow((r) => (r === c.id ? null : r))}
                      onDrop={(e) => { e.preventDefault(); dropOnRow(c.id); }}
                      className={`border-t align-middle transition-colors ${
                        overRow === c.id ? "border-brand bg-brand-tint" : "border-line/70"
                      } ${dragId === c.id ? "opacity-40" : ""}`}>
                      <td
                        draggable
                        onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", c.id); } catch {} }}
                        onDragEnd={() => { setDragId(null); setOverRow(null); setOverSec(null); }}
                        title="Drag to reorder or move to another section"
                        className="cursor-grab select-none py-1 pl-1 pr-1 text-muted/50 hover:text-brand active:cursor-grabbing">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
                          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
                          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
                        </svg>
                      </td>
                      <td colSpan={7} className="py-0.5">
                        <div className="h-3 rounded bg-line/25" />
                      </td>
                      <td className="whitespace-nowrap py-0.5 text-right">
                        <button className="px-1 text-red-500" title="Remove empty row" onClick={() => delComp(c.id)}>✕</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id} data-selrow="" data-cid={c.id}
                      onMouseDown={(e) => { const t = e.target as HTMLElement; if (t.closest("[data-grip]")) return; onRowDown(c.id, !!t.closest("[data-rowcheck]"), e.shiftKey); }}
                      onMouseEnter={() => onRowEnter(c.id)}
                      onDragOver={(e) => { if (dragId && dragId !== c.id) { e.preventDefault(); if (overRow !== c.id) setOverRow(c.id); } }}
                      onDragLeave={() => setOverRow((r) => (r === c.id ? null : r))}
                      onDrop={(e) => { e.preventDefault(); dropOnRow(c.id); }}
                      className={`border-t align-middle transition-colors ${
                        selected.has(c.id) ? "bg-[#FFF0E8]" : overRow === c.id ? "border-brand bg-brand-tint" : "border-line/70"
                      } ${dragId === c.id ? "opacity-40" : ""}`}>
                      <td
                        data-grip
                        draggable
                        onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", c.id); } catch {} }}
                        onDragEnd={() => { setDragId(null); setOverRow(null); setOverSec(null); }}
                        title="Drag to reorder or move to another section"
                        className={`cursor-grab select-none py-1 pl-1 pr-1 text-muted/50 hover:text-brand active:cursor-grabbing ${selected.has(c.id) ? "border-l-[3px] border-[#F16722]" : "border-l-[3px] border-transparent"}`}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
                          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
                          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
                        </svg>
                      </td>
                      <td className="max-w-[330px] py-1 pr-2">
                        {c.name}
                        {editComp === c.id && (
                          <ComponentEditSelect current={c} panelCount={s.panels.length}
                            onPick={(nc, scope) => {
                              if (scope === "all") replaceComponent(c.ref, c.name, nc, new Set(s.panels.map((pp) => pp.id)));
                              else if (scope === "panel") replaceComponent(c.ref, c.name, nc, new Set([p.id]));
                              else replaceComp(c.id, nc); // this item only
                              setEditComp(null);
                            }}
                            onClose={() => setEditComp(null)} />
                        )}
                      </td>
                      <td className="py-1 pr-2 text-[11px] text-muted">{c.ref}</td>
                      <td className="py-1 pr-2"
                        onMouseEnter={(e) => { if (selected.has(c.id)) setHoverSum({ col: "qty", x: e.clientX, y: e.clientY }); }}
                        onMouseLeave={() => setHoverSum(null)}>
                        {c.baseQty != null ? (
                          // Combo item: the Qty column is the PER-UNIT qty (1 per unit); the group's
                          // combination qty (×N) multiplies the total, not this number.
                          <input className="input h-7 px-1.5 text-center text-xs" type="number" min={0} value={c.baseQty || ""}
                            data-qtyinput onKeyDown={qtyEnterNav}
                            title="Per-unit qty — the combination qty (×N) multiplies the total"
                            onChange={(e) => {
                              const per = Math.max(0, parseFloat(e.target.value) || 0);
                              const n = comboQtyOf(secComps, effGroup.get(c.id) || "");
                              setComp(c.id, { baseQty: per, qty: per * n });
                            }} />
                        ) : (
                          <input className="input h-7 px-1.5 text-center text-xs" type="number" min={0} value={c.qty || ""}
                            data-qtyinput onKeyDown={qtyEnterNav}
                            onChange={(e) => setComp(c.id, { qty: Math.max(0, parseFloat(e.target.value) || 0) })} />
                        )}
                      </td>
                      <td className="py-1 pr-2"><input className="input h-7 px-1.5 text-xs" value={c.adj} placeholder="—"
                        onChange={(e) => setComp(c.id, { adj: e.target.value })} /></td>
                      <td className="py-1 pr-2"><input className="input h-7 px-1.5 text-xs" value={c.note} placeholder="—"
                        onChange={(e) => setComp(c.id, { note: e.target.value })} /></td>
                      <td className="py-1 pr-2 text-right text-muted"
                        onMouseEnter={(e) => { if (selected.has(c.id)) setHoverSum({ col: "unit", x: e.clientX, y: e.clientY }); }}
                        onMouseLeave={() => setHoverSum(null)}>{fmtEgp(itemPriceEgp(c, s))}</td>
                      <td className="py-1 pr-2 text-right font-semibold"
                        onMouseEnter={(e) => { if (selected.has(c.id)) setHoverSum({ col: "total", x: e.clientX, y: e.clientY }); }}
                        onMouseLeave={() => setHoverSum(null)}>{fmtEgp(itemPriceEgp(c, s) * c.qty)}</td>
                      <td className="whitespace-nowrap py-1 pr-1 text-right">
                        <input type="checkbox" data-rowcheck className="mr-1.5 h-3.5 w-3.5 cursor-pointer accent-brand align-middle" checked={selected.has(c.id)} readOnly
                          onClick={(e) => e.preventDefault()}
                          title="Click to toggle · drag anywhere on the row to select a range · Shift-click for a range" />
                        <button className="px-1 text-muted hover:text-brand-dark" title="Change component" onClick={() => setEditComp(c.id)}>✎</button>
                        <button className="px-1 text-red-500" title="Remove" onClick={() => delComp(c.id)}>✕</button>
                      </td>
                    </tr>
                    );
                    const rows: JSX.Element[] = [];
                    let curGroup = " ";
                    if (secComps.length) rows.push(insertZone(sec, null, `ins-top-${sec}`));
                    secComps.forEach((c) => {
                      const g = effGroup.get(c.id) || "";
                      if (g !== curGroup) {
                        curGroup = g;
                        if (g) {
                          // Single source of truth for the multiplier: qty ÷ baseQty.
                          // The header ×N badge and the "Combination qty" field both read it.
                          const cq = comboQtyOf(secComps, g);
                          // Combination-qty (×N) control: MCC groups (by name) + custom combinations (flagged).
                          const scalable = /\(Type \d+\)/.test(g) ||
                            !!secComps.find((x) => !isSpacer(x) && (effGroup.get(x.id) || "") === g)?.comboScalable;
                          // A group's tick selects THAT group, nothing else.
                          //
                          // It used to select every row sharing the group's comboId, so that one tick
                          // took a combination spanning several groups (Sync → Source 1 / Source 2 /
                          // Bus Coupler). But comboId is also shared by groups that are independent in
                          // every way that matters — duplicate a combination a few times and G1…G4 all
                          // carry one id — and then ticking G4 selected the whole section. Selecting a
                          // group has to mean the group; comboId is not a reliable stand-in for "one
                          // combination", and it drives nothing else (not price, not qty).
                          const selIds = secComps.filter((c) => !isSpacer(c) && (effGroup.get(c.id) || "") === g).map((c) => c.id);
                          const selOn = selIds.filter((id) => selected.has(id)).length;
                          rows.push(
                            <tr key={`grp-${sec}-${g}`} className="align-middle">
                              <td className="py-1" />
                              {/* Description column — combination name (+2px vs the rows) */}
                              <td className="py-1 pr-2">
                                {editGroup === `${sec}|${g}` ? (
                                  <input autoFocus value={editGroupVal}
                                    onChange={(e) => setEditGroupVal(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { renameGroup(g, sec, editGroupVal); setEditGroup(null); }
                                      else if (e.key === "Escape") setEditGroup(null);
                                    }}
                                    onBlur={() => { renameGroup(g, sec, editGroupVal); setEditGroup(null); }}
                                    className="h-6 w-full rounded border border-brand px-1.5 text-[13px] uppercase tracking-wide text-brand-dark focus:outline-none" />
                                ) : (
                                  <span className="text-[13px] font-normal leading-tight text-brand-dark underline underline-offset-2">
                                    <span className="uppercase tracking-wide">{g}</span>{scalable ? `, QTY (${cq}) each contain:` : ""}
                                    <button type="button" title="Rename combination"
                                      onClick={() => { setEditGroupVal(g); setEditGroup(`${sec}|${g}`); }}
                                      className="ml-1.5 rounded px-1 leading-none text-brand-dark/50 no-underline hover:bg-white hover:text-brand-dark">✎</button>
                                  </span>
                                )}
                              </td>
                              {/* Reference column — "Combination qty" label (bigger + bold) */}
                              <td className="py-1 pr-2 text-right">
                                {scalable && <span className="whitespace-nowrap text-[13px] font-bold text-muted">Combination qty</span>}
                              </td>
                              {/* Qty column — the combination-qty box, aligned with the row Qty inputs */}
                              <td className="py-1 pr-2">
                                {scalable && (
                                  <input type="number" min={1} value={cq}
                                    onChange={(e) => setComboQty(g, sec, parseInt(e.target.value) || 1)}
                                    className="input h-7 px-1.5 text-center text-xs"
                                    title="Quantity of the whole combination — scales all its items" />
                                )}
                              </td>
                              {/* Adj → Total columns — actions on the left, "Move to" pushed to the right */}
                              <td colSpan={4} className="py-1 pr-1">
                                <div className="flex items-center justify-end gap-1">
                                  <button type="button" title={`Add a component into “${g}”`}
                                    onClick={() => { const armed = addTarget?.sec === sec && addTarget?.group === g; setAddTarget(armed ? null : { sec, group: g }); if (!armed) { u({ activeSection: sec }); refocusSearch(); } }}
                                    className={`rounded px-1.5 py-0.5 text-[11px] font-bold leading-none transition ${addTarget?.sec === sec && addTarget?.group === g ? "bg-brand text-white" : "text-brand-dark/70 hover:bg-white hover:text-brand-dark"}`}>+ Add</button>
                                  <button type="button" title="Move group up (sort within section)" onClick={() => reorderGroup(g, sec, -1)}
                                    className="rounded px-1 text-xs leading-none text-brand-dark/60 hover:bg-white hover:text-brand-dark">↑</button>
                                  <button type="button" title="Move group down (sort within section)" onClick={() => reorderGroup(g, sec, 1)}
                                    className="rounded px-1 text-xs leading-none text-brand-dark/60 hover:bg-white hover:text-brand-dark">↓</button>
                                  <button type="button" title="Duplicate this combination" onClick={() => duplicateGroup(g, sec)}
                                    className="rounded px-1 text-sm leading-none text-brand-dark/60 hover:bg-white hover:text-brand-dark">⧉</button>
                                  <button type="button" title="Copy this combination — paste into any panel" onClick={() => copyGroup(g, sec)}
                                    className="rounded px-1 text-sm leading-none text-brand-dark/60 hover:bg-white hover:text-brand-dark">📋</button>
                                  {p.sections.length > 1 && (
                                    <select value="" onChange={(e) => { if (e.target.value) moveGroupToSection(g, sec, e.target.value); }}
                                      title="Move this group to another section"
                                      className="ml-1 h-6 w-24 cursor-pointer rounded border border-line bg-white px-1 text-[11px] text-muted focus:border-brand focus:outline-none">
                                      <option value="">Move to…</option>
                                      {p.sections.filter((x) => x !== sec).map((x) => <option key={x} value={x}>{x}</option>)}
                                    </select>
                                  )}
                                </div>
                              </td>
                              {/* Last column — select / clear every row in THIS group. Shown in every section. */}
                              <td className="py-1 pr-1 text-right">
                                {selIds.length > 0 && (
                                  <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-brand align-middle"
                                    checked={selOn === selIds.length}
                                    ref={(el) => { if (el) el.indeterminate = selOn > 0 && selOn < selIds.length; }}
                                    onChange={(e) => setIdsSel(selIds, e.target.checked)}
                                    title="Select / clear all in this group" />
                                )}
                              </td>
                            </tr>
                          );
                        }
                      }
                      rows.push(renderRow(c));
                      rows.push(insertZone(sec, c.id, `ins-${c.id}`));
                    });
                    return rows;
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {/* Selection action bar — starts anchored below the selection; drag the grip to move it anywhere.
          Once dragged it is position:fixed, so it's portaled to <body> to escape this card's
          animate-fade-up ancestor whose lingering transform would otherwise capture `fixed`
          and fling the bar off-screen (same trap the export modal avoids). */}
      {selected.size > 0 && (dragPos != null || barTop != null) && (() => {
        const bar = (
          <div
            className={`no-print z-40 ${dragPos ? "fixed" : "absolute left-1/2 -translate-x-1/2"}`}
            style={dragPos ? { left: dragPos.x, top: dragPos.y } : { top: barTop ?? 0 }}>
            <div data-selbar="" className="flex flex-col gap-1 rounded-2xl border border-line bg-white py-2 pl-3 pr-3 shadow-lift animate-pop">
              <div className="flex items-center gap-2.5">
              <span onMouseDown={startBarDrag} title="Drag to move the bar"
                className="flex shrink-0 cursor-move select-none items-center text-muted/60 hover:text-brand">
                <svg width="11" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" />
                  <circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" />
                  <circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
                </svg>
              </span>
              <button type="button" onClick={isSelCombo ? uncombineSel : combineSel} disabled={!isSelCombo && selected.size < 2}
                title={isSelCombo ? "Ungroup the selected combination" : "Group the selected rows into one combination"}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40">
                <span className="text-base leading-none">{isSelCombo ? "⊟" : "⊞"}</span> {isSelCombo ? "Uncombine" : "Combination"}
              </button>
              <button type="button" onClick={duplicateSel} title="Duplicate selected rows (Ctrl/Cmd+D)"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-surface">
                <span className="text-base leading-none">⧉</span> Duplicate
              </button>
              <div className="relative">
                <button type="button" onClick={() => setMoveOpen((v) => !v)} title="Move selected rows to another section"
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-surface ${moveOpen ? "bg-surface" : ""}`}>
                  <span className="text-base leading-none">↧</span> Move to
                  <svg width="9" height="9" viewBox="0 0 12 12" className="opacity-50" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {moveOpen && (
                  <div className="absolute bottom-full left-1/2 z-50 mb-2 max-h-56 w-52 -translate-x-1/2 overflow-auto rounded-xl border border-line bg-white py-1 shadow-lift">
                    <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">Move to section</p>
                    {p.sections.map((sec) => (
                      <button key={sec} type="button" onClick={() => moveSelTo(sec)}
                        className="block w-full truncate px-3 py-1.5 text-left text-sm text-ink hover:bg-brand-tint">{sec}</button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={deleteSel} title="Delete selected rows (Del)"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50">
                <span className="text-base leading-none">✕</span> Delete
              </button>
              <span className="h-6 w-px bg-line" />
              <button type="button" onClick={clearSel} title="Close (Esc)" aria-label="Close — clear selection"
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none text-muted transition hover:bg-surface hover:text-ink">✕</button>
              </div>
              <div className="flex items-baseline justify-center gap-2 leading-none">
                <span className="text-xs font-semibold text-muted">{selected.size} selected</span>
                <span className="text-[16px] font-bold text-brand-dark">Total {fmtEgp(selectedTotal)}</span>
              </div>
            </div>
          </div>
        );
        return dragPos ? createPortal(bar, document.body) : bar;
      })()}
      {/* Column-aware running sum — floats by the cursor over the Qty / Unit cost / Total cells of
          selected rows. Portaled to <body> for the same reason as the action bar: it's fixed and
          would otherwise be captured by the animate-fade-up wrapper's transform. */}
      {hoverSum && selected.size > 0 && createPortal(
        <div className="no-print pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2.5 py-1 text-[11px] font-semibold text-white shadow-lift"
          style={{ left: hoverSum.x, top: hoverSum.y - 10 }}>
          <span className="text-white/60">{hoverSum.col === "qty" ? "Σ Qty" : hoverSum.col === "unit" ? "Σ Unit cost" : "Σ Total"}</span>{" "}
          {fmtEgp(colSum(hoverSum.col))}
        </div>, document.body
      )}
    </div>
  );
}

// RPT: re-select a component from the database. Shows the full list in database
// order with the current component highlighted in its original position (scrolls
// to it on open), plus a search box. Picking one updates technical + pricing data.
function ComponentEditSelect({ current, panelCount, onPick, onClose }: {
  current: PanelComponent; panelCount: number; onPick: (c: DbComponent, scope: "item" | "panel" | "all") => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"item" | "panel" | "all">("item"); // replace this item / all identical in this panel / all panels
  const [active, setActive] = useState(0); // keyboard-highlighted row index into `shown`
  const activeRef = useRef<HTMLButtonElement>(null);
  const isCurrent = (c: DbComponent) => c.ref === current.ref && c.n === current.name;
  const shown = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return COMPONENTS; // full list, in database order
    return COMPONENTS.filter((c) => {
      const hay = `${c.n} ${c.ref} ${c.t} ${c.r} ${c.brand}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [q]);
  // Start the cursor on the current component (unfiltered) or the top match (filtered).
  useEffect(() => {
    if (!q) { const i = shown.findIndex(isCurrent); setActive(i >= 0 ? i : 0); }
    else setActive(0);
  }, [q]);
  // Keep the highlighted row scrolled into view (also scrolls to the current one on open).
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [active, shown]);
  // ↑/↓ move the highlight, Enter picks it — driven from the always-focused search box.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = shown[active]; if (c) onPick(c, scope); }
  };
  // Portal to <body>: rendered inline in a table row, this fixed overlay would otherwise be
  // captured by the panels tab's animate-fade-up transform — placing it near the top of the tall
  // wrapper instead of the viewport, so autoFocus would scroll the whole page up to the row.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 p-4 pt-20"
      onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl2 border border-line bg-white shadow-lift"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-line p-3">
          <p className="mb-1.5 text-xs font-bold text-ink">Change component <span className="font-normal text-muted">— current: {current.name}</span><span className="ml-1 font-normal text-muted/80">· ↑↓ to move · Enter to pick</span></p>
          <input autoFocus className="input h-9 text-sm" placeholder="Search name / reference / type / rating…"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-muted">Replace:</span>
            {([["item", "This item"], ["panel", "All identical · this panel"], ["all", `All identical · all panels (${panelCount})`]] as const).map(([k, label]) => (
              <button key={k} type="button" onMouseDown={(e) => { e.preventDefault(); setScope(k); }}
                className={`rounded-full border px-2 py-0.5 font-bold transition ${scope === k ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted hover:border-brand/40"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[55vh] overflow-auto">
          {shown.length === 0 && <div className="px-3 py-3 text-xs text-muted">No matches.</div>}
          {shown.map((c, i) => {
            const cur = isCurrent(c), act = i === active;
            return (
              <button key={c.ref + c.n} ref={act ? activeRef : undefined} type="button"
                onMouseDown={() => onPick(c, scope)} onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${act ? "bg-brand-tint" : cur ? "bg-brand-light" : ""} ${cur ? "font-bold text-brand-dark" : ""}`}
                style={act ? { boxShadow: "inset 2px 0 0 #F16722" } : undefined}>
                <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{c.t}</span>
                <span className="min-w-0 flex-1 truncate">{c.n}</span>
                <span className="shrink-0 text-[11px] text-muted">{c.ref} · {c.brand}{cur ? " · current" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>, document.body
  );
}

// ── Replace component across panels (the "⇄ Replace component" tool) ──
// Pick a catalogue part used somewhere in the QTN and swap every instance of it (matched
// by reference + name) for another catalogue part, across all or selected panels. Each
// instance keeps its qty / adjustments / group; only the catalogue fields change.
function ReplaceComponentModal({ s, replaceComponent, factors, onClose }: {
  s: LvState;
  replaceComponent: (matchRef: string, matchName: string, nc: DbComponent, panelIds: Set<string>) => void;
  factors: LvState["factors"]; onClose: () => void;
}) {
  // Distinct catalogue parts in use across the QTN (instance + panel counts).
  const used = useMemo(() => {
    const map = new Map<string, { ref: string; name: string; brand: string; count: number; panels: Set<string> }>();
    for (const pp of s.panels) for (const c of pp.components) {
      if (isSpacer(c) || !c.ref) continue;
      const key = `${c.ref}|${c.name}`;
      const ex = map.get(key);
      if (ex) { ex.count += 1; ex.panels.add(pp.id); } else map.set(key, { ref: c.ref, name: c.name, brand: c.brand, count: 1, panels: new Set([pp.id]) });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [s.panels]);

  const [findKey, setFindKey] = useState("");
  const [repl, setRepl] = useState<DbComponent | null>(null);
  const [allPanels, setAllPanels] = useState(true);
  const [sel, setSel] = useState<Set<string>>(() => new Set(s.panels.map((pp) => pp.id)));
  const find = used.find((u) => `${u.ref}|${u.name}` === findKey) ?? null;

  const inSel = (pp: LvPanel) => allPanels || sel.has(pp.id);
  const instInPanel = (pp: LvPanel) => (find ? pp.components.filter((c) => !isSpacer(c) && c.ref === find.ref && c.name === find.name).length : 0);
  let instTotal = 0, panelsTotal = 0;
  if (find) for (const pp of s.panels) if (inSel(pp)) { const n = instInPanel(pp); if (n) { instTotal += n; panelsTotal += 1; } }
  const ready = !!find && !!repl && instTotal > 0;
  const panelName = (pp: LvPanel, i: number) => (pp.name?.trim() || `Panel ${i + 1}`);
  const apply = () => { if (!ready) return; replaceComponent(find!.ref, find!.name, repl!, new Set(s.panels.filter(inSel).map((pp) => pp.id))); onClose(); };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 p-4 pt-16 no-print"
      onMouseDown={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="w-full max-w-2xl overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-extrabold tracking-tight text-ink">⇄ Replace component</h2>
          <button className="rounded-full px-2 text-xl leading-none text-muted hover:text-ink" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="max-h-[75vh] space-y-4 overflow-auto p-5">
          {used.length === 0 ? (
            <p className="text-sm text-muted">No components in this quotation yet.</p>
          ) : (
            <>
              <div>
                <L>Find — a part used in this quotation</L>
                <SearchSelect value={findKey} placeholder="Search a part used across the panels…"
                  options={used.map((u) => ({ key: `${u.ref}|${u.name}`, label: u.name, hint: `${u.ref} · ${u.count}× · ${u.panels.size} panel${u.panels.size === 1 ? "" : "s"}` }))}
                  onPick={setFindKey} />
              </div>
              <div>
                <L>Replace with — any catalogue component</L>
                <ComponentSearch factors={factors} placeholder="Search the catalogue…" onPick={(c) => setRepl(c)} />
                {repl && <p className="mt-1 text-[12px] font-semibold text-brand-dark">→ {repl.n} <span className="font-normal text-muted">{repl.ref} · {repl.brand} · {fmtEgp(componentPriceEgp(repl, factors))} EGP</span></p>}
              </div>
              <div>
                <L>Apply to</L>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={() => setAllPanels(true)} className={`rounded-full border px-3 py-1 font-bold transition ${allPanels ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted hover:border-brand/40"}`}>All panels ({s.panels.length})</button>
                  <button type="button" onClick={() => setAllPanels(false)} className={`rounded-full border px-3 py-1 font-bold transition ${!allPanels ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted hover:border-brand/40"}`}>Selected panels</button>
                </div>
                {!allPanels && (
                  <div className="mt-2 max-h-44 space-y-0.5 overflow-auto rounded-lg border border-line p-2">
                    {s.panels.map((pp, i) => {
                      const n = instInPanel(pp);
                      return (
                        <label key={pp.id} className={`flex items-center gap-2 rounded px-1.5 py-0.5 text-[13px] ${n ? "hover:bg-brand-tint" : "opacity-45"}`}>
                          <input type="checkbox" className="accent-brand" checked={sel.has(pp.id)} disabled={!n}
                            onChange={(e) => setSel((prev) => { const nx = new Set(prev); if (e.target.checked) nx.add(pp.id); else nx.delete(pp.id); return nx; })} />
                          <span className="flex-1 truncate">{panelName(pp, i)}</span>
                          <span className="text-[11px] text-muted">{n ? `${n}×` : "not used"}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-surface px-3 py-2 text-[13px] font-semibold text-ink">
                {find
                  ? <>Will replace <b className="text-brand-dark">{instTotal}</b> instance{instTotal === 1 ? "" : "s"} of <b>{find.name}</b>{repl ? <> with <b className="text-brand-dark">{repl.n}</b></> : ""} across <b>{panelsTotal}</b> panel{panelsTotal === 1 ? "" : "s"}.</>
                  : "Pick a part to find, then its replacement."}
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary disabled:opacity-40" disabled={!ready} onClick={apply}>Replace{ready ? ` ${instTotal}` : ""}</button>
        </div>
      </div>
    </div>, document.body
  );
}

// ── Combination builders (RPT-03) ────────────────────────────────────────────
type ComboKind = "ats" | "sync" | "photocell" | "mcc" | "pfc" | "wd" | "motorized" | "lamps" | "pushbtn" | "fire" | "custom";
function BreakerSelect({ label, value, onPick, pool, placeholder = "Search breaker…" }: {
  label: string; value: DbComponent | null; onPick: (c: DbComponent) => void; pool: DbComponent[]; placeholder?: string;
}) {
  return (
    <div>
      <L>{label}</L>
      <SearchSelect
        value={value ? `${value.ref}|${value.n}` : ""}
        placeholder={placeholder}
        options={pool.map((c) => ({ key: `${c.ref}|${c.n}`, label: c.n, hint: [c.f || c.t, c.r].filter(Boolean).join(" · ") }))}
        onPick={(k) => {
          const c = pool.find((x) => `${x.ref}|${x.n}` === k);
          if (c) onPick(c);
        }} />
    </div>
  );
}

function AtsBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const pool = useMemo(() => atsBreakerPool(), []);
  const [type, setType] = useState<AtsTypeId>("1oo2");
  const [breakers, setBreakers] = useState<(DbComponent | null)[]>([null, null]);
  const meta = ATS_TYPES.find((t) => t.id === type)!;

  // RPT-03: picking the first breaker auto-fills the rest (each stays editable)
  // RPT-03: picking C.B (1) auto-fills all remaining incomers with the same
  // breaker — each can still be changed independently afterwards.
  const pick = (i: number, c: DbComponent) => {
    setBreakers((old) => {
      const next = [...old];
      next[i] = c;
      if (i === 0) for (let j = 1; j < meta.incomers; j++) next[j] = c;
      return next;
    });
  };
  useEffect(() => {
    setBreakers((old) => Array.from({ length: meta.incomers }, (_, i) => old[i] ?? old[0] ?? null));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = breakers[0] ? frameOf(breakers[0]) : null;
  const ready = breakers.slice(0, meta.incomers).every(Boolean) && frame;

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {ATS_TYPES.map((t) => (
          <button key={t.id} disabled={!t.available}
            title={t.available ? undefined : "Template data pending — Phase 3"}
            onClick={() => t.available && setType(t.id)}
            className={`rounded-md border px-3 py-1 text-xs font-bold ${
              type === t.id ? "border-brand bg-brand-light text-brand-dark"
              : t.available ? "border-line bg-white text-muted" : "cursor-not-allowed border-line bg-surface text-muted/40"
            }`}>
            {!t.available && "🔒 "}{t.label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: meta.incomers }, (_, i) => (
          <BreakerSelect key={i} label={`C.B (${i + 1})${i > 0 ? " — auto-filled, editable" : ""}`}
            value={breakers[i] ?? null} onPick={(c) => pick(i, c)} pool={pool} />
        ))}
      </div>
      {frame && <p className="mt-2 text-[11px] text-muted">Detected frame: <b>{frame}</b> · identical incomers (Phase 1)</p>}
      <button className="btn-ghost mt-2" disabled={!ready}
        onClick={() => ready && onPreview(buildAts(type, frame!, breakers.filter(Boolean) as DbComponent[]), `ATS ${meta.label}`)}>
        Generate combination
      </button>
    </div>
  );
}

// Synchronization — a dynamic list of sources + bus couplers (no interlock). Each source
// gets a synchronising module + control accessories (relay, lamps, start/stop); the first
// source also gets a 3-position selector. Each bus coupler gets a generator bus-tie module.
function SyncBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const pool = useMemo(() => atsBreakerPool(), []);
  const [units, setUnits] = useState<SyncUnit[]>([{ kind: "source", breaker: null }, { kind: "source", breaker: null }]);

  // Picking the first breaker auto-fills any empty units with the same breaker (each stays editable).
  const pick = (i: number, c: DbComponent) => setUnits((old) => {
    const next = old.map((u, j) => (j === i ? { ...u, breaker: c } : u));
    return i === 0 ? next.map((u) => (u.breaker ? u : { ...u, breaker: c })) : next;
  });
  const addUnit = (kind: "source" | "bus") => setUnits((old) => [...old, { kind, breaker: old[0]?.breaker ?? null }]);
  const removeUnit = (i: number) => setUnits((old) => (old.length > 1 ? old.filter((_, j) => j !== i) : old));

  // Display labels: Source (1), Source (2)…; Bus Coupler (or Bus Coupler (1/2…) when several).
  const busCount = units.filter((u) => u.kind === "bus").length;
  const labels = (() => { let s = 0, b = 0; return units.map((u) => (u.kind === "source" ? `Source (${++s})` : busCount > 1 ? `Bus Coupler (${++b})` : "Bus Coupler")); })();
  const filled = units.filter((u) => u.breaker);
  const ready = filled.some((u) => u.kind === "source"); // at least one source with a breaker

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => addUnit("source")}
          className="rounded-full border border-brand/40 bg-white px-3 py-1 text-[11px] font-bold text-brand-dark transition hover:border-brand hover:bg-brand-light">+ Add source</button>
        <button type="button" onClick={() => addUnit("bus")}
          className="rounded-full border border-brand/40 bg-white px-3 py-1 text-[11px] font-bold text-brand-dark transition hover:border-brand hover:bg-brand-light">+ Add bus coupler</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {units.map((u, i) => (
          <div key={i} className="relative">
            {units.length > 1 && (
              <button type="button" onClick={() => removeUnit(i)} title="Remove"
                className="absolute right-0 top-0 text-[11px] font-semibold text-muted hover:text-red-600">✕</button>
            )}
            <BreakerSelect label={`${labels[i]}${u.kind === "bus" ? " — bus tie" : ""}`}
              value={u.breaker} onPick={(c) => pick(i, c)} pool={pool} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Each <b>source</b> = breaker + operating accessories + a synchronising &amp; load-sharing module + control set
        (relay, 2 red / 3 green / 2 yellow lamps, start &amp; stop). Each <b>bus coupler</b> = breaker + operating accessories +
        a generator bus-tie module + control set (relay, 1 red / 2 green / 1 yellow, start &amp; stop). One 3-position master
        selector is added for the panel. <b>Identical units are collected</b> into “N × each contain…” with per-unit &amp; total pricing. No mechanical interlock.
      </p>
      <button className="btn-ghost mt-2" disabled={!ready}
        onClick={() => ready && onPreview(buildSync(units), "Synchronization")}>
        Generate combination
      </button>
    </div>
  );
}

function PhotocellBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const pool = useMemo(() => COMPONENTS, []); // full database — not only breakers
  const [cb, setCb] = useState<DbComponent | null>(null);
  const [manual, setManual] = useState(0); // manual rating override (A)
  const rating = manual > 0 ? manual : cb ? breakerAmps(cb) : 0;
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <BreakerSelect label="Circuit breaker" value={cb} onPick={(c) => { setCb(c); setManual(0); }} pool={pool} placeholder="Search all components…" />
        <div>
          <L>Rating (A) <span className="text-[11px] font-normal text-muted">— auto from C.B, or type manually</span></L>
          <input className="input" inputMode="numeric" value={rating || ""} placeholder="e.g. 160"
            onChange={(e) => setManual(parseInt(e.target.value.replace(/[^\d]/g, "")) || 0)} />
        </div>
      </div>
      {cb && (
        <p className="mt-1.5 text-[11px] text-muted">
          Detected C.B rating: <b>{breakerAmps(cb) || "?"} A</b>{manual > 0 ? ` · using ${manual} A (manual)` : ""}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted">Contactor + aux are sized from the rating; photocell, selector, timer, pushbuttons &amp; lamps are fixed.</p>
      <button className="btn-ghost mt-2" disabled={!rating}
        onClick={() => rating && onPreview(buildPhotocell(rating, cb ?? undefined), "Photocell")}>Generate combination</button>
    </div>
  );
}

function MccBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const [kind, setKind] = useState(MCC_KINDS[0] ?? "DOL-3Ph");
  const kws = useMemo(() => mccKws(kind), [kind]);
  const [kw, setKw] = useState(kws[0] ?? "");
  useEffect(() => { const list = mccKws(kind); setKw(list[0] ?? ""); }, [kind]);
  const types = useMemo(() => mccTypes(kind, kw), [kind, kw]);
  const [type, setType] = useState(2);
  useEffect(() => setType(types.includes(2) ? 2 : (types[0] ?? 1)), [types]); // default Type 2 when available
  const [withCtl, setWithCtl] = useState(true);
  const [qty, setQty] = useState(1); // RPT-1: quantity for this combination
  // KVA → kW helper: kW = KVA × P.F, rounded UP to the nearest standard motor kW
  // in the current list, then auto-selected in the Motor (kW) dropdown.
  const [kva, setKva] = useState("");
  const [pf, setPf] = useState("0.8");
  const roundUpKw = (raw: number): string => {
    const sorted = [...kws].sort((a, b) => parseFloat(a) - parseFloat(b));
    for (const k of sorted) if (parseFloat(k) >= raw - 1e-9) return k; // smallest rating ≥ demand
    return sorted[sorted.length - 1] ?? kw;                            // beyond the top rating → the max
  };
  const applyFromKva = (kvaStr: string, pfStr: string) => {
    const raw = (parseFloat(kvaStr) || 0) * (parseFloat(pfStr) || 0);
    if (raw > 0) setKw(roundUpKw(raw));
  };
  // Re-apply if the kW list changes (e.g. a different Starter) so the KVA stays honoured.
  useEffect(() => { const raw = (parseFloat(kva) || 0) * (parseFloat(pf) || 0); if (raw > 0) setKw(roundUpKw(raw)); }, [kws]); // eslint-disable-line react-hooks/exhaustive-deps
  const rawKw = (parseFloat(kva) || 0) * (parseFloat(pf) || 0);
  const pickedKw = rawKw > 0 ? roundUpKw(rawKw) : "";
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div><L>Starter</L><Sel value={kind as any} onChange={(v) => setKind(v)} options={MCC_KINDS as any} className="w-36" /></div>
        <div><L>Motor (kW)</L><Sel value={kw as any} onChange={(v) => setKw(v)} options={kws as any} className="w-32" /></div>
        <div><L>Type</L><Sel value={String(type) as any} onChange={(v) => setType(+v)} options={types.map(String) as any} className="w-24" /></div>
        <div><L>Qty</L><input className="input w-20" inputMode="numeric" value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, "")) || 1))} /></div>
        <label className="flex cursor-pointer select-none items-center gap-1.5 pb-2 text-xs font-semibold text-ink">
          <input type="checkbox" className="cursor-pointer accent-brand" checked={withCtl} onChange={(e) => setWithCtl(e.target.checked)} /> + control acc.
        </label>
        <button className="btn-ghost"
          onClick={() => onPreview(buildMcc(kind, kw, type, withCtl, qty), `MCC ${kind} ${kw}`)}>
          Generate combination
        </button>
        {/* KVA → kW converter — fills the Motor (kW) above from KVA × P.F (rounded up). */}
        <div className="ml-auto flex items-end gap-2 rounded-md border border-dashed border-brand/50 bg-brand-light/50 px-3 py-2">
          <div><L>KVA</L>
            <input className="input w-20" inputMode="decimal" placeholder="0" value={kva}
              onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setKva(v); applyFromKva(v, pf); }} /></div>
          <div><L>P.F</L>
            <input className="input w-16" inputMode="decimal" value={pf}
              onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setPf(v); applyFromKva(kva, v); }} /></div>
          <div className="pb-1.5 text-[11px] font-semibold leading-tight text-brand-dark">
            {rawKw > 0
              ? <>= {rawKw.toFixed(2)} kW<br />→ selects <b>{pickedKw}</b></>
              : <span className="text-muted">KVA × P.F<br />→ nearest kW</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Power Factor Correction — required-kVAR calculator (the "P.F.C calculation" tab) ──
// From the measured load & target PF it computes the required capacitor rating
// Qc = P·(tanφ₁−tanφ₂). The result is pushed (onResult) into the "Required kVAR" field
// of the "Existing / known P.F.C" tab. Advisory — verify against network measurements.
function PfcCalculator({ onResult }: { onResult: (kvar: number) => void }) {
  const [loadVal, setLoadVal] = useState(1000);
  const [loadUnit, setLoadUnit] = useState<"kVA" | "kW">("kVA");
  const [pf1, setPf1] = useState(0.8);
  const [pf2, setPf2] = useState(0.95);
  const [volt, setVolt] = useState(400);
  const [freq, setFreq] = useState(50);

  const cP = Math.min(0.999, Math.max(0.05, pf1)), cT = Math.min(0.999, Math.max(0.05, pf2));
  const P = loadUnit === "kVA" ? loadVal * cP : loadVal;                    // active power kW
  const qc = Math.max(0, P * (Math.tan(Math.acos(cP)) - Math.tan(Math.acos(cT)))); // exact required kVAR (Qc)
  const qcExact = Math.round(qc);
  const qc25 = Math.ceil(qc / 25) * 25;                                     // rounded UP to the nearest 25 kVAR (standard bank step)
  // Push the rounded (nearest-25) value into the known-P.F.C tab's Required kVAR.
  useEffect(() => { onResult(qc25); }, [qc25]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = (x: number, d = 0) => (Number.isFinite(x) ? x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  // plain functions (not nested components) so inputs keep focus while typing
  const numF = (label: string, value: number, set: (v: number) => void, st = 1, hint?: string) => (
    <div>
      <L>{label}{hint && <span className="text-[10px] font-normal normal-case text-muted"> {hint}</span>}</L>
      <input className="input h-9" type="number" step={st} value={value || ""} onChange={(e) => set(parseFloat(e.target.value) || 0)} />
    </div>
  );
  return (
        <div className="grid gap-4">
          {/* Installation data (editable) */}
          <section className="rounded-lg border border-brand/30 bg-brand-tint/40 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-dark">Installation data</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <L>Total load</L>
                <div className="flex gap-1">
                  <input className="input h-9" type="number" value={loadVal || ""} onChange={(e) => setLoadVal(parseFloat(e.target.value) || 0)} />
                  <select className="input h-9 w-20 cursor-pointer" value={loadUnit} onChange={(e) => setLoadUnit(e.target.value as "kVA" | "kW")}><option>kVA</option><option>kW</option></select>
                </div>
              </div>
              {numF("Existing PF", pf1, setPf1, 0.01, "cosφ₁ lag")}
              {numF("Target PF", pf2, setPf2, 0.01, "cosφ₂")}
              {numF("Voltage (V)", volt, setVolt, 10, "line-line")}
              {numF("Frequency (Hz)", freq, setFreq, 10)}
              <div>
                <L>Required kVAR <span className="text-[10px] font-normal normal-case text-muted">nearest 25 kVAR</span></L>
                <div className="flex h-9 items-center justify-start rounded-md border border-brand/50 bg-white px-3 text-sm font-extrabold text-brand-dark">{f(qc25)} kVAR</div>
                <p className="mt-1 text-[10px] leading-snug text-muted">Rounded <b>up</b> to the nearest 25 kVAR (standard bank step). Exact required: <b>{f(qcExact)} kVAR</b>.</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted">↳ the rounded value ({f(qc25)} kVAR) is sent to <b>Required kVAR</b> in the “Existing / known P.F.C” tab.</p>
          </section>
        </div>
  );
}

function PfcBuilder({ onPreview, syncKvar }: { onPreview: (l: ComboLine[], tag: string) => void; syncKvar?: number | null }) {
  const pool = useMemo(() => breakerPool(), []);
  const [cb, setCb] = useState<DbComponent | null>(null);
  const [i, setI] = useState({ ...PFC_DEFAULT });
  // The P.F.C-calculation tab feeds its computed required kVAR into this field.
  useEffect(() => { if (syncKvar != null && syncKvar > 0) setI((x) => ({ ...x, kvar: syncKvar })); }, [syncKvar]);
  const tot = pfcTotalKvar(i);
  const header = pfcHeader(i);
  // plain functions (not nested components) so inputs keep focus while typing
  const num = (k: "kvar" | "fixedSteps" | "var1Steps" | "var2Steps", label: string) => (
    <div key={k}>
      <L>{label}</L>
      <input className="input w-full" type="number" min={0} value={i[k] || ""}
        onChange={(e) => setI({ ...i, [k]: parseInt(e.target.value) || 0 })} />
    </div>
  );
  const kvarSel = (k: "fixedKvar" | "var1Kvar" | "var2Kvar", label: string) => (
    <div key={k}>
      <L>{label}</L>
      <select className="input w-full cursor-pointer" value={i[k]} onChange={(e) => setI({ ...i, [k]: +e.target.value as 25 | 50 })}>
        <option value={25}>25 kVAR</option><option value={50}>50 kVAR</option>
      </select>
    </div>
  );
  const ok = tot >= i.kvar;
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-3 text-[11px] text-muted">Phase 1: 400 V systems, 25/50 kVAR steps only (RPT-03).</p>
      {/* One shared 4-column grid so every field lines up across all three rows:
          breaker (×2) · required kVAR · C.B rating  /  fixed bank · variable-1 bank  /  summary (×2) · variable-2 bank. */}
      <div className="grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-4">
        {/* Row 1 — breaker · required kVAR · C.B rating */}
        <div className="sm:col-span-2">
          <BreakerSelect label="P.F.C. circuit breaker *" value={cb}
            onPick={(c) => { setCb(c); setI((x) => ({ ...x, cbRating: breakerAmps(c) })); }} pool={pool} />
        </div>
        {num("kvar", "Required kVAR")}
        <div>
          <L>C.B rating (A) <span className="text-[11px] font-normal text-muted">— auto</span></L>
          <input className={`input ${!i.cbRating ? "border-red-400 bg-red-50/40" : ""}`} inputMode="numeric"
            value={i.cbRating || ""} placeholder="e.g. 250"
            onChange={(e) => { setI({ ...i, cbRating: parseInt(e.target.value.replace(/[^\d]/g, "")) || 0 }); setCb(null); }} />
        </div>

        {/* Row 2 — fixed bank + first variable bank */}
        {num("fixedSteps", "Fixed steps")}{kvarSel("fixedKvar", "Fixed step kVAR")}
        {num("var1Steps", "Var. steps 1")}{kvarSel("var1Kvar", "Var.1 step kVAR")}

        {/* Row 3 — live summary card + optional second variable bank (aligned under variable-1) */}
        <div className={`flex h-full flex-col justify-center rounded-lg border px-3 py-2 sm:col-span-2 ${ok ? "border-green-200 bg-green-50/60" : "border-amber-200 bg-amber-50/60"}`}>
          <p className={`flex items-center gap-1.5 text-xs font-bold ${ok ? "text-green-700" : "text-amber-700"}`}>
            <span className="text-sm leading-none">{ok ? "✓" : "⚠"}</span>
            Configured {tot} kVAR{i.kvar ? ` of ${i.kvar} required` : ""}{ok ? "" : ` — short by ${i.kvar - tot}`}
          </p>
          <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[11px] leading-snug text-muted">
            <span className="font-semibold text-ink">Header:</span> {header}
          </p>
        </div>
        {num("var2Steps", "Var. steps 2")}{kvarSel("var2Kvar", "Var.2 step kVAR")}
      </div>

      <button className="btn-ghost mt-4 sm:px-6" disabled={!i.cbRating}
        onClick={() => i.cbRating && onPreview(buildPfc(i, cb ?? undefined), "P.F.C")}>Generate combination</button>
    </div>
  );
}

function WdBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const pool = useMemo(() => atsBreakerPool().filter((c) => wdKeyFor(c)), []); // only breakers with a WD kit (no MCBs / junk)
  const [cb, setCb] = useState<DbComponent | null>(null);
  const [manualKey, setManualKey] = useState(""); // manual Frame·poles override
  const [acc, setAcc] = useState("none"); // W.D operating-mechanism accessory
  const [zoom, setZoom] = useState<string | null>(null); // full-res guide-image lightbox
  const key = manualKey || (cb ? wdKeyFor(cb) : "") || WD_OPTIONS[0]?.key || "";
  const labelOf = (k: string) => WD_OPTIONS.find((o) => o.key === k)?.label ?? "?";
  // A FLD/RHD/RHE choice that has no part for the picked breaker's frame (e.g. FLD on XT7).
  const accUnavailable = !!cb && acc !== "none" && acc !== "motorized" && !wdAccessoryName(acc, cb);
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <BreakerSelect label="Circuit breaker" value={cb} onPick={(c) => { setCb(c); setManualKey(""); }} pool={pool} placeholder="Search all components…" />
        <div>
          <L>Frame · poles <span className="text-[11px] font-normal text-muted">— auto from C.B, or pick</span></L>
          <select className="input cursor-pointer" value={key} onChange={(e) => setManualKey(e.target.value)}>
            {WD_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <L>W.D MCCB accessories</L>
          <div className="flex items-center gap-2">
            <select className="input cursor-pointer flex-1" value={acc} onChange={(e) => setAcc(e.target.value)}>
              {WD_ACCESSORIES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            {WD_ACC_IMG[acc] && (
              <button type="button" onClick={() => setZoom(WD_ACC_IMG[acc])} title="Click to enlarge"
                className="shrink-0 rounded-md border border-line bg-white p-0.5 hover:border-brand" aria-label="Enlarge guide photo">
                <img src={WD_ACC_IMG[acc]} alt={`${acc.toUpperCase()} guide`} className="h-9 w-auto cursor-zoom-in" />
              </button>
            )}
          </div>
        </div>
      </div>
      {cb && <p className="mt-1.5 text-[11px] text-muted">Detected: <b>{labelOf(wdKeyFor(cb))}</b>{manualKey ? ` · using ${labelOf(manualKey)} (manual)` : ""}</p>}
      {accUnavailable
        ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{WD_ACCESSORIES.find((a) => a.id === acc)?.label} isn’t offered for this breaker’s frame — it will be skipped.</p>
        : <p className="mt-1 text-[11px] text-muted">Fixed + moving part kit for the withdrawable breaker (the picked breaker is included){acc !== "none" ? ", plus the chosen operating mechanism" : ""}.</p>}
      <button className="btn-ghost mt-2" disabled={!key} onClick={() => key && onPreview(buildWd(key, cb ?? undefined, acc), "WD kit")}>Generate kit</button>
      {zoom && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 no-print" onClick={() => setZoom(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setZoom(null); }}>
          <div className="fixed inset-0 bg-ink/70 animate-fade-in" />
          <img src={zoom} alt="Accessory guide — click to close" className="relative max-h-[85vh] max-w-[92vw] rounded-lg bg-white p-3 shadow-lift animate-pop" />
        </div>,
        document.body
      )}
    </div>
  );
}

function MotorizedBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  // Only MCCB / ACB breakers (no MCBs / junk); on the XT7 frame only the motorizable
  // XT7M variant qualifies, so plain XT7 (XT7S / XT7H without "M") is filtered out.
  const pool = useMemo(() => atsBreakerPool().filter((c) => frameOf(c) !== "XT7" || /\bXT7[SH]?\s*M\b/i.test(c.n)), []);
  const [cb, setCb] = useState<DbComponent | null>(null);
  const [manualFrame, setManualFrame] = useState(""); // manual frame override
  const frame = manualFrame || (cb ? motorizedFrameKey(frameOf(cb)) : "") || MOTORIZED_FRAMES[0];
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <BreakerSelect label="Circuit breaker" value={cb} onPick={(c) => { setCb(c); setManualFrame(""); }} pool={pool} placeholder="Search all components…" />
        <div>
          <L>Breaker frame <span className="text-[11px] font-normal text-muted">— auto from C.B, or pick</span></L>
          <select className="input cursor-pointer" value={frame} onChange={(e) => setManualFrame(e.target.value)}>
            {MOTORIZED_FRAMES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
      {cb && <p className="mt-1.5 text-[11px] text-muted">Detected frame: <b>{motorizedFrameKey(frameOf(cb)) || "?"}</b>{manualFrame ? ` · using ${manualFrame} (manual)` : ""}</p>}
      {frame === "XT7M"
        ? <p className="mt-1 text-[11px] font-semibold text-amber-700">XT7 must be the motorizable XT7M variant.</p>
        : <p className="mt-1 text-[11px] text-muted">Motor operator + control gear (push buttons, pilots, selector) — sized to the breaker frame; the picked breaker is included.</p>}
      <button className="btn-ghost mt-2" disabled={!frame}
        onClick={() => frame && onPreview(buildMotorized(frame, cb ?? undefined), `Motorized C.B — ${frame}`)}>Generate combination</button>
    </div>
  );
}

function LampsBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  // Fixed set — generate on open so the "Add to …" step shows directly (no Generate step, no blurb).
  useEffect(() => { onPreview(buildIndicationLamps(), "Indication Lamps"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Push Buttons: fixed green-start / red-stop pushbutton pair, added as a "Push Buttons" group.
function PushButtonsBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  // Fixed set — generate on open so the "Add to …" step shows directly (no Generate step, no blurb).
  useEffect(() => { onPreview(buildPushButtons(), "Push Buttons"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Fire: fixed fire-alarm interface set (relay + base + 24 Vdc supply), added as a "Fire" group.
function FireBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  useEffect(() => { onPreview(buildFire(), "Fire"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Rich component search — same behaviour as the main Components search bar: ranked hits
// (name / reference / type / rating) showing price · type badge · name · ref/brand, with
// arrow-key navigation, Enter to pick, and Esc / outside-click to close.
function ComponentSearch({ factors, onPick, placeholder, inputRef }: {
  factors: LvState["factors"]; onPick: (c: DbComponent) => void; placeholder?: string; inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchComponents(q, 40), [q]);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setActiveIdx(0); }, [q]);
  useEffect(() => { (listRef.current?.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [activeIdx]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setQ(""); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const pick = (c: DbComponent) => { onPick(c); setQ(""); };
  return (
    <div ref={wrapRef} className="relative">
      <input ref={inputRef} className="input" placeholder={placeholder ?? "Search components (name / reference / type / rating)…"}
        value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (!q) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); const c = hits[activeIdx]; if (c) pick(c); }
          else if (e.key === "Escape") setQ("");
        }} />
      {q && (
        <div ref={listRef} className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white shadow-lift">
          {hits.length === 0 && <div className="px-3 py-2 text-xs text-muted">No matches</div>}
          {hits.map((c, i) => (
            <button key={c.ref + c.n} type="button"
              className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${i === activeIdx ? "bg-brand-light" : "hover:bg-brand-tint"}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={() => pick(c)}>
              <b className="w-24 shrink-0 whitespace-nowrap text-left text-brand-dark">EGP {fmtEgp(componentPriceEgp(c, factors))}</b>
              <span className="min-w-0 flex-1 truncate">
                <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{c.t}</span>
                {c.n}
                <span className="ml-1 text-[11px] text-muted">{c.ref} · {c.brand}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// New Combination: build a custom named group from any catalogue components. Name it,
// search-and-add items (each with its own qty), then add it as a group to the active section.
function CustomBuilder({ factors, onPreview }: { factors: LvState["factors"]; onPreview: (l: ComboLine[], tag: string) => void }) {
  const [name, setName] = useState("");
  const [comboQty, setComboQty] = useState(1); // ×N — scales the whole combination
  const [items, setItems] = useState<{ comp: DbComponent; qty: number }[]>([]);
  const [pending, setPending] = useState<DbComponent | null>(null); // picked component awaiting a qty
  const [pendQty, setPendQty] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const add = (c: DbComponent, qty: number) =>
    setItems((old) => {
      const i = old.findIndex((x) => x.comp.ref === c.ref && x.comp.n === c.n);
      if (i >= 0) { const next = [...old]; next[i] = { ...next[i], qty: next[i].qty + qty }; return next; } // bump qty if re-added
      return [...old, { comp: c, qty }];
    });
  // Adding an item returns focus to the component search (to add the next one) rather
  // than letting focus fall onto the Combination-qty field.
  const confirmAdd = () => { if (!pending) return; add(pending, parseInt(pendQty, 10) || 1); setPending(null); setPendQty(""); requestAnimationFrame(() => searchRef.current?.focus()); };
  const setQty = (i: number, q: number) => setItems((old) => old.map((x, j) => (j === i ? { ...x, qty: Math.max(1, q) } : x)));
  const remove = (i: number) => setItems((old) => old.filter((_, j) => j !== i));
  const label = name.trim() || "New Combination";
  const gen = () => {
    if (!items.length) return;
    // baseQty = per-unit qty; qty = baseQty × N so the group's ×N combination-qty scales it.
    onPreview(items.map((it) => ({ qty: it.qty * comboQty, baseQty: it.qty, desc: it.comp.n, comp: it.comp, groupLabel: label })), label);
  };
  return (
    <div className="rounded-lg border border-line p-3">
      {/* Name written directly — same pill input as the “New section…” field */}
      <input className="input h-10 w-full rounded-full text-sm sm:w-72" value={name}
        onChange={(e) => setName(e.target.value)} placeholder="New combination…" />
      <div className="mt-2">
        <L>Add component</L>
        <ComponentSearch inputRef={searchRef} factors={factors} placeholder="Search all components…" onPick={(c) => { setPending(c); setPendQty(""); }} />
      </div>
      {/* Qty popup — appears when a component is picked, before it's added to the list */}
      {pending && (
        <div className="mt-2 rounded-lg border border-brand/50 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs">
            <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{pending.t}</span>
            <span className="font-bold text-ink">{pending.n}</span>
            <span className="ml-1 text-[11px] text-muted">{pending.ref} · {pending.brand}</span>
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted">Qty</label>
            <input autoFocus inputMode="numeric" className="input h-9 w-24" placeholder="1" value={pendQty}
              onChange={(e) => setPendQty(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") { setPending(null); setPendQty(""); } }} />
            <button type="button" className="btn-primary h-9 px-4 text-sm" onClick={confirmAdd}>Add</button>
            <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={() => { setPending(null); setPendQty(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {items.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded border border-line/70">
          {items.map((it, i) => (
            <div key={it.comp.ref + it.comp.n + i} className="flex items-center gap-2 border-t border-line/60 px-2 py-1 text-xs first:border-0">
              <span className="min-w-0 flex-1 truncate">{it.comp.n} <span className="text-muted">· {it.comp.ref} · {it.comp.brand}</span></span>
              <input className="input h-7 w-16 text-center" inputMode="numeric" value={it.qty}
                onChange={(e) => setQty(i, parseInt(e.target.value.replace(/[^\d]/g, "")) || 1)} title="Quantity" />
              <button type="button" className="px-1 text-red-500 hover:text-red-700" title="Remove" onClick={() => remove(i)}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted">Search and pick components to add them. Set a quantity per item, then generate — they’re added as one named group.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          Combination qty
          <input className="input h-8 w-16 text-center" inputMode="numeric" value={comboQty}
            onChange={(e) => setComboQty(Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, "")) || 1))}
            title="Quantity of the whole combination — scales every item (×N)" />
        </label>
        <button className="btn-ghost" disabled={!items.length} onClick={gen}>
          Generate combination ({items.length}{comboQty > 1 ? ` ×${comboQty}` : ""})
        </button>
      </div>
    </div>
  );
}

// Enclosure dimensions live in the "H x W x D" name string (the price-DB H/W/D
// fields are all 0), e.g. "1400x800x300" → { H:1400, W:800, D:300 }. Used for
// RPT-02's Double rule: panel 2 matches panel 1's H & D, width 600/800 mm only.
function encDims(name: string): { H: number; W: number; D: number } | null {
  // Accept both separators: raw catalogue names use "300x200x150"; formatted Sizing
  // labels use "300 × 200 × 250 mm". Both must parse so the height filter works everywhere.
  const m = String(name).match(/(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/i);
  return m ? { H: +m[1], W: +m[2], D: +m[3] } : null;
}

// ── Panel type (RPT-01 §Sizing + RPT-02) — enclosure sizings added like
//    components: pick → row with qty / remove ─────────────────────────────────
function SizingCard({ p, u, factors }: {
  p: LvPanel; u: (patch: Partial<LvPanel>) => void;
  factors: LvState["factors"];
}) {
  const panelsLocked = p.ratingA > PANELS_MAX_INCOMER_A;
  useEffect(() => {
    if (panelsLocked && p.sizingMode === "panels") u({ sizingMode: "cells", panelItems: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelsLocked]);

  const ps = p.panelsSizing;
  const cc = p.cellConfig;
  const upCells = (patch: Partial<typeof cc>) => u({ cellConfig: retable({ ...cc, ...patch }) });

  const famOptions = ps.layout === "Double" ? DOUBLE_FAMILIES : PANEL_SYSTEMS;
  const sizing1Pool = ENCLOSURES.filter((e) => e.fam === ps.family);
  // RPT-1: in a Double layout, panel 2 inherits panel 1's height & depth — only
  // the width (600/800 mm) may vary. Dimensions are read from the name (encDims)
  // because the price-DB H/W/D fields are all 0.
  const slot1Sel = (p.panelItems ?? []).find((it) => (it.slot ?? 1) === 1) ?? null;
  const slot1Dims = slot1Sel ? encDims(slot1Sel.name) : null;
  const sizing2Pool = sizing1Pool.filter((e) => {
    const d = encDims(e.name);
    return d != null && (d.W === 600 || d.W === 800) &&
      (!slot1Dims || (d.H === slot1Dims.H && d.D === slot1Dims.D));
  });

  const ip31Off = proEIp31Disabled(cc.depth, cc.thickness);

  // single-selection enclosure: one item per slot (Single = slot 1; Double = 1 + 2)
  const items = p.panelItems ?? [];
  const slotItem = (slot: 1 | 2) => items.find((it) => (it.slot ?? 1) === slot) ?? null;
  const setSlot = (slot: 1 | 2, e: (typeof ENCLOSURES)[number] | null) => {
    let others = items.filter((it) => (it.slot ?? 1) !== slot);
    // RPT-1: changing panel 1 in a Double layout clears panel 2 (it must re-match H&D).
    if (slot === 1 && ps.layout === "Double") others = others.filter((it) => (it.slot ?? 1) !== 2);
    const next: PanelTypeItem[] = e
      ? [...others, { id: uid(), slot, fam: e.fam, name: e.name, ref: e.ref, ip: String(e.ip ?? ""), eur: e.eur, egp: e.egp, qty: 1 }]
      : others;
    u({ panelItems: next.sort((a, b) => (a.slot ?? 1) - (b.slot ?? 1)) });
  };
  const setLayout = (layout: "Single" | "Double") => {
    const family = layout === "Double" && !DOUBLE_FAMILIES.includes(ps.family as any) ? "SR-Basic" : ps.family;
    const trimmed = layout === "Single" ? items.filter((it) => (it.slot ?? 1) === 1) : items;
    u({ panelsSizing: { ...ps, layout, family }, panelItems: trimmed });
  };
  // Pillars busbar is 3P + Neutral (100%) + Earth (25%) = 4.25 bar-equivalents; every
  // other family is 3P. Picking a family resets the busbar poles to its standard.
  const setFamily = (family: string) =>
    u({ panelsSizing: { ...ps, family }, panelItems: [], busbarPoles: family === "Pillars" ? 4.25 : 3 });
  const keyOf = (it: PanelTypeItem | null) => (it ? `${it.name}|${it.ref}` : "");

  // Panels/Cells chooser — rendered at the top in panels/none mode, or inside the
  // left column (beside the Copper Tool) in cells mode.
  const toggleEl = (
    <div className="mb-4 max-w-md">
      <L>Panels or Cells?</L>
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={panelsLocked}
          onClick={() => { if (p.sizingMode !== "panels") u({ sizingMode: "panels", cellConfig: defaultCellConfig() }); }}
          title={panelsLocked ? `Incomer > ${PANELS_MAX_INCOMER_A} A — cells only (RPT-01)` : undefined}
          className={`rounded-lg border-2 px-3 py-2 text-left transition ${
            p.sizingMode === "panels"
              ? "border-brand bg-brand-tint shadow-soft"
              : panelsLocked
              ? "cursor-not-allowed border-line bg-surface opacity-50"
              : "border-line bg-white hover:border-brand/50 hover:bg-brand-tint/40"
          }`}
        >
          <div className={`text-sm font-bold leading-tight ${p.sizingMode === "panels" ? "text-brand-dark" : "text-ink"}`}>
            {panelsLocked && "🔒 "}Panels
          </div>
          <div className="text-[11px] text-muted">Standard enclosures</div>
        </button>
        <button
          onClick={() => { if (p.sizingMode !== "cells") u({ sizingMode: "cells", panelItems: [] }); }}
          className={`rounded-lg border-2 px-3 py-2 text-left transition ${
            p.sizingMode === "cells"
              ? "border-brand bg-brand-tint shadow-soft"
              : "border-line bg-white hover:border-brand/50 hover:bg-brand-tint/40"
          }`}
        >
          <div className={`text-sm font-bold leading-tight ${p.sizingMode === "cells" ? "text-brand-dark" : "text-ink"}`}>Cells</div>
          <div className="text-[11px] text-muted">Pro-E / IS2 / PLP</div>
        </button>
      </div>
      {panelsLocked && (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
          Incoming C.B &gt; {PANELS_MAX_INCOMER_A} A → Panels disabled (cells only)
        </p>
      )}
    </div>
  );

  return (
    <div className="card p-5">
      <div>
      {/* Panel type body — full width; the No. of poles summary is its own section below. */}
      <div className="min-w-0">
      <h2 className="sec-head">Panel type</h2>
      {/* Step 1 — Panels or Cells? In cells mode this chooser moves into the left
          column (beside the Copper Tool), so it renders here only otherwise. */}
      {p.sizingMode !== "cells" && toggleEl}

      {p.sizingMode === "none" ? (
        <p className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-muted">
          Choose <b className="text-ink">Panels</b> or <b className="text-ink">Cells</b> above to configure this panel.
        </p>
      ) : p.sizingMode === "panels" ? (
        <div>
          <div className="max-w-md space-y-3">
            <div>
              <L>Layout</L>
              <div className="flex gap-1.5">
                {(["Single", "Double"] as const).map((l) => {
                  const noDouble = l === "Double" && !DOUBLE_FAMILIES.includes(ps.family as any);
                  return (
                    <button key={l} disabled={noDouble} onClick={() => { if (!noDouble) setLayout(l); }}
                      title={noDouble ? `${ps.family} panels can't be Double` : undefined}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-bold ${
                        noDouble ? "cursor-not-allowed border-line bg-surface text-muted/40"
                          : ps.layout === l ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted"
                      }`}>{l}</button>
                  );
                })}
              </div>
              {ps.layout === "Double" && <p className="mt-1 text-[11px] text-muted">Double: SR-Basic / Unikit / Local only · 2nd width 60/80 (RPT-02)</p>}
            </div>
            <div>
              <L>Enclosure family</L>
              <Sel value={ps.family as any} onChange={(v) => setFamily(v)} options={famOptions as any} />
            </div>
            <div>
              <L>{ps.layout === "Double" ? "Sizing (1)" : "Sizing"}</L>
              <SearchSelect value={keyOf(slotItem(1))} placeholder="Search size — one selection…"
                options={sizing1Pool.map((e) => ({
                  key: `${e.name}|${e.ref}`,
                  label: e.name,
                  hint: `${e.ref} · ${fmtEgp(enclosurePriceEgp(e, factors))} EGP`,
                }))}
                onPick={(k) => setSlot(1, sizing1Pool.find((x) => `${x.name}|${x.ref}` === k) ?? null)} heightMatch />
            </div>
            {ps.layout === "Double" && (
              <div>
                <L>Sizing (2) — width only (H &amp; D match panel 1)</L>
                <SearchSelect value={keyOf(slotItem(2))} placeholder="Search size — one selection…"
                  options={sizing2Pool.map((e) => ({
                    key: `${e.name}|${e.ref}`,
                    label: e.name,
                    hint: `${e.ref} · ${fmtEgp(enclosurePriceEgp(e, factors))} EGP`,
                  }))}
                  onPick={(k) => setSlot(2, sizing2Pool.find((x) => `${x.name}|${x.ref}` === k) ?? null)} heightMatch />
              </div>
            )}
          </div>

          {/* the selected enclosure(s) — one per slot */}
          {items.length > 0 && (
            <table className="mt-3 w-full text-[13px]">
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-line/70">
                    <td className="py-1 pr-2 font-medium">
                      {ps.layout === "Double" && <span className="mr-1 rounded bg-brand-light px-1 text-[10px] font-bold text-brand-dark">#{it.slot ?? 1}</span>}
                      {it.fam} — {it.name}
                    </td>
                    <td className="py-1 pr-2 text-[11px] text-muted">{it.ref}</td>
                    <td className="py-1 pr-2 text-right font-semibold">
                      {fmtEgp(it.eur > 0 ? it.eur * factors.euro : it.egp)}
                    </td>
                    <td className="py-1 text-right">
                      <button className="px-1 text-red-500" title="Clear" onClick={() => setSlot((it.slot ?? 1) as 1 | 2, null)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)] xl:items-stretch">
          {/* Panels/Cells chooser + config + cells list (left) */}
          <div className="min-w-0">
          {toggleEl}
          <div className="mb-3 max-w-md space-y-3">
            <div>
              <L>Cell type</L>
              <Sel value={cc.type as any} onChange={(v) => {
                const fresh = defaultCellConfig(v as CellType);
                u({ cellConfig: fresh });
              }} options={CELL_SYSTEMS as any} />
            </div>
            <div>
              <L>Cell depth</L>
              <div className="flex gap-1">
                {(cc.type === "Pro-E" ? PRO_E_DEPTHS : cc.type === "IS2" ? IS2_DEPTHS : PLP_DEPTHS).map((d) => (
                  <button key={d} onClick={() => upCells({ depth: d })}
                    className={`flex-1 rounded-md border px-2 py-1 text-xs font-bold ${
                      cc.depth === d ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted"
                    }`}>{d} cm</button>
                ))}
              </div>
            </div>
            {cc.type === "Pro-E" && (
              <>
                <div>
                  <L>Sheet thickness</L>
                  <div className="flex gap-1">
                    {PRO_E_THICKNESS.map((t) => (
                      <button key={t} onClick={() => {
                        const ip = proEIp31Disabled(cc.depth, t) && cc.ip === "IP31" ? "IP65" : cc.ip;
                        upCells({ thickness: t, ip });
                      }}
                        className={`flex-1 rounded-md border px-2 py-1 text-xs font-bold ${
                          cc.thickness === t ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted"
                        }`}>{t} mm</button>
                    ))}
                  </div>
                </div>
                <div>
                  <L>IP rating</L>
                  <div className="flex gap-1">
                    {PRO_E_IPS.map((ip) => {
                      const off = ip === "IP31" && ip31Off;
                      return (
                        <button key={ip} disabled={off}
                          title={off ? "90 cm + 2 mm → IP65 only (RPT-02)" : undefined}
                          onClick={() => !off && upCells({ ip })}
                          className={`flex-1 rounded-md border px-2 py-1 text-xs font-bold ${
                            cc.ip === ip ? "border-brand bg-brand-light text-brand-dark"
                            : off ? "cursor-not-allowed border-line bg-surface text-muted/40" : "border-line bg-white text-muted"
                          }`}>{off && "🔒 "}{ip}</button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            {cc.type !== "Pro-E" && (
              <div className="text-[11px] text-muted">IP54 · 1.5 mm (set automatically for {cc.type})</div>
            )}
          </div>

          <table className="w-full max-w-md text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                <th className="py-1">Item</th><th className="w-24 py-1">Qty</th>
              </tr>
            </thead>
            <tbody>
              {cc.rows.map((r, i) => (
                <tr key={r.desc} className="border-t border-line/70">
                  <td className="py-1 font-medium">{r.desc}{r.locked && <span className="ml-1.5 text-[10px] text-muted">(fixed)</span>}</td>
                  <td className="py-1">
                    {(() => {
                      const setQty = (v: number) => {
                        const rows = cc.rows.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Math.round(v) || 0) } : x));
                        u({ cellConfig: { ...cc, rows } });
                      };
                      return (
                        <div className="inline-flex items-stretch">
                          <input className={`input h-7 w-12 rounded-r-none px-1.5 text-center text-xs ${r.locked ? "bg-surface" : ""}`}
                            type="number" min={0} value={r.qty || ""} disabled={r.locked}
                            onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
                          <div className="flex flex-col">
                            <button type="button" title="Increase" disabled={r.locked} onClick={() => setQty(r.qty + 1)}
                              className="grid h-3.5 w-6 place-items-center rounded-tr-md border border-l-0 border-line text-[8px] leading-none text-muted hover:bg-brand-light hover:text-brand-dark disabled:opacity-30">▲</button>
                            <button type="button" title="Decrease" disabled={r.locked || r.qty <= 0} onClick={() => setQty(r.qty - 1)}
                              className="grid h-3.5 w-6 place-items-center rounded-br-md border border-l-0 border-t-0 border-line text-[8px] leading-none text-muted hover:bg-brand-light hover:text-brand-dark disabled:opacity-30">▼</button>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>{/* /left: config + cells */}
          {/* Copper Tool — beside the panel type */}
          <div className="min-w-0 mt-6 xl:mt-0">
            <CopperToolCard p={p} u={u} />
          </div>
        </div>
      )}
      </div>{/* /LEFT */}

      </div>{/* /grid */}
    </div>
  );
}

// Panel "No. of poles" summary — categorises the panel's DIN-rail components (MCB / RCBO /
// RCCB, contactors + aux + terminal, control gear) and totals their rail width in poles,
// so the enclosure can be sized. Widths come from the Control Design Guide (see lv/poles.ts).
function PolesSummary({ p }: { p: LvPanel }) {
  // Split the DIN-rail poles by feed: Main Incoming vs everything else (Outgoings).
  const pIn = panelPoles(p.components.filter((c) => c.section === "Main Incoming"));
  const pOut = panelPoles(p.components.filter((c) => c.section !== "Main Incoming"));
  const pl = (n: number) => `${n} pole${n === 1 ? "" : "s"}`;
  const groupKinds: Record<PoleGroup, PoleKind[]> = {
    protection: ["mcb", "rcbo", "rccb"],
    contactors: ["af", "esb", "aux", "terminal"],
    control: ["timer", "psu", "relay", "surge"],
  };
  // Per-section: tick the types to include in the total (all on by default). Tracked as the
  // *excluded* set so newly appearing types are counted by default.
  const [exIn, setExIn] = useState<Set<PoleKind>>(new Set());
  const [exOut, setExOut] = useState<Set<PoleKind>>(new Set());
  type Poles = ReturnType<typeof panelPoles>;
  const sumOf = (d: Poles, ex: Set<PoleKind>, kinds: PoleKind[]) =>
    kinds.reduce((s, k) => s + (!ex.has(k) ? (d.rows[k]?.poles || 0) : 0), 0);
  // One Incoming / Outgoings block: section header + total, then the group tables.
  const block = (title: string, d: Poles, ex: Set<PoleKind>, setEx: React.Dispatch<React.SetStateAction<Set<PoleKind>>>) => {
    const toggle = (k: PoleKind) => setEx((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    return (
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="flex items-center justify-between bg-brand-tint/50 px-3 py-1.5 text-[12px] font-extrabold uppercase tracking-wide text-brand-dark">
          <span>{title}</span><span>{pl(sumOf(d, ex, POLE_KINDS))}</span>
        </div>
        {d.total === 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted">No {title.toLowerCase()} DIN-rail items yet.</p>
        ) : (
          (Object.keys(groupKinds) as PoleGroup[]).map((g) => {
            const kinds = groupKinds[g].filter((k) => d.rows[k]?.poles);
            if (!kinds.length) return null;
            return (
              <div key={g}>
                <div className="flex items-center justify-between border-t border-line bg-surface px-3 py-1 text-[11px] font-bold text-muted">
                  <span>{GROUP_LABEL[g]}</span><span>{pl(sumOf(d, ex, kinds))}</span>
                </div>
                <table className="w-full table-fixed text-[13px]">
                  <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 76 }} /></colgroup>
                  <tbody>
                    {kinds.map((k) => (
                      <tr key={k} className={`border-t border-line/50 ${!ex.has(k) ? "" : "opacity-45"}`}>
                        <td className="py-1 pl-3">
                          <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-brand align-middle" checked={!ex.has(k)}
                            title="Include in the total" onChange={() => toggle(k)} />
                        </td>
                        <td className="truncate py-1 pl-1 text-muted">{KIND_LABEL[k]}</td>
                        <td className="whitespace-nowrap py-1 pr-3 text-right font-semibold text-ink">{pl(d.rows[k].poles)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>
    );
  };
  return (
    <div>
      <h2 className="sec-head">No. of poles <span className="text-[11px] font-normal text-muted">— DIN-rail width · 1 pole = {POLE_CM} cm</span></h2>
      {pIn.total === 0 && pOut.total === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
          Add MCB / RCBO / RCCB, contactors or control gear — their pole widths appear here to help size the panel.
        </p>
      ) : (
        <div className="space-y-2.5">
          <div className="grid items-start gap-2.5 sm:grid-cols-2">
            {block("Incoming", pIn, exIn, setExIn)}
            {block("Outgoings", pOut, exOut, setExOut)}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-brand-tint/60 px-3 py-2 text-sm font-extrabold text-brand-dark">
            <span>Total no. poles</span>
            <span>{pl(sumOf(pIn, exIn, POLE_KINDS) + sumOf(pOut, exOut, POLE_KINDS))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// RPT-1: Copper Tool (Cells) — free-text copper lengths per standard rating, with
// live weight (kg) and P/N/E rows highlighted as recommendations from the incomer.
function CopperToolCard({ p, u }: { p: LvPanel; u: (patch: Partial<LvPanel>) => void }) {
  const type = p.cellConfig.type;
  const tool = p.copperTool ?? {};
  const setLen = (rating: number, key: "p" | "n" | "e", val: number) => {
    const cur = tool[String(rating)] ?? { p: 0, n: 0, e: 0 };
    const next = { ...tool, [String(rating)]: { ...cur, [key]: val } };
    // Total busbar copper weight flows into the panel cost.
    u({ copperTool: next, mainBusbarKg: Math.round(copperTotal(type, next) * 10) / 10 });
  };
  const total = copperTotal(type, tool);
  const cell = (rating: number, key: "p" | "n" | "e") => {
    const v = tool[String(rating)]?.[key] ?? 0;
    return (
      <input className="input h-8 w-16 px-1 text-center text-sm" inputMode="decimal" value={v || ""} placeholder="0"
        data-coppercol={key} onKeyDown={copperEnterNav}
        onChange={(e) => setLen(rating, key, parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
    );
  };
  return (
    <div className="flex h-full flex-col rounded-lg border border-line p-3">
      <div className="-mx-3 -mt-3 mb-3 flex items-center justify-between rounded-t-lg border-b border-brand/20 bg-brand-light px-3 py-2">
        <h3 className="text-base font-bold text-brand-dark">Copper Tool</h3>
        <span className="text-sm font-bold text-brand-dark">Busbar copper: {total.toFixed(1)} KG</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="h-full w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-muted">
              <th className="px-1 py-1">Rating</th>
              <th className="px-1 py-1">CSA <span className="normal-case">(mm²)</span></th>
              <th className="px-1 py-1 text-center">Phase L <span className="normal-case">(mm)</span></th>
              <th className="px-1 py-1 text-center">Neutral L <span className="normal-case">(mm)</span></th>
              <th className="px-1 py-1 text-center">Earth L <span className="normal-case">(mm)</span></th>
              <th className="px-1 py-1 text-right">Weight KG</th>
            </tr>
          </thead>
          <tbody>
            {COPPER_RATINGS.map((r) => {
              const csa = csaFor(type, r);
              const row = tool[String(r)] ?? { p: 0, n: 0, e: 0 };
              const wkg = copperWeight(row.p, csa, 3) + copperWeight(row.n, csa, 1) + copperWeight(row.e, csa, 1);
              return (
                <tr key={r} className="border-t border-line/60">
                  <td className="whitespace-nowrap px-1 py-0.5 font-semibold">{r} A</td>
                  <td className="px-1 py-0.5 text-muted">{csa}</td>
                  <td className="px-1 py-0.5 text-center">{cell(r, "p")}</td>
                  <td className="px-1 py-0.5 text-center">{cell(r, "n")}</td>
                  <td className="px-1 py-0.5 text-center">{cell(r, "e")}</td>
                  <td className="px-1 py-0.5 text-right font-semibold">{wkg ? wkg.toFixed(1) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Material List tab (RPT-04) ───────────────────────────────────────────────
interface AbbDiscCtl {
  globalPct: number;
  defaultFor: (r: MatRow) => number;
  valueFor: (r: MatRow) => number;
  isOverride: (r: MatRow) => boolean;
  onChange: (r: MatRow, pct: number) => void;
}
function MatTable({ title, rows, withSupplier, note, abbDisc }: { title: string; rows: MatRow[]; withSupplier?: boolean; note?: string; abbDisc?: AbbDiscCtl }) {
  if (!rows.length) return null;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-baseline justify-between bg-brand-tint px-4 py-2">
        <h3 className="text-sm font-bold text-brand-dark">{title}</h3>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      {/* table-fixed + a shared colgroup keep every table's columns at the same x,
          so the headers of all Material-List tables line up with each other. */}
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col />
          <col style={{ width: 210 }} />
          {abbDisc && <col style={{ width: 110 }} />}
          {withSupplier && <col style={{ width: 150 }} />}
          <col style={{ width: 96 }} />
          <col style={{ width: 72 }} />
        </colgroup>
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
            <th className="px-4 py-1.5">Description</th>
            <th className="px-2 py-1.5">Reference</th>
            {abbDisc && <th className="px-2 py-1.5 text-right">Discount (%)</th>}
            {withSupplier && <th className="px-2 py-1.5">Supplier</th>}
            <th className="px-2 py-1.5">Stock</th>
            <th className="px-4 py-1.5 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line/70">
              <td className="px-4 py-1">{r.description}</td>
              <td className="px-2 py-1 text-[11px] text-muted">{r.reference || "—"}</td>
              {abbDisc && (
                <td className="px-2 py-1 text-right">
                  <input type="number" min={0} max={100} step={0.5}
                    className={`w-16 rounded border px-1.5 py-0.5 text-right text-[12px] focus:outline-none ${
                      abbDisc.isOverride(r) ? "border-brand bg-brand-light font-bold text-brand-dark" : "border-line bg-white text-ink"
                    }`}
                    value={abbDisc.valueFor(r) || ""}
                    title={abbDisc.isOverride(r) ? "Custom — click and clear to follow the default" : `Default ${abbDisc.defaultFor(r)}%${abbDisc.defaultFor(r) === abbDisc.globalPct ? " (Pricing Settings)" : ""}`}
                    onChange={(e) => abbDisc.onChange(r, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
                </td>
              )}
              {withSupplier && <td className="px-2 py-1 text-muted">{r.supplier}</td>}
              <td className="px-2 py-1 text-[11px] text-muted">{r.stock || "—"}</td>
              <td className="px-4 py-1 text-right font-bold">{r.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialTab({ s, qtnNo, abbOnly, setAbbOnly, up }: { s: LvState; qtnNo: string; abbOnly: boolean; setAbbOnly: (v: boolean) => void; up: (patch: Partial<LvState>) => void }) {
  const { confirm, prompt: askFor, dialogs } = useDialogs();
  const ml = useMemo(() => buildMaterialList(s), [s]);
  const empty = !s.panels.length || (!ml.abb.length && !ml.other.length && !ml.abbEnclosures.length && !ml.proE.length && !ml.is2.length && !ml.plpCells.length);
  // Per-item ABB discount (%) — defaults to the Pricing-Settings global, editable
  // per item. Stored by reference||name; drives each ABB item's price in the quote.
  const globalPct = Math.round(s.factors.abbDiscount * 100);
  // Default for a row: ABB products follow the Pricing-Settings global only when supplied
  // from ABB (priced off the EUR import list, eur > 0) — locally-priced EGP items default
  // to 0. Enclosures are quoted at list price and never take the global discount, and every
  // other supplier (incl. cells) defaults to 0. A per-item value still applies to any of them.
  const defFor = (r: MatRow) =>
    r.supplier === "ABB" && (r.eur ?? 0) > 0 ? globalPct : 0;
  const abbDisc: AbbDiscCtl = {
    globalPct,
    defaultFor: defFor,
    valueFor: (r) => s.abbItemDiscounts[abbKey(r)] ?? defFor(r),
    // Highlight only when the value differs from the row's default.
    isOverride: (r) => (s.abbItemDiscounts[abbKey(r)] ?? defFor(r)) !== defFor(r),
    onChange: (r, pct) => {
      const next = { ...s.abbItemDiscounts };
      if (pct === defFor(r)) delete next[abbKey(r)]; // back to default → follow it (no highlight)
      else next[abbKey(r)] = pct;
      up({ abbItemDiscounts: next });
    },
  };
  const overrideCount = Object.keys(s.abbItemDiscounts).length;
  // "Default Discount" — drop every per-item override so all items follow the
  // Pricing-Settings ABB discount again.
  const resetAbbDiscounts = async () => {
    if (!overrideCount) return;
    if (
      !(await confirm({
        title: "Reset the ABB discount",
        message: `${overrideCount} item${overrideCount > 1 ? "s go" : " goes"} back to the Pricing-Settings default of ${globalPct}%.`,
        confirmLabel: "Reset them",
      }))
    )
      return;
    up({ abbItemDiscounts: {} });
  };
  // RPT-1: number report tables sequentially by display order, skipping any
  // hidden/empty section — subsequent sections renumber automatically.
  type Block =
    | { kind: "table"; title: string; rows: MatRow[]; withSupplier?: boolean; note?: string }
    | { kind: "copper"; title: string; kg: number };
  const abbNote = "ABB discount (%) is editable per item · defaults from Pricing Settings";
  const encNote = "Quoted at list price — the ABB discount does not apply · a per-item discount (%) can still be entered";
  const candidates: (Block | false)[] = [
    { kind: "table", title: "ABB Products", rows: ml.abb, note: abbNote },
    !abbOnly && { kind: "table", title: "Other Suppliers", rows: ml.other },
    !abbOnly && { kind: "table", title: "PLP Cells", rows: ml.plpCells },
    { kind: "table", title: "ABB Enclosures", rows: ml.abbEnclosures, note: encNote },
    !abbOnly && { kind: "table", title: "IS2", rows: ml.is2 },
    !abbOnly && { kind: "copper", title: "Copper — total project weight", kg: ml.copperKg },
    !abbOnly && { kind: "table", title: "Pro-E", rows: ml.proE },
  ];
  const visible = candidates.filter((b): b is Block =>
    !!b && (b.kind === "copper" ? b.kg > 0 : b.rows.length > 0));
  // Export the current Material List (same rows/columns as the tables) to a real
  // .xlsx via SheetJS. Filename defaults to "ML-<qtn> Rev NN" (same qtn/rev as the
  // TO/CO PDF export) and is editable; cancelling the prompt skips the export.
  const exportExcel = async () => {
    const def = offerTitle("ML", qtnNo, s.project.revisionNo);
    const name = await askFor({
      title: "Export the Material List",
      message: "Name the Excel file.",
      defaultValue: def,
      confirmLabel: "Export",
    });
    if (name === null) return; // cancelled
    const exportBlocks = visible.map((b) =>
      b.kind === "table"
        ? { ...b, abbDiscPct: b.rows.map((r) => abbDisc.valueFor(r)) }
        : b);
    const ws = XLSX.utils.aoa_to_sheet(materialAoa(exportBlocks as MatBlock[]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material List");
    const trimmed = name.trim() || def;
    XLSX.writeFile(wb, /\.xlsx$/i.test(trimmed) ? trimmed : `${trimmed}.xlsx`);
  };
  return (
    <div className="space-y-4 animate-fade-up">
      {dialogs}
      <div className="flex flex-wrap items-center gap-2">
        {([["ABB M.L", true], ["Full M.L", false]] as [string, boolean][]).map(([label, v]) => (
          <button key={label} onClick={() => setAbbOnly(v)}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold ${
              abbOnly === v ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>{label}</button>
        ))}
        <span className="text-[11px] text-muted">ABB M.L → for ABB discount · Full M.L → supply chain &amp; stock</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={resetAbbDiscounts} disabled={!overrideCount}
            title={`Reset every item's ABB discount to the Pricing-Settings default (${globalPct}%)`}
            className="rounded-full border border-line bg-white px-4 py-1.5 text-xs font-bold text-muted hover:border-brand/40 disabled:opacity-40 no-print">
            ↺ Default Discount{overrideCount ? ` (${overrideCount})` : ""}
          </button>
          {!empty && (
            <button onClick={exportExcel} title="Download the current Material List as an .xlsx file"
              className="rounded-full border border-brand bg-white px-4 py-1.5 text-xs font-bold text-brand-dark hover:bg-brand-light no-print">
              ⬇ Export to Excel
            </button>
          )}
        </div>
      </div>

      {empty ? (
        <div className="card p-10 text-center text-sm text-muted">Configure panels first — the Material List updates automatically.</div>
      ) : (
        <>
          {visible.map((b, i) => b.kind === "table" ? (
            <MatTable key={b.title} title={`${i + 1} · ${b.title}`} rows={b.rows} withSupplier={b.withSupplier} note={b.note}
              abbDisc={abbDisc} />
          ) : (
            <div key={b.title} className="card flex items-center justify-between p-4">
              <h3 className="text-sm font-bold text-brand-dark">{i + 1} · {b.title}</h3>
              <span className="text-lg font-extrabold text-ink">{b.kg.toFixed(1)} KG</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
