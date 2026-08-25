import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  getToken,
  type PricingStatus,
  type RmuPriceRow,
  type PriceChangeRow,
  type LvRow,
  type LvDuplicateNames,
} from "../api";
import { COMPONENTS, ENCLOSURES, DEFAULT_FACTORS } from "../lv/catalog";
import { refreshCatalog } from "../lv/catalogSource";
import LvExcelImport from "../pricing/LvExcelImport";
import LvCombosPanel from "../pricing/LvCombosPanel";
import { useDialogs } from "../components/ConfirmModal";

// Price list — the owner-facing screen.
//
// How it works, and why: edits are saved as a DRAFT. Customers keep seeing the
// old prices until "Update price list & database" is pressed, which publishes
// them and makes them live on the very next click — no deploy, no waiting.
// That gap is deliberate: it gives a review step before a typo reaches a quote.

/** What the first-time import found already repeated in the catalogue file. */
interface SeedNames {
  duplicateNames: number;
  examples: string[];
}
/** Said once, at the end of the import, because the import cannot refuse them:
 *  it replays the catalogue the app ships with, and stopping half way through
 *  would leave the price list unusable. The Components tab lists them in full. */
const duplicateSeedNote = (s: SeedNames) =>
  `Note: ${s.duplicateNames} name${s.duplicateNames === 1 ? " is" : "s are"} used by more than one item ` +
  `(${s.examples.slice(0, 3).join("; ")}${s.examples.length > 3 ? "; …" : ""}). ` +
  `They were imported as they are — see the warning on the Components tab.`;

const GROUPS: { kind: RmuPriceRow["kind"]; title: string; hint: string }[] = [
  { kind: "PANEL", title: "RMU panels", hint: "Minimum price per panel configuration (USD)" },
  { kind: "LUCY", title: "Lucy AEGIS PLUS", hint: "Price per configuration (USD)" },
  { kind: "RTU", title: "Smart / RTU", hint: "Added when a Smart/RTU option is chosen" },
  { kind: "ADDON", title: "Add-ons", hint: "Extras such as the outdoor enclosure" },
];

