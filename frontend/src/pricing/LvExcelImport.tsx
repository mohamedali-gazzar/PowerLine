// Bulk LV price update from a spreadsheet.
//
// The workbook is read here in the browser and sent as plain rows, so the
// server never deals with file uploads. Nothing is written until the summary
// has been read and confirmed.

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { api, type LvImportPreview, type LvImportRow } from "../api";
import { bundledCatalog } from "../lv/catalogSource";

/** The columns the template ships with, in order. */
export const TEMPLATE_COLUMNS = [
  "Type",
  "Description",
  "Item Code",
  "ABB Price list in EURO",
  "Market Price in EGP",
  "IP",
  "Mounting",
  "RAL",
  "Cross Section",
  "Weight/Panel/Pole",
  "Weight/Cell/Pole",
  "Brand",
] as const;

/** Headers arrive with stray spaces and varying case — match on a flattened key. */
const flat = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const HEADER_ALIASES: Record<string, string> = {
  "type": "type",
  "description": "description",
  "item code": "code",
  "code": "code",
  "reference": "code",
  "abb price list in euro": "eur",
  "price eur": "eur",
  "eur": "eur",
  "market price in egp": "egp",
  "price egp": "egp",
  "egp": "egp",
  "brand": "brand",
  "poles": "poles",
};

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.eE+-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Turn a sheet into import rows, tolerating column order and stray spaces. */
export function parseWorkbook(buf: ArrayBuffer): { rows: LvImportRow[]; missing: string[] } {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  const rows: LvImportRow[] = [];
  const seenKeys = new Set<string>();

  for (const r of raw) {
    const mapped: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const key = HEADER_ALIASES[flat(k)];
      if (key) {
        mapped[key] = v;
        seenKeys.add(key);
      }
    }
    const code = String(mapped.code ?? "").trim();
    const description = String(mapped.description ?? "").trim();
    if (!code && !description) continue; // blank spacer line

    rows.push({
      type: String(mapped.type ?? "").trim(),
      description,
      code,
      eur: toNum(mapped.eur),
      egp: toNum(mapped.egp),
      brand: String(mapped.brand ?? "").trim(),
      poles: Math.trunc(toNum(mapped.poles)),
    });
  }

  const missing: string[] = [];
  if (!seenKeys.has("code")) missing.push("Item Code");
  if (!seenKeys.has("eur") && !seenKeys.has("egp")) missing.push("ABB Price list in EURO / Market Price in EGP");
  return { rows, missing };
}

/**
 * The catalogue that ships inside the app, expressed as import rows.
 *
 * This is what makes the two halves reconcilable. The bundled file is only the
 * factory default — the database is the real price list — so when the file is
 * updated in a release, this feeds it through the SAME merging, audited import
 * as a spreadsheet rather than overwriting anything.
 */
export function catalogueRows(): LvImportRow[] {
  // The PRISTINE shipped catalogue — never the live arrays, which by now hold
  // the database's own prices and would compare equal to themselves.
  const { components: COMPONENTS, enclosures: ENCLOSURES } = bundledCatalog();
  const rows: LvImportRow[] = [];
  for (const c of COMPONENTS) {
    if (!c.ref) continue; // spacers carry no part number and no price
    rows.push({
      type: c.t ?? "",
      description: c.d ?? "",
      code: c.ref,
      eur: c.eur ?? 0,
      egp: c.egp ?? 0,
      brand: c.brand ?? "",
      poles: c.poles ?? 0,
    });
  }
  for (const e of ENCLOSURES) {
    if (!e.ref) continue;
    rows.push({
      type: "",
      description: e.name ?? "",
      code: e.ref,
      eur: e.eur ?? 0,
      egp: e.egp ?? 0,
      brand: "",
      poles: 0,
    });
  }
  return rows;
}

/** Download an empty workbook with the expected columns. */
export function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS as unknown as string[]]);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(12, Math.min(38, c.length + 6)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Price list");
  XLSX.writeFile(wb, "PowerLine LV price list template.xlsx");
}

