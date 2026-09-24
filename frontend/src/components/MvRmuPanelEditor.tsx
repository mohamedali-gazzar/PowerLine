import { useEffect, useRef, useState } from "react";
import RmuConfigForm, { DEFAULT_RMU_CONFIG, rmuShortCode, rmuAuxShuntUsd, KIOSK_FEEDER_OPTIONS } from "./RmuConfigForm";
import { api } from "../api";
import type { GeneratedOffer, RmuConfigInput } from "../types";
import { DEFAULT_MV_COMMERCIAL, type LvPanel, type LvState } from "../lv/store";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * The editor shown for an MV "RMU" package panel. It reuses the EXACT RMU
 * configurator form and the EXACT backend pricing endpoint the standalone RMU
 * offer uses — the config lives on the panel (`p.mvRmuConfig`) so it saves and
 * shares with the quotation like everything else in MV.
 *
 * Above the form sits the live price card — the RMU mirror of the LV
 * "Panel cost (live)" card. An RMU has no built-up cost the way an LV panel
 * does (no components/copper to add up); its price comes straight from the RMU
 * price list for the exact configuration, plus any add-ons. The card shows that
 * build-up and this line's total after the offer's discount and VAT — every
 * number matches the MV Commercial tab exactly (same source, same maths).
 */
