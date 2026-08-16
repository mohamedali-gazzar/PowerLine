// Bulk LV price update from a spreadsheet.
//
// The workbook is read here in the browser and sent as plain rows, so the
// server never deals with file uploads. Nothing is written until the summary
// has been read and confirmed.

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { api, type LvImportPreview, type LvImportRow, type LvRow } from "../api";

/** The current-catalogue export follows the master "Configurator Price list" layout:
 *  same columns, order and (quirky) spacing, so it lines up with the sheet the
 *  catalogue was maintained in — plus a Poles column the master never had (see below).
 *  On upload the import reads Type, Description, Item Code, the two prices, Poles, the
 *  two weights and Brand; IP / Mounting / RAL / Cross Section / ABB Discount ride along
 *  for reference and are not applied. Column ORDER does not matter on the way in — the
 *  parser matches on the header text — so an older sheet without Poles still imports.
 *  (The blank-template download was removed on 13 Aug 2026; these columns are still
 *  the export header, so the name is kept to avoid churn across the parser.) */
export const EMPTY_TEMPLATE_COLUMNS = [
  "Type",
  "Description",
  "Item Code",
  " ABB Price list in EURO ",
  " Market Price in EGP ",
  "IP",
  "Mounting",
  "RAL",
  "Cross Section",
  // Connection copper is costed as (kg per pole × POLES), so a missing pole count
  // makes an item's copper free. This column was in neither the export nor the
  // parser's header list, so a download → edit → upload round trip silently
  // dropped it and pole counts could not be corrected from this screen at all.
  // Spelled the master price list's way so a downloaded sheet matches it exactly.
  // Added 13 Aug 2026.
  "No.poles",
  "Weight/Panel/Pole",
  "Weight/Cell/Pole",
  " Brand ",
  " ABB Discount ",
] as const;

/** Headers arrive with stray spaces and varying case — match on a flattened key. */
const flat = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const HEADER_ALIASES: Record<string, string> = {
  "type": "type",
  "family": "family",
  "rating": "rating",
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
  // The master "Configurator Price list" calls this column "No.poles", which was
  // recognised by nothing — so every import from the master silently dropped pole
  // counts, which is how 22 items ended up costing no connection copper at all.
  // Both spellings are accepted; the export writes the master's.
  "poles": "poles",
  "no.poles": "poles",
  "no. poles": "poles",
  "no poles": "poles",
  "no.of poles": "poles",
  "no. of poles": "poles",
  "number of poles": "poles",
  // These two ship in the template and were parsed by nobody until now.
  "weight/panel/pole": "cuP",
  "weight/cell/pole": "cuC",
  "stock": "stock",
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
      family: String(mapped.family ?? "").trim(),
      rating: String(mapped.rating ?? "").trim(),
      description,
      code,
      eur: toNum(mapped.eur),
      egp: toNum(mapped.egp),
      brand: String(mapped.brand ?? "").trim(),
      poles: Math.trunc(toNum(mapped.poles)),
      cuP: toNum(mapped.cuP),
      cuC: toNum(mapped.cuC),
      stock: String(mapped.stock ?? "").trim(),
    });
  }

  const missing: string[] = [];
  if (!seenKeys.has("code")) missing.push("Item Code");
  if (!seenKeys.has("eur") && !seenKeys.has("egp")) missing.push("ABB Price list in EURO / Market Price in EGP");
  return { rows, missing };
}