const pct = (v: number | null | undefined) => (typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—");
const money = (eur: number, egp: number) => (eur > 0 ? `€${eur.toFixed(2)}` : egp > 0 ? `${egp.toLocaleString()} EGP` : "—");

export default function LvExcelImport({ onApplied }: { onApplied: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<LvImportPreview | null>(null);
  const [tab, setTab] = useState<"updates" | "additions" | "warnings">("updates");
  const [done, setDone] = useState("");

  const pickFile = () => {
    setError("");
    setDone("");
    fileRef.current?.click();
  };

  /** Compare the catalogue shipped in this release against the database. */
  const checkAppCatalogue = async () => {
    setError("");
    setDone("");
    setBusy("Comparing with the app catalogue…");
    try {
      const rows = catalogueRows();
      const p = await api.pricing.lvImportPreview(rows);
      if (p.summary.updates + p.summary.additions === 0) {
        await api.pricing.lvImportCancel(p.batchId).catch(() => {});
        setDone("The database already matches the app catalogue — nothing to sync.");
        return;
      }
      setPreview(p);
      setTab("updates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compare with the app catalogue.");
    } finally {
      setBusy("");
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be chosen again after a cancel
    if (!file) return;

    setBusy("Reading the file…");
    setError("");
    try {
      const { rows, missing } = parseWorkbook(await file.arrayBuffer());
      if (missing.length) {
        setError(`This sheet is missing: ${missing.join(", ")}. Download the template to see the expected columns.`);
        return;
      }
      if (!rows.length) {
        setError("No rows found in the first sheet.");
        return;
      }
      setBusy(`Checking ${rows.length.toLocaleString()} rows against the price list…`);
      setPreview(await api.pricing.lvImportPreview(rows));
      setTab("updates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy("");
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy("Applying…");
    setError("");
    try {
      const r = await api.pricing.lvImportApply(preview.batchId);
      setPreview(null);
      const head = `${r.updated.toLocaleString()} item(s) updated, ${r.added} item(s) added`;
      if (r.published) {
        setDone(`${head} — live in quotations now.`);
      } else {
        // Saved to the draft but NOT published, so nobody sees it yet. The guards are
        // RMU-side, so say which one stopped it instead of leaving it to be discovered.
        setError(
          `${head}, but they are NOT live yet — publishing was blocked.` +
            (r.blockers?.length ? ` ${r.blockers.join(" · ")}.` : "") +
            ` Fix that, then press “Update price list & database”.`,
        );
      }
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the import.");
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    const id = preview?.batchId;
    setPreview(null);
    if (id) await api.pricing.lvImportCancel(id).catch(() => {});
  };

  const s = preview?.summary;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={pickFile} disabled={!!busy}>
          {busy || "⬆ Update from Excel"}
        </button>
        <button className="btn-ghost" onClick={checkAppCatalogue} disabled={!!busy}>
          ⟳ Check app catalogue
        </button>
        <button className="btn-ghost" onClick={downloadTemplate} disabled={!!busy}>
          ⬇ Empty template
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onFile}
        />
      </div>

      {error && !preview && (
        <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}
      {done && (
        <p className="mt-2 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-300">
          ✓ {done}
        </p>
      )}

      {preview &&
        s &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={cancel} />
            <div
              role="dialog"
              aria-modal="true"
              className="relative flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl2 border border-line bg-white p-6 shadow-lift animate-pop"
            >
              <h2 className="sec-head">Review before applying</h2>
              <p className="-mt-1 mb-3 text-xs text-muted">
                Read {s.rowsRead.toLocaleString()} rows. Nothing has been changed yet.
              </p>

              {/* Headline counts */}
              <div className="grid gap-2 sm:grid-cols-4">
                <Stat label="Items to update" value={s.updates.toLocaleString()} tone="brand" />
                <Stat label="New items to add" value={String(s.additions)} tone="brand" />
                <Stat label="Already correct" value={s.unchanged.toLocaleString()} />
                <Stat label="Left untouched" value={String(s.blankKept)} hint="blank price cell" />
              </div>

              {s.updates > 0 && (
                <p className="mt-3 rounded-lg border border-line bg-surface p-2.5 text-xs font-semibold text-ink">
                  {s.priceUpdates.toLocaleString()} price{s.priceUpdates === 1 ? "" : "s"} ·{" "}
                  {s.dataUpdates.toLocaleString()} data change{s.dataUpdates === 1 ? "" : "s"}
                  {s.priceUpdates > 0 && (
                    <>
                      {" "}
                      · {s.increases.toLocaleString()} up · {s.decreases.toLocaleString()} down · median{" "}
                      {pct(s.medianPct)} (range {pct(s.minPct)} to {pct(s.maxPct)})
                    </>
                  )}
                </p>
              )}

              {s.renames > 0 && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                  ⚠ {s.renames.toLocaleString()} description{s.renames === 1 ? "" : "s"} renamed. Combination templates
                  (ATS / MCC / WD) find parts by description — check the Warnings tab before applying.
                </p>
              )}

              {(s.unpriced > 0 || s.duplicates > 0 || s.noCode > 0) && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                  ⚠ Skipped:{" "}
                  {[
                    s.unpriced > 0 && `${s.unpriced} new item(s) with no price`,
                    s.duplicates > 0 && `${s.duplicates} repeated item code(s)`,
                    s.noCode > 0 && `${s.noCode} row(s) with no item code`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}

              {/* Detail */}
              <div className="mt-3 flex gap-1.5">
                {(["updates", "additions", "warnings"] as const).map((t) => {
                  const n = t === "updates" ? preview.updates.length : t === "additions" ? preview.additions.length : preview.warnings.length;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition ${
                        tab === t ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand/40"
                      }`}
                    >
                      {t} ({n})
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 min-h-[9rem] flex-1 overflow-auto rounded-lg border border-line">
                {tab === "warnings" ? (
                  preview.warnings.length ? (
                    <ul className="divide-y divide-line text-xs">
                      {preview.warnings.map((w, i) => (
                        <li key={i} className="px-3 py-1.5 text-amber-700 dark:text-amber-300">{w}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-4 text-center text-xs text-muted">Nothing to flag.</p>
                  )
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface text-left uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-3 py-2 font-bold">Item code</th>
                        <th className="px-3 py-2 font-bold">Description</th>
                        {tab === "updates" && <th className="px-3 py-2 text-right font-bold">Was</th>}
                        <th className="px-3 py-2 text-right font-bold">{tab === "updates" ? "Becomes" : "Price"}</th>
                        {tab === "updates" && <th className="px-3 py-2 text-right font-bold">Change</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(tab === "updates" ? preview.updates : preview.additions).map((d, i) => {
                        // A data-only row keeps its price — show it as untouched, not as a move.
                        const priceHeld = tab === "updates" && d.priceMoved === false;
                        return (
                        <tr key={d.code + i} className="border-t border-line align-top">
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-muted">{d.code}</td>
                          <td className="px-3 py-1.5 text-ink">
                            {d.label}
                            {!!d.fields?.length && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {d.fields.map((fc) => (
                                  <span
                                    key={fc.field}
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      fc.field === "d"
                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200"
                                        : "bg-brand-tint text-brand-dark"
                                    }`}
                                    title={`${fc.label}: ${fc.from || "—"} → ${fc.to}`}
                                  >
                                    {fc.label}: {fc.from || "—"} → {fc.to}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          {tab === "updates" && (
                            <td className="whitespace-nowrap px-3 py-1.5 text-right text-muted">
                              {money(d.fromEur ?? 0, d.fromEgp ?? 0)}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold text-ink">
                            {priceHeld ? <span className="font-normal text-muted">kept</span> : money(d.eur, d.egp)}
                          </td>
                          {tab === "updates" && (
                            <td
                              className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold ${
                                (d.pct ?? 0) > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted"
                              }`}
                            >
                              {priceHeld ? "—" : pct(d.pct)}
                            </td>
                          )}
                        </tr>
                        );
                      })}
                      {(tab === "updates" ? preview.updates : preview.additions).length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-muted">
                            Nothing in this list.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
              {preview.truncated && (
                <p className="mt-1 text-[11px] text-muted/80">
                  Showing the first 300 of each. Every row is applied — the list above is just a sample.
                </p>
              )}

              {error && (
                <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </p>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button className="btn-ghost" onClick={cancel} disabled={!!busy}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={apply} disabled={!!busy || s.updates + s.additions === 0}>
                  {busy || `Apply ${(s.updates + s.additions).toLocaleString()} change${s.updates + s.additions === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "brand"; hint?: string }) {
  return (
    <div className={`rounded-lg border p-2.5 ${tone === "brand" ? "border-brand/40 bg-brand-tint" : "border-line bg-white"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold text-ink">{value}</div>
      {hint && <div className="text-[10px] text-muted/70">{hint}</div>}
    </div>
  );
}
