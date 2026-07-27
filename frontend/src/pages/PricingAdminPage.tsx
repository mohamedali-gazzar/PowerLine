import { useEffect, useMemo, useState } from "react";
import { api, type PricingStatus, type RmuPriceRow, type PriceChangeRow } from "../api";

// Price list — the owner-facing screen.
//
// How it works, and why: edits are saved as a DRAFT. Customers keep seeing the
// old prices until "Update price list & database" is pressed, which publishes
// them and makes them live on the very next click — no deploy, no waiting.
// That gap is deliberate: it gives a review step before a typo reaches a quote.

const GROUPS: { kind: RmuPriceRow["kind"]; title: string; hint: string }[] = [
  { kind: "PANEL", title: "RMU panels", hint: "Minimum price per panel configuration (USD)" },
  { kind: "LUCY", title: "Lucy AEGIS PLUS", hint: "Price per configuration (USD)" },
  { kind: "RTU", title: "Smart / RTU", hint: "Added when a Smart/RTU option is chosen" },
  { kind: "ADDON", title: "Add-ons", hint: "Extras such as the outdoor enclosure" },
];

export default function PricingAdminPage() {
  const [status, setStatus] = useState<PricingStatus | null>(null);
  const [rows, setRows] = useState<RmuPriceRow[] | null>(null);
  const [pending, setPending] = useState<PriceChangeRow[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);

  const loadAll = async () => {
    setError("");
    try {
      const s = await api.pricing.status();
      setStatus(s);
      if (s.canEdit && s.seedState === "READY") {
        const [l, p] = await Promise.all([api.pricing.list(), api.pricing.pending()]);
        setRows(l.rows);
        setPending(p.changes);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const setUp = async () => {
    setBusy("setup");
    setError("");
    try {
      const r = await api.pricing.setUp();
      if (!r.ok) {
        setError("Import stopped: the database did not match the app's price list, so nothing was published.");
      } else {
        setToast(`Price list created — ${Object.values(r.counts).reduce((a, b) => a + b, 0)} items imported.`);
        await loadAll();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const savePrice = async (row: RmuPriceRow, value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n === row.priceUsd) return;
    setBusy(row.id);
    try {
      const r = await api.pricing.setPrice(row.id, n);
      setRows((rs) => (rs ? rs.map((x) => (x.id === row.id ? r.row : x)) : rs));
      setPending(await api.pricing.pending().then((p) => p.changes));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const toggleRetire = async (row: RmuPriceRow) => {
    if (
      row.active &&
      !window.confirm(
        `Retire "${row.label || row.key}"?\n\nIt stops being offered from the next publish. ` +
          `Quotations already saved keep this product and its price, and are not affected.`
      )
    )
      return;
    setBusy(row.id);
    setError("");
    try {
      const r = await api.pricing.retire(row.id, !row.active);
      setRows((rs) => (rs ? rs.map((x) => (x.id === row.id ? r.row : x)) : rs));
      setPending(await api.pricing.pending().then((p) => p.changes));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const publish = async () => {
    setBusy("publish");
    setError("");
    try {
      const r = await api.pricing.publish();
      setToast(`Published. Everyone sees the new prices from their next click (version ${r.version}).`);
      setConfirming(false);
      await loadAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.key} ${r.label}`.toLowerCase().includes(q));
  }, [rows, query]);

  if (!status) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-20" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  // ── No access ──────────────────────────────────────────────────────────────
  if (!status.canEdit && status.seedState === "READY") {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight">Price list</h1>
        <div className="card mt-4 p-6 text-center">
          <div className="text-3xl">🔒</div>
          <p className="mt-2 font-bold text-ink">You don't have access to price editing</p>
          <p className="mt-1 text-sm text-muted">
            Ask the price-list owner to give you access. You can keep using the app normally —
            offers and quotations are unaffected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Price list</h1>
          <p className="text-sm text-muted">
            Change a price here, then press <b>Update price list &amp; database</b> to make it live.
          </p>
        </div>
        <StatusChip status={status} />
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      {toast && <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">{toast}</p>}

      {/* ── First-time setup ─────────────────────────────────────────────── */}
      {status.seedState !== "READY" && (
        <div className="card p-6">
          <h2 className="sec-head">Set up the online price list</h2>
          <p className="text-sm text-muted">
            This copies the prices the app is using right now into the database, so you can edit
            them here instead of in Excel. <b>Nothing changes for anyone</b> — the prices stay
            exactly the same. It checks every price matches before switching over, and it can be
            undone.
          </p>
          <p className="mt-2 text-xs text-muted">
            Whoever does this becomes the price-list owner and can give access to colleagues.
          </p>
          <button className="btn-primary mt-4" onClick={setUp} disabled={busy === "setup"}>
            {busy === "setup" ? "Setting up…" : "Set up the price list →"}
          </button>
        </div>
      )}

      {/* ── Publish bar ──────────────────────────────────────────────────── */}
      {status.seedState === "READY" && (
        <div
          className={`card mb-4 flex flex-wrap items-center justify-between gap-3 p-4 ${
            pending.length ? "border-amber-300 bg-amber-50/60" : ""
          }`}
        >
          <div>
            <p className="text-sm font-bold text-ink">
              {pending.length === 0
                ? "No unpublished changes"
                : `${pending.length} change${pending.length === 1 ? "" : "s"} waiting to go live`}
            </p>
            <p className="text-xs text-muted">
              {pending.length === 0
                ? "The live price list is up to date."
                : "Customers still see the old prices until you publish."}
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={pending.length === 0 || busy === "publish"}
            onClick={() => setConfirming(true)}
          >
            {busy === "publish" ? "Publishing…" : "Update price list & database"}
          </button>
        </div>
      )}

      {/* ── Review sheet ─────────────────────────────────────────────────── */}
      {confirming && (
        <div className="card mb-4 border-brand/40 p-4">
          <h2 className="sec-head">Review before publishing</h2>
          <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto text-sm">
            {pending.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 border-b border-line/60 py-1">
                <span className="truncate font-medium text-ink">{c.label}</span>
                <span className="shrink-0 font-mono text-xs">
                  <span className="text-muted line-through">{c.oldValue}</span>
                  {" → "}
                  <b className="text-brand-dark">{c.newValue}</b>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={publish} disabled={busy === "publish"}>
              {busy === "publish" ? "Publishing…" : "Yes, make these live"}
            </button>
            <button className="btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── The prices ───────────────────────────────────────────────────── */}
      {status.seedState === "READY" && (
        <>
          <input
            className="input mb-3"
            placeholder="Search a product or price code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {!filtered && <div className="skeleton h-64" />}
          {filtered &&
            GROUPS.map((g) => {
              const list = filtered.filter((r) => r.kind === g.kind);
              if (!list.length) return null;
              return (
                <div key={g.kind} className="card mb-4 overflow-hidden">
                  <div className="flex items-baseline justify-between px-5 py-3">
                    <h2 className="sec-head mb-0">{g.title}</h2>
                    <span className="text-xs text-muted">{g.hint}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {list.map((r) => (
                        <tr key={r.id} className={`border-t border-line ${r.active ? "" : "bg-slate-50/70"}`}>
                          <td className="px-5 py-2">
                            <div className={`font-medium ${r.active ? "text-ink" : "text-muted line-through"}`}>
                              {r.label || r.key}
                            </div>
                            {r.label && <div className="font-mono text-[11px] text-muted">{r.key}</div>}
                            {!r.active && (
                              <span className="mt-0.5 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                RETIRED — not offered
                              </span>
                            )}
                          </td>
                          <td className="w-56 px-5 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-muted">USD</span>
                              <input
                                type="number"
                                min={1}
                                defaultValue={r.priceUsd}
                                disabled={busy === r.id || !r.active}
                                onBlur={(e) => savePrice(r, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                }}
                                className="input w-28 text-right"
                              />
                              <button
                                type="button"
                                title={r.active ? "Stop offering this product" : "Offer this product again"}
                                onClick={() => toggleRetire(r)}
                                disabled={busy === r.id}
                                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface hover:text-ink"
                              >
                                {r.active ? "Retire" : "Restore"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
        </>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: PricingStatus }) {
  const live = status.source === "db";
  return (
    <div className="text-right text-xs">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold ${
          live ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
        }`}
      >
        {live ? `● Live — version ${status.version}` : "○ Using the built-in price list"}
      </span>
      {status.stale && (
        <div className="mt-1 font-semibold text-amber-700">Database unreachable — showing last known prices</div>
      )}
    </div>
  );
}