const pct = (v: number | null | undefined) => (typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—");
const money = (eur: number, egp: number) => (eur > 0 ? `€${eur.toFixed(2)}` : egp > 0 ? `${egp.toLocaleString()} EGP` : "—");

export default function LvExcelImport({ onApplied, extra }: { onApplied: () => void; extra?: ReactNode }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [dl, setDl] = useState(""); // "Download current" progress text
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<LvImportPreview | null>(null);
  const [tab, setTab] = useState<"updates" | "additions" | "noCode" | "warnings">("updates");
  const [done, setDone] = useState("");
  // Rows the name rule refused at apply time — the catalogue can have moved on
  // since the preview, so these are not always the ones the preview flagged.
  const [notes, setNotes] = useState<string[]>([]);
  // Rows with no item code are matched on description and applied only if ticked.
  const [includeNoCode, setIncludeNoCode] = useState(false);

  const pickFile = () => {
    setError("");
    setDone("");
    setNotes([]);
    fileRef.current?.click();
  };

  // Export the whole current catalogue in the master price-list layout, so it
  // matches the sheet the catalogue is maintained in and re-imports cleanly by
  // Item Code. IP / Mounting / RAL / Cross Section are blank (components carry
  // none); ABB Discount follows the system's rule (an ABB item priced in EUR).
  // Paged (server caps a page at 200), in catalogue (sortIndex) order.
  const downloadCurrent = async () => {
    setError("");
    setDone("");
    setDl("Preparing…");
    try {
      const take = 200;
      const fetchAll = async (kind: "components" | "enclosures") => {
        const out: LvRow[] = [];
        for (let page = 0; ; page++) {
          const r = await api.pricing.lvList({ kind, take, page });
          out.push(...r.rows);
          setDl(`Preparing… ${kind} ${out.length.toLocaleString()} / ${r.total.toLocaleString()}`);
          if (out.length >= r.total || r.rows.length === 0) break;
        }
        return out;
      };
      const comps = await fetchAll("components");
      const encs = await fetchAll("enclosures");
      const header = EMPTY_TEMPLATE_COLUMNS as unknown as string[];
      // Components carry Type/prices/weights/Brand; enclosures & cells carry their
      // family (→ Type), IP/Mounting/RAL and price. Both flow into one master sheet.
      const compBody = comps.map((r) => [
        r.t ?? "",                                            // Type
        r.d ?? "",                                            // Description
        r.ref ?? "",                                          // Item Code
        r.eur ?? 0,                                           // ABB Price list in EURO
        r.egp ?? 0,                                           // Market Price in EGP
        "", "", "", "",                                       // IP · Mounting · RAL · Cross Section (components carry none)
        r.poles ?? 0,                                         // Poles — multiplies the copper columns below
        r.cuP ?? 0,                                           // Weight/Panel/Pole
        r.cuC ?? 0,                                           // Weight/Cell/Pole
        r.brand ?? "",                                        // Brand
        r.brand === "ABB" && (r.eur ?? 0) > 0 ? "Yes" : "No", // ABB Discount (system rule)
      ]);
      const encBody = encs.map((r) => [
        r.fam ?? "",   // Type ← enclosure family
        r.name ?? "",  // Description
        r.ref ?? "",   // Item Code
        r.eur ?? 0,    // ABB Price list in EURO
        r.egp ?? 0,    // Market Price in EGP
        r.ip ?? "",    // IP
        r.mount ?? "", // Mounting
        r.ral ?? "",   // RAL
        "",            // Cross Section
        "",            // Poles (enclosures have none)
        "",            // Weight/Panel/Pole
        "",            // Weight/Cell/Pole
        "",            // Brand (enclosures store none)
        "No",          // ABB Discount (an enclosure is never ABB-discounted)
      ]);
      const body = [...compBody, ...encBody];
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      // Size each column to its widest cell (header or data), within reason.
      ws["!cols"] = header.map((c, i) => ({
        wch: Math.max(12, Math.min(40, body.reduce((m, row) => Math.max(m, String(row[i] ?? "").length), c.length) + 2)),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Price list");
      XLSX.writeFile(wb, "PowerLine LV price list (current).xlsx");
      setDone(`Downloaded ${body.length.toLocaleString()} items (${comps.length.toLocaleString()} components + ${encs.length.toLocaleString()} enclosures & cells).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the current price list.");
    } finally {
      setDl("");
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
      const r = await api.pricing.lvImportApply(preview.batchId, includeNoCode);
      setPreview(null);
      setNotes(r.nameClashes ?? []);
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
  const noCodeTotal = (s?.noCodeUpdates ?? 0) + (s?.noCodeAdditions ?? 0);
  // The code-less rows count towards Apply only once they are ticked.
  const applyCount = (s ? s.updates + s.additions : 0) + (includeNoCode ? noCodeTotal : 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={pickFile} disabled={!!busy || !!dl}>
          {busy || "⬆ Update from Excel"}
        </button>
        <button className="btn-ghost" onClick={downloadCurrent} disabled={!!busy || !!dl}>
          {dl || "⬇ Download Current Excel"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onFile}
        />
        {extra}
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
      {/* Named one by one on purpose: a count of skipped rows is not something
          anyone can act on, the item it clashed with is. */}
      {notes.length > 0 && !preview && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
          <p className="font-bold">
            {notes.length} row{notes.length === 1 ? " was" : "s were"} left out because the name is already an item's:
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {notes.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
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

              {s.nameClashes > 0 && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                  ⚠ {s.nameClashes.toLocaleString()} row{s.nameClashes === 1 ? "" : "s"} would give an item a name another
                  item already has. Two items with the same name cannot be told apart, so a quotation would use whichever
                  comes first — those rows are left out (a rename is left out on its own and the price still applies).
                  The{" "}
                  <button type="button" onClick={() => setTab("warnings")} className="font-bold underline underline-offset-2">
                    Warnings
                  </button>{" "}
                  tab says which item each one clashes with. Everything else applies normally.
                </p>
              )}

              {s.renames > 0 && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                  ⚠ {s.renames.toLocaleString()} description{s.renames === 1 ? "" : "s"} renamed. Combination templates
                  (ATS / MCC / WD) find parts by description — check the Warnings tab before applying.
                </p>
              )}

              {/* Rows with no item code — matched on description and offered, not dropped. */}
              {noCodeTotal > 0 && (
                <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-brand/40 bg-brand-tint p-2.5">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
                    checked={includeNoCode} onChange={(e) => setIncludeNoCode(e.target.checked)} />
                  <span className="text-xs text-ink">
                    <b>
                      {noCodeTotal} row{noCodeTotal === 1 ? "" : "s"} have no item code
                    </b>{" "}
                    — matched on description instead
                    {s.noCodeUpdates > 0 && s.noCodeAdditions > 0
                      ? ` (${s.noCodeUpdates} to update, ${s.noCodeAdditions} to add)`
                      : s.noCodeAdditions > 0
                      ? ` (${s.noCodeAdditions} would be added as new)`
                      : ` (${s.noCodeUpdates} would be updated)`}
                    . Tick to include them, then review them in the{" "}
                    <button type="button" onClick={() => setTab("noCode")} className="font-bold underline underline-offset-2">
                      No item code
                    </button>{" "}
                    tab.
                  </span>
                </label>
              )}

              {(s.unpriced > 0 || s.duplicates > 0) && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                  ⚠ Skipped:{" "}
                  {[
                    s.unpriced > 0 && `${s.unpriced} new item(s) with no price`,
                    s.duplicates > 0 && `${s.duplicates} repeated item code(s)`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}

              {/* Detail */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(["updates", "additions", "noCode", "warnings"] as const).map((t) => {
                  const n =
                    t === "updates" ? preview.updates.length
                    : t === "additions" ? preview.additions.length
                    : t === "noCode" ? (preview.noCodeItems?.length ?? 0)
                    : preview.warnings.length;
                  if (t === "noCode" && !n) return null;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${t === "noCode" ? "" : "capitalize"} ${
                        tab === t ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand/40"
                      }`}
                    >
                      {t === "noCode" ? "No item code" : t} ({n})
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
                        <th className="px-3 py-2 font-bold">{tab === "noCode" ? "Matched by" : "Item code"}</th>
                        <th className="px-3 py-2 font-bold">Description</th>
                        {tab !== "additions" && <th className="px-3 py-2 text-right font-bold">Was</th>}
                        <th className="px-3 py-2 text-right font-bold">{tab === "additions" ? "Price" : "Becomes"}</th>
                        {tab !== "additions" && <th className="px-3 py-2 text-right font-bold">Change</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(tab === "updates" ? preview.updates : tab === "noCode" ? preview.noCodeItems ?? [] : preview.additions).map((d, i) => {
                        // A data-only row keeps its price — show it as untouched, not as a move.
                        const priceHeld = tab !== "additions" && d.priceMoved === false;
                        return (
                        <tr key={d.code + i} className="border-t border-line align-top">
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-muted">
                            {d.code || (
                              <span className="font-sans not-italic text-brand-dark">
                                {d.kind === "add" ? "new · no code" : "description"}
                              </span>
                            )}
                          </td>
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
                          {tab !== "additions" && (
                            <td className="whitespace-nowrap px-3 py-1.5 text-right text-muted">
                              {d.kind === "add" ? "—" : money(d.fromEur ?? 0, d.fromEgp ?? 0)}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold text-ink">
                            {priceHeld ? <span className="font-normal text-muted">kept</span> : money(d.eur, d.egp)}
                          </td>
                          {tab !== "additions" && (
                            <td
                              className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold ${
                                (d.pct ?? 0) > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted"
                              }`}
                            >
                              {d.kind === "add" ? "new" : priceHeld ? "—" : pct(d.pct)}
                            </td>
                          )}
                        </tr>
                        );
                      })}
                      {(tab === "updates" ? preview.updates : tab === "noCode" ? preview.noCodeItems ?? [] : preview.additions).length === 0 && (
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
                <button className="btn-primary" onClick={apply} disabled={!!busy || applyCount === 0}>
                  {busy || `Apply ${applyCount.toLocaleString()} change${applyCount === 1 ? "" : "s"}`}
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
