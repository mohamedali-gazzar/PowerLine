import { useEffect, useRef, useState } from "react";
import RmuConfigForm, { DEFAULT_RMU_CONFIG, rmuShortCode, rmuAuxShuntUsd } from "./RmuConfigForm";
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
  const listSelling = baseUnit + addUnit;           // base + add-ons = list price (no Aux/Shunt)
  const factor = preview?.rmuFactor ?? 0.85;
  const auxShuntOffer = rmuAuxShuntUsd(rmu) * rate; // per-feeder Aux / Shunt-trip in the offer currency
  // The standalone RMU-panel "Panel cost (live)" card: Aux/Shunt add to the selling; cost = selling × factor.
  const selling = listSelling + auxShuntOffer;
  const cost = Math.round(selling * factor);
  // Report the RMU cost in EGP to the kiosk price table: the LIST cost plus Aux/Shunt at full price,
  // so inside a kiosk they ride the RMU row's factor (0.85). `cost` is EGP for an EGP offer; a USD
  // offer keeps USD floor prices, so multiply by the quotation's USD→EGP rate. Zero Aux/Shunt ⇒ same
  // number as before this feature.
  const usdRate = s.factors?.usd || 1;
  const listCostEgp = currency === "EGP" ? Math.round(listSelling * factor) : Math.round(Math.round(listSelling * factor) * usdRate);
  const costEgp = !priced ? null : listCostEgp + Math.round(rmuAuxShuntUsd(rmu) * usdRate);
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
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm [&_b]:text-base">
            <div className="rounded-lg bg-surface p-2.5">Cost<br /><b>{fmt(cost)} {currency}</b></div>
            <div className="rounded-lg bg-surface p-2.5">Factor<br /><b>{factor}</b></div>
            <div className="rounded-lg bg-brand p-2.5 text-white">Selling<br /><b>{fmt(selling)} {currency}</b></div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            This exact configuration isn't in the RMU price list yet, so it has no automatic price. It will show as “Price on request” until the price list includes it (the code above is {panelCode}).
          </p>
        )}
      </div>
      )}

      <RmuConfigForm value={rmu} onChange={setR} onChangeMany={setMany} code={code} panelCode={panelCode} />
    </div>
  );
}
