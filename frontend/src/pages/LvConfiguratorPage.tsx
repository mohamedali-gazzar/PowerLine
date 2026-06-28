import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getQtn, saveQtn, renameQtn } from "../lv/qtns";
import { useStaff, SALES_MANAGER } from "../staff";
import {
  AMB_TEMPS, NEUTRAL_EARTH, COPPER_TYPES, INCOMING_CABLES, OUTGOING_CABLES, FORMS,
  PANEL_SYSTEMS, CELL_SYSTEMS, PANELS_MAX_INCOMER_A, DOUBLE_FAMILIES,
  COMPONENTS, ENCLOSURES, componentPriceEgp, enclosurePriceEgp, fmtEgp,
  type DbComponent,
} from "../lv/catalog";
import {
  newPanel, duplicatePanel, nextDuplicateName, DEFAULT_SECTIONS, FIXED_SECTIONS, toPanelComponent, freeComponent, uid,
  spacerComponent, isSpacer,
  calcPanel, grandTotals, buildMaterialList, searchComponents,
  type LvState, type LvPanel, type PanelComponent, type MatRow, type PanelCalc, type PanelTypeItem,
} from "../lv/store";
import {
  ATS_TYPES, atsBreakerPool, frameOf, buildAts,
  breakerPool, breakerAmps, buildPhotocell,
  MCC_KINDS, mccKws, mccTypes, buildMcc,
  PFC_DEFAULT, pfcTotalKvar, pfcHeader, buildPfc,
  WD_OPTIONS, buildWd,
  buildIndicationLamps,
  type ComboLine, type AtsTypeId,
} from "../lv/combos";
import { rankSearchOptions } from "../lv/search";
import { materialAoa, type MatBlock } from "../lv/materialExcel";
import * as XLSX from "xlsx";
import {
  PRO_E_DEPTHS, PRO_E_THICKNESS, PRO_E_IPS, IS2_DEPTHS, PLP_DEPTHS,
  proEIp31Disabled, retable, defaultCellConfig, type CellType,
} from "../lv/cells";
import {
  COPPER_RATINGS, csaFor, copperWeight, copperTotal, roundUpRating, pctOf,
} from "../lv/copper";