export default function PricingAdminPage() {
  const { confirm, dialogs } = useDialogs();
  const [status, setStatus] = useState<PricingStatus | null>(null);
  const [rows, setRows] = useState<RmuPriceRow[] | null>(null);
  const [pending, setPending] = useState<PriceChangeRow[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState("");
  const [section, setSection] = useState<"RMU" | "LV">("LV");
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
            .then((seeded) => {
              // The catalogue file itself contains repeated descriptions. The
              // seed is allowed to write them (refusing would leave the price
              // list half-built), so it says so instead of staying quiet.
              if (seeded.duplicateNames > 0) setToast(duplicateSeedNote(seeded));
              return api.pricing.status().then(setStatus);
            })
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
  const importLvCatalogue = async (): Promise<SeedNames> => {
    const CHUNK = 300;
    // What the catalogue file itself repeats. Each chunk answers for the whole
    // table, so the last answer is the final one.
    let duplicateNames = 0;
    let examples: string[] = [];
    for (let i = 0; i < COMPONENTS.length; i += CHUNK) {
      const slice = COMPONENTS.slice(i, i + CHUNK).map((c, j) => ({ ...c, sortIndex: i + j }));
      const r = await api.pricing.lvSeedChunk("LV_COMPONENTS", i, slice);
      duplicateNames = r.duplicateNames ?? duplicateNames;
      examples = r.duplicateExamples ?? examples;
      setProgress(`Importing components… ${Math.min(i + CHUNK, COMPONENTS.length)} of ${COMPONENTS.length}`);
    }
    for (let i = 0; i < ENCLOSURES.length; i += CHUNK) {
      const slice = ENCLOSURES.slice(i, i + CHUNK).map((e, j) => ({ ...e, sortIndex: i + j }));
      await api.pricing.lvSeedChunk("LV_ENCLOSURES", i, slice);
      setProgress(`Importing enclosures… ${Math.min(i + CHUNK, ENCLOSURES.length)} of ${ENCLOSURES.length}`);
    }
    setProgress("Saving pricing factors…");
    await api.pricing.lvSettings(DEFAULT_FACTORS);
    return { duplicateNames, examples };
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
      const seeded = await importLvCatalogue();

      setToast(
        `Price list created — ${Object.values(r.counts).reduce((a, b) => a + b, 0)} RMU prices, ` +
          `${COMPONENTS.length} components and ${ENCLOSURES.length} enclosures imported.` +
          (seeded.duplicateNames > 0 ? ` ${duplicateSeedNote(seeded)}` : "")
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
      !(await confirm({
        title: `Retire "${row.label || row.key}"`,
        message:
          "It stops being offered from the next publish.\n" +
          "Quotations already saved keep this product and its price, and are not affected.",
        confirmLabel: "Retire it",
      }))
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
      // Pull what was just published into THIS session too, or the configurator
      // would keep quoting the catalogue this tab signed in with.
      await refreshCatalog(getToken());
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
  // Locked only for people with NO price access at all. "View price list" gets the
  // real page with the editing controls disabled — otherwise granting view-only
  // access showed the same padlock as granting nothing.
  if (!status.canView && !status.canEdit && status.seedState === "READY") {
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
      {dialogs}
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

      {/* ── Publish bar ──────────────────────────────────────────────────────
          Publishing is offered whenever the live list is behind the database —
          not only when there are unpublished EDITS. Prices also arrive by
          import or first-run seed, which write no edit rows; gating on those
          alone left the price list stuck with the publish button greyed out. */}
      {status.seedState === "READY" &&
        (() => {
          const behind = status.behindLive === true;
          const needsPublish = pending.length > 0 || behind;
          return (
            <div
              className={`card mb-4 flex flex-wrap items-center justify-between gap-3 p-4 ${
                needsPublish ? "border-amber-300 bg-amber-50/60 dark:border-amber-400/40 dark:bg-amber-400/10" : ""
              }`}
            >
              <div>
                <p className="text-sm font-bold text-ink">
                  {pending.length > 0
                    ? `${pending.length} change${pending.length === 1 ? "" : "s"} waiting to go live`
                    : behind
                    ? "The live price list is behind"
                    : "No unpublished changes"}
                </p>
                <p className="text-xs text-muted">
                  {pending.length > 0
                    ? "Customers still see the old prices until you publish."
                    : behind
                    ? "Prices in the database are newer than the ones quotations use. Publish to send them live."
                    : "Every price change goes live as you make it. This button is only needed if one didn’t."}
                </p>
              </div>
              <button
                className="btn-primary"
                disabled={!needsPublish || busy === "publish"}
                onClick={() => setConfirming(true)}
              >
                {busy === "publish" ? "Publishing…" : "Update price list & database"}
              </button>
            </div>
          );
        })()}

      {/* ── Review sheet ─────────────────────────────────────────────────── */}
      {confirming && (
        <div className="card mb-4 border-brand/40 p-4">
          <h2 className="sec-head">Review before publishing</h2>
          {pending.length === 0 && (
            <p className="mb-3 rounded-lg border border-line bg-surface p-3 text-xs font-semibold text-muted">
              No individual edits to list — the prices in the database are simply newer than the published list
              (an import or the first-run copy). Publishing sends the current database prices to quotations.
            </p>
          )}
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
          <div className="mb-4 flex items-center justify-between gap-2 border-b border-line">
            <div className="flex gap-2">
              {(["LV", "RMU"] as const).map((s) => (
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
            <History onChanged={loadAll} />
          </div>

          {/* Only meaningful once the LV catalogue exists — before that, setup writes
              these itself. */}
          {section === "LV" && status.counts.lvComponents > 0 && <DefaultRates onSaved={loadAll} />}

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

/**
 * Items that already share a name.
 *
 * The app cannot tell two items with the same name apart: everywhere a part is
 * looked up by its description — the ATS / MCC / photocell combinations, and the
 * breaker dropdowns, which show the description as the label — the first one in
 * the list wins. When the two carry different prices, that difference is quoted
 * without anybody choosing it.
 *
 * Shown, not fixed. Which of a pair is the right one is a commercial decision:
 * they are two different ABB order codes, and renaming or removing one changes
 * what the combinations resolve to. New ones are refused from now on; these are
 * the ones that were already here.
 */
function DuplicateNames({ reloadKey }: { reloadKey: number }) {
  const [rep, setRep] = useState<LvDuplicateNames | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.pricing.lvDuplicateNames().then(setRep).catch(() => setRep(null));
  }, [reloadKey]);

  if (!rep || rep.total === 0) return null;

  const priceOf = (i: LvDuplicateNames["groups"][number]["items"][number]) =>
    i.eur > 0 ? `€${i.eur.toFixed(2)}` : i.egp > 0 ? `${i.egp.toLocaleString()} EGP` : "no price";
  // Same money, different order code, is a different problem from same name,
  // different money — only the second one changes what a customer is charged.
  const gap = (g: LvDuplicateNames["groups"][number]) => {
    const [a, b] = g.items;
    if (!b) return "";
    const va = a.eur > 0 ? a.eur : a.egp;
    const vb = b.eur > 0 ? b.eur : b.egp;
    if (!va || !vb || (a.eur > 0) !== (b.eur > 0)) return ""; // euro vs pound: not comparable here
    if (Math.abs(va - vb) < 0.005) return "same price";
    return `${(Math.abs(vb - va) / Math.min(va, vb) * 100).toFixed(0)}% apart`;
  };

  return (
    <div className="card mb-3 border-amber-300 bg-amber-50/60 p-3 dark:border-amber-400/40 dark:bg-amber-400/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">
          ⚠ {rep.total} name{rep.total === 1 ? " is" : "s are"} used by more than one item
        </p>
        <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show them"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Two items with the same name cannot be told apart — the app uses whichever comes first in the list, so where the
        two prices differ, the difference is quoted without anyone choosing it. Nothing has been changed: which of each
        pair is the right one is your decision. Adding a new item with a name that is already used is now refused.
      </p>
      {open && (
        <ul className="mt-2 max-h-72 space-y-2 overflow-auto rounded-lg border border-amber-300/60 bg-white p-2 text-xs dark:bg-transparent">
          {rep.groups.map((g) => (
            <li key={g.name}>
              <div className="font-semibold text-ink">
                {g.name}
                {gap(g) && <span className="ml-2 font-normal text-muted">({gap(g)})</span>}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {g.items.map((i, n) => (
                  <div key={i.id} className="flex flex-wrap gap-x-2 text-muted">
                    <span className="font-mono text-[11px]">{i.ref || "no item code"}</span>
                    <span>{priceOf(i)}</span>
                    {n === 0 && <span className="font-semibold text-amber-700 dark:text-amber-300">← this one is used</span>}
                    {!i.active && <span>(removed from the list)</span>}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** LV price list — 2,121 components and 253 enclosures, with Excel-style
 *  filtering. Filtering and paging happen on the SERVER (50 rows at a time), so
 *  the screen stays fast no matter how big the catalogue gets. */
/**
 * The pole count, editable in place.
 *
 * Connection copper is costed as (copper per pole × poles), so an item recorded
 * with no poles has its copper priced at zero and is quoted for less than it
 * costs. Everything else on this table is set through the Excel upload, but that
 * only reaches items in a downloaded sheet — an item added straight to the live
 * site had no way to be corrected at all. A cell with copper weight but no pole
 * count is tinted amber, so the broken ones can be spotted by scrolling.
 */
function PolesCell({
  row,
  onSaved,
  onError,
}: {
  row: LvRow;
  onSaved: (row: LvRow) => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState(row.poles ? String(row.poles) : "");
  const [busy, setBusy] = useState(false);
  // Re-sync when the row is replaced underneath us (filter change, page change).
  useEffect(() => setText(row.poles ? String(row.poles) : ""), [row.id, row.poles]);

  const current = row.poles ?? 0;
  const missing = !current && !!((row.cuP ?? 0) > 0 || (row.cuC ?? 0) > 0);

  const save = async () => {
    const n = Math.trunc(Number(text));
    if (text.trim() === "" || !Number.isFinite(n) || n < 0 || n > 12) {
      setText(current ? String(current) : ""); // reject silently, put it back
      return;
    }
    if (n === current) return;
    setBusy(true);
    try {
      const r = await api.pricing.lvUpdatePoles(row.id, n);
      onSaved(r.row);
      void refreshCatalog(getToken()); // the edit publishes — reload this session's catalogue
    } catch (e) {
      onError((e as Error).message);
      setText(current ? String(current) : "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <input
      type="number"
      min={0}
      max={12}
      step={1}
      value={text}
      disabled={busy}
      placeholder="—"
      title={missing ? "No pole count — this item's connection copper is being costed at zero" : "Poles"}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(current ? String(current) : "");
          e.currentTarget.blur();
        }
      }}
      className={`w-14 rounded border px-1.5 py-0.5 text-right text-xs tabular-nums outline-none transition focus:border-brand ${
        missing
          ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"
          : "border-transparent bg-transparent text-ink hover:border-line"
      } disabled:opacity-50`}
    />
  );
}

function LvPrices() {
  const { confirm, dialogs } = useDialogs();
  const [kind, setKind] = useState<"components" | "enclosures" | "combos">("components");
  // Combinations are owner-only (access.manage) — a stricter gate than the rest of
  // the price list, because editing a template changes what a combination charges
  // for, not just what it is called. Asked once; the server enforces it regardless.
  const [mayEditCombos, setMayEditCombos] = useState(false);
  useEffect(() => {
    api.access
      .me()
      .then((m) => setMayEditCombos(m.perms.includes("access.manage")))
      .catch(() => setMayEditCombos(false));
  }, []);
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
  // Bumped whenever rows are written, so the duplicate-name warning re-counts.
  const [reloadKey, setReloadKey] = useState(0);
  const take = 50;

  useEffect(() => {
    api.pricing.lvFacets().then(setFacets).catch(() => setFacets(null));
  }, []);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    if (kind === "combos") return; // templates, not priced rows — nothing to list
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

  const toggleRetire = async (row: LvRow) => {
    if (kind === "combos") return; // unreachable — the row table isn't rendered for combinations
    const removing = row.active !== false;
    if (
      removing &&
      !(await confirm({
        title: `Remove "${row.d || row.name || row.ref}"`,
        message:
          "It stops being offered for new work from the next publish.\n" +
          "Quotations already saved keep this item and its price, and you can restore it at any time.",
        confirmLabel: "Remove from the list",
      }))
    )
      return;
    setBusy(row.id);
    setErr("");
    try {
      const r = await api.pricing.lvRetire(row.id, kind, !removing);
      setRows((rs) => (rs ? rs.map((x) => (x.id === row.id ? r.row : x)) : rs));
      void refreshCatalog(getToken()); // retiring publishes too
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

  const tabRow = (
    <div className="mb-3 flex gap-1">
      {(["components", "enclosures", "combos"] as const)
        .filter((k) => k !== "combos" || mayEditCombos)
        .map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition ${
              kind === k ? "bg-brand text-white" : "bg-brand-tint/60 text-brand-dark hover:bg-brand-tint"
            }`}
          >
            {k === "components" ? "Components" : k === "enclosures" ? "Enclosures & cells" : "Combinations"}
          </button>
        ))}
    </div>
  );

  // Combinations are templates, not priced rows — no search, filters or paging
  // apply — so they replace the table view rather than sharing it.
  if (kind === "combos") {
    return <div>{tabRow}<LvCombosPanel /></div>;
  }

  return (
    <div>
      {dialogs}
      {tabRow}

      {/* Items already sharing a name. Components only — enclosure names are
          unique in the database, so the case cannot arise there. */}
      {kind === "components" && <DuplicateNames reloadKey={reloadKey} />}

      {/* Bulk update from a spreadsheet — for a whole new supplier price list,
          where editing rows one at a time is not realistic. */}
      <div className="card mb-3 p-3">
        <LvExcelImport
          onApplied={() => {
            setPage(0);
            setReloadKey((k) => k + 1);
            api.pricing.lvList({ kind, q, type, brand, fam, noPrice, page: 0, take }).then((r) => {
              setRows(r.rows);
              setTotal(r.total);
            });
            api.pricing.lvFacets().then(setFacets).catch(() => {});
            // An import publishes on apply, so this session's catalogue is now a
            // version behind — reload it or the configurator keeps the old text.
            void refreshCatalog(getToken());
          }}
        />
      </div>

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
                <th className="px-4 py-2 w-28">Brand</th>
                <th className="px-4 py-2 w-28 text-right">Price EUR</th>
                <th className="px-4 py-2 w-28 text-right">Price EGP</th>
                {kind === "components" && <th className="px-4 py-2 w-16 text-right">Poles</th>}
                {kind === "components" && <th className="px-4 py-2 w-24 text-right">Weight/Panel/Pole</th>}
                {kind === "components" && <th className="px-4 py-2 w-24 text-right">Weight/Cell/Pole</th>}
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isComp = kind === "components";
                return (
                <tr key={r.id} className={`border-t border-line ${r.active === false ? "bg-slate-50/70" : ""}`}>
                  <td className="px-4 py-2">
                    <div className={`font-medium ${r.active === false ? "text-muted line-through" : "text-ink"}`}>
                      {r.d || r.name || r.n || r.ref}
                      {r.active === false && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                          REMOVED
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted">
                      {[r.ref, r.f, r.r, r.ip].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{r.t || r.fam}</td>
                  <td className="px-4 py-2 text-xs font-medium text-ink">{r.brand || "—"}</td>
                  {isComp ? (
                    <>
                      {/* Prices are read-only here — they are managed through the Excel upload. */}
                      <td className="px-4 py-2 text-right font-medium text-ink">{r.eur ? r.eur.toFixed(2) : "—"}</td>
                      <td className="px-4 py-2 text-right font-medium text-ink">{r.egp ? r.egp.toLocaleString() : "—"}</td>
                      <td className="px-4 py-2 text-right text-xs text-ink">
                        <PolesCell
                          row={r}
                          onSaved={(u) => setRows((rs) => (rs ? rs.map((x) => (x.id === u.id ? u : x)) : rs))}
                          onError={setErr}
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-ink">{r.cuP ? r.cuP : "—"}</td>
                      <td className="px-4 py-2 text-right text-xs text-ink">{r.cuC ? r.cuC : "—"}</td>
                    </>
                  ) : (
                    <>
                      {/* Enclosure prices are read-only too — set via the Excel upload. */}
                      <td className="px-4 py-2 text-right font-medium text-ink">{r.eur ? r.eur.toFixed(2) : "—"}</td>
                      <td className="px-4 py-2 text-right font-medium text-ink">{r.egp ? r.egp.toLocaleString() : "—"}</td>
                    </>
                  )}
                  {/* Remove / Restore stays in the UI (prices are still Excel-only). */}
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy === r.id}
                      title={r.active === false ? "Offer this item again" : "Stop offering this item"}
                      onClick={() => toggleRetire(r)}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface hover:text-ink"
                    >
                      {r.active === false ? "Restore" : "Remove"}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        {kind === "components"
          ? "Poles can be edited here — click the number, type, press Enter. It goes live straight away, because connection copper is costed as copper-per-pole × poles, so an item with no poles is quoted with no copper cost at all (those are tinted amber). Prices and copper weights are still read-only — set them through the Excel upload above (matched on Item Code), then re-upload. Use Remove to stop offering an item."
          : "Prices are read-only here — set them through the Excel upload above (matched on Item Code), then re-upload. Use Remove to stop offering an item."}
      </p>
    </div>
  );
}

/**
 * The rates a NEW quotation starts from.
 *
 * These live in the published price book, so they were only ever written once,
 * during first-time setup — there was no way to change them afterwards from
 * anywhere in the app. The configurator's own "Pricing Settings" tab edits a
 * single quotation, not the defaults, which is a genuinely easy thing to confuse.
 *
 * Saving publishes, so the new rates reach everyone on their next click. Existing
 * quotations are untouched: each one carries the rates it was built with, on
 * purpose, so an offer already sent never re-prices itself.
 */
function DefaultRates({ onSaved }: { onSaved: () => void }) {
  const [usd, setUsd] = useState("");
  const [euro, setEuro] = useState("");
  const [safety, setSafety] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Seed the fields from what is published right now.
  useEffect(() => {
    setUsd(String(DEFAULT_FACTORS.usd ?? ""));
    setEuro(String(DEFAULT_FACTORS.euro ?? ""));
    setSafety(String(((DEFAULT_FACTORS.safetyFactor ?? 0) * 100).toFixed(2).replace(/\.?0+$/, "")));
  }, []);

  const save = async () => {
    const u = Number(usd), e = Number(euro), s = Number(safety);
    if (![u, e, s].every(Number.isFinite) || u <= 0 || e <= 0 || s < 0 || s > 10) {
      setErr("Enter a USD and EUR rate above zero, and a safety factor between 0 and 10%.");
      return;
    }
    setBusy(true); setErr(""); setMsg("");
    try {
      // Stored as a fraction — the field is a percentage, so 2 means ×1.02.
      await api.pricing.lvSettings({ usd: u, euro: e, safetyFactor: s / 100 });
      const r = await api.pricing.publish();
      await refreshCatalog(getToken());
      setMsg(`Saved and published (version ${r.version}). New quotations start from these.`);
      onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mb-4 p-4">
      <h2 className="sec-head mb-0">Default rates for new quotations</h2>
      <p className="mb-3 mt-1 text-xs text-muted">
        What a brand-new quotation starts from. Quotations already saved keep the rates they
        were built with, so nothing already sent to a customer changes.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="dr-usd">USD → EGP</label>
          <input id="dr-usd" className="input w-32" type="number" step="0.01" min="0"
            value={usd} onChange={(e) => setUsd(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="dr-eur">EUR → EGP</label>
          <input id="dr-eur" className="input w-32" type="number" step="0.01" min="0"
            value={euro} onChange={(e) => setEuro(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="dr-sf">Safety factor (%)</label>
          <input id="dr-sf" className="input w-32" type="number" step="0.1" min="0" max="10"
            value={safety} onChange={(e) => setSafety(e.target.value)} />
        </div>
        <button className="btn-primary mb-0.5" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save & publish"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm font-semibold text-red-700">{err}</p>}
      {msg && <p className="mt-2 text-sm font-semibold text-green-700">{msg}</p>}
    </div>
  );
}

/** History of every price change, with one-click undo. Undo is applied as a NEW
 *  change (never by rewriting the record), so the trail stays complete. */
function History({ onChanged }: { onChanged: () => void }) {
  const { notify, dialogs } = useDialogs();
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
      await notify({ title: "That undo was refused", message: (e as Error).message });
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
      {dialogs}
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
