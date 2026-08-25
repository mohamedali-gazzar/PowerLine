import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listQtns, listAllQtns, deleteQtn, restoreQtn, duplicateQtn, amendQtn, supersededNumbers, parseRevision, type QtnListItem } from "../lv/qtns";
import { useDialogs } from "../components/ConfirmModal";
import { api, QTN_STATUSES, QTN_STATUS_LABEL, QTN_STATUS_STYLE, type QtnStatus } from "../api";
import type { Offer } from "../types";
import { useAuth } from "../auth/AuthContext";
import { useAutoRefresh, useChangedKeys } from "../hooks/useAutoRefresh";
import { fmtEgp, DEFAULT_FACTORS } from "../lv/catalog";
import { fmtActive } from "../components/ActiveTimeBadge";

// Status-filter value for superseded LV revisions. "Cancelled" is derived from the
// revision numbers, not a stored status, so it needs a sentinel that can never collide
// with a real status.
const CANCELLED_FILTER = "__cancelled__";

// RMU offers now share the LV approval lifecycle (Draft → … → Submitted), so they
// use the same QTN_STATUS_LABEL / QTN_STATUS_STYLE as LV — no separate RMU statuses.

/** RMU offer total as USD incl. VAT, to sit in the same column as the LV total.
 *  Uses the offer's own frozen commercial figure; converts from EGP with the offer's
 *  stored rate. Returns null when it can't be determined (shown as "—"). */
function rmuTotalUsd(o: Offer): number | null {
  const incl = o.commercial?.totalInclVat ?? null;
  if (incl == null || !Number.isFinite(incl)) return null;
  const cur = (o.currency || "").toUpperCase();
  if (cur === "USD") return incl;
  if (o.usdToEgpRate && o.usdToEgpRate > 0) return incl / o.usdToEgpRate; // stored in EGP
  return null;
}

type Kind = "LV" | "RMU";
/** One row of the unified history — an LV quotation or an RMU offer, normalised to
 *  a shared shape so both render in the same table. `lv` / `rmu` keep the raw record
 *  for the row's actions. */
interface UniRow {
  kind: Kind;
  id: string;
  number: string;
  updatedAt: string;
  projectName: string;
  customer: string;
  units: string; // LV: panel count · RMU: "N ways"
  totalUsd: number | null;
  activeSeconds?: number; // LV: accumulated hands-on time (RMU not tracked yet)
  statusKey: string;
  statusLabel: string;
  statusStyle: string;
  ownerEmail?: string;
  ownerName?: string;
  approverEmail?: string;
  removedAt?: string | null;
  removedBy?: string;
  cancelled?: boolean; // LV superseded revision
  revisionNo?: number; // LV Project-tab revision (0 = original)
  lv?: QtnListItem;
  rmu?: Offer;
}

// ── Action icons (16px, stroke = currentColor) ────────────────────────────────
const AmendIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
const DuplicateIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
const TrashIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" /></svg>
);
const RestoreIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
);

