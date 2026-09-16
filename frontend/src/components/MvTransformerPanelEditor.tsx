import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type TransformerRow } from "../api";
import { TR_ICON_DRY, TR_ICON_OIL } from "../pcss/data";
import type { TransformerConfigInput } from "../types";
import type { LvPanel } from "../lv/store";

/** A brand-new Transformer panel: nothing chosen yet. */
export const DEFAULT_TRANSFORMER_CONFIG: TransformerConfigInput = {
  ratingKva: null,
  primaryKv: null,
  brand: "",
  insulation: "",
  transportation: 300,
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const uniqNums = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
const uniqStrs = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Label / description / icon for an insulation value, so the Dry / Oil choices show as the
 *  same picture tiles as the P-CSS selector. Unknown values still render as a plain tile. */
function insulationMeta(v: string): { label: string; sub: string; icon?: string } {
  const k = v.trim().toLowerCase();
  if (k === "dry") return { label: "Dry Type", sub: "Cast-resin, air-cooled transformer", icon: TR_ICON_DRY };
  if (k === "oil") return { label: "Oil Type", sub: "Oil-immersed, liquid-cooled transformer", icon: TR_ICON_OIL };
  return { label: v, sub: "" };
}

/**
 * The editor for an MV "Transformer" package panel. The four selections — rating,
 * primary voltage, brand and insulation — pick exactly one transformer out of the
 * Transformer price database (managed by the Excel round-trip on /pricing). That row
 * gives the transformer's CODE and its price: the sheet holds the cost, and the
 * selling price is cost ÷ factor (the same factor, default 0.95, shown on the price
 * screen). A live "Panel cost (live)" card mirrors the RMU panel's.
 *
 * The dropdown options are the distinct values actually in the price list, so you can
 * only pick real ratings/brands/etc.; a combination the list doesn't carry shows
 * "Not in price list" rather than a wrong price.
 */
export default function MvTransformerPanelEditor({
  p,
  upPanel,
}: {
  p: LvPanel;
  upPanel: (id: string, patch: Partial<LvPanel>) => void;
}) {
  const cfg = p.mvTransformerConfig ?? DEFAULT_TRANSFORMER_CONFIG;
  // Writes route through upPanel, which already drops edits on a read-only / teammate
  // quotation — so no extra guard is needed here.
  const set = <K extends keyof TransformerConfigInput>(k: K, v: TransformerConfigInput[K]) =>
    upPanel(p.id, { mvTransformerConfig: { ...cfg, [k]: v } });

  // The transformer catalogue (the price database). Fetched once — the four dropdowns
  // and the price/code match all read from it. ~50 rows, so no paging is needed.
  const [rows, setRows] = useState<TransformerRow[] | null>(null);
  const [factor, setFactor] = useState(0.95);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copyCode = async (code: string) => {
    const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
    try {
      await navigator.clipboard.writeText(code);
      flash();
      return;
    } catch { /* modern API blocked (some embedded contexts) — fall back below */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      flash();
    } catch { /* clipboard unavailable — ignore */ }
  };
  useEffect(() => {
    let alive = true;
    api.pricing
      .transformerList({ activeOnly: true, take: 1000 })
      .then((r) => { if (alive) { setRows(r.rows); setFactor(r.factor || 0.95); } })
      .catch(() => { if (alive) setError("Could not load the transformer price list. Check your connection and reopen this panel."); });
    return () => { alive = false; };
  }, []);

  const ratings = useMemo(() => uniqNums((rows ?? []).map((r) => r.ratingKva)), [rows]);
  const voltages = useMemo(() => uniqNums((rows ?? []).map((r) => r.primaryKv)), [rows]);
  const brands = useMemo(() => uniqStrs((rows ?? []).map((r) => r.brand)), [rows]);
  const insulations = useMemo(() => uniqStrs((rows ?? []).map((r) => r.insulation)), [rows]);

  const chosen = cfg.ratingKva != null && cfg.primaryKv != null && !!cfg.brand && !!cfg.insulation;
  const match = useMemo(
    () =>
      !rows || !chosen
        ? null
        : rows.find(
            (r) =>
              r.ratingKva === cfg.ratingKva &&
              r.primaryKv === cfg.primaryKv &&
              r.brand === cfg.brand &&
              r.insulation === cfg.insulation,
          ) ?? null,
    [rows, chosen, cfg.ratingKva, cfg.primaryKv, cfg.brand, cfg.insulation],
  );
  const cost = match?.costEgp ?? 0;
  const transportation = cfg.transportation ?? 300;
  // selling = cost ÷ factor (the price screen's factor) PLUS a flat transportation charge that the
  // factor is deliberately NOT applied to.
  const sellingBase = factor > 0 ? Math.round(cost / factor) : cost;
  const selling = sellingBase + transportation;
  const loading = rows == null && !error;

  return (
    <div className="animate-fade-up grid items-stretch gap-4 lg:grid-cols-2">
      {/* Live price + code — the transformer mirror of the RMU "Panel cost (live)" card.
          On desktop it sits to the RIGHT of the selections; on mobile it stays on top. */}
      <div className="card px-4 py-3 lg:order-2">
        <div className="flex w-full items-center justify-between gap-3">
          <h2 className="sec-head mb-0">Panel cost (live)</h2>
          {!chosen ? (
            <span className="text-sm font-semibold text-muted">choose all four</span>
          ) : match ? (
            <span className="whitespace-nowrap text-sm font-bold text-brand-dark">{fmt(selling)} USD</span>
          ) : (
            <span className="whitespace-nowrap text-sm font-bold text-amber-600">Not in price list</span>
          )}
        </div>

        {match ? (
          <div className="mt-3 grid auto-rows-fr grid-cols-3 gap-2 text-sm [&_b]:text-base">
            <div className="col-span-3 flex items-center justify-between gap-2 rounded-lg bg-brand-light p-2.5 text-brand-dark">
              <div className="min-w-0"><span className="text-sm">Transformer code</span><br /><b className="break-all text-base">{match.code}</b></div>
              <button type="button" onClick={() => copyCode(match.code)} title="Copy the transformer code"
                className="shrink-0 rounded-md border border-brand/30 bg-white/70 px-2.5 py-1 text-xs font-bold text-brand-dark transition hover:bg-white dark:bg-white/10 dark:hover:bg-white/20">
                {copied ? "✓ Copied" : "⧉ Copy"}
              </button>
            </div>
            <div className="rounded-lg bg-surface p-2.5">Cost<br /><b>{fmt(cost)} USD</b></div>
            <div className="rounded-lg bg-surface p-2.5">Factor<br /><b>{factor}</b></div>
            <div className="rounded-lg bg-surface p-2.5">Transportation<br />
              <span className="inline-flex items-baseline gap-1">
                <input type="number" min={0} value={transportation}
                  onChange={(e) => set("transportation", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-14 border-b border-dashed border-line bg-transparent text-left text-base font-bold text-ink outline-none focus:border-brand" />
                <span className="text-xs font-semibold text-muted">USD</span>
              </span>
            </div>
            <div className="col-span-3 flex items-end justify-between gap-2 rounded-lg bg-brand p-2.5 text-white">
              <div>Selling price<br /><b>{fmt(selling)} USD</b></div>
              <div className="text-right text-xs font-semibold text-white/85">cost ÷ factor {factor}<br />+ transport {fmt(transportation)}</div>
            </div>
          </div>
        ) : chosen ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            No transformer in the price list matches this exact combination (rating · voltage · brand · insulation). Change a selection, or add this transformer to the price list first.
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted">Pick a rating, primary voltage, brand and insulation below to see the transformer's code and price.</p>
        )}
      </div>

      {/* The four selections — three dropdowns plus the Dry/Oil insulation tiles, filled
          from the price database. Left column on desktop. */}
      <div className="card space-y-4 px-4 py-4 lg:order-1">
        <h2 className="sec-head mb-0">Transformer Details</h2>
        {error && (
          <p className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <TrField label="TR. Rating (kVA)">
            <select className="input cursor-pointer" disabled={loading} value={cfg.ratingKva ?? ""}
              onChange={(e) => set("ratingKva", e.target.value ? Number(e.target.value) : null)}>
              <option value="">{loading ? "Loading…" : "Select rating…"}</option>
              {ratings.map((r) => <option key={r} value={r}>{r} KVA</option>)}
            </select>
          </TrField>
          <TrField label="Voltage (kV)">
            <select className="input cursor-pointer" disabled={loading} value={cfg.primaryKv ?? ""}
              onChange={(e) => set("primaryKv", e.target.value ? Number(e.target.value) : null)}>
              <option value="">{loading ? "Loading…" : "Select voltage…"}</option>
              {voltages.map((v) => <option key={v} value={v}>{v} kV</option>)}
            </select>
          </TrField>
          <TrField label="TR. brand">
            <select className="input cursor-pointer" disabled={loading} value={cfg.brand}
              onChange={(e) => set("brand", e.target.value)}>
              <option value="">{loading ? "Loading…" : "Select brand…"}</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </TrField>
        </div>

        <TrField label="Insulation type">
          {loading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {insulations.map((ins) => {
                const meta = insulationMeta(ins);
                const active = cfg.insulation === ins;
                return (
                  <button key={ins} type="button" onClick={() => set("insulation", ins)}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150 ${active ? "border-brand bg-brand-light ring-1 ring-brand/30" : "border-line bg-white hover:border-brand/40 hover:shadow-soft dark:bg-neutral-900"}`}>
                    {meta.icon && <span className={`shrink-0 ${active ? "text-brand" : "text-muted"}`} dangerouslySetInnerHTML={{ __html: meta.icon }} />}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink">{meta.label}</span>
                      {meta.sub && <span className="mt-0.5 block text-xs text-muted">{meta.sub}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </TrField>
      </div>
    </div>
  );
}

function TrField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-brand-dark">{label}</div>
      {children}
    </div>
  );
}
