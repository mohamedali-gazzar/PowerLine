import { useEffect, useMemo, useRef, useState } from "react";
import { api, type PricingStatus, type RmuPriceRow, type PriceChangeRow, type LvRow } from "../api";
import { COMPONENTS, ENCLOSURES, DEFAULT_FACTORS } from "../lv/catalog";

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
  const [progress, setProgress] = useState("");
  const [section, setSection] = useState<"RMU" | "LV">("RMU");
  const autoImported = useRef(false); // guard: import the LV catalogue once per visit

  const loadAll = async () => {
    setError("");
    try {
      const s = await api.pricing.status();
      setStatus(s);
      if (s.canEdit && s.seedState === "READY") {
        const [l, p] = await Promise.all([api.pricing.list(), api.pricing.pending()]);
        setRows(l.rows);
        setPending(p.changes);
        // The LV catalogue is small and copying it changes no prices, so import
        // it automatically rather than making the owner press a button for it.
        if (s.counts.lvComponents === 0 && !autoImported.current) {
          autoImported.current = true;
          importLvCatalogue()
            .then(() => api.pricing.status().then(setStatus))
            .catch((e) => setError((e as Error).message))
            .finally(() => setProgress(""));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  /** Send the LV catalogue from the browser in chunks — it lives in the app
   *  bundle, and 2,374 rows will not fit in one serverless request. Each chunk
   *  replaces its own slice, so re-running this can never duplicate rows. */
  const importLvCatalogue = async () => {
    const CHUNK = 300;
    for (let i = 0; i < COMPONENTS.length; i += CHUNK) {
      const slice = COMPONENTS.slice(i, i + CHUNK).map((c, j) => ({ ...c, sortIndex: i + j }));
      await api.pricing.lvSeedChunk("LV_COMPONENTS", i, slice);
      setProgress(`Importing components… ${Math.min(i + CHUNK, COMPONENTS.length)} of ${COMPONENTS.length}`);
    }
    for (let i = 0; i < ENCLOSURES.length; i += CHUNK) {
      const slice = ENCLOSURES.slice(i, i + CHUNK).map((e, j) => ({ ...e, sortIndex: i + j }));
      await api.pricing.lvSeedChunk("LV_ENCLOSURES", i, slice);
      setProgress(`Importing enclosures… ${Math.min(i + CHUNK, ENCLOSURES.length)} of ${ENCLOSURES.length}`);
    }
    setProgress("Saving pricing factors…");
    await api.pricing.lvSettings(DEFAULT_FACTORS);
  };

  const setUp = async () => {
    setBusy("setup");
    setError("");
    setProgress("Importing RMU prices…");
    try {
      // 1) RMU — verified against the built-in list before it goes live.
      const r = await api.pricing.setUp();
      if (!r.ok) {
        setError("Import stopped: the database did not match the app's price list, so nothing was published.");
        return;
      }

      // 2) LV — the catalogue itself.
      await importLvCatalogue();

      setToast(
        `Price list created — ${Object.values(r.counts).reduce((a, b) => a + b, 0)} RMU prices, ` +
          `${COMPONENTS.length} components and ${ENCLOSURES.length} enclosures imported.`
      );
      await loadAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress("");
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
          {progress && <p className="mt-2 text-sm font-semibold text-brand-dark">{progress}</p>}
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
          {/* Which price list are you editing? */}
          <div className="mb-4 flex gap-2 border-b border-line">
            {(["RMU", "LV"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition ${
                  section === s
                    ? "border-brand text-brand-dark"
                    : "border-transparent text-muted hover:text-brand-dark"
                }`}
              >
                {s === "RMU" ? "⚡ RMU / MV prices" : "🔌 LV prices"}
                <span className="ml-2 text-[11px] font-semibold text-muted">
                  {s === "RMU" ? status.counts.rmuPrices : status.counts.lvComponents + status.counts.lvEnclosures}
                </span>
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <History onChanged={loadAll} />
            {status.role === "OWNER" && <AccessPanel />}
          </div>

          {section === "LV" && status.counts.lvComponents === 0 && (
            <div className="card p-6 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              <p className="mt-3 text-sm font-semibold text-ink">Loading the LV price list…</p>
              <p className="text-xs text-muted">{progress || "Copying your current prices — they do not change."}</p>
            </div>
          )}
          {section === "LV" && status.counts.lvComponents > 0 && <LvPrices />}

          {section === "RMU" && (
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
        </>
      )}
    </div>
  );
}

/** Add an LV component. Every field is required — an item missing its type,
 *  description or reference cannot be found or priced by the calculator. */
function AddLvComponent({
  types,
  brands,
  onAdded,
}: {
  types: string[];
  brands: string[];
  onAdded: () => void;
}) {
  const empty = { t: "", f: "", r: "", d: "", ref: "", brand: "ABB", poles: "3", eur: "", egp: "" };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>(empty);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    setErr("");
    setSaving(true);
    try {
      await api.pricing.lvAdd({
        t: v.t.trim(),
        f: v.f.trim(),
        r: v.r.trim(),
        d: v.d.trim(),
        ref: v.ref.trim(),
        brand: v.brand.trim(),
        poles: Number(v.poles) || 0,
        eur: Number(v.eur) || 0,
        egp: Number(v.egp) || 0,
      });
      setV(empty);
      setOpen(false);
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open)
    return (
      <button className="btn-ghost mb-3" onClick={() => setOpen(true)}>
        + Add a component
      </button>
    );

  const F = ({ k, label, ph, list }: { k: string; label: string; ph?: string; list?: string[] }) => (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        value={v[k]}
        placeholder={ph}
        list={list ? `dl-${k}` : undefined}
        onChange={(e) => set(k, e.target.value)}
      />
      {list && (
        <datalist id={`dl-${k}`}>
          {list.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      )}
    </div>
  );

  return (
    <div className="card mb-3 border-brand/40 p-4">
      <h2 className="sec-head">Add a component</h2>
      <p className="mb-3 text-xs text-muted">All fields are required. It is added to the end of the catalogue.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <F k="t" label="Type" ph="MCCB" list={types} />
        <F k="f" label="Family" ph="XT2S" />
        <F k="r" label="Rating" ph="160A" />
        <div className="sm:col-span-3">
          <label className="label">Description</label>
          <input className="input" value={v.d} placeholder="MCCB XT2S 160A 3P" onChange={(e) => set("d", e.target.value)} />
        </div>
        <F k="ref" label="Reference" ph="1SDA067xxxR1" />
        <F k="brand" label="Brand" list={brands} />
        <div>
          <label className="label">Poles</label>
          <input className="input" type="number" min={0} value={v.poles} onChange={(e) => set("poles", e.target.value)} />
        </div>
        <div>
          <label className="label">Price EUR</label>
          <input className="input" type="number" min={0} step="0.01" value={v.eur} onChange={(e) => { set("eur", e.target.value); if (e.target.value) set("egp", ""); }} />
        </div>
        <div>
          <label className="label">or Price EGP</label>
          <input className="input" type="number" min={0} step="0.01" value={v.egp} onChange={(e) => { set("egp", e.target.value); if (e.target.value) set("eur", ""); }} />
        </div>
      </div>
      {err && <p className="mt-2 text-sm font-semibold text-red-700">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary" onClick={submit} disabled={saving}>
          {saving ? "Adding…" : "Add component"}
        </button>
        <button className="btn-ghost" onClick={() => { setOpen(false); setErr(""); }}>Cancel</button>
      </div>
    </div>
  );
}

/** LV price list — 2,121 components and 253 enclosures, with Excel-style
 *  filtering. Filtering and paging happen on the SERVER (50 rows at a time), so
 *  the screen stays fast no matter how big the catalogue gets. */
function LvPrices() {
  const [kind, setKind] = useState<"components" | "enclosures">("components");
  const [rows, setRows] = useState<LvRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [fam, setFam] = useState("");
  const [noPrice, setNoPrice] = useState(false);
  const [facets, setFacets] = useState<{ types: string[]; brands: string[]; families: string[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const take = 50;

  useEffect(() => {
    api.pricing.lvFacets().then(setFacets).catch(() => setFacets(null));
  }, []);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setRows(null);
      api.pricing
        .lvList({ kind, q, type, brand, fam, noPrice, page, take })
        .then((r) => {
          setRows(r.rows);
          setTotal(r.total);
        })
        .catch((e) => setErr((e as Error).message));
    }, 250);
    return () => clearTimeout(t);
  }, [kind, q, type, brand, fam, noPrice, page]);

  useEffect(() => setPage(0), [kind, q, type, brand, fam, noPrice]);

  const save = async (row: LvRow, eur: number, egp: number) => {
    setBusy(row.id);
    setErr("");
    try {
      const r = await api.pricing.lvSetPrice(row.id, kind, eur, egp);
      setRows((rs) => (rs ? rs.map((x) => (x.id === row.id ? r.row : x)) : rs));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const clearFilters = () => {
    setQ("");
    setType("");
    setBrand("");
    setFam("");
    setNoPrice(false);
  };
  const filtersOn = !!(q || type || brand || fam || noPrice);
  const pages = Math.ceil(total / take);

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {(["components", "enclosures"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition ${
              kind === k ? "bg-brand text-white" : "bg-brand-tint/60 text-brand-dark hover:bg-brand-tint"
            }`}
          >
            {k === "components" ? "Components" : "Enclosures & cells"}
          </button>
        ))}
      </div>

      {/* Add a component (components only — enclosures and cells are matched by
          name against generated cell tables, so a hand-added one would never be
          found by the calculator). */}
      {kind === "components" && (
        <AddLvComponent
          types={facets?.types ?? []}
          brands={facets?.brands ?? []}
          onAdded={() => {
            setPage(0);
            setQ("");
            api.pricing.lvList({ kind, take }).then((r) => {
              setRows(r.rows);
              setTotal(r.total);
            });
          }}
        />
      )}

      {/* Excel-style filter bar */}
      <div className="card mb-3 flex flex-wrap items-end gap-2 p-3">
        <div className="min-w-[200px] flex-1">
          <label className="label">Search</label>
          <input
            className="input"
            placeholder="Type, family, rating, description, reference…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {kind === "components" ? (
          <>
            <div>
              <label className="label">Type</label>
              <select className="input w-44" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                {facets?.types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Brand</label>
              <select className="input w-36" value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>
                {facets?.brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div>
            <label className="label">Family</label>
            <select className="input w-44" value={fam} onChange={(e) => setFam(e.target.value)}>
              <option value="">All families</option>
              {facets?.families.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={noPrice} onChange={(e) => setNoPrice(e.target.checked)} />
          Only items with no price
        </label>
        {filtersOn && (
          <button className="btn-ghost mb-0.5" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      {err && <p className="mb-2 rounded bg-red-50 p-2 text-sm font-semibold text-red-700">{err}</p>}

      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>
          {total.toLocaleString()} item{total === 1 ? "" : "s"}
          {filtersOn ? " match your filter" : ""}
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <button className="btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
            Page {page + 1} of {pages}
            <button className="btn-ghost px-2 py-1" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
          </span>
        )}
      </div>

      {!rows && <div className="skeleton h-64" />}
      {rows && rows.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">Nothing matches those filters.</div>
      )}
      {rows && rows.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2 w-28">{kind === "components" ? "Type" : "Family"}</th>
                <th className="px-4 py-2 w-28 text-right">Price EUR</th>
                <th className="px-4 py-2 w-28 text-right">Price EGP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-2">
                    <div className="font-medium text-ink">{r.d || r.name || r.n || r.ref}</div>
                    <div className="text-[11px] text-muted">
                      {[r.ref, r.brand, r.f, r.r, r.ip].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{r.t || r.fam}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number" min={0} step="0.01" defaultValue={r.eur} disabled={busy === r.id}
                      className="input w-24 text-right"
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.eur) save(r, v, v > 0 ? 0 : r.egp);
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number" min={0} step="0.01" defaultValue={r.egp} disabled={busy === r.id}
                      className="input w-24 text-right"
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.egp) save(r, v > 0 ? 0 : r.eur, v);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Each item is priced in ONE currency — filling EUR clears EGP and vice versa, exactly as the
        calculator expects.
      </p>
    </div>
  );
}

/** History of every price change, with one-click undo. Undo is applied as a NEW
 *  change (never by rewriting the record), so the trail stays complete. */
function History({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PriceChangeRow[] | null>(null);
  const [busy, setBusy] = useState("");

  const load = () => api.pricing.history().then((r) => setRows(r.changes)).catch(() => setRows([]));
  useEffect(() => {
    if (open) load();
  }, [open]);

  const undo = async (id: string) => {
    setBusy(id);
    try {
      await api.pricing.undo(id);
      await load();
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const describe = (c: PriceChangeRow) => {
    if (c.field === "priceUsd") return `${c.oldValue} → ${c.newValue} USD`;
    if (c.field === "__created") return `added at ${c.newValue} USD`;
    if (c.field === "__retired") return "retired";
    if (c.field === "__restored") return "offered again";
    if (c.field === "role") return `access: ${c.oldValue} → ${c.newValue}`;
    if (c.field === "__seed") return "price list set up";
    return c.field;
  };

  if (!open)
    return (
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        🕘 History
      </button>
    );

  return (
    <div className="card mb-4 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="sec-head mb-0">History</h2>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
      </div>
      {!rows && <div className="skeleton h-32" />}
      {rows && rows.length === 0 && <p className="text-sm text-muted">No changes yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{c.label}</span>
                <span className="text-[11px] text-muted">
                  {describe(c)} · {c.actorEmail || "unknown"} · {new Date(c.createdAt).toLocaleString()}
                </span>
              </span>
              {["priceUsd", "__created", "__retired", "__restored"].includes(c.field) && (
                <button
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand-dark hover:bg-brand-tint"
                  disabled={busy === c.id}
                  onClick={() => undo(c.id)}
                >
                  Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Owner-only: give a colleague price-editing access, or take it away. */
function AccessPanel() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<{ id: string; email: string; name: string; role: string }[] | null>(null);
  const [err, setErr] = useState("");

  const load = () => api.pricing.users().then((r) => setUsers(r.users)).catch((e) => setErr((e as Error).message));
  useEffect(() => {
    if (open) load();
  }, [open]);

  const change = async (id: string, role: string) => {
    setErr("");
    try {
      await api.pricing.setRole(id, role);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (!open)
    return (
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        👥 Who can edit prices
      </button>
    );

  return (
    <div className="card mb-4 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="sec-head mb-0">Who can edit prices</h2>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
      </div>
      {err && <p className="mb-2 text-sm font-semibold text-red-700">{err}</p>}
      {!users && <div className="skeleton h-32" />}
      {users && (
        <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{u.name || u.email}</span>
                <span className="text-[11px] text-muted">{u.email}</span>
              </span>
              <select className="input w-40 shrink-0" value={u.role} onChange={(e) => change(u.id, e.target.value)}>
                <option value="USER">No access</option>
                <option value="PRICE_ADMIN">Can edit prices</option>
                <option value="OWNER">Owner</option>
              </select>
            </li>
          ))}
        </ul>
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
