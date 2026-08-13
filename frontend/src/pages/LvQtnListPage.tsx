import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listQtns, listAllQtns, deleteQtn, restoreQtn, duplicateQtn, amendQtn, supersededNumbers, type QtnListItem } from "../lv/qtns";
import { api, QTN_STATUSES, QTN_STATUS_LABEL, QTN_STATUS_STYLE, type QtnStatus } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useAutoRefresh, useChangedKeys } from "../hooks/useAutoRefresh";
import { fmtEgp, DEFAULT_FACTORS } from "../lv/catalog";
import NewQtnPicker from "../components/NewQtnPicker";

/** Deleting is refused (409) once a quotation has entered the approval flow, so
 *  the button is only offered on the two stages the server still accepts. */
const DELETABLE = new Set<QtnStatus>(["DRAFT", "RETURNED"]);

/** LV landing page — the offers history. "+ New QTN" opens a fresh workspace
 *  (Project / Pricing / Panels / Technical / Commercial / Material). */
export default function LvQtnListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [qtns, setQtns] = useState<QtnListItem[] | null>(null); // null = first load in flight
  /** True when the list holds every user's quotations, not just the signed-in one's. */
  const [scopeAll, setScopeAll] = useState(false);
  const [myPerms, setMyPerms] = useState<string[]>([]);
  /** Owner-only: also list the quotations that have been removed, so they can be
   *  reviewed and restored. Off by default — removed means out of the way. */
  const [showRemoved, setShowRemoved] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<QtnStatus | "">("");
  const [owner, setOwner] = useState("");
  const [approver, setApprover] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const reload = async () => {
    // Which list this page may show is the server's call, so ask before fetching:
    // /qtns/all 403s for everyone without qtn.viewAll and would blank the page.
    let all = false;
    try {
      const acc = await api.access.me();
      all = acc.perms.includes("qtn.viewAll");
      setMyPerms(acc.perms);
    } catch {
      /* unreadable access record — fall back to the personal list */
    }
    try {
      // Hidden quotations are only fetched when the owner asks for them; the
      // server ignores the flag for everyone else, so this cannot leak anything.
      const rows = all ? await listAllQtns(showRemoved) : await listQtns();
      setScopeAll(all);
      setQtns(rows);
      setLoadErr("");
    } catch (e) {
      const msg = (e as Error).message || "Could not load the quotations.";
      // A refused cross-user read still leaves the user's own list readable.
      if (all) {
        try {
          setQtns(await listQtns());
          setScopeAll(false);
          setLoadErr(`${msg} — showing your own quotations instead.`);
          return;
        } catch {
          /* both calls failed — report the first message below */
        }
      }
      setQtns([]);
      setScopeAll(false);
      setLoadErr(msg);
    }
  };
  useEffect(() => {
    reload();
    // Re-fetches when the owner toggles "Show removed" — the hidden rows come from
    // the server, not from filtering what is already on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRemoved]);
  // Quotations added or edited by other people appear on their own — and right away
  // when you come back to the tab. Rows that changed flash briefly (see `justChanged`).
  useAutoRefresh(() => reload(), 30_000);

  // Which rows arrived/changed since the last refresh — flashed briefly in the table.
  const justChanged = useChangedKeys(qtns, (q) => q.id, (q) => `${q.updatedAt}|${q.status}`);

  const rows = qtns ?? [];
  // A quotation saved before the workflow shipped carries no status; read it as a
  // draft so the badge and the delete guard both have something to work with.
  const statusOf = (x: QtnListItem): QtnStatus => x.status ?? "DRAFT";

  // Filter options come from the fetched rows — there is no facets endpoint for
  // quotations, and the lists are short enough to derive client-side.
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of qtns ?? []) if (x.ownerEmail) m.set(x.ownerEmail, x.ownerName || x.ownerEmail);
    return [...m].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [qtns]);
  const approvers = useMemo(
    () => [...new Set((qtns ?? []).map((x) => x.approverEmail).filter(Boolean))].sort(),
    [qtns]
  );

  const filtersOn = Boolean(q || status || owner || approver || from || to);
  const clearFilters = () => { setQ(""); setStatus(""); setOwner(""); setApprover(""); setFrom(""); setTo(""); };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // The pickers give a calendar day, so the "to" bound has to cover its whole day.
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return (qtns ?? []).filter((x) => {
      if (status && (x.status ?? "DRAFT") !== status) return false;
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
  }, [qtns, q, status, owner, approver, from, to]);

  // QTN numbers superseded by a higher revision — shown as "Cancelled". Numbers
  // repeat across users, so revisions are matched within one owner's numbering
  // only; otherwise one user's "-2" would cancel another user's original.
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

  const myEmail = (user?.email || "").toLowerCase();
  const mayManage = myPerms.includes("access.manage");
  // Removing HIDES a quotation — it is kept and can be restored, so this is not a
  // destructive action. Still only drafts and returned ones: anything approved or
  // submitted is the record of an offer that went to a customer.
  // Owners may remove anyone's; everyone else only their own, as before.
  const canDelete = (x: QtnListItem) =>
    !x.removedAt &&
    DELETABLE.has(statusOf(x)) &&
    (mayManage || !scopeAll || (x.ownerEmail || "").toLowerCase() === myEmail);

  const onNew = () => setPicker(true);
  const onDelete = async (e: React.MouseEvent, x: QtnListItem) => {
    e.stopPropagation();
    if (
      !confirm(
        `Remove ${x.number} from the lists?\n\n` +
          `It is kept, not deleted — its number stays reserved, and you can bring it ` +
          `back with "Show removed".`,
      )
    )
      return;
    setActionErr("");
    try {
      await deleteQtn(x.id);
      await reload();
    } catch (e2) {
      setActionErr((e2 as Error).message || `Could not remove ${x.number}.`);
    }
  };
  const onRestore = async (e: React.MouseEvent, x: QtnListItem) => {
    e.stopPropagation();
    setActionErr("");
    try {
      await restoreQtn(x.id);
      await reload();
    } catch (e2) {
      setActionErr((e2 as Error).message || `Could not restore ${x.number}.`);
    }
  };
  const onDuplicate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActionErr("");
    const rec = await duplicateQtn(id);
    if (rec) navigate(`/lv/qtn/${rec.id}`);
    else setActionErr("Could not duplicate that quotation.");
  };
  // Amend = open a new revision (QTN-…-N+1); the current revision is thereby cancelled.
  const onAmend = async (e: React.MouseEvent, id: string, number: string) => {
    e.stopPropagation();
    if (!confirm(`Amend ${number}?\nThis opens a new revision and cancels ${number}.`)) return;
    setActionErr("");
    const rec = await amendQtn(id, number);
    if (rec) navigate(`/lv/qtn/${rec.id}`);
    else setActionErr(`Could not amend ${number}.`);
  };

  const count = filtered.length === rows.length
    ? `${rows.length} saved`
    : `${filtered.length} of ${rows.length} shown`;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">LV — Offers History</h1>
          <p className="text-sm text-muted">
            {qtns === null ? "Loading…" : count} · {scopeAll ? "all users" : "your quotations"}
          </p>
          {qtns !== null && !scopeAll && (
            <p className="mt-1 text-xs text-muted">
              You are seeing only your own quotations — viewing everyone&apos;s needs the view-all permission.
            </p>
          )}
        </div>
        <button className="btn-primary shrink-0" onClick={onNew}>+ New QTN</button>
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

      {qtns === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center animate-fade-up">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-2xl">⚡</div>
          <p className="text-muted">{scopeAll ? "No quotations have been sent for approval yet." : "No quotations yet."}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">
            A QTN holds the whole job — project data, pricing settings, panels &amp; components,
            and generates the Technical / Commercial offers and Material List.
          </p>
          <button className="btn-primary mt-4" onClick={onNew}>Create your first QTN</button>
        </div>
      ) : (
        <>
          {/* Filters run over the rows already fetched — no round trip per keystroke. */}
          <div className="card mb-3 flex flex-wrap items-end gap-2 p-3 animate-fade-up">
            <div className="min-w-[200px] flex-1">
              <label className="label" htmlFor="qtn-search">Search</label>
              <input id="qtn-search" className="input" placeholder="QTN number, project or customer…"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {/* Owner-only. Removed quotations are kept, so this is how they are
                reviewed and brought back. */}
            {mayManage && scopeAll && (
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm" title="Removed quotations are kept, never deleted">
                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand"
                  checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                Show removed
              </label>
            )}
            <div>
              <label className="label" htmlFor="qtn-status">Status</label>
              <select id="qtn-status" className="input w-56" value={status}
                onChange={(e) => setStatus(e.target.value as QtnStatus | "")}>
                <option value="">All statuses</option>
                {QTN_STATUSES.map((s) => <option key={s} value={s}>{QTN_STATUS_LABEL[s]}</option>)}
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
              <p className="text-muted">No quotations match these filters.</p>
              <button className="btn-ghost mt-4" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : (
            <div className="card overflow-x-auto animate-fade-up">
              <table className="w-full text-sm">
                <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
                  <tr>
                    <th className="px-4 py-3">QTN No</th>
                    <th className="px-4 py-3">Status</th>
                    {scopeAll && <th className="px-4 py-3">Owner</th>}
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Panels</th>
                    <th className="px-4 py-3">Total (USD incl. VAT)</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((x, i) => {
                    const st = statusOf(x);
                    const dead = cancelledIds.has(x.id);
                    return (
                      <tr key={x.id}
                        className={`cursor-pointer border-t border-line transition-colors hover:bg-brand-tint ${
                          justChanged.has(x.id) ? "animate-flash-new" : "animate-fade-up"
                        }`}
                        style={justChanged.has(x.id) ? undefined : { animationDelay: `${i * 0.04}s` }}
                        onClick={() => navigate(`/lv/qtn/${x.id}`)}>
                        <td className="px-4 py-3 font-bold text-ink">
                          <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${dead ? "bg-surface text-muted line-through" : "bg-brand-light text-brand-dark"}`}>{x.number}</span>
                          {dead && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">Cancelled</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${QTN_STATUS_STYLE[st]}`}
                            title={x.approverEmail ? `${QTN_STATUS_LABEL[st]} · approver ${x.approverEmail}` : QTN_STATUS_LABEL[st]}>
                            {QTN_STATUS_LABEL[st]}
                          </span>
                        </td>
                        {scopeAll && (
                          <td className="px-4 py-3 text-muted" title={x.ownerEmail}>{x.ownerName || x.ownerEmail || "—"}</td>
                        )}
                        <td className="px-4 py-3">{x.projectName || <span className="text-muted">—</span>}</td>
                        <td className="px-4 py-3 text-muted">{x.customer || "—"}</td>
                        <td className="px-4 py-3 text-muted">{x.panels}</td>
                        <td className="px-4 py-3 font-semibold" title={`${fmtEgp(x.totalEgp)} EGP · @ ${DEFAULT_FACTORS.usd} EGP/USD`}>{"$" + fmtEgp(x.totalEgp / DEFAULT_FACTORS.usd)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{new Date(x.updatedAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                            {!dead && ((!scopeAll || x.ownerEmail === user?.email)
                              ? (myPerms.includes("qtn.amendOwn") || myPerms.includes("qtn.amendAll"))
                              : myPerms.includes("qtn.amendAll")) && (
                              <button onClick={(e) => onAmend(e, x.id, x.number)} className="font-semibold text-brand-dark hover:underline" title="Open a new revision — cancels this one">Amend</button>
                            )}
                            <button onClick={(e) => onDuplicate(e, x.id)} className="font-semibold text-brand hover:underline">Duplicate</button>
                            {canDelete(x) && (
                              <button onClick={(e) => onDelete(e, x)} className="text-red-500 hover:underline" title="Hide it from the lists — it is kept and can be brought back">Remove</button>
                            )}
                            {x.removedAt && mayManage && (
                              <button onClick={(e) => onRestore(e, x)} className="font-semibold text-green-700 hover:underline" title={`Removed ${new Date(x.removedAt).toLocaleDateString()}${x.removedBy ? ` by ${x.removedBy}` : ""}`}>Restore</button>
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

      {picker && <NewQtnPicker desk="lv" onClose={() => setPicker(false)} />}
    </div>
  );
}