export default function MvRmuPanelEditor({
  s,
  p,
  upPanel,
  insideKiosk = false,
  onPanelCode,
  onCost,
}: {
  s: LvState;
  p: LvPanel;
  upPanel: (id: string, patch: Partial<LvPanel>) => void;
  /** Rendered inside the MV kiosk accordion: the RMU form is identical to a standalone RMU, but the
   *  per-panel "Panel cost (live)" card is dropped (a single kiosk-wide cost card replaces it). */
  insideKiosk?: boolean;
  /** Reports the official RMU code up to the host (the kiosk shows it in the RMU section header). */
  onPanelCode?: (code: string) => void;
  /** Reports the RMU cost (EGP) up to the kiosk price table. Null until the config is priced. */
  onCost?: (egp: number | null) => void;
}) {
  const rmu = p.mvRmuConfig ?? DEFAULT_RMU_CONFIG;
  // Writes route through upPanel, which already drops edits on a read-only /
  // teammate quotation — so no extra guard is needed here.
  const setR = <K extends keyof RmuConfigInput>(k: K, v: RmuConfigInput[K]) =>
    upPanel(p.id, { mvRmuConfig: { ...rmu, [k]: v } });
  const setMany = (patch: Partial<RmuConfigInput>) =>
    upPanel(p.id, { mvRmuConfig: { ...rmu, ...patch } });

  const code = rmuShortCode(rmu);

  // Backend preview → the official panel code AND the live price. Keyed by the
  // config signature and debounced so a burst of keystrokes fires one request; the
  // ref check drops any response that arrives after the config moved on again.
  const [preview, setPreview] = useState<GeneratedOffer | null>(null);
  const sig = JSON.stringify(rmu);
  const latest = useRef(sig);
  useEffect(() => {
    latest.current = sig;
    let alive = true;
    const t = setTimeout(() => {
      api
        .previewConfig(rmu)
        .then((g) => { if (alive && latest.current === sig) setPreview(g); })
        .catch(() => { if (alive && latest.current === sig) setPreview(null); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const panelCode = preview?.panelCode || preview?.configCode || "…";
  // Report the resolved code up to the host (kiosk header). Skip the "…" placeholder while loading.
  useEffect(() => { if (onPanelCode && panelCode && panelCode !== "…") onPanelCode(panelCode); }, [panelCode, onPanelCode]);

  // --- Live price (the "Panel cost (live)" card) — Cost / Factor / Selling, like the
  // Transformer card. Selling = the RMU's list price (base + add-ons); Cost = selling × factor;
  // factor is the RMU selling factor (default 0.85). Currency is offer-wide (MV Pricing Settings);
  // RMU floor prices are USD, so an EGP offer multiplies by the quotation's USD→EGP rate.
  const cm = s.mvRmu ?? DEFAULT_MV_COMMERCIAL;
  const currency = cm.currency;
  const rate = currency === "EGP" ? (s.factors?.usd || 1) : 1;
  const lp = preview?.listPricing;
  const priced = !!lp && lp.found && lp.basePrice != null;
  const baseUnit = (lp?.basePrice ?? 0) * rate;
  const addUnit = (lp?.addOns ?? []).reduce((sum, a) => sum + a.price, 0) * rate;
  const listSelling = baseUnit + addUnit;           // base + add-ons = the RMU's list price (no Aux/Shunt)
  const factor = preview?.rmuFactor ?? 0.85;
  // The card separates the RMU from its per-feeder Aux / Shunt-trip. The RMU sells at its list price
  // (cost = list × factor). Aux/Shunt PRICES are SELLING prices; their cost is selling × factor (0.85).
  // Totals are the two added together.
  const rmuCost = Math.round(listSelling * factor);
  const rmuSelling = listSelling;
  const auxSelling = Math.round(rmuAuxShuntUsd(rmu) * rate);
  const auxCost = Math.round(auxSelling * factor);
  const cost = rmuCost + auxCost;
  const selling = rmuSelling + auxSelling;
  // Report the RMU cost in EGP to the kiosk price table: the LIST cost plus the Aux/Shunt COST
  // (their selling × factor), so the kiosk RMU row's selling (cost ÷ factor) carries Aux/Shunt at
  // their entered selling price. Zero Aux/Shunt ⇒ same number as before.
  const usdRate = s.factors?.usd || 1;
  const listCostEgp = currency === "EGP" ? Math.round(listSelling * factor) : Math.round(Math.round(listSelling * factor) * usdRate);
  const costEgp = !priced ? null : listCostEgp + Math.round(rmuAuxShuntUsd(rmu) * factor * usdRate);
  useEffect(() => { onCost?.(costEgp); }, [costEgp, onCost]);

  return (
    <div className="animate-fade-up space-y-4">
      {/* Live price — Cost / Factor / Selling (mirrors the Transformer card). Hidden in the
          kiosk, which gets one combined cost card for the whole packaged unit. */}
      {!insideKiosk && (
      <div className="card px-4 py-3">
        <div className="flex w-full items-center justify-between gap-3">
          <h2 className="sec-head mb-0">Panel cost (live)</h2>
          {preview == null ? (
            <span className="text-sm font-semibold text-muted">calculating…</span>
          ) : priced ? (
            <span className="whitespace-nowrap text-sm font-bold text-brand-dark">{fmt(selling)} {currency}</span>
          ) : (
            <span className="whitespace-nowrap text-sm font-bold text-amber-600">Price on request</span>
          )}
        </div>

        {preview == null ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="skeleton h-14 rounded-lg" />
            <div className="skeleton h-14 rounded-lg" />
            <div className="skeleton h-14 rounded-lg" />
          </div>
        ) : priced ? (
          auxCost > 0 ? (
            // Aux/Shunt present → separate the RMU line from the Aux + Shunt-trip line, then the total.
            <div className="mt-3 space-y-1 text-sm">
              <div className="grid grid-cols-[1fr_5rem_2.75rem_5rem] gap-x-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                <span></span><span className="text-right">Cost</span><span className="text-center">Factor</span><span className="text-right">Selling</span>
              </div>
              <div className="grid grid-cols-[1fr_5rem_2.75rem_5rem] items-center gap-x-2">
                <span className="font-semibold text-ink">RMU</span>
                <span className="text-right tabular-nums">{fmt(rmuCost)}</span>
                <span className="text-center tabular-nums text-muted">{factor}</span>
                <span className="text-right font-semibold tabular-nums">{fmt(rmuSelling)}</span>
              </div>
              <div className="grid grid-cols-[1fr_5rem_2.75rem_5rem] items-center gap-x-2">
                <span className="font-semibold text-ink">Aux + Shunt trip</span>
                <span className="text-right tabular-nums">{fmt(auxCost)}</span>
                <span className="text-center tabular-nums text-muted">{factor}</span>
                <span className="text-right font-semibold tabular-nums">{fmt(auxSelling)}</span>
              </div>
              <div className="grid grid-cols-[1fr_5rem_2.75rem_5rem] items-center gap-x-2 border-t border-line pt-1 font-bold text-brand-dark">
                <span>Total</span>
                <span className="text-right tabular-nums">{fmt(cost)} {currency}</span>
                <span className="text-center tabular-nums">{factor}</span>
                <span className="text-right tabular-nums">{fmt(selling)} {currency}</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm [&_b]:text-base">
              <div className="rounded-lg bg-surface p-2.5">Cost<br /><b>{fmt(cost)} {currency}</b></div>
              <div className="rounded-lg bg-surface p-2.5">Factor<br /><b>{factor}</b></div>
              <div className="rounded-lg bg-brand p-2.5 text-white">Selling<br /><b>{fmt(selling)} {currency}</b></div>
            </div>
          )
        ) : (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            This exact configuration isn't in the RMU price list yet, so it has no automatic price. It will show as “Price on request” until the price list includes it (the code above is {panelCode}).
          </p>
        )}
      </div>
      )}

      <RmuConfigForm value={rmu} onChange={setR} onChangeMany={setMany} code={code} panelCode={panelCode}
        feederOptions={insideKiosk ? KIOSK_FEEDER_OPTIONS : undefined} />
    </div>
  );
}