type Tab = "project" | "pricing" | "panels" | "technical" | "commercial" | "material";
const TABS: Tab[] = ["project", "pricing", "panels", "technical", "commercial", "material"];

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
function Sel<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: readonly T[]; className?: string;
}) {
  return (
    <select className={`input cursor-pointer ${className ?? ""}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
/** Searchable dropdown (RPT-01: enclosure family + sizing must be searchable). */
function SearchSelect({ value, placeholder, options, onPick }: {
  value: string; placeholder: string;
  options: { key: string; label: string; hint?: string }[];
  onPick: (key: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  // Live, flexible filter+rank — see rankSearchOptions (lv/search.ts).
  const shown = useMemo(() => rankSearchOptions(options, q), [q, options]);
  const sel = options.find((o) => o.key === value);
  // Keyboard nav: first option auto-highlighted; ↑/↓ move, Enter picks the highlight.
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setActiveIdx(0); }, [q, open]);
  useEffect(() => { (listRef.current?.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [activeIdx]);
  return (
    <div className="relative">
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
export default function LvConfiguratorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [rec] = useState(() => getQtn(id));
  // RPT-1: history-aware state so the whole workspace supports Undo / Redo.
  const [hist, setHist] = useState<{ past: LvState[]; present: LvState; future: LvState[] }>(
    () => ({ past: [], present: rec?.state ?? null!, future: [] })
  );
  const s = hist.present;
  // Restore the last tab this QTN was on (per-QTN), else the default view.
  const tabKey = `lv-tab-${id}`;
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem(tabKey) as Tab | null;
    return saved && TABS.includes(saved) ? saved : (rec?.state.panels.length ? "panels" : "project");
  });
  const [matAbbOnly, setMatAbbOnly] = useState(false);
  // RPT-1: the QTN number is editable after creation (kept unique in the registry).
  const [qtnNum, setQtnNum] = useState(() => rec?.number ?? "");
  // Renames the QTN in the registry (unique, non-empty). Edited from the Project tab.
  const renameQtnNumber = (n: string): { ok: boolean; error?: string } => {
    if (!rec) return { ok: false, error: "Quotation not found." };
    const res = renameQtn(rec.id, n);
    if (res.ok) setQtnNum(n.trim());
    return res;
  };

  const apply = (updater: (old: LvState) => LvState) =>
    setHist((h) => {
      const next = updater(h.present);
      return next === h.present ? h : { past: [...h.past, h.present].slice(-60), present: next, future: [] };
    });
  const undo = () =>
    setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future].slice(0, 60) } : h));
  const redo = () =>
    setHist((h) => (h.future.length ? { past: [...h.past, h.present].slice(-60), present: h.future[0], future: h.future.slice(1) } : h));
  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;

  useEffect(() => {
    if (!rec) navigate("/lv", { replace: true });
  }, [rec, navigate]);
  useEffect(() => {
    if (rec && s) saveQtn(rec.id, s);
  }, [rec, s]);
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

  const totals = useMemo(() => (s ? grandTotals(s) : { sell: 0, vat: 0, incl: 0 }), [s]);
  if (!rec || !s) return null;
  const sel = s.panels.find((p) => p.id === s.selectedId) ?? null;
  // RPT-1: block every offer/output tab until each panel has its mandatory fields.
  const offerIssues = s.panels.flatMap((p, i) =>
    panelInvalid(p).map((msg) => `Panel ${i + 1}${p.name.trim() ? ` (${p.name.trim()})` : ""}: ${msg}`));

  // immutable update helpers
  const up = (patch: Partial<LvState>) => apply((old) => ({ ...old, ...patch }));
  const upPanel = (id: string, patch: Partial<LvPanel>) =>
    apply((old) => ({ ...old, panels: old.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const addPanel = () => {
    const p = newPanel(s.panels.length + 1);
    apply((old) => ({ ...old, panels: [...old.panels, p], selectedId: p.id }));
    setTab("panels");
  };
  const removePanel = (id: string) =>
    apply((old) => {
      const panels = old.panels.filter((p) => p.id !== id);
      return { ...old, panels, selectedId: panels[0]?.id ?? null };
    });
  const clonePanel = (id: string) =>
    apply((old) => {
      const src = old.panels.find((p) => p.id === id);
      if (!src) return old;
      const copy = duplicatePanel(src, nextDuplicateName(src.name, old.panels));
      const i = old.panels.findIndex((p) => p.id === id);
      const panels = [...old.panels];
      panels.splice(i + 1, 0, copy);
      return { ...old, panels, selectedId: copy.id };
    });

  // Per-tab memory: remember each tab's scroll position (and the last active tab
  // for this QTN), and restore them when you return — instead of resetting.
  const scrollByTab = useRef<Record<string, number>>({});
  const goToTab = (t: Tab) => {
    scrollByTab.current[tab] = window.scrollY; // remember where we were on this tab
    localStorage.setItem(tabKey, t);
    setTab(t);
  };
  useLayoutEffect(() => {
    window.scrollTo(0, scrollByTab.current[tab] ?? 0); // restore the entered tab's position
  }, [tab]);

  // Arrow-key navigation between form fields, based on their on-screen layout —
  // fast keyboard data entry. Left/Right move the text cursor first (navigate
  // only at the start/end); Up/Down navigate. For a CLOSED dropdown (<select>)
  // the arrows navigate too and the native value-cycling is suppressed — the
  // value only changes once the dropdown is opened (Alt+Down / click), after
  // which the OS popup handles the arrows (this handler no longer fires).
  const navRef = useRef<HTMLDivElement>(null);
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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-up no-print">
        <div>
          <Link to="/lv" className="text-xs font-semibold text-brand hover:underline">← All QTNs</Link>
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
            <span className="code-chip">{qtnNum}</span>
            {s.project.name || "LV Quotation"}
          </h1>
          <p className="text-sm text-muted">
            {fmtEgp(totals.sell)} EGP excl. VAT
            {totals.sell > 0 && <> · <strong className="text-ink">{fmtEgp(totals.incl)}</strong> incl. {Math.round(s.factors.vat * 100)}% VAT</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
          <button className="btn-ghost" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
        </div>
      </div>

      {/* Tabs — sticky header so sections are reachable without scrolling up.
          Negative margins let the bg band span the full content width; py keeps a
          solid band so content scrolls cleanly underneath. */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 flex flex-wrap gap-1.5 border-b border-line/60 bg-surface px-4 py-2.5 no-print sm:-mx-6 sm:px-6">
        {([["project", "Project"], ["pricing", "Pricing Settings"], ["panels", "Panels"], ["technical", "Technical Offer"], ["commercial", "Commercial Offer"], ["material", "Material List"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => goToTab(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t ? "border-brand bg-brand text-white shadow-soft" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div ref={navRef} onKeyDown={onFieldArrowNav}>
        {tab === "project" && <ProjectTab s={s} up={up} qtnNum={qtnNum} onRenameQtn={renameQtnNumber} />}
        {tab === "pricing" && <PricingTab s={s} up={up} />}
        {tab === "panels" && (
          <PanelsTab s={s} sel={sel} up={up} upPanel={upPanel}
            onAdd={addPanel} onDel={removePanel} onClone={clonePanel} />
        )}
        {tab === "technical" && (offerIssues.length ? <OfferBlocked issues={offerIssues} /> : <TechnicalTab s={s} qtnNo={qtnNum} />)}
        {tab === "commercial" && (offerIssues.length ? <OfferBlocked issues={offerIssues} /> : <CommercialTab s={s} qtnNo={qtnNum} />)}
        {tab === "material" && (offerIssues.length ? <OfferBlocked issues={offerIssues} /> : <MaterialTab s={s} qtnNo={qtnNum} abbOnly={matAbbOnly} setAbbOnly={setMatAbbOnly} />)}
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
  if (!p.ratingA || p.ratingA <= 0) out.push("Incoming C.B rating is required");
  return out;
}
function OfferBlocked({ issues }: { issues: string[] }) {
  return (
    <div className="card border-amber-300 bg-amber-50 p-6 animate-fade-up">
      <p className="font-bold text-amber-800">⚠ Complete the required panel fields before generating any offer.</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-700">
        {issues.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </div>
  );
}

// ── Offer documents (the configurator's main output) ────────────────────────
function DocHeader({ s, qtnNo, title }: { s: LvState; qtnNo: string; title: string }) {
  const pr = s.project;
  const [staff] = useStaff();
  const mgr = staff.salesManagers.find((m) => m.name === SALES_MANAGER);
  const mgrMobile = mgr?.mobile || "";
  const mgrEmail = mgr?.email || "";
  return (
    <div className="border-b-4 border-brand pb-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-extrabold tracking-tight text-brand">Power<span className="text-ink">Line</span></div>
          <div className="text-[11px] text-muted">Electrical Industries — powerline.com.eg</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-extrabold">{title}</div>
          <div className="font-mono text-sm font-bold text-brand-dark">{qtnNo}</div>
          <div className="text-xs text-muted">{fmtDate(pr.date)}</div>
          {pr.optyNo && <div className="text-xs text-muted">OPTY No.: {pr.optyNo}</div>}
          {pr.revisionNo && <div className="text-xs text-muted">Rev. No.: {pr.revisionNo}</div>}
        </div>
      </div>
      {/* Row 1: Project | Sales(+phone) | Sales mgr(+phone)   Row 2: Customer | Email(Sales) | Email(Sales mgr) */}
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-3">
        <div><span className="text-muted">Project:</span> <b>{pr.name || "—"}</b></div>
        <div><span className="text-muted">Sales:</span> <b>{pr.salesPerson || "—"}</b>{pr.salesMobile && <span className="text-xs text-muted"> · {pr.salesMobile}</span>}</div>
        <div><span className="text-muted">Sales Manager:</span> <b>{SALES_MANAGER}</b>{mgrMobile && <span className="text-xs text-muted"> · {mgrMobile}</span>}</div>
        <div><span className="text-muted">Customer:</span> <b>{pr.customer || "—"}</b></div>
        <div><span className="text-muted">Email:</span> <b className="text-xs">{pr.salesEmail || "—"}</b></div>
        <div><span className="text-muted">Email:</span> <b className="text-xs">{mgrEmail || "—"}</b></div>
      </div>
    </div>
  );
}

// Export name: prefix the document kind to the QTN number ("QTN-26-0001" →
// "TO-QTN-26-0001") and append the 2-digit revision. Used for the TO/CO print
// filename (document.title) and the Material List Excel filename ("ML-…").
function offerTitle(kind: "TO" | "CO" | "ML", qtnNo: string, rev: string): string {
  return `${kind}-${qtnNo} Rev ${String(rev ?? "").padStart(2, "0")}`;
}

function PrintBar({ label, docTitle }: { label: string; docTitle?: string }) {
  // Set the document title right before printing so the saved PDF / print job is
  // named after the offer; restore it once the dialog closes (afterprint).
  const print = () => {
    if (!docTitle) return window.print();
    const prev = document.title;
    document.title = docTitle;
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };
  return (
    <div className="mb-3 flex items-center justify-between no-print">
      <p className="text-xs text-muted">{label}</p>
      <button className="btn-primary" onClick={print}>⬇ PDF / Print</button>
    </div>
  );
}

/** Technical Offer — one document page per panel, in the reference layout:
 *  red item bar (Item No. | name | Item Qty.), red-label spec grid, then the
 *  components table (Qty | Description | Reference | Brand | Poles).
 *  Printing exports ALL panels as one PDF, one page each. */
const TRED = "#F16722"; // brand orange — drives item bar, spec labels & table header
function TechnicalTab({ s, qtnNo }: { s: LvState; qtnNo: string }) {
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
    <td className="border px-2 py-1 text-[12px] font-bold" style={{ color: TRED, background: "#fdf0e9", borderColor: "#f1d3c4" }}>{children}</td>
  );
  const Val = ({ children }: { children?: React.ReactNode }) => (
    <td className="border px-2 py-1 text-[12px]" style={{ borderColor: "#f1d3c4" }}>{children}</td>
  );
  return (
    <div className="animate-fade-up">
      <PrintBar label={`${s.panels.length} panel${s.panels.length > 1 ? "s" : ""} → ${s.panels.length} technical page${s.panels.length > 1 ? "s" : ""} in one PDF.`}
        docTitle={offerTitle("TO", qtnNo, s.project.revisionNo)} />
      <div className="print-area space-y-6">
        {/* Cover page (branded title page) */}
        <section className="tech-cover" style={{ breakAfter: "page" }}>
          <img src="/brand/logo-color.png" alt="PowerLine" className="w-72 max-w-[70%]" />
          <a href="https://www.powerline.com.eg" className="text-sm font-semibold" style={{ color: TRED }}>www.powerline.com.eg</a>
          <div className="mt-8 space-y-1">
            <div className="text-2xl font-extrabold tracking-tight text-ink">Technical Offer</div>
            <div className="text-sm font-bold" style={{ color: TRED }}>{qtnNo}</div>
            {s.project.name && <div className="text-sm text-ink">{s.project.name}</div>}
            {s.project.customer && <div className="text-sm text-muted">{s.project.customer}</div>}
            {s.project.date && <div className="text-xs text-muted">{fmtDate(s.project.date)}</div>}
          </div>
        </section>
        {s.panels.map((p, pi) => {
          const sp = specOf(p);
          return (
            <div key={p.id} className="card overflow-hidden"
              style={pi < s.panels.length - 1 ? { breakAfter: "page" } : undefined}>
              {/* item bar */}
              <table className="w-full border-collapse">
                <tbody>
                  <tr style={{ background: TRED }} className="text-white">
                    <td className="w-44 border-r border-white/40 px-3 py-2 text-sm font-bold">Item No. {pi + 1}</td>
                    <td className="px-3 py-2 text-center text-sm font-bold">{p.name}</td>
                    <td className="w-40 border-l border-white/40 px-3 py-2 text-sm font-bold">Item Qty.</td>
                    <td className="w-24 border-l border-white/40 px-3 py-2 text-center text-sm font-bold">{p.qty}</td>
                  </tr>
                </tbody>
              </table>
              {/* spec grid — 2 label/value pairs per row, like the reference */}
              <table className="w-full border-collapse">
                <tbody>
                  {([
                    ["Panel Type", sp.panelType, "IP", sp.ip],
                    ["Mounting", sp.mount, "Rating", p.ratingA ? `${p.ratingA} A` : ""],
                    ["RAL", sp.ral, "Amb. Temp.", p.ambTemp],
                    ["Copper", p.copperType, "Neutral", p.neutral],
                    ["Incoming Cables", p.incomingCables, "Earth", p.earth],
                    ["Outgoing Cables", p.outgoingCables, "Form", p.form],
                    ["Designation", p.code, "Fed From", p.fedFrom],
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
              {/* components table */}
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ background: TRED }} className="text-white">
                    <th className="w-14 px-2 py-1.5 text-center text-[12px] font-bold">Qty</th>
                    <th className="px-2 py-1.5 text-left text-[12px] font-bold">Description</th>
                    <th className="w-32 px-2 py-1.5 text-left text-[12px] font-bold">Brand</th>
                    <th className="w-40 px-2 py-1.5 text-left text-[12px] font-bold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const secs = p.sections.filter((sec) => p.components.some((c) => c.section === sec));
                    if (secs.length === 0)
                      return (
                        <tr><td colSpan={4} className="px-2 py-5 text-center text-sm text-muted">No components.</td></tr>
                      );
                    // RPT: the orange group sub-labels (Circuit Breaker, Contactor…) only
                    // appear when the panel has MORE THAN ONE section; a single-section
                    // panel prints a clean flat component list under its section header.
                    const multiSection = secs.length > 1;
                    return secs.flatMap((sec) => {
                      const comps = p.components.filter((c) => c.section === sec);
                      const order: string[] = [];
                      const byG = new Map<string, PanelComponent[]>();
                      comps.forEach((c) => {
                        const k = c.group || "";
                        if (!byG.has(k)) { byG.set(k, []); order.push(k); }
                        byG.get(k)!.push(c);
                      });
                      const rows: JSX.Element[] = [];
                      // Section header only when there's MORE THAN ONE section; the orange
                      // group sub-labels (Circuit Breaker, Contactor…) are never shown here.
                      if (multiSection)
                        rows.push(
                          <tr key={`s-${sec}`}>
                            <td colSpan={4} className="border px-2 py-1 text-center text-[12px] font-bold uppercase tracking-wide" style={{ background: "#f3f3f5", borderColor: "#f1d3c4" }}>{sec}</td>
                          </tr>
                        );
                      for (const g of order) {
                        for (const c of byG.get(g)!)
                          rows.push(isSpacer(c) ? (
                            <tr key={c.id}>
                              <td colSpan={4} className="border-y px-2 py-1 text-[12.5px]" style={{ borderColor: "#f3ddd4" }}>&nbsp;</td>
                            </tr>
                          ) : (
                            <tr key={c.id} className="border-b align-top" style={{ borderColor: "#f3ddd4" }}>
                              <td className="px-2 py-1 text-center text-[12.5px] font-semibold">{c.qty}</td>
                              <td className="px-2 py-1 text-[12.5px]">
                                {c.name}
                                {(c.adj || c.comment) && (
                                  <div className="text-[11px] italic text-muted">
                                    {[c.adj && `Adj: ${c.adj}`, c.comment].filter(Boolean).join(" · ")}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1 text-[12.5px]">{c.brand}</td>
                              <td className="px-2 py-1 text-[11.5px] text-muted">{c.note}</td>
                            </tr>
                          ));
                      }
                      return rows;
                    });
                  })()}
                </tbody>
              </table>
              <div className="mt-1 flex justify-between border-t px-1 pt-1 text-[9px] text-muted" style={{ borderColor: "#f1d3c4" }}>
                <span>{qtnNo}</span>
                <span>Item {pi + 1} of {s.panels.length}</span>
                <span>{fmtDate(s.project.date)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Commercial Offer — panel prices at the current Pricing Settings. */
function CommercialTab({ s, qtnNo }: { s: LvState; qtnNo: string }) {
  // RPT-1: selling currency — default USD; EGP-based prices convert via the Pricing rate.
  const [cur, setCur] = useState<"USD" | "EGP">("USD");
  if (!s.panels.length) {
    return <div className="card p-10 text-center text-sm text-muted animate-fade-up">Add panels first — the Commercial Offer is generated from them.</div>;
  }
  const calcs: [LvPanel, PanelCalc][] = s.panels.map((p) => [p, calcPanel(p, s.factors)]);
  const subtotal = calcs.reduce((t, [, c]) => t + c.totalSell, 0);
  const vat = subtotal * s.factors.vat;
  const rate = cur === "USD" ? (s.factors.usd || 1) : 1; // EGP per unit of display currency
  const m = (egp: number) => fmtEgp(egp / rate);
  return (
    <div className="animate-fade-up">
      <PrintBar label="Prices follow the Pricing Settings tab (rates, ABB discount, factor) live."
        docTitle={offerTitle("CO", qtnNo, s.project.revisionNo)} />
      <div className="mb-3 flex items-center gap-2 no-print">
        <span className="text-xs font-semibold text-muted">Currency</span>
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {(["USD", "EGP"] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCur(c)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${cur === c ? "bg-brand text-white" : "text-muted hover:text-brand"}`}>{c}</button>
          ))}
        </div>
      </div>
      <div className="card print-area space-y-5 p-6">
        <DocHeader s={s} qtnNo={qtnNo} title="Commercial Offer" />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-brand text-left text-[10px] uppercase tracking-wide text-muted">
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
                <td className="py-1.5 pr-2">
                  <b>{p.name}</b>
                  <div className="text-[11px] text-muted">
                    {p.encFam} LV distribution panel{p.ratingA ? ` · ${p.ratingA} A incomer` : ""} · Form {p.form} · {p.components.filter((c) => !isSpacer(c)).length} components
                  </div>
                </td>
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
        <p className="border-t border-line pt-2 text-[10px] text-muted">
          Prices in {cur}{cur === "USD" ? ` (1 USD = ${fmtEgp(s.factors.usd)} EGP)` : ""}. Validity per agreement · delivery ex-works PowerLine · {qtnNo}.
        </p>
      </div>
    </div>
  );
}

