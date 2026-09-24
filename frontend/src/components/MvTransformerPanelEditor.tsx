import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type TransformerRow } from "../api";
import { TR_ICON_DRY, TR_ICON_OIL } from "../pcss/data";
import { trDisplayCode } from "./transformerTechData";
import { Toggle } from "./fields";
import { withoutTransformerLabel } from "./TransformerTechnicalSheet";
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
  insideKioskOnly = false,
  onCode,
  onCost,
  usdRate = 1,
}: {
  p: LvPanel;
  upPanel: (id: string, patch: Partial<LvPanel>) => void;
  /** Set when this transformer sits inside a kiosk: the kiosk is its enclosure, so it is always
   *  IP00. The Standalone/IP23 choice is then removed and IP00 is forced on the code and price. */
  insideKioskOnly?: boolean;
  /** Reports the transformer code up to the host (the kiosk shows it in the Transformer header);
   *  empty until all four selections are made. */
  onCode?: (code: string) => void;
  /** Reports the transformer cost (EGP) up to the kiosk price table. Null until a row matches. */
  onCost?: (egp: number | null) => void;
  /** USD→EGP rate — transformer prices are USD, so the kiosk (EGP) multiplies by this. */
  usdRate?: number;
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

  // In a kiosk the transformer is always IP00. Once its config exists, pin insideKiosk=true so the
  // SAVED value is right too (the display/price already force IP00 below). Runs only in a kiosk.
  useEffect(() => {
    if (insideKioskOnly && p.mvTransformerConfig && p.mvTransformerConfig.insideKiosk !== true) {
      upPanel(p.id, { mvTransformerConfig: { ...p.mvTransformerConfig, insideKiosk: true } });
    }
  }, [insideKioskOnly, p.id, p.mvTransformerConfig, upPanel]);

  // Cascading options — the price database IS the reference. Each dropdown lists only what the DB
  // actually has for the OTHER current selections, so Powerline shows only its 6 ratings and only
  // Dry; add an oil transformer or a new rating to the database and it appears here automatically.
  const brands = useMemo(() => uniqStrs((rows ?? []).map((r) => r.brand)), [rows]);
  const ratings = useMemo(
    () => uniqNums((rows ?? []).filter((r) =>
      (!cfg.brand || r.brand === cfg.brand) &&
      (cfg.primaryKv == null || r.primaryKv === cfg.primaryKv) &&
      (!cfg.insulation || r.insulation === cfg.insulation)).map((r) => r.ratingKva)),
    [rows, cfg.brand, cfg.primaryKv, cfg.insulation],
  );
  const voltages = useMemo(
    () => uniqNums((rows ?? []).filter((r) =>
      (!cfg.brand || r.brand === cfg.brand) &&
      (cfg.ratingKva == null || r.ratingKva === cfg.ratingKva) &&
      (!cfg.insulation || r.insulation === cfg.insulation)).map((r) => r.primaryKv)),
    [rows, cfg.brand, cfg.ratingKva, cfg.insulation],
  );
  // Every insulation in the DB (so we can still SHOW Oil, but LOCKED, when the brand has no oil),
  // and the set the current brand/rating/voltage actually offers.
  const allInsulations = useMemo(() => uniqStrs((rows ?? []).map((r) => r.insulation)), [rows]);
  const availInsulations = useMemo(
    () => new Set((rows ?? []).filter((r) =>
      (!cfg.brand || r.brand === cfg.brand) &&
      (cfg.primaryKv == null || r.primaryKv === cfg.primaryKv) &&
      (cfg.ratingKva == null || r.ratingKva === cfg.ratingKva)).map((r) => r.insulation)),
    [rows, cfg.brand, cfg.primaryKv, cfg.ratingKva],
  );

  // Choosing a brand clears any rating / voltage / insulation the new brand doesn't offer, so a
  // QTN never keeps a combination the database can't price.
  const setBrand = (brand: string) => {
    if (!brand) { set("brand", ""); return; }
    const forB = (rows ?? []).filter((r) => r.brand === brand);
    const rs = new Set(forB.map((r) => r.ratingKva));
    const vs = new Set(forB.map((r) => r.primaryKv));
    const is = new Set(forB.map((r) => r.insulation));
    upPanel(p.id, {
      mvTransformerConfig: {
        ...cfg, brand,
        ratingKva: cfg.ratingKva != null && rs.has(cfg.ratingKva) ? cfg.ratingKva : null,
        primaryKv: cfg.primaryKv != null && vs.has(cfg.primaryKv) ? cfg.primaryKv : null,
        insulation: cfg.insulation && is.has(cfg.insulation) ? cfg.insulation : "",
      },
    });
  };

  const chosen = cfg.ratingKva != null && cfg.primaryKv != null && !!cfg.brand && !!cfg.insulation;
  // Base row for the four selections (a transformer may have TWO rows — one per IP code).
  const base = useMemo(
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
  // Oil transformers have no enclosure, so they are always IP00 — the Standalone/Inside-kiosk
  // choice (which only swaps a dry transformer between IP23 and IP00) does not apply to them.
  const isOil = (cfg.insulation || "").trim().toLowerCase() === "oil";
  // Inside a kiosk the transformer is always IP00, whatever the stored flag says.
  const effInsideKiosk = insideKioskOnly || !!cfg.insideKiosk;
  // The code for the chosen IP context: standalone → "…2300", inside a kiosk → "…0000".
  const displayCode = base ? trDisplayCode(base.code, effInsideKiosk) : "";
  // Report the code up to the host (kiosk header); empty until all four selections are made.
  useEffect(() => { onCode?.(displayCode); }, [displayCode, onCode]);
  // Prefer the exact IP-variant row so its OWN price is used (IP23-with-enclosure and IP00-in-kiosk
  // can be priced separately); fall back to the base row when only one IP code exists.
  const match = base ? ((rows ?? []).find((r) => r.code === displayCode) ?? base) : null;
  const cost = match?.costEgp ?? 0;
  // Report the transformer cost in EGP to the kiosk price table (prices are USD → × the rate).
  // A zero cost means this exact combination isn't in the price list — report null, not 0.
  const costEgp = match && cost > 0 ? Math.round(cost * usdRate) : null;
  useEffect(() => { onCost?.(costEgp); }, [costEgp, onCost]);
  const transportation = cfg.transportation ?? 300;
  // selling = cost ÷ factor (the price screen's factor) PLUS a flat transportation charge that the
  // factor is deliberately NOT applied to.
  const sellingBase = factor > 0 ? Math.round(cost / factor) : cost;
  const selling = sellingBase + transportation;
  const loading = rows == null && !error;

  return (
    <div className={`animate-fade-up grid items-stretch gap-4 ${insideKioskOnly ? "grid-cols-1" : "lg:grid-cols-2"}`}>
      {/* Live price + code — the transformer mirror of the RMU "Panel cost (live)" card.
          On desktop it sits to the RIGHT of the selections; on mobile it stays on top.
          Hidden in the kiosk, which gets one combined cost card for the whole packaged unit. */}
      {!insideKioskOnly && (
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
              <div className="min-w-0"><span className="text-sm">Transformer code</span><br /><b className="break-all text-base">{displayCode}</b></div>
              <button type="button" onClick={() => copyCode(displayCode)} title="Copy the transformer code"
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
      )}

      {/* The four selections — three dropdowns plus the Dry/Oil insulation tiles, filled
          from the price database. Left column on desktop. */}
      <div className="card flex flex-col space-y-4 px-4 py-3 lg:order-1">
        <h2 className="sec-head mb-0">Transformer Details</h2>
        {/* Kiosk only: supply the compact substation WITHOUT a transformer. The compartment is then not
            priced; the rating / voltage / insulation below become the (optional) description of the
            transformer the customer will fit, shown on the offer as "Without … Transformer …". */}
        {insideKioskOnly && (
          <div className="rounded-lg border border-line bg-surface p-3">
            <Toggle checked={!!cfg.withoutTransformer} onChange={(v) => set("withoutTransformer", v)}
              label="Without transformer (supplied by others)" />
            {cfg.withoutTransformer && (
              <p className="mt-2 text-xs text-muted">
                Not charged. Pick a rating, voltage and insulation below to print
                “{withoutTransformerLabel(cfg)}”, or leave them blank for just “Without Transformer”.
              </p>
            )}
          </div>
        )}
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
              onChange={(e) => setBrand(e.target.value)}>
              <option value="">{loading ? "Loading…" : "Select brand…"}</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </TrField>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-brand-dark">Insulation type</div>
          {loading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : (
            <div className="grid flex-1 auto-rows-fr gap-2 sm:grid-cols-2">
              {allInsulations.map((ins) => {
                const meta = insulationMeta(ins);
                const active = cfg.insulation === ins;
                const locked = !availInsulations.has(ins); // this brand doesn't offer it → lock it
                return (
                  <button key={ins} type="button" disabled={locked} onClick={() => set("insulation", ins)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all duration-150 ${locked ? "cursor-not-allowed border-line bg-surface opacity-60" : active ? "border-brand bg-brand-light ring-1 ring-brand/30" : "border-line bg-white hover:border-brand/40 hover:shadow-soft dark:bg-neutral-900"}`}>
                    {meta.icon && <span className={`shrink-0 ${active ? "text-brand" : "text-muted"}`} dangerouslySetInnerHTML={{ __html: meta.icon }} />}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink">{locked ? "🔒 " : ""}{meta.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{locked ? `Not available${cfg.brand ? ` for ${cfg.brand}` : ""}` : meta.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Standalone vs inside-kiosk — sets the technical datasheet's IP (IP23 vs IP00) and
            the commercial "IP 23 / IP 00" wording. Default is a standalone transformer.
            Oil transformers have no enclosure, so they are locked to IP00 (no toggle).
            Hidden entirely inside a kiosk: it is always IP00 there (forced above), so the
            fixed note added nothing. */}
        {!insideKioskOnly && (
        <div>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-brand-dark">Installation</div>
          {isOil ? (
            <div className="rounded-lg border border-line bg-surface p-2.5">
              <span className="block text-sm font-bold text-ink">IP00 — no enclosure</span>
              <span className="mt-0.5 block text-xs text-muted">Oil transformers have no enclosure, so they are always IP00.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[
                { on: false, label: "Standalone", sub: "IP23 enclosure" },
                { on: true, label: "Inside kiosk", sub: "IP00 (kiosk protects)" },
              ].map((opt) => {
                const active = !!cfg.insideKiosk === opt.on;
                return (
                  <button key={opt.label} type="button" onClick={() => set("insideKiosk", opt.on)}
                    className={`rounded-lg border p-2.5 text-left transition-all duration-150 ${active ? "border-brand bg-brand-light ring-1 ring-brand/30" : "border-line bg-white hover:border-brand/40 dark:bg-neutral-900"}`}>
                    <span className="block text-sm font-bold text-ink">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{opt.sub}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}
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
