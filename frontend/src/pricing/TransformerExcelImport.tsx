// Bulk transformer price update from a spreadsheet — the same browser-side Excel round-trip as
// LvExcelImport: the workbook is read here and sent as plain rows, nothing is written until the
// summary is confirmed. Rows are matched on "Code". "Price (EGP)" is the COST.

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { api, type TransformerImportPreview, type TransformerImportRow, type TransformerRow } from "../api";

/** The download layout — the owner's own sheet columns, so a downloaded file looks like theirs.
 *  "Cost Price (EGP)" is what the database stores; "Selling Price (EGP)" is derived (cost / factor)
 *  and shown for reference only — it is ignored on upload. */
const COLUMNS = [
  "Transformer rating (KVA)",
  "Primary voltage",
  "Cost Price (EGP)",
  "Selling Price (EGP)",
  "Code",
  "Transformer brand",
  "Insulation type",
] as const;

const flat = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Column order does not matter on upload — the header text is matched. Only the COST is read;
 *  the selling column (whatever its header) is not mapped, so it never overwrites the stored cost. */
const HEADER_ALIASES: Record<string, string> = {
  "code": "code",
  "transformer code": "code",
  "transformer rating (kva)": "ratingKva",
  "rating (kva)": "ratingKva",
  "rating": "ratingKva",
  "kva": "ratingKva",
  "primary voltage": "primaryKv",
  "primary voltage (kv)": "primaryKv",
  "voltage": "primaryKv",
  "kv": "primaryKv",
  "cost price (egp)": "costEgp",
  "cost price": "costEgp",
  "cost (egp)": "costEgp",
  "cost": "costEgp",
  "price (egp)": "costEgp",
  "price egp": "costEgp",
  "transformer brand": "brand",
  "brand": "brand",
  "insulation type": "insulation",
  "insulation": "insulation",
};