// ── Project tab (RPT-01) ─────────────────────────────────────────────────────
function ProjectTab({ s, up, qtnNum, onRenameQtn }: {
  s: LvState; up: (p: Partial<LvState>) => void;
  qtnNum: string; onRenameQtn: (n: string) => { ok: boolean; error?: string };
}) {
  const pr = s.project;
  const upPr = (patch: Partial<LvState["project"]>) => up({ project: { ...pr, ...patch } });
  const [staff, setStaff] = useStaff();
  const pickSales = (name: string) => {
    const sp = staff.salesPeople.find((x) => x.name === name);
    upPr({ salesPerson: name, salesMobile: sp?.mobile ?? "", salesEmail: sp?.email ?? "" });
  };
  // Sales manager is fixed (Ali Kamal); his contact comes from the shared registry.
  const mgr = staff.salesManagers.find((m) => m.name === SALES_MANAGER);
  const [newSales, setNewSales] = useState({ name: "", mobile: "", email: "" });
  const [newEng, setNewEng] = useState("");
  // QTN number — editable here; commits to the registry on blur / Enter (kept unique).
  const [qtnDraft, setQtnDraft] = useState(qtnNum);
  const [qtnErr, setQtnErr] = useState("");
  useEffect(() => { setQtnDraft(qtnNum); }, [qtnNum]);
  const commitQtn = () => {
    if (qtnDraft.trim() === qtnNum.trim()) { setQtnErr(""); return; }
    const res = onRenameQtn(qtnDraft);
    setQtnErr(res.ok ? "" : res.error || "Invalid QTN number.");
  };

  return (
    <div className="grid max-w-4xl gap-5 animate-fade-up">
      <div className="card p-5">
        <h2 className="sec-head">Project</h2>
        <p className="mb-3 text-xs text-muted">Used to generate the Technical & Commercial offer cover pages.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Row 1: Project name | Customer */}
          <div><L>Project name</L><input className="input" value={pr.name} onChange={(e) => upPr({ name: e.target.value })} /></div>
          <div><L>Customer</L><input className="input" value={pr.customer} onChange={(e) => upPr({ customer: e.target.value })} /></div>
          {/* Row 2 left (spans the Project-name column): QTN No. + Revision No. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <L>QTN No.</L>
              <input className="input" value={qtnDraft}
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
            <L>Sales support engineer</L>
            <select className="input cursor-pointer" value={pr.supportEngineer} onChange={(e) => upPr({ supportEngineer: e.target.value })}>
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
          {/* Sales person — name + phone side by side, email full width below */}
          <div className="grid content-start gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <L>Sales person</L>
                <select className="input cursor-pointer" value={pr.salesPerson} onChange={(e) => pickSales(e.target.value)}>
                  <option value="">— select —</option>
                  {staff.salesPeople.filter((p) => p.name !== SALES_MANAGER).map((p) => <option key={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div><L>Phone no.</L><input className="input bg-surface" value={pr.salesMobile} readOnly /></div>
            </div>
            <div><L>Sales person email</L><input className="input bg-surface" value={pr.salesEmail} readOnly /></div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="sec-head">Staff lists</h2>
        <p className="mb-3 text-xs text-muted">Editable — <b>shared with the RMU offer form</b>. Add or remove names (RPT-01).</p>
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
  // plain function (NOT a nested component) so inputs keep focus across re-renders
  const num = (k: "euro" | "usd" | "copper" | "sheetMetal" | "operations" | "factor" | "abbDiscount" | "vat",
    label: string, opts?: { step?: number; pct?: boolean; hint?: string }) => (
    <div key={k}>
      <L>{label}</L>
      <input className="input" type="number" step={opts?.step ?? 0.01}
        value={opts?.pct ? Math.round(f[k] * 10000) / 100 : f[k]}
        onChange={(e) => upF(k, opts?.pct ? (parseFloat(e.target.value) || 0) / 100 : parseFloat(e.target.value) || 0)} />
      {opts?.hint && <p className="mt-1 text-[11px] text-muted">{opts.hint}</p>}
    </div>
  );
  return (
    <div className="card max-w-3xl p-5 animate-fade-up">
      <h2 className="sec-head">Pricing Settings</h2>
      <p className="mb-3 text-xs text-muted">
        Exchange rates, material costs, operations and margins — drives the EGP selling price live.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {num("euro", "EUR → EGP")}
        {num("usd", "USD → EGP")}
        {num("copper", "Copper (EGP/kg)", { step: 1 })}
        {num("sheetMetal", "Sheet metal (EGP/kg)", { step: 1 })}
        {num("operations", "Operations (%)", { pct: true })}
        {num("factor", "Selling factor", { hint: "cost ÷ factor = selling price" })}
        {num("abbDiscount", "ABB discount (%)", { pct: true, hint: "Applied to ABB products ONLY (RPT-01)" })}
        {num("vat", "VAT (%)", { pct: true })}
      </div>
    </div>
  );
}

// ── Panels tab ───────────────────────────────────────────────────────────────
function PanelsTab({ s, sel, up, upPanel, onAdd, onDel, onClone }: {
  s: LvState; sel: LvPanel | null;
  up: (p: Partial<LvState>) => void;
  upPanel: (id: string, p: Partial<LvPanel>) => void;
  onAdd: () => void; onDel: (id: string) => void; onClone: (id: string) => void;
}) {
  // Drag-and-drop reorder state (hooks must precede the early return).
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  if (!s.panels.length) {
    return (
      <div className="card p-12 text-center animate-fade-up">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-2xl">⚡</div>
        <p className="text-muted">No panels yet.</p>
        <button className="btn-primary mt-4" onClick={onAdd}>+ Add your first panel</button>
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
      {/* panel list — sticks below the sticky tab header */}
      <div className="card p-3 lg:sticky lg:top-16">
        {s.panels.map((p, i) => {
          const active = p.id === s.selectedId;
          return (
            <div key={p.id}
              onDragOver={(e) => { if (dragId && dragId !== p.id) { e.preventDefault(); if (overId !== p.id) setOverId(p.id); } }}
              onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); dropPanel(p.id); }}
              className={`mb-1.5 flex items-center gap-1 rounded-lg border px-2 py-2 transition-all duration-150 ${
                active ? "border-brand bg-brand-light" : "border-line bg-white hover:bg-brand-tint"
              } ${dragId === p.id ? "scale-[0.98] opacity-40" : ""} ${overId === p.id ? "border-t-2 border-t-brand bg-brand-tint" : ""}`}>
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
              <button onClick={() => up({ selectedId: p.id })} className="ml-2 min-w-0 flex-1 text-left">
                <div className={`truncate text-sm font-bold ${active ? "text-brand-dark" : "text-ink"} ${!p.name.trim() ? "italic text-muted" : ""}`}>{p.name.trim() || "(unnamed panel)"}</div>
              </button>
              <button onClick={() => onClone(p.id)} title="Duplicate panel"
                className="shrink-0 rounded p-1 text-base text-muted transition-colors hover:bg-white hover:text-brand-dark">⧉</button>
              <button onClick={() => onDel(p.id)} title="Delete panel"
                className="shrink-0 rounded p-1 text-base text-red-500 transition-colors hover:bg-white">✕</button>
            </div>
          );
        })}
        <button className="btn-ghost mt-1 w-full" onClick={onAdd}>+ Add panel</button>
      </div>

      {/* editor */}
      {sel && <PanelEditor key={sel.id} s={s} p={sel} upPanel={upPanel} />}
    </div>
  );
}

function PanelEditor({ s, p, upPanel }: {
  s: LvState; p: LvPanel;
  upPanel: (id: string, patch: Partial<LvPanel>) => void;
}) {
  const u = (patch: Partial<LvPanel>) => upPanel(p.id, patch);
  const calc = calcPanel(p, s.factors);

  return (
    <div className="space-y-4">
      {/* Cost summary (RPT-1: shown first, above the panel name & details) */}
      <div className="card p-5">
        <h2 className="sec-head">Panel cost (live)</h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-surface p-2.5">Components<br /><b>{fmtEgp(calc.compCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">Enclosure + kits<br /><b>{fmtEgp(calc.enclCost + calc.kits)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">Copper ({calc.cuWeight.toFixed(1)} kg + busbar)<br /><b>{fmtEgp(calc.cuConnCost + calc.busbarCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">Unit cost + ops<br /><b>{fmtEgp(calc.unitCostOps)} EGP</b></div>
          <div className="rounded-lg bg-brand-light p-2.5 text-brand-dark">Unit selling<br /><b>{fmtEgp(calc.sellUnit)} EGP</b></div>
          <div className="rounded-lg bg-brand p-2.5 text-white">Total ×{p.qty}<br /><b>{fmtEgp(calc.totalSell)} EGP</b></div>
        </div>
      </div>

      {/* Panel details */}
      <div className="card p-5">
        <h2 className="sec-head">Panel details</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><L>Panel name <span className="text-brand">*</span></L>
            <input className={`input ${!p.name.trim() ? "border-red-400 bg-red-50/40" : ""}`} value={p.name}
              placeholder="required" onChange={(e) => u({ name: e.target.value })} /></div>
          <div><L>Fed from</L><input className="input" value={p.fedFrom} onChange={(e) => u({ fedFrom: e.target.value })} /></div>
          <div><L>Quantity</L><input className="input" inputMode="numeric" value={p.qty}
            onChange={(e) => u({ qty: Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, "")) || 1) })} /></div>
          <div><L>Incoming C.B rating (A) <span className="text-brand">*</span></L>
            <input className={`input ${!p.ratingA ? "border-red-400 bg-red-50/40" : ""}`} inputMode="numeric" value={p.ratingA || ""}
              placeholder="e.g. 630" onChange={(e) => u({ ratingA: parseInt(e.target.value.replace(/[^\d]/g, "")) || 0 })} /></div>
          <div><L>Amb. temp</L><Sel value={p.ambTemp as any} onChange={(v) => u({ ambTemp: v })} options={AMB_TEMPS} /></div>
          <div><L>Form</L><Sel value={p.form as any} onChange={(v) => u({ form: v })} options={FORMS} /></div>
          <div><L>Neutral</L><Sel value={p.neutral as any} onChange={(v) => u({ neutral: v })} options={NEUTRAL_EARTH} /></div>
          <div><L>Earth</L><Sel value={p.earth as any} onChange={(v) => u({ earth: v })} options={NEUTRAL_EARTH} /></div>
          <div><L>Copper</L><Sel value={p.copperType as any} onChange={(v) => u({ copperType: v })} options={COPPER_TYPES} /></div>
          <div><L>Incoming cables</L><Sel value={p.incomingCables as any} onChange={(v) => u({ incomingCables: v })} options={INCOMING_CABLES} /></div>
          <div><L>Outgoing cables</L><Sel value={p.outgoingCables as any} onChange={(v) => u({ outgoingCables: v })} options={OUTGOING_CABLES} /></div>
          <div>
            <L>Main busbar Cu (kg)</L>
            <input className="input" type="number" min={0} step={0.5} value={p.mainBusbarKg || ""}
              placeholder="0" onChange={(e) => u({ mainBusbarKg: parseFloat(e.target.value) || 0 })} />
            <p className="mt-1 text-[11px] text-muted">auto for panels · manual for cells</p>
          </div>
          <div>
            <L>Designation</L>
            <input className="input" value={p.code} onChange={(e) => u({ code: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Circuit combinations */}
      <CombosCard p={p} u={u} />

      {/* Components */}
      <ComponentsCard s={s} p={p} u={u} />

      {/* Panel type — placed after Components (enclosure sizings as component-like items) */}
      <SizingCard p={p} u={u} factors={s.factors} />

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

// ── Components card ──────────────────────────────────────────────────────────
function ComponentsCard({ s, p, u }: { s: LvState; p: LvPanel; u: (patch: Partial<LvPanel>) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchComponents(q, 40), [q]);
  const [newSection, setNewSection] = useState("");
  const [editingSec, setEditingSec] = useState<string | null>(null); // custom-section rename
  const [editVal, setEditVal] = useState("");
  const [editComp, setEditComp] = useState<string | null>(null); // row being re-selected
  // Picking a search result opens a small qty popup before the component is added.
  const [pending, setPending] = useState<DbComponent | null>(null);
  const [pendQty, setPendQty] = useState(""); // empty box — typed number becomes the qty (blank = 1)
  const qtyRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // When the qty popup opens, focus + select the field so the quantity can be typed
  // straight from the keyboard (type the number, then Enter to add).
  useEffect(() => { if (pending) { qtyRef.current?.focus(); qtyRef.current?.select(); } }, [pending]);
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
  // Re-select a component from the database, keeping qty / adj / comment / note /
  // section / group; all technical + pricing fields update from the new component.
  const replaceComp = (id: string, c: DbComponent) =>
    u({ components: p.components.map((x) => (x.id === id ? {
      ...x, name: c.n, desc: c.d, ref: c.ref, type: c.t, brand: c.brand, rating: c.r,
      eur: c.eur, egp: c.egp, poles: c.poles, cuP: c.cuP, cuC: c.cuC, stock: c.stock,
    } : x)) });
  const move = (id: string, dir: -1 | 1) => {
    const arr = [...p.components];
    const i = arr.findIndex((c) => c.id === id);
    // swap with previous/next row in the SAME section (order is reflected in the Technical offer)
    const sec = arr[i].section;
    let j = i + dir;
    while (j >= 0 && j < arr.length && arr[j].section !== sec) j += dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    u({ components: arr });
  };
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
  const removeSection = (sec: string) => {
    if (isFixed(sec) || !p.sections.includes(sec)) return;
    // A panel must always keep at least one section to hold its components.
    if (p.sections.length <= 1) {
      alert("A panel needs at least one section — add another before removing this one.");
      return;
    }
    const hasComps = p.components.some((c) => c.section === sec);
    if (hasComps && !confirm(`Remove section “${sec}”? Its components move to another section.`)) return;
    const sections = p.sections.filter((x) => x !== sec);
    // Prefer a remaining default as the new home; otherwise the first section left.
    const fallback = sections.find((x) => DEFAULT_SECTIONS.includes(x)) ?? sections[0];
    u({
      sections,
      components: p.components.map((c) => (c.section === sec ? { ...c, section: fallback } : c)),
      activeSection: p.activeSection === sec ? fallback : p.activeSection,
    });
  };

  // Drop a dragged row onto another row: it takes the target's section (move
  // across sections) and is inserted just before it (reorder).
  const dropOnRow = (targetId: string) => {
    setOverRow(null);
    const dId = dragId;
    setDragId(null);
    if (!dId || dId === targetId) return;
    const arr = [...p.components];
    const from = arr.findIndex((c) => c.id === dId);
    const tgt = arr.find((c) => c.id === targetId);
    if (from < 0 || !tgt) return;
    const moved = { ...arr[from], section: tgt.section };
    arr.splice(from, 1);
    const tIdx = arr.findIndex((c) => c.id === targetId);
    arr.splice(tIdx, 0, moved);
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
    const moved = { ...arr[from], section };
    arr.splice(from, 1);
    let lastIdx = -1;
    for (let i = 0; i < arr.length; i++) if (arr[i].section === section) lastIdx = i;
    if (lastIdx >= 0) arr.splice(lastIdx + 1, 0, moved);
    else arr.push(moved);
    u({ components: arr });
  };

  const add = (c: DbComponent, qty = 1) => {
    u({ components: [...p.components, { ...toPanelComponent(c, p.activeSection), qty: Math.max(1, qty) }] });
    setQ("");
    // Return focus to the search box so the next component can be typed without the mouse.
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  return (
    <div className="card p-5">
      <h2 className="sec-head">Components</h2>

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
          const active = p.activeSection === sec;
          return (
            <span key={sec}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overSec !== sec) setOverSec(sec); } }}
              onDragLeave={() => setOverSec((x) => (x === sec ? null : x))}
              onDrop={(e) => { e.preventDefault(); dropOnSection(sec); }}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                overSec === sec ? "border-brand bg-brand-light text-brand-dark ring-2 ring-brand/50"
                : active ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted hover:border-brand/40"
              }`}>
              <button type="button" data-section={sec} onClick={() => u({ activeSection: sec })}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const idx = p.sections.indexOf(sec);
                  const next = p.sections[idx + (e.key === "ArrowRight" ? 1 : -1)];
                  if (!next) return;
                  u({ activeSection: next });
                  requestAnimationFrame(() => (document.querySelector(`button[data-section="${CSS.escape(next)}"]`) as HTMLElement | null)?.focus());
                }}
                title={dragId ? `Move component to “${sec}”` : undefined}>{sec}</button>
              {!isFixed(sec) && (
                <span className="ml-1 inline-flex items-center gap-0.5 border-l border-line/70 pl-1">
                  <button type="button" title="Rename section" onClick={() => { setEditVal(sec); setEditingSec(sec); }}
                    className="grid h-6 w-6 place-items-center rounded text-sm leading-none text-ink/70 hover:bg-brand-light hover:text-brand-dark">✎</button>
                  <button type="button" title="Remove section" onClick={() => removeSection(sec)}
                    className="grid h-6 w-6 place-items-center rounded text-sm leading-none text-red-500 hover:bg-red-100 hover:text-red-600">✕</button>
                </span>
              )}
            </span>
          );
        })}
        <input className="input h-8 w-36 text-xs" placeholder="New section…" value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newSection.trim()) {
              u({ sections: [...p.sections, newSection.trim()], activeSection: newSection.trim() });
              setNewSection("");
            }
          }} />
        <button type="button" title={`Insert a blank spacer row in “${p.activeSection}”`}
          onClick={() => u({ components: [...p.components, spacerComponent(p.activeSection)] })}
          className="h-8 rounded-full border border-dashed border-line px-3 text-xs font-semibold text-muted hover:border-brand/50 hover:text-brand-dark">
          + Empty row
        </button>
      </div>

      {/* search */}
      <div className="relative mb-3">
        <input ref={searchRef} className="input" placeholder={`Search 2,124 components (name / reference / type / rating) → adds to “${p.activeSection}”`}
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
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
                className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm ${i === activeIdx ? "bg-brand-light" : "hover:bg-brand-tint"}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={() => { setPending(c); setPendQty(""); }}>
                <span>
                  <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{c.t}</span>
                  {c.n}
                  <span className="ml-1 text-[11px] text-muted">{c.ref} · {c.brand}</span>
                </span>
                <b className="shrink-0 text-brand-dark">{fmtEgp(componentPriceEgp(c, s.factors))}</b>
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
              <span className="ml-1 text-[11px] text-muted">{pending.ref} · {pending.brand} → “{p.activeSection}”</span>
            </p>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted">Qty</label>
              <input ref={qtyRef} autoFocus inputMode="numeric" className="input h-9 w-24" placeholder="1" value={pendQty}
                onChange={(e) => setPendQty(e.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") { add(pending, parseInt(pendQty, 10) || 1); setPending(null); } if (e.key === "Escape") setPending(null); }} />
              <button type="button" className="btn-primary h-9 px-4 text-sm" onClick={() => { add(pending, parseInt(pendQty, 10) || 1); setPending(null); }}>Add</button>
              <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* table grouped by section */}
      {p.components.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
          No components — search above or use the combination builders below.
        </p>
      ) : (
        p.sections.filter((sec) => p.components.some((c) => c.section === sec)).map((sec, si, arr) => (
          <div key={sec} className="mb-3">
            <div
              onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overSec !== sec) setOverSec(sec); } }}
              onDragLeave={() => setOverSec((x) => (x === sec ? null : x))}
              onDrop={(e) => { e.preventDefault(); dropOnSection(sec); }}
              className={`mb-1 flex items-center justify-between rounded px-1 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-dark transition ${overSec === sec ? "bg-brand-tint ring-1 ring-brand/40" : ""}`}
            >
              <span>{sec}</span>
              <span className="flex items-center gap-0.5">
                <button type="button" title="Move section up" disabled={si === 0}
                  onClick={() => moveSection(sec, -1)}
                  className="rounded px-1 text-sm leading-none text-muted hover:bg-white hover:text-brand-dark disabled:opacity-25">↑</button>
                <button type="button" title="Move section down" disabled={si === arr.length - 1}
                  onClick={() => moveSection(sec, 1)}
                  className="rounded px-1 text-sm leading-none text-muted hover:bg-white hover:text-brand-dark disabled:opacity-25">↓</button>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="w-5 py-1"></th>
                    <th className="py-1 pr-2">Description</th>
                    <th className="py-1 pr-2">Ref</th>
                    <th className="w-16 py-1 pr-2">Qty</th>
                    <th className="w-20 py-1 pr-2">Adj.</th>
                    <th className="w-28 py-1 pr-2">Comment</th>
                    <th className="w-28 py-1 pr-2">Note</th>
                    <th className="py-1 pr-2 text-right">Total</th>
                    <th className="w-20 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {p.components.filter((c) => c.section === sec).map((c) => isSpacer(c) ? (
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
                        className="cursor-grab select-none py-1 pr-1 text-muted/50 hover:text-brand active:cursor-grabbing">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
                          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
                          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
                        </svg>
                      </td>
                      <td colSpan={6} className="py-1 pr-2">
                        <span className="text-[11px] italic text-muted/50">empty row (spacer)</span>
                      </td>
                      <td className="py-1 pr-2" />
                      <td className="whitespace-nowrap py-1 text-right">
                        <button className="px-1 text-muted hover:text-ink" title="Move up" onClick={() => move(c.id, -1)}>↑</button>
                        <button className="px-1 text-muted hover:text-ink" title="Move down" onClick={() => move(c.id, 1)}>↓</button>
                        <button className="px-1 text-red-500" title="Remove" onClick={() => delComp(c.id)}>✕</button>
                      </td>
                    </tr>
                  ) : (
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
                        className="cursor-grab select-none py-1 pr-1 text-muted/50 hover:text-brand active:cursor-grabbing">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
                          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
                          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
                        </svg>
                      </td>
                      <td className="max-w-[330px] py-1 pr-2">
                        {c.group && <span className="mr-1 rounded bg-brand-light px-1 text-[9px] font-bold text-brand-dark">{c.group}</span>}
                        {c.name}
                        {editComp === c.id && (
                          <ComponentEditSelect current={c}
                            onPick={(nc) => { replaceComp(c.id, nc); setEditComp(null); }}
                            onClose={() => setEditComp(null)} />
                        )}
                      </td>
                      <td className="py-1 pr-2 text-[11px] text-muted">{c.ref}</td>
                      <td className="py-1 pr-2">
                        <input className="input h-7 px-1.5 text-center text-xs" type="number" min={0} value={c.qty}
                          onChange={(e) => setComp(c.id, { qty: Math.max(0, parseFloat(e.target.value) || 0) })} />
                      </td>
                      <td className="py-1 pr-2"><input className="input h-7 px-1.5 text-xs" value={c.adj} placeholder="—"
                        onChange={(e) => setComp(c.id, { adj: e.target.value })} /></td>
                      <td className="py-1 pr-2"><input className="input h-7 px-1.5 text-xs" value={c.comment} placeholder="—"
                        onChange={(e) => setComp(c.id, { comment: e.target.value })} /></td>
                      <td className="py-1 pr-2"><input className="input h-7 px-1.5 text-xs" value={c.note} placeholder="—"
                        onChange={(e) => setComp(c.id, { note: e.target.value })} /></td>
                      <td className="py-1 pr-2 text-right font-semibold">{fmtEgp(componentPriceEgp(c, s.factors) * c.qty)}</td>
                      <td className="whitespace-nowrap py-1 text-right">
                        <button className="px-1 text-muted hover:text-brand-dark" title="Change component" onClick={() => setEditComp(c.id)}>✎</button>
                        <button className="px-1 text-muted hover:text-ink" title="Move up" onClick={() => move(c.id, -1)}>↑</button>
                        <button className="px-1 text-muted hover:text-ink" title="Move down" onClick={() => move(c.id, 1)}>↓</button>
                        <button className="px-1 text-red-500" title="Remove" onClick={() => delComp(c.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// RPT: re-select a component from the database. Shows the full list in database
// order with the current component highlighted in its original position (scrolls
// to it on open), plus a search box. Picking one updates technical + pricing data.
function ComponentEditSelect({ current, onPick, onClose }: {
  current: PanelComponent; onPick: (c: DbComponent) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const curRef = useRef<HTMLButtonElement>(null);
  const isCurrent = (c: DbComponent) => c.ref === current.ref && c.n === current.name;
  const shown = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return COMPONENTS; // full list, in database order
    return COMPONENTS.filter((c) => {
      const hay = `${c.n} ${c.ref} ${c.t} ${c.r} ${c.brand}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [q]);
  useEffect(() => { curRef.current?.scrollIntoView({ block: "center" }); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 p-4 pt-20"
      onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl2 border border-line bg-white shadow-lift"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-line p-3">
          <p className="mb-1.5 text-xs font-bold text-ink">Change component <span className="font-normal text-muted">— current: {current.name}</span></p>
          <input autoFocus className="input h-9 text-sm" placeholder="Search name / reference / type / rating…"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} />
        </div>
        <div className="max-h-[55vh] overflow-auto">
          {shown.length === 0 && <div className="px-3 py-3 text-xs text-muted">No matches.</div>}
          {shown.map((c) => {
            const cur = isCurrent(c);
            return (
              <button key={c.ref + c.n} ref={cur ? curRef : undefined} type="button"
                onMouseDown={() => onPick(c)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-tint ${cur ? "bg-brand-light font-bold text-brand-dark" : ""}`}>
                <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{c.t}</span>
                <span className="min-w-0 flex-1 truncate">{c.n}</span>
                <span className="shrink-0 text-[11px] text-muted">{c.ref} · {c.brand}{cur ? " · current" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Combination builders (RPT-03) ────────────────────────────────────────────
function CombosCard({ p, u }: { p: LvPanel; u: (patch: Partial<LvPanel>) => void }) {
  const [kind, setKind] = useState<"ats" | "photocell" | "mcc" | "pfc" | "wd" | "lamps" | null>(null);
  const [preview, setPreview] = useState<ComboLine[]>([]);
  const [tag, setTag] = useState("");

  const commit = () => {
    if (!preview.length) return;
    // RPT-1: each line keeps its own group header (e.g. ATS → Source 1 / Source 2
    // / Interlock / Control CT; P.F.C → the generated formula header).
    const items = preview.map((l) =>
      l.comp
        ? toPanelComponent(l.comp, p.activeSection, l.qty, l.groupLabel || tag)
        : freeComponent(l.desc, p.activeSection, l.qty, l.groupLabel || tag)
    );
    u({ components: [...p.components, ...items] });
    setPreview([]);
    setKind(null);
  };

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="sec-head mb-0 pb-0 after:hidden">Circuit combinations</h2>
        {p.components.some((c) => c.group) && (
          <button className="text-xs font-semibold text-red-600 hover:underline"
            onClick={() => { if (confirm("Remove ALL generated combinations from this panel?")) u({ components: p.components.filter((c) => !c.group) }); }}>
            ✕ Clear all combinations
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-muted">
        Predefined assemblies — generated from the database, then fully editable in the table above (defaults only).
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {([["lamps", "Indication Lamps"], ["ats", "ATS"], ["photocell", "Photocell"], ["mcc", "MCC starter"], ["pfc", "P.F.C"], ["wd", "WD kit"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setKind(kind === k ? null : k); setPreview([]); }}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${
              kind === k ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>
            + {label}
          </button>
        ))}
      </div>

      {kind === "ats" && <AtsBuilder onPreview={(lines, t) => { setPreview(lines); setTag(t); }} />}
      {kind === "photocell" && <PhotocellBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
      {kind === "mcc" && <MccBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
      {kind === "pfc" && <PfcBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
      {kind === "wd" && <WdBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
      {kind === "lamps" && <LampsBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}

      {preview.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          <div className="mb-1.5 text-xs font-bold text-ink">Preview — {preview.length} items ({tag})</div>
          <div className="max-h-52 overflow-auto">
            {preview.map((l, i) => (
              <div key={i} className="flex justify-between gap-3 border-t border-line/60 py-0.5 text-xs first:border-0">
                <span>
                  <span className="mr-1 rounded bg-white px-1 text-[9px] font-bold text-muted">{l.groupLabel}</span>
                  {l.desc}
                  {!l.comp && <span className="ml-1 text-amber-600" title="Not matched in component DB — added without price">⚠ no price</span>}
                </span>
                <span className="shrink-0 font-semibold">×{l.qty}</span>
              </div>
            ))}
          </div>
          <button className="btn-primary mt-2" onClick={commit}>Add {preview.length} items to “{p.activeSection}”</button>
        </div>
      )}
    </div>
  );
}

function BreakerSelect({ label, value, onPick, pool }: {
  label: string; value: DbComponent | null; onPick: (c: DbComponent) => void; pool: DbComponent[];
}) {
  return (
    <div>
      <L>{label}</L>
      <SearchSelect
        value={value ? `${value.ref}|${value.n}` : ""}
        placeholder="Search breaker…"
        options={pool.map((c) => ({ key: `${c.ref}|${c.n}`, label: c.n, hint: `${c.f} · ${c.r}` }))}
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

function PhotocellBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const pool = useMemo(() => breakerPool(), []);
  const [cb, setCb] = useState<DbComponent | null>(null);
  const [manual, setManual] = useState(0); // manual rating override (A)
  const rating = manual > 0 ? manual : cb ? breakerAmps(cb) : 0;
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <BreakerSelect label="Circuit breaker" value={cb} onPick={(c) => { setCb(c); setManual(0); }} pool={pool} />
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
  useEffect(() => setKw(mccKws(kind)[0] ?? ""), [kind]);
  const types = useMemo(() => mccTypes(kind, kw), [kind, kw]);
  const [type, setType] = useState(1);
  useEffect(() => setType(types[0] ?? 1), [types]);
  const [withCtl, setWithCtl] = useState(true);
  const [qty, setQty] = useState(1); // RPT-1: quantity for this combination
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div><L>Starter</L><Sel value={kind as any} onChange={(v) => setKind(v)} options={MCC_KINDS as any} className="w-36" /></div>
        <div><L>Motor (kW)</L><Sel value={kw as any} onChange={(v) => setKw(v)} options={kws as any} className="w-32" /></div>
        <div><L>Type</L><Sel value={String(type) as any} onChange={(v) => setType(+v)} options={types.map(String) as any} className="w-24" /></div>
        <div><L>Qty</L><input className="input w-20" inputMode="numeric" value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, "")) || 1))} /></div>
        <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-ink">
          <input type="checkbox" checked={withCtl} onChange={(e) => setWithCtl(e.target.checked)} /> + control acc.
        </label>
        <button className="btn-ghost" onClick={() => onPreview(buildMcc(kind, kw, type, withCtl, qty), `MCC ${kind} ${kw}${qty > 1 ? ` ×${qty}` : ""}`)}>Generate combination</button>
      </div>
    </div>
  );
}

function PfcBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const pool = useMemo(() => breakerPool(), []);
  const [cb, setCb] = useState<DbComponent | null>(null);
  const [i, setI] = useState({ ...PFC_DEFAULT });
  const tot = pfcTotalKvar(i);
  const header = pfcHeader(i);
  // plain functions (not nested components) so inputs keep focus while typing
  const num = (k: "kvar" | "fixedSteps" | "var1Steps" | "var2Steps", label: string) => (
    <div key={k}>
      <L>{label}</L>
      <input className="input w-28" type="number" min={0} value={i[k]}
        onChange={(e) => setI({ ...i, [k]: parseInt(e.target.value) || 0 })} />
    </div>
  );
  const kvarSel = (k: "fixedKvar" | "var1Kvar" | "var2Kvar", label: string) => (
    <div key={k}>
      <L>{label}</L>
      <select className="input w-28 cursor-pointer" value={i[k]} onChange={(e) => setI({ ...i, [k]: +e.target.value as 25 | 50 })}>
        <option value={25}>25 kVAR</option><option value={50}>50 kVAR</option>
      </select>
    </div>
  );
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="mb-2 text-[11px] text-muted">Phase 1: 400 V systems, 25/50 kVAR steps only (RPT-03).</p>
      {/* P.F.C. main circuit breaker — pick from the catalogue (rating auto-derived), or type a rating */}
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <BreakerSelect label="P.F.C. circuit breaker *" value={cb}
          onPick={(c) => { setCb(c); setI((x) => ({ ...x, cbRating: breakerAmps(c) })); }} pool={pool} />
        <div>
          <L>C.B rating (A) <span className="text-[11px] font-normal text-muted">— auto from C.B, or type manually</span></L>
          <input className={`input ${!i.cbRating ? "border-red-400 bg-red-50/40" : ""}`} inputMode="numeric"
            value={i.cbRating || ""} placeholder="e.g. 250"
            onChange={(e) => { setI({ ...i, cbRating: parseInt(e.target.value.replace(/[^\d]/g, "")) || 0 }); setCb(null); }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {num("kvar", "Required kVAR")}
        <div />
        {num("fixedSteps", "Fixed steps")}{kvarSel("fixedKvar", "Fixed step kVAR")}
        {num("var1Steps", "Var. steps 1")}{kvarSel("var1Kvar", "Var.1 step kVAR")}
        {num("var2Steps", "Var. steps 2")}{kvarSel("var2Kvar", "Var.2 step kVAR")}
      </div>
      <p className={`mt-2 text-xs font-semibold ${tot >= i.kvar ? "text-green-700" : "text-amber-700"}`}>
        Configured: {tot} kVAR {i.kvar ? `of ${i.kvar} required` : ""} {tot >= i.kvar ? "✓" : "— short by " + (i.kvar - tot)}
      </p>
      <div className="mt-2 rounded bg-surface px-2 py-1 text-[11px] font-semibold text-ink">Header: {header}</div>
      <button className="btn-ghost mt-2" disabled={!i.cbRating}
        onClick={() => i.cbRating && onPreview(buildPfc(i, cb ?? undefined), "P.F.C")}>Generate combination</button>
    </div>
  );
}

function WdBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const [key, setKey] = useState(WD_OPTIONS[0]?.key ?? "");
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <L>Frame · poles</L>
          <select className="input w-48 cursor-pointer" value={key} onChange={(e) => setKey(e.target.value)}>
            {WD_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <button className="btn-ghost" onClick={() => onPreview(buildWd(key), "WD kit")}>Generate kit</button>
      </div>
      <p className="mt-2 text-[11px] text-muted">Adds the fixed part + moving part kit for the selected withdrawable breaker.</p>
    </div>
  );
}

function LampsBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="mb-2 text-[11px] text-muted">
        Red / Green / Yellow pilot lights (LED 230 V AC) — 1 each.
      </p>
      <button className="btn-ghost" onClick={() => onPreview(buildIndicationLamps(), "Indication Lamps")}>Generate set</button>
    </div>
  );
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
  // the width (60/80) may vary.
  const slot1Sel = (p.panelItems ?? []).find((it) => (it.slot ?? 1) === 1) ?? null;
  const slot1Enc = slot1Sel ? ENCLOSURES.find((e) => e.ref === slot1Sel.ref && e.name === slot1Sel.name) : undefined;
  const sizing2Pool = sizing1Pool.filter((e) =>
    (e.W === 600 || e.W === 800) && (!slot1Enc || (e.H === slot1Enc.H && e.D === slot1Enc.D)));

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
  const setFamily = (family: string) => u({ panelsSizing: { ...ps, family }, panelItems: [] });
  const keyOf = (it: PanelTypeItem | null) => (it ? `${it.name}|${it.ref}` : "");

  return (
    <div className="card p-5">
      <h2 className="sec-head">Panel type</h2>
      {/* Step 1 — choose what this panel is built from. Only the chosen section
          renders below; switching modes clears the other one's selection. */}
      <div className="mb-4">
        <L>Panels or Cells?</L>
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={panelsLocked}
            onClick={() => { if (p.sizingMode !== "panels") u({ sizingMode: "panels", cellConfig: defaultCellConfig() }); }}
            title={panelsLocked ? `Incomer > ${PANELS_MAX_INCOMER_A} A — cells only (RPT-01)` : undefined}
            className={`rounded-xl border-2 px-4 py-3 text-left transition ${
              p.sizingMode === "panels"
                ? "border-brand bg-brand-tint shadow-soft"
                : panelsLocked
                ? "cursor-not-allowed border-line bg-surface opacity-50"
                : "border-line bg-white hover:border-brand/50 hover:bg-brand-tint/40"
            }`}
          >
            <div className={`text-sm font-bold ${p.sizingMode === "panels" ? "text-brand-dark" : "text-ink"}`}>
              {panelsLocked && "🔒 "}Panels
            </div>
            <div className="mt-0.5 text-[11px] text-muted">Standard enclosures · Single / Double</div>
          </button>
          <button
            onClick={() => { if (p.sizingMode !== "cells") u({ sizingMode: "cells", panelItems: [] }); }}
            className={`rounded-xl border-2 px-4 py-3 text-left transition ${
              p.sizingMode === "cells"
                ? "border-brand bg-brand-tint shadow-soft"
                : "border-line bg-white hover:border-brand/50 hover:bg-brand-tint/40"
            }`}
          >
            <div className={`text-sm font-bold ${p.sizingMode === "cells" ? "text-brand-dark" : "text-ink"}`}>Cells</div>
            <div className="mt-0.5 text-[11px] text-muted">Pro-E / IS2 / PLP cell systems</div>
          </button>
        </div>
        {panelsLocked && (
          <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
            Incoming C.B &gt; {PANELS_MAX_INCOMER_A} A → Panels disabled (cells only)
          </p>
        )}
      </div>

      {p.sizingMode === "none" ? (
        <p className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-muted">
          Choose <b className="text-ink">Panels</b> or <b className="text-ink">Cells</b> above to configure this panel.
        </p>
      ) : p.sizingMode === "panels" ? (
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <L>Layout</L>
              <div className="flex gap-1.5">
                {(["Single", "Double"] as const).map((l) => (
                  <button key={l} onClick={() => setLayout(l)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-bold ${
                      ps.layout === l ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted"
                    }`}>{l}</button>
                ))}
              </div>
              {ps.layout === "Double" && <p className="mt-1 text-[11px] text-muted">Double: SR-Basic / Unikit only · 2nd width 60/80 (RPT-02)</p>}
            </div>
            <div>
              <L>Enclosure family</L>
              <Sel value={ps.family as any} onChange={(v) => setFamily(v)} options={famOptions as any} />
            </div>
            <div className={ps.layout === "Double" ? "" : "sm:col-span-2"}>
              <L>{ps.layout === "Double" ? "Sizing (1)" : "Sizing"}</L>
              <SearchSelect value={keyOf(slotItem(1))} placeholder="Search size — one selection…"
                options={sizing1Pool.map((e) => ({
                  key: `${e.name}|${e.ref}`,
                  label: e.name,
                  hint: `${e.ref} · ${fmtEgp(enclosurePriceEgp(e, factors))} EGP`,
                }))}
                onPick={(k) => setSlot(1, sizing1Pool.find((x) => `${x.name}|${x.ref}` === k) ?? null)} />
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
                  onPick={(k) => setSlot(2, sizing2Pool.find((x) => `${x.name}|${x.ref}` === k) ?? null)} />
              </div>
            )}
          </div>

          {/* the selected enclosure(s) — one per slot */}
          {items.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-line p-3 text-center text-xs text-muted">
              No panel selected — pick one sizing above.
            </p>
          ) : (
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
        <div>
          <div className="mb-3 grid gap-3 sm:grid-cols-4">
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
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-bold ${
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
                        className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-bold ${
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
                          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-bold ${
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
              <div className="sm:col-span-2 self-end text-[11px] text-muted">IP54 · 1.5 mm (set automatically for {cc.type})</div>
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
                    <input className={`input h-7 w-20 px-1.5 text-center text-xs ${r.locked ? "bg-surface" : ""}`}
                      type="number" min={0} value={r.qty} disabled={r.locked}
                      onChange={(e) => {
                        const rows = cc.rows.map((x, j) => (j === i ? { ...x, qty: Math.max(0, parseInt(e.target.value) || 0) } : x));
                        u({ cellConfig: { ...cc, rows } });
                      }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <CopperToolCard p={p} u={u} />
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
  const inc = p.ratingA || 0;
  const hiP = inc ? roundUpRating(inc) : 0;
  const hiN = inc ? roundUpRating(inc * pctOf(p.neutral)) : 0;
  const hiE = inc ? roundUpRating(inc * pctOf(p.earth)) : 0;
  const total = copperTotal(type, tool);
  const cell = (rating: number, key: "p" | "n" | "e", hi: boolean, color: string) => {
    const v = tool[String(rating)]?.[key] ?? 0;
    return (
      <input className="input h-7 w-16 px-1 text-center text-xs" inputMode="decimal" value={v || ""} placeholder="0"
        style={hi ? { boxShadow: `inset 0 0 0 2px ${color}`, background: `${color}22`, color, fontWeight: 700 } : undefined}
        onChange={(e) => setLen(rating, key, parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
    );
  };
  return (
    <div className="mt-4 rounded-lg border border-line p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Copper Tool <span className="text-[11px] font-normal text-muted">· {type} · lengths in mm</span></h3>
        <span className="text-xs font-bold text-brand-dark">Busbar copper: {total.toFixed(1)} kg</span>
      </div>
      <p className="mb-1 text-[11px] text-muted">Enter the required copper length per rating. Recommended cells are highlighted (all values stay editable):</p>
      {inc > 0 ? (
        <p className="mb-2 text-[11px] font-semibold">
          <span style={{ color: "#dc2626" }}>Phase {hiP} A</span> ·{" "}
          <span style={{ color: "#111827" }}>Neutral {hiN} A</span> ·{" "}
          <span style={{ color: "#16a34a" }}>Earth {hiE} A</span>
          <span className="font-normal text-muted"> — from {inc} A incomer (N {Math.round(pctOf(p.neutral) * 100)}% · E {Math.round(pctOf(p.earth) * 100)}%)</span>
        </p>
      ) : (
        <p className="mb-2 text-[11px] text-muted">Set the panel's Incoming C.B rating to get Phase / Neutral / Earth recommendations.</p>
      )}
      <div className="overflow-auto">
        <table className="w-full min-w-[460px] text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="px-1 py-1">Rating</th>
              <th className="px-1 py-1">CSA <span className="normal-case">(mm²)</span></th>
              <th className="px-1 py-1 text-center">Phase L <span className="normal-case">(mm)</span></th>
              <th className="px-1 py-1 text-center">Neutral L <span className="normal-case">(mm)</span></th>
              <th className="px-1 py-1 text-center">Earth L <span className="normal-case">(mm)</span></th>
              <th className="px-1 py-1 text-right">Weight kg</th>
            </tr>
          </thead>
          <tbody>
            {COPPER_RATINGS.map((r) => {
              const csa = csaFor(type, r);
              const row = tool[String(r)] ?? { p: 0, n: 0, e: 0 };
              const wkg = copperWeight(row.p, csa, 3) + copperWeight(row.n, csa, 1) + copperWeight(row.e, csa, 1);
              return (
                <tr key={r} className="border-t border-line/60">
                  <td className="whitespace-nowrap px-1 py-0.5 font-semibold">{r} A
                    {hiP === r && <span className="ml-1 rounded px-1 text-[9px] font-bold text-white" style={{ background: "#dc2626" }}>P</span>}
                    {hiN === r && <span className="ml-1 rounded px-1 text-[9px] font-bold text-white" style={{ background: "#111827" }}>N</span>}
                    {hiE === r && <span className="ml-1 rounded px-1 text-[9px] font-bold text-white" style={{ background: "#16a34a" }}>E</span>}
                  </td>
                  <td className="px-1 py-0.5 text-muted">{csa}</td>
                  <td className="px-1 py-0.5 text-center">{cell(r, "p", hiP === r, "#dc2626")}</td>
                  <td className="px-1 py-0.5 text-center">{cell(r, "n", hiN === r, "#111827")}</td>
                  <td className="px-1 py-0.5 text-center">{cell(r, "e", hiE === r, "#16a34a")}</td>
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
function MatTable({ title, rows, withSupplier, note }: { title: string; rows: MatRow[]; withSupplier?: boolean; note?: string }) {
  if (!rows.length) return null;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-baseline justify-between bg-brand-tint px-4 py-2">
        <h3 className="text-sm font-bold text-brand-dark">{title}</h3>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
            <th className="px-4 py-1.5">Description</th>
            <th className="px-2 py-1.5">Reference</th>
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

function MaterialTab({ s, qtnNo, abbOnly, setAbbOnly }: { s: LvState; qtnNo: string; abbOnly: boolean; setAbbOnly: (v: boolean) => void }) {
  const ml = useMemo(() => buildMaterialList(s), [s]);
  const empty = !s.panels.length || (!ml.abb.length && !ml.other.length && !ml.abbEnclosures.length && !ml.proE.length && !ml.is2.length && !ml.plpCells.length);
  // RPT-1: number report tables sequentially by display order, skipping any
  // hidden/empty section — subsequent sections renumber automatically.
  type Block =
    | { kind: "table"; title: string; rows: MatRow[]; withSupplier?: boolean; note?: string }
    | { kind: "copper"; title: string; kg: number };
  const abbNote = s.factors.abbDiscount > 0
    ? `ABB discount ${Math.round(s.factors.abbDiscount * 100)}% applies to this table only`
    : "ABB discount applies to this table only";
  const candidates: (Block | false)[] = [
    { kind: "table", title: "ABB Products", rows: ml.abb, note: abbNote },
    !abbOnly && { kind: "table", title: "Other Suppliers", rows: ml.other, withSupplier: true },
    !abbOnly && { kind: "table", title: "PLP Cells", rows: ml.plpCells },
    { kind: "table", title: "ABB Enclosures", rows: ml.abbEnclosures },
    !abbOnly && { kind: "table", title: "IS2", rows: ml.is2 },
    !abbOnly && { kind: "copper", title: "Copper — total project weight", kg: ml.copperKg },
    !abbOnly && { kind: "table", title: "Pro-E", rows: ml.proE },
  ];
  const visible = candidates.filter((b): b is Block =>
    !!b && (b.kind === "copper" ? b.kg > 0 : b.rows.length > 0));
  // Export the current Material List (same rows/columns as the tables) to a real
  // .xlsx via SheetJS. Filename defaults to "ML-<qtn> Rev NN" (same qtn/rev as the
  // TO/CO PDF export) and is editable; cancelling the prompt skips the export.
  const exportExcel = () => {
    const def = offerTitle("ML", qtnNo, s.project.revisionNo);
    const name = window.prompt("Excel file name:", def);
    if (name === null) return; // cancelled
    const ws = XLSX.utils.aoa_to_sheet(materialAoa(visible as MatBlock[]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material List");
    const trimmed = name.trim() || def;
    XLSX.writeFile(wb, /\.xlsx$/i.test(trimmed) ? trimmed : `${trimmed}.xlsx`);
  };
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-wrap items-center gap-2">
        {([["ABB M.L", true], ["Full M.L", false]] as [string, boolean][]).map(([label, v]) => (
          <button key={label} onClick={() => setAbbOnly(v)}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold ${
              abbOnly === v ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>{label}</button>
        ))}
        <span className="text-[11px] text-muted">ABB M.L → for ABB discount · Full M.L → supply chain &amp; stock</span>
        {!empty && (
          <button onClick={exportExcel} title="Download the current Material List as an .xlsx file"
            className="ml-auto rounded-full border border-brand bg-white px-4 py-1.5 text-xs font-bold text-brand-dark hover:bg-brand-light no-print">
            ⬇ Export to Excel
          </button>
        )}
      </div>

      {empty ? (
        <div className="card p-10 text-center text-sm text-muted">Configure panels first — the Material List updates automatically.</div>
      ) : (
        <>
          {visible.map((b, i) => b.kind === "table" ? (
            <MatTable key={b.title} title={`${i + 1} · ${b.title}`} rows={b.rows} withSupplier={b.withSupplier} note={b.note} />
          ) : (
            <div key={b.title} className="card flex items-center justify-between p-4">
              <h3 className="text-sm font-bold text-brand-dark">{i + 1} · {b.title}</h3>
              <span className="text-lg font-extrabold text-ink">{b.kg.toFixed(1)} kg</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