function Act({ title, onClick, disabled, danger, children }: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md border transition ${
        disabled
          ? "cursor-not-allowed border-line text-muted/30"
          : danger
          ? "border-line text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500"
          : "border-line text-muted hover:border-brand/40 hover:bg-brand-tint hover:text-brand-dark"
      }`}
    >
      {children}
    </button>
  );
}

/** Offer History — every LV quotation and RMU offer in one list. Creating a new QTN
 *  lives on the Home dashboard only ("+ New QTN"); this page just lists + opens them. */
export default function LvQtnListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm, dialogs } = useDialogs();
  const [qtns, setQtns] = useState<QtnListItem[] | null>(null); // null = first load in flight
  const [offers, setOffers] = useState<Offer[] | null>(null);
  /** True when the LV list holds every user's quotations, not just the signed-in one's. */
  const [scopeAll, setScopeAll] = useState(false);
  const [myPerms, setMyPerms] = useState<string[]>([]);
  /** Owner-only: also list the LV quotations that have been removed, so they can be
   *  reviewed and restored. Off by default — removed means out of the way. */
  const [showRemoved, setShowRemoved] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | Kind>("");
  const [status, setStatus] = useState<string>("");
  const [owner, setOwner] = useState("");
  const [approver, setApprover] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const reload = async () => {
    // Which LV list this page may show is the server's call, so ask before fetching:
    // /qtns/all 403s for everyone without qtn.viewAll and would blank the page.
    let all = false;
    try {
      const acc = await api.access.me();
      all = acc.perms.includes("qtn.viewAll");
      setMyPerms(acc.perms);
    } catch {
      /* unreadable access record — fall back to the personal list */
    }
    // LV quotations. Drafts are now always included (history shows work in progress
    // too); removed ones only when the owner asks.
    try {
      const rows = all
        ? await listAllQtns({ includeRemoved: showRemoved, includeDrafts: true })
        : await listQtns();
      setScopeAll(all);
      setQtns(rows);
      setLoadErr("");
    } catch (e) {
      const msg = (e as Error).message || "Could not load the quotations.";
      if (all) {
        try {
          setQtns(await listQtns());
          setScopeAll(false);
          setLoadErr(`${msg} — showing your own quotations instead.`);
        } catch {
          setQtns([]);
          setScopeAll(false);
          setLoadErr(msg);
        }
      } else {
        setQtns([]);
        setScopeAll(false);
        setLoadErr(msg);
      }
    }
    // RMU offers (always the signed-in user's own — the server scopes them). A failure
    // here must not blank the LV list, so it is swallowed to an empty RMU set.
    try {
      setOffers(await api.listOffers({ includeRemoved: showRemoved }));
    } catch {
      setOffers([]);
    }
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRemoved]);
  useAutoRefresh(() => reload(), 30_000);

  // Ticks so the green "being edited now" dot appears/clears on its own between the
  // 30s data refreshes (a draft goes idle a minute after its last autosave).
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // LV QTN numbers superseded by a higher revision — shown as "Cancelled". Numbers
  // repeat across users, so revisions are matched within one owner's numbering only.
  const cancelledIds = useMemo(() => {
    const byOwner = new Map<string, QtnListItem[]>();
    for (const x of qtns ?? []) {
      const g = byOwner.get(x.ownerEmail || "");
      if (g) g.push(x); else byOwner.set(x.ownerEmail || "", [x]);
    }
    const out = new Set<string>();
    for (const group of byOwner.values()) {
      const dead = supersededNumbers(group.map((x) => x.number));
      for (const x of group) if (dead.has(x.number)) out.add(x.id);
    }
    return out;
  }, [qtns]);

  // Normalise both sources into one recency-ordered list.
  const rows = useMemo<UniRow[]>(() => {
    const lv: UniRow[] = (qtns ?? []).map((x) => {
      const st = (x.status ?? "DRAFT") as QtnStatus;
      return {
        kind: "LV", id: x.id, number: x.number, updatedAt: x.updatedAt,
        projectName: x.projectName, customer: x.customer,
        units: String(x.panels ?? 0),
        totalUsd: Number.isFinite(x.totalEgp) ? x.totalEgp / DEFAULT_FACTORS.usd : null,
        activeSeconds: x.activeSeconds ?? 0,
        statusKey: st, statusLabel: QTN_STATUS_LABEL[st], statusStyle: QTN_STATUS_STYLE[st],
        ownerEmail: x.ownerEmail, ownerName: x.ownerName, approverEmail: x.approverEmail,
        removedAt: x.removedAt, removedBy: x.removedBy, cancelled: cancelledIds.has(x.id),
        revisionNo: x.revisionNo, lv: x,
      };
    });
    const rmu: UniRow[] = (offers ?? []).map((o) => ({
      // Show the customer-facing QTN number (QTN-26-####) like LV, not the internal
      // PL-YYYY-#### offer number; fall back to it only if no QTN was entered.
      kind: "RMU", id: o.id, number: o.quotationNo || o.offerNumber, updatedAt: o.updatedAt,
      projectName: o.projectName, customer: o.customer,
      units: `${o.generated?.summary?.totalCubicles ?? 0} ways`,
      totalUsd: rmuTotalUsd(o),
      activeSeconds: o.activeSeconds ?? 0,
      // RMU offers now use the same 5-stage approval status as LV, so they share
      // the LV labels/styles. (The API's offerStatus() maps any legacy SENT/WON/LOST
      // to Draft/Submitted, so o.status is always one of the five.)
      statusKey: o.status as QtnStatus,
      statusLabel: o.statusLabel ?? QTN_STATUS_LABEL[o.status as QtnStatus] ?? o.status,
      statusStyle: QTN_STATUS_STYLE[o.status as QtnStatus] ?? "bg-slate-100 text-slate-600",
      ownerEmail: o.ownerEmail, ownerName: o.ownerName, approverEmail: o.approverEmail,
      rmu: o,
    }));
    return [...lv, ...rmu].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [qtns, offers, cancelledIds]);

  const loading = qtns === null && offers === null;
  const justChanged = useChangedKeys(rows, (r) => r.id, (r) => `${r.updatedAt}|${r.statusKey}`);

  // Filter options derived from the fetched LV rows (RMU offers carry no owner/approver).
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of qtns ?? []) if (x.ownerEmail) m.set(x.ownerEmail, x.ownerName || x.ownerEmail);
    return [...m].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [qtns]);
  const approvers = useMemo(
    () => [...new Set((qtns ?? []).map((x) => x.approverEmail).filter(Boolean))].sort(),
    [qtns]
  );

  const filtersOn = Boolean(q || type || status || owner || approver || from || to);
  const clearFilters = () => { setQ(""); setType(""); setStatus(""); setOwner(""); setApprover(""); setFrom(""); setTo(""); };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return rows.filter((x) => {
      if (type && x.kind !== type) return false;
      if (status === CANCELLED_FILTER) { if (!x.cancelled) return false; }
      else if (status && x.statusKey !== status) return false;
      if (owner && x.ownerEmail !== owner) return false;
      if (approver && x.approverEmail !== approver) return false;
      if (fromMs !== null || toMs !== null) {
        const t = new Date(x.updatedAt).getTime();
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
      }
      if (needle && ![x.number, x.projectName, x.customer].some((f) => (f || "").toLowerCase().includes(needle)))
        return false;
      return true;
    });
  }, [rows, q, type, status, owner, approver, from, to]);

  // Keep the revisions of one LV quotation together (newest first), where they sit in
  // the recency order. RMU offers are each their own group, so they stay by date.
  const ordered = useMemo(() => {
    const keyOf = (x: UniRow) => x.kind === "RMU"
      ? `rmu|${x.id}`
      : `${(x.ownerEmail || "").toLowerCase()}|${parseRevision(x.number).base}`;
    const groups = new Map<string, UniRow[]>();
    for (const x of filtered) {
      const k = keyOf(x);
      const g = groups.get(k);
      if (g) g.push(x); else groups.set(k, [x]);
    }
    for (const g of groups.values())
      if (g.length > 1) g.sort((a, b) => parseRevision(b.number).rev - parseRevision(a.number).rev);
    const seen = new Set<string>();
    const out: UniRow[] = [];
    for (const x of filtered) {
      const k = keyOf(x);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(...groups.get(k)!);
    }
    return out;
  }, [filtered]);

  const myEmail = (user?.email || "").toLowerCase();
  const mayManage = myPerms.includes("access.manage");
  // LV: removing HIDES a quotation (kept, restorable) — only drafts and returned ones;
  // anything approved/submitted is the record of an offer that went to a customer.
  // Any status can be removed — it's a soft hide (kept + restorable via "Show removed"),
  // not an erase. Gated only by ownership: your own rows, or anyone's with access.manage.
  const canDeleteLv = (x: UniRow) =>
    x.kind === "LV" && !x.removedAt &&
    (mayManage || !scopeAll || (x.ownerEmail || "").toLowerCase() === myEmail);
  const canAmendLv = (x: UniRow) =>
    x.kind === "LV" && !x.cancelled &&
    ((!scopeAll || x.ownerEmail === user?.email)
      ? myPerms.includes("qtn.amendOwn") || myPerms.includes("qtn.amendAll")
      : myPerms.includes("qtn.amendAll"));

  // A DRAFT / RETURNED RMU offer opens the editor (re-editable, like an LV draft);
  // once it's locked (waiting / approved / submitted) it opens the read-only view.
  const rmuEditable = (x: UniRow) => x.statusKey === "DRAFT" || x.statusKey === "RETURNED";
  const rowHref = (x: UniRow) =>
    x.kind === "RMU"
      ? rmuEditable(x) ? `/offers/${x.id}/edit` : `/offers/${x.id}`
      : `/lv/qtn/${x.id}`;

  // The number shown in History, with the revision suffix. If the stored number already
  // carries a "-N" (Amend flow) keep it; otherwise append the Project-tab Revision No.
  // when it's > 0 — so a rev-1 quotation reads "QTN-26-1129-1" like its offer does.
  const displayNumber = (x: UniRow): string => {
    if (x.kind !== "LV") return x.number;
    if (parseRevision(x.number).rev > 0) return x.number;
    return x.revisionNo && x.revisionNo > 0 ? `${x.number}-${x.revisionNo}` : x.number;
  };

  // ── LV actions ──────────────────────────────────────────────────────────────
  const onDeleteLv = async (e: React.MouseEvent, x: UniRow) => {
    e.stopPropagation();
    if (!(await confirm({
      title: `Remove ${x.number}`,
      message: "It is hidden from the lists, not deleted. Its number stays reserved, and " +
        'you can bring it back at any time with "Show removed".',
      confirmLabel: "Remove",
    }))) return;
    setActionErr("");
    try { await deleteQtn(x.id); await reload(); }
    catch (e2) { setActionErr((e2 as Error).message || `Could not remove ${x.number}.`); }
  };
  const onRestore = async (e: React.MouseEvent, x: UniRow) => {
    e.stopPropagation();
    setActionErr("");
    try { await restoreQtn(x.id); await reload(); }
    catch (e2) { setActionErr((e2 as Error).message || `Could not restore ${x.number}.`); }
  };
  const onDuplicateLv = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActionErr("");
    const rec = await duplicateQtn(id);
    if (rec) navigate(`/lv/qtn/${rec.id}`);
    else setActionErr("Could not duplicate that quotation.");
  };
  const onAmendLv = async (e: React.MouseEvent, id: string, number: string) => {
    e.stopPropagation();
    if (!(await confirm({
      title: `Amend ${number}`,
      message: `This opens a new revision to work on, and cancels ${number}.`,
      confirmLabel: "Open a revision",
    }))) return;
    setActionErr("");
    const rec = await amendQtn(id, number);
    if (rec) navigate(`/lv/qtn/${rec.id}`);
    else setActionErr(`Could not amend ${number}.`);
  };

  // ── RMU actions ───────────────────────────────────────────────────────────────
  // Amend = open the offer to work on it. Duplicate = an independent copy (prices stay
  // frozen — the server clones the snapshot). Delete = permanent (RMU has no hide/restore).
  const onDuplicateRmu = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActionErr("");
    try { const dup = await api.duplicateOffer(id); navigate(`/offers/${dup.id}/edit`); }
    catch (e2) { setActionErr((e2 as Error).message || "Could not duplicate that offer."); }
  };
  const onDeleteRmu = async (e: React.MouseEvent, x: UniRow) => {
    e.stopPropagation();
    if (!(await confirm({
      title: `Delete ${x.number}`,
      message: "It is removed for good — this one cannot be undone.",
      confirmLabel: "Delete offer",
      tone: "danger",
    }))) return;
    setActionErr("");
    try { await api.deleteOffer(x.id); await reload(); }
    catch (e2) { setActionErr((e2 as Error).message || `Could not delete ${x.number}.`); }
  };

  const count = filtered.length === rows.length ? `${rows.length} saved` : `${filtered.length} of ${rows.length} shown`;

  return (
    <div>
      {dialogs}
      <div className="mb-5 flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Offer History</h1>
          <p className="text-sm text-muted">
            {loading ? "Loading…" : count} · {scopeAll ? "all users" : "your offers"}
          </p>
          {!loading && !scopeAll && (
            <p className="mt-1 text-xs text-muted">
              You are seeing only your own offers — viewing everyone&apos;s LV quotations needs the view-all permission.
            </p>
          )}
        </div>
      </div>

      {loadErr && (
        <div className="card mb-3 border-red-200 bg-red-50 p-3 text-sm text-red-700 animate-fade-in">{loadErr}</div>
      )}
      {actionErr && (
        <div className="card mb-3 flex items-start justify-between gap-3 border-red-200 bg-red-50 p-3 text-sm text-red-700 animate-fade-in">
          <span>{actionErr}</span>
          <button className="text-xs font-semibold hover:underline" onClick={() => setActionErr("")}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center animate-fade-up">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-2xl">⚡</div>
          <p className="text-muted">No offers yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">
            An offer holds the whole job — its project data, pricing, panels/configuration, and the
            Technical / Commercial offers it generates. Start one from the Home page.
          </p>
        </div>
      ) : (
        <>
          <div className="card mb-3 flex flex-wrap items-end gap-2 p-3 animate-fade-up">
            <div className="min-w-[200px] flex-1">
              <label className="label" htmlFor="qtn-search">Search</label>
              <input id="qtn-search" className="input" placeholder="QTN number, project or customer…"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {mayManage && scopeAll && (
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm" title="Removed quotations are kept, never deleted">
                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand"
                  checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                Show removed
              </label>
            )}
            <div>
              <label className="label" htmlFor="qtn-type">Type</label>
              <select id="qtn-type" className="input w-32" value={type} onChange={(e) => setType(e.target.value as "" | Kind)}>
                <option value="">All types</option>
                <option value="LV">LV</option>
                <option value="RMU">RMU</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="qtn-status">Status</label>
              <select id="qtn-status" className="input w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {QTN_STATUSES.map((s) => <option key={s} value={s}>{QTN_STATUS_LABEL[s]}</option>)}
                <option value={CANCELLED_FILTER}>Cancelled (old revisions)</option>
              </select>
            </div>
            {owners.length > 1 && (
              <div>
                <label className="label" htmlFor="qtn-owner">Creator</label>
                <select id="qtn-owner" className="input w-44" value={owner} onChange={(e) => setOwner(e.target.value)}>
                  <option value="">All creators</option>
                  {owners.map((o) => <option key={o.email} value={o.email}>{o.name}</option>)}
                </select>
              </div>
            )}
            {approvers.length > 0 && (
              <div>
                <label className="label" htmlFor="qtn-approver">Approver</label>
                <select id="qtn-approver" className="input w-44" value={approver} onChange={(e) => setApprover(e.target.value)}>
                  <option value="">All approvers</option>
                  {approvers.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="qtn-from">Updated from</label>
              <input id="qtn-from" type="date" className="input w-40" value={from} max={to || undefined}
                onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="qtn-to">Updated to</label>
              <input id="qtn-to" type="date" className="input w-40" value={to} min={from || undefined}
                onChange={(e) => setTo(e.target.value)} />
            </div>
            {filtersOn && <button className="btn-ghost" onClick={clearFilters}>Clear filters</button>}
          </div>

          {filtered.length === 0 ? (
            <div className="card p-10 text-center animate-fade-up">
              <p className="text-muted">No offers match these filters.</p>
              <button className="btn-ghost mt-4" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : (
            <div className="card overflow-x-auto animate-fade-up">
              <table className="w-full text-sm">
                <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">QTN No</th>
                    <th className="px-4 py-3">Status</th>
                    {scopeAll && <th className="px-4 py-3">Owner</th>}
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Panels / Ways</th>
                    <th className="px-4 py-3">Total (USD incl. VAT)</th>
                    <th className="px-4 py-3" title="Active hands-on time spent working on the quotation">Active time</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((x, i) => {
                    const dead = !!x.cancelled;
                    // "Live" = a draft whose autosave fired in the last minute → someone is
                    // working on it right now. The list auto-refreshes every 30s, so this
                    // turns on/off on its own as people start and stop editing.
                    const live = x.statusKey === "DRAFT" && !dead && nowTick - new Date(x.updatedAt).getTime() < 60_000;
                    return (
                      <tr key={`${x.kind}-${x.id}`}
                        className={`cursor-pointer border-t border-line transition-colors hover:bg-brand-tint ${
                          justChanged.has(x.id) ? "animate-flash-new" : "animate-fade-up"
                        }`}
                        style={justChanged.has(x.id) ? undefined : { animationDelay: `${i * 0.04}s` }}
                        onClick={() => navigate(rowHref(x))}>
                        <td className="px-4 py-3">
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${x.kind === "RMU" ? "bg-violet-100 text-violet-700" : "bg-brand-light text-brand-dark"}`}>{x.kind}</span>
                        </td>
                        <td className="px-4 py-3 font-bold text-ink">
                          <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${dead ? "bg-surface text-muted line-through" : "bg-brand-light text-brand-dark"}`}>{displayNumber(x)}</span>
                          {dead && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">Cancelled</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${x.statusStyle}`}
                            title={live ? "Being worked on right now" : x.approverEmail ? `${x.statusLabel} · approver ${x.approverEmail}` : x.statusLabel}>
                            {live && (
                              <span className="relative flex h-2 w-2" aria-label="online">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                              </span>
                            )}
                            {x.statusLabel}
                          </span>
                        </td>
                        {scopeAll && (
                          <td className="px-4 py-3 text-muted" title={x.ownerEmail}>{x.ownerName || x.ownerEmail || "—"}</td>
                        )}
                        <td className="px-4 py-3">{x.projectName || <span className="text-muted">—</span>}</td>
                        <td className="px-4 py-3 text-muted">{x.customer || "—"}</td>
                        <td className="px-4 py-3 text-muted">{x.units}</td>
                        <td className="px-4 py-3 font-semibold">{x.totalUsd == null ? <span className="text-muted">—</span> : "$" + fmtEgp(x.totalUsd)}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-ink" title="Active hands-on time on this quotation">
                          {x.activeSeconds ? `⏱ ${fmtActive(x.activeSeconds)}` : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{new Date(x.updatedAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {x.kind === "LV" ? (
                              <>
                                <Act title={canAmendLv(x) ? "Amend — open a new revision (cancels this one)" : "You can't amend this one"}
                                  disabled={!canAmendLv(x)} onClick={(e) => onAmendLv(e, x.id, x.number)}>{AmendIcon}</Act>
                                <Act title="Duplicate — an independent copy" onClick={(e) => onDuplicateLv(e, x.id)}>{DuplicateIcon}</Act>
                                {x.removedAt && mayManage ? (
                                  <Act title={`Restore — removed ${new Date(x.removedAt).toLocaleDateString()}${x.removedBy ? ` by ${x.removedBy}` : ""}`}
                                    onClick={(e) => onRestore(e, x)}>{RestoreIcon}</Act>
                                ) : (
                                  <Act title={canDeleteLv(x) ? "Remove — hidden, can be restored" : "Only the owner or an admin can remove it"}
                                    danger disabled={!canDeleteLv(x)} onClick={(e) => onDeleteLv(e, x)}>{TrashIcon}</Act>
                                )}
                              </>
                            ) : (
                              <>
                                <Act title="Amend — open this offer to work on it" onClick={(e) => { e.stopPropagation(); navigate(rowHref(x)); }}>{AmendIcon}</Act>
                                <Act title="Duplicate — an independent copy (prices stay frozen)" onClick={(e) => onDuplicateRmu(e, x.id)}>{DuplicateIcon}</Act>
                                <Act title="Delete — permanent" danger onClick={(e) => onDeleteRmu(e, x)}>{TrashIcon}</Act>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