const toNum = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.eE+-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function parseWorkbook(buf: ArrayBuffer): { rows: TransformerImportRow[]; missing: string[] } {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  const rows: TransformerImportRow[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const mapped: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const key = HEADER_ALIASES[flat(k)];
      if (key) { mapped[key] = v; seen.add(key); }
    }
    const code = String(mapped.code ?? "").trim();
    if (!code) continue; // no code = no identity, skip
    rows.push({
      code,
      ratingKva: toNum(mapped.ratingKva),
      primaryKv: toNum(mapped.primaryKv),
      costEgp: toNum(mapped.costEgp),
      brand: String(mapped.brand ?? "").trim(),
      insulation: String(mapped.insulation ?? "").trim(),
    });
  }
  const missing: string[] = [];
  if (!seen.has("code")) missing.push("Code");
  if (!seen.has("costEgp")) missing.push("Price (EGP)");
  return { rows, missing };
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function TransformerExcelImport({ onApplied }: { onApplied: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [dl, setDl] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<TransformerImportPreview | null>(null);
  const [tab, setTab] = useState<"updates" | "additions" | "removals" | "warnings">("updates");
  const [done, setDone] = useState("");
  const [includeRemovals, setIncludeRemovals] = useState(false);

  const pickFile = () => { setError(""); setDone(""); fileRef.current?.click(); };

  const downloadCurrent = async () => {
    setError(""); setDone(""); setDl("Preparing…");
    try {
      const take = 500;
      const out: TransformerRow[] = [];
      let factor = 0.95;
      for (let page = 0; ; page++) {
        const r = await api.pricing.transformerList({ take, page, activeOnly: true });
        out.push(...r.rows);
        factor = r.factor || factor;
        setDl(`Preparing… ${out.length} / ${r.total}`);
        if (out.length >= r.total || r.rows.length === 0) break;
      }
      const header = COLUMNS as unknown as string[];
      // Cost is what we store; Selling = cost / factor, for the reader's reference only.
      const body = out.map((r) => [r.ratingKva, r.primaryKv, r.costEgp, factor > 0 ? Math.round(r.costEgp / factor) : 0, r.code, r.brand, r.insulation]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      ws["!cols"] = header.map((c, i) => ({
        wch: Math.max(12, Math.min(40, body.reduce((m, row) => Math.max(m, String(row[i] ?? "").length), c.length) + 2)),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transformers");
      XLSX.writeFile(wb, "PowerLine Transformer database (current).xlsx");
      setDone(`Downloaded ${out.length} transformer${out.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the current transformer sheet.");
    } finally {
      setDl("");
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("Reading the file…"); setError("");
    try {
      const { rows, missing } = parseWorkbook(await file.arrayBuffer());
      if (missing.length) { setError(`This sheet is missing: ${missing.join(", ")}. Download the current file to see the expected columns.`); return; }
      if (!rows.length) { setError("No transformer rows with a Code were found in the first sheet."); return; }
      setBusy(`Checking ${rows.length} rows…`);
      const p = await api.pricing.transformerImportPreview(rows);
      setPreview(p);
      setTab(p.summary.updates ? "updates" : p.summary.additions ? "additions" : "removals");
      // Pre-tick "remove missing" only when the file clearly IS the whole list.
      const sm = p.summary;
      setIncludeRemovals(sm.removals > 0 && sm.removals <= sm.updates + sm.unchanged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy("");
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy("Applying…"); setError("");
    try {
      const r = await api.pricing.transformerImportApply(preview.batchId, includeRemovals);
      setPreview(null);
      const head = `${fmt(r.updated)} updated, ${fmt(r.added)} added${r.removed ? `, ${fmt(r.removed)} removed` : ""}`;
      if (r.published) setDone(`${head} — live now.`);
      else setError(`${head}, but they are NOT live yet — publishing was blocked.${r.blockers?.length ? " " + r.blockers.join(" · ") + "." : ""} Fix that, then press "Update price list & database".`);
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
    if (id) await api.pricing.transformerImportCancel(id).catch(() => {});
  };

  const s = preview?.summary;
  const applyCount = s ? s.updates + s.additions + (includeRemovals ? s.removals : 0) : 0;

  const list = preview
    ? tab === "updates" ? preview.updates
    : tab === "additions" ? preview.additions
    : tab === "removals" ? preview.removals
    : []
    : [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={pickFile} disabled={!!busy || !!dl}>{busy || "⬆ Update from Excel"}</button>
        <button className="btn-ghost" onClick={downloadCurrent} disabled={!!busy || !!dl}>{dl || "⬇ Download Current Excel"}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
      </div>

      {error && !preview && (
        <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>
      )}
      {done && (
        <p className="mt-2 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-300">✓ {done}</p>
      )}

      {preview && s && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={cancel}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl2 bg-white shadow-2xl dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line p-5">
              <h3 className="text-lg font-extrabold text-ink">Review transformer changes</h3>
              <button className="rounded p-1 text-xl text-muted hover:text-ink" onClick={cancel} title="Cancel">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
              {([["Rows read", s.rowsRead], ["Updates", s.updates], ["Additions", s.additions], ["Removals", s.removals]] as const).map(([label, n]) => (
                <div key={label} className="rounded-lg border border-line bg-surface p-3 text-center">
                  <div className="text-2xl font-extrabold text-ink">{fmt(n)}</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted">{label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1 border-b border-line px-5">
              {([["updates", s.updates], ["additions", s.additions], ["removals", s.removals], ["warnings", preview.warnings.length]] as const).map(([key, n]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold capitalize ${tab === key ? "border-brand text-brand-dark" : "border-transparent text-muted hover:text-ink"}`}>
                  {key} <span className="ml-1 text-xs text-muted">{n}</span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {tab === "warnings" ? (
                preview.warnings.length === 0 ? <p className="text-sm text-muted">No warnings.</p> : (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                )
              ) : list.length === 0 ? (
                <p className="text-sm text-muted">Nothing in this list.</p>
              ) : (
                <div className="space-y-1.5">
                  {list.map((d, i) => (
                    <div key={i} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                      <div className="font-bold text-ink">{d.label}</div>
                      {d.changes && d.changes.length > 0 && (
                        <div className="mt-0.5 text-xs text-muted">
                          {d.changes.map((c, j) => (
                            <span key={j} className="mr-3">{c.field}: <span className="line-through">{c.from}</span> → <b className="text-ink">{c.to}</b></span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-line p-5">
              {s.removals > 0 && (
                <label className="mb-3 flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" checked={includeRemovals} onChange={(e) => setIncludeRemovals(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
                  <span>Remove the <b>{fmt(s.removals)}</b> transformer{s.removals === 1 ? "" : "s"} not in this file (they had a price but the sheet no longer lists them).</span>
                </label>
              )}
              {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted">{fmt(applyCount)} change{applyCount === 1 ? "" : "s"} will be applied and published.</span>
                <div className="flex items-center gap-2">
                  <button className="btn-ghost" onClick={cancel} disabled={!!busy}>Cancel</button>
                  <button className="btn-primary" onClick={apply} disabled={!!busy || applyCount === 0}>{busy || "Apply & publish"}</button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
