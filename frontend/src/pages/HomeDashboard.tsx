import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api, QTN_STATUSES, QTN_STATUS_LABEL, QTN_STATUS_STYLE,
  type HistoryItem, type QtnStatus, type QtnListItemDto, type MyAccess, type StalePricedQtns,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import NewQtnPicker from "../components/NewQtnPicker";
import RedPriceAlert from "../components/RedPriceAlert";
import EstimatorEvaluation from "./EstimatorEvaluation";

/** Post-login home: profile, weekly performance, QTN history, and quick actions
 *  (New QTN → RMU/LV, plus the Kiosk tool). */
export default function HomeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<MyQtnRow[] | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [status, setStatus] = useState<QtnStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [chooser, setChooser] = useState(false);
  const [stale, setStale] = useState<StalePricedQtns | null>(null);
  const [reviewFilter, setReviewFilter] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // account.history() merges LV + RMU, but its LV rows only carry the old
    // submitted flag — the workflow status lives on /qtns. So the LV half comes
    // from qtns.list() and only the RMU rows are kept from the merged history.
    Promise.all([
      api.qtns.list().catch(() => [] as QtnListItemDto[]),
      api.account.history().then((r) => r.items).catch(() => [] as HistoryItem[]),
    ]).then(([lv, merged]) => setRows(myQtnRows(lv, merged)));
    // A failed probe must not hand out permissions — fall back to holding none.
    api.access.me().then(setAccess).catch(() => setAccess({ tier: "ENGINEER", perms: [], role: "USER" }));
    // Open QTNs that froze their prices on a superseded price list (silent on failure).
    api.account.stalePrices().then(setStale).catch(() => {});
  }, []);

  const can = (perm: string) => Boolean(access?.perms.includes(perm));

  const needle = query.trim().toLowerCase();
  // Per-QTN price marks for the history rows: how many lines are outdated, and which
  // were explicitly re-priced to the current list ("prices updated").
  const outdatedBy = new Map((stale?.items ?? []).map((i) => [i.id, i.changedCount]));
  const appliedIds = new Set(stale?.applied ?? []);
  const staleCount = stale?.items.length ?? 0;

  const visible = (rows ?? []).filter(
    (r) =>
      // "Review QTNs" narrows the history to only the quotations that need a price update.
      (!reviewFilter || outdatedBy.has(r.id)) &&
      (status === "ALL" || r.status === status) &&
      (!needle || `${r.number} ${r.projectName} ${r.customer}`.toLowerCase().includes(needle))
  );

  return (
    <div className="animate-fade-up">
      {/* Stale-price warning: open QTNs priced on an older list, review before submitting */}
      {staleCount > 0 && (
        <div className="mb-4">
          <RedPriceAlert
            message={
              staleCount === 1
                ? "1 open quotation was priced on an older price list — review it before submitting."
                : `${staleCount} open quotations were priced on an older price list — review them before submitting.`
            }
            actionLabel="Review QTNs"
            onAction={() => {
              setStatus("ALL");
              setQuery("");
              setReviewFilter(true);
              historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </div>
      )}

      {/* Greeting + quick actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ProfilePhoto />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
            </h1>
            <p className="text-sm text-muted">{user?.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setChooser(true)}>+ New QTN</button>
          {can("access.manage") && (
            <button className="btn-ghost" onClick={() => navigate("/access")}>🔑 Access Center</button>
          )}
        </div>
      </div>

      {can("qtn.approve") && <ApprovalInbox />}

      {/* Estimator performance — you vs team median */}
      <div>
        <h2 className="sec-head mb-3">Your performance</h2>
        <EstimatorEvaluation />
      </div>

      {/* QTN history */}
      <div ref={historyRef} className="mt-5 card overflow-hidden scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="sec-head mb-0">My QTN History</h2>
            {reviewFilter && (
              <button
                type="button"
                onClick={() => setReviewFilter(false)}
                title="Show all quotations again"
                className="chip whitespace-nowrap bg-red-100 text-[11px] text-red-700 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300"
              >
                ⚠ Needs price update · Show all ✕
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-60 py-1.5 text-xs"
              placeholder="Search number, project or customer"
              aria-label="Search quotations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="input w-auto py-1.5 text-xs"
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value as QtnStatus | "ALL")}
            >
              <option value="ALL">All statuses</option>
              {QTN_STATUSES.map((s) => (
                <option key={s} value={s}>{QTN_STATUS_LABEL[s]}</option>
              ))}
            </select>
            <span className="text-xs text-muted">{visible.length} items</span>
          </div>
        </div>
        {rows === null ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            No quotations yet — press <b className="text-ink">+ New QTN</b> to start your first one.
          </div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">Nothing matches that search.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-5 py-2.5">QTN No</th>
                <th className="px-5 py-2.5">Type</th>
                <th className="px-5 py-2.5">Project</th>
                <th className="px-5 py-2.5">Customer</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Prices</th>
                <th className="px-5 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.kind}-${r.id}`}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-brand-tint"
                  onClick={() => navigate(r.link)}>
                  <td className="px-5 py-2.5 font-bold">
                    <span className="rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs text-brand-dark">{r.number}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.kind === "LV" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{r.kind}</span>
                  </td>
                  <td className="px-5 py-2.5">{r.projectName || <span className="text-muted">—</span>}</td>
                  <td className="px-5 py-2.5 text-muted">{r.customer || "—"}</td>
                  <td className="px-5 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-2.5">
                    {r.kind === "LV" && outdatedBy.has(r.id) ? (
                      <span className="chip whitespace-nowrap bg-red-100 text-[11px] text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        ⚠ {outdatedBy.get(r.id)} price{outdatedBy.get(r.id) === 1 ? "" : "s"} outdated
                      </span>
                    ) : r.kind === "LV" && appliedIds.has(r.id) ? (
                      <span className="chip whitespace-nowrap bg-green-100 text-[11px] text-green-700 dark:bg-green-500/15 dark:text-green-300">
                        ✓ Prices updated
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted">{new Date(r.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {chooser && <NewQtnPicker desk="all" onClose={() => setChooser(false)} />}
    </div>
  );
}

// ── My QTN history (LV workflow rows + RMU offers, one list) ─────────────────
interface MyQtnRow {
  kind: "LV" | "RMU";
  id: string;
  number: string;
  projectName: string;
  customer: string;
  updatedAt: string;
  status: QtnStatus;
  link: string;
}

function myQtnRows(lv: QtnListItemDto[], merged: HistoryItem[]): MyQtnRow[] {
  return [
    ...lv.map((q) => ({
      kind: "LV" as const,
      id: q.id,
      number: q.number,
      projectName: q.projectName,
      customer: q.customer,
      updatedAt: q.updatedAt,
      // A server mid-rollout may not send a status yet; the legacy flag still maps
      // onto the two states that mean the same thing.
      status: q.status ?? (q.submitted ? "SUBMITTED" : "DRAFT"),
      link: `/lv/qtn/${q.id}`,
    })),
    // RMU offers have no approval workflow at all, so their single submitted flag
    // is placed on the same two states — one filter then covers both kinds.
    ...merged
      .filter((h) => h.kind === "RMU")
      .map((h) => ({
        kind: h.kind,
        id: h.id,
        number: h.number,
        projectName: h.projectName,
        customer: h.customer,
        updatedAt: h.updatedAt,
        status: (h.submitted ? "SUBMITTED" : "DRAFT") as QtnStatus,
        link: h.link,
      })),
  ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function StatusBadge({ status }: { status: QtnStatus }) {
  return (
    <span className={`chip whitespace-nowrap text-[11px] ${QTN_STATUS_STYLE[status]}`}>
      {QTN_STATUS_LABEL[status]}
    </span>
  );
}

// ── Approval inbox ───────────────────────────────────────────────────────────
/** How long a quotation has waited, in the coarsest unit that still says something. */
function waitedFor(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** Only rendered for users holding qtn.approve — /qtns/queue 403s for anyone else. */
function ApprovalInbox() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QtnListItemDto[] | null>(null);

  useEffect(() => {
    api.qtns.queue().then(setQueue).catch(() => setQueue([]));
  }, []);

  return (
    <div className="card mb-5 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <h2 className="sec-head mb-0">Waiting for your approval</h2>
        {queue && queue.length > 0 && (
          <span className="chip bg-amber-100 text-amber-700">{queue.length} waiting</span>
        )}
      </div>
      {queue === null ? (
        <div className="space-y-2 px-5 pb-5">{[0, 1].map((i) => <div key={i} className="skeleton h-10" />)}</div>
      ) : queue.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">Nothing waiting — the queue is clear.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
            <tr>
              <th className="px-5 py-2.5">QTN No</th>
              <th className="px-5 py-2.5">Project</th>
              <th className="px-5 py-2.5">Created by</th>
              <th className="px-5 py-2.5">Waiting</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((q) => (
              <tr key={q.id}
                className="cursor-pointer border-t border-line transition-colors hover:bg-brand-tint"
                onClick={() => navigate(`/lv/qtn/${q.id}`)}>
                <td className="px-5 py-2.5 font-bold">
                  <span className="rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs text-brand-dark">{q.number}</span>
                </td>
                <td className="px-5 py-2.5">{q.projectName || <span className="text-muted">—</span>}</td>
                <td className="px-5 py-2.5 text-muted">{q.ownerName || q.ownerEmail || "—"}</td>
                <td className="px-5 py-2.5 text-xs text-muted">
                  {waitedFor(q.submittedForApprovalAt || q.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Profile photo (upload + downscale to keep it small) ───────────────────────
function ProfilePhoto() {
  const { user, setUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const target = 256;
        const scale = Math.min(target / img.width, target / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        try {
          const r = await api.account.updateProfile({ photo: dataUrl });
          setUser(r.user);
        } catch {
          /* ignore */
        } finally {
          setBusy(false);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const initials = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div className="group relative">
      <button
        onClick={() => fileRef.current?.click()}
        title="Change profile photo"
        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-brand/30 bg-brand-tint text-2xl font-extrabold text-brand-dark"
      >
        {user?.photo && /^data:image\//.test(user.photo) ? (
          <img src={user.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </button>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-ink/40 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100">
        {busy ? "…" : "Edit"}
      </span>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}

// The New QTN card picker now lives in ../components/NewQtnPicker (desk-scoped).
