import { useEffect, useRef, useState } from "react";
import RmuConfigForm, { DEFAULT_RMU_CONFIG, rmuShortCode, rmuAuxShuntUsd, KIOSK_FEEDER_OPTIONS } from "./RmuConfigForm";
import { api } from "../api";
import type { GeneratedOffer, RmuConfigInput } from "../types";
import { DEFAULT_MV_COMMERCIAL, type LvPanel, type LvState } from "../lv/store";
import { fmtMoney } from "../money";

const fmt = fmtMoney; // money reads one way everywhere  see src/money.ts

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
  defaultName,
}: {
  s: LvState;
  p: LvPanel;
  upPanel: (id: string, patch: Partial<LvPanel>) => void;
  /** The auto name this item shows in the panel list (e.g. "RMU-01"), used as the Panel name
   *  placeholder so an unnamed item reads the same here as in the list. */
  defaultName?: string;
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
  // Two different factors, and the difference is the whole point:
  //  · `dbFactor` is the price list's own factor. It turns the list price into the COST, and the cost
  //    does not move — it is what the RMU costs us, whatever we decide to charge.
  //  · `factor` is the editable one. It turns that fixed cost into the SELLING price (cost ÷ factor),
  //    exactly as the Transformer, LV, Kiosk Size and Accessories rows work.
  // Left alone, factor === dbFactor and the selling price comes back to the list price, so nothing
  // already quoted moves.
  const dbFactor = preview?.rmuFactor ?? 0.85;
  const factor = p.mvRmuFactor ?? dbFactor;
  // Aux / Shunt-trip prices are entered as SELLING prices, so they are costed the same way as the
  // list price. Both lines then sell at cost ÷ factor, and the totals are the two added up — so the
  // breakdown always reconciles with the total shown underneath it.
  const auxListSelling = Math.round(rmuAuxShuntUsd(rmu) * rate);
  const sellOf = (c: number) => (factor > 0 ? Math.round(c / factor) : c);
  const rmuCost = Math.round(listSelling * dbFactor);
  const auxCost = Math.round(auxListSelling * dbFactor);
  const rmuSelling = sellOf(rmuCost);
  const auxSelling = sellOf(auxCost);
  const cost = rmuCost + auxCost;
  const selling = rmuSelling + auxSelling;
  // The same fixed cost in EGP, reported to the kiosk price table so its RMU row divides by the very
  // same factor and lands on the very same selling price.
  const usdRate = s.factors?.usd || 1;
  const costEgp = !priced ? null : (currency === "EGP" ? cost : Math.round(cost * usdRate));
  useEffect(() => { onCost?.(costEgp); }, [costEgp, onCost]);

  // The factor box, shared by both cost cards below — this is the ONE place the RMU's factor is
  // edited (inside a kiosk the combined kiosk cost table shows it read-only).
  const factorInput = (
    <input type="number" step="0.01" min={0} value={factor}
      onChange={(e) => upPanel(p.id, { mvRmuFactor: e.target.value === "" ? undefined : Number(e.target.value) })}
      className="mt-1 w-20 rounded-md border border-line bg-white px-2 py-1 text-right text-sm font-bold tabular-nums text-ink focus:border-brand focus:outline-none dark:bg-neutral-900" />
  );

  // Live price — Cost / Factor / Selling (mirrors the Transformer card). Handed to RmuConfigForm so it
  // sits at the TOP of the right-hand column (above Metering) and the RMU Code card gets the full left
  // column. Inside a kiosk it is the compact three-box row only: the kiosk's own combined cost table
  // carries the name/quantity and the totals.
  const costCard = insideKiosk ? (
    <div className="card px-4 py-3">
      {/* The boxes always show; Cost / Selling stay blank until a price is found, so the card keeps
          its shape instead of collapsing into a message. */}
      <div className="grid grid-cols-3 gap-2 text-sm [&_b]:text-base">
        <div className="rounded-lg bg-surface p-2.5">Cost<br /><b>{priced ? `${fmt(cost)} ${currency}` : "—"}</b></div>
        <div className="rounded-lg bg-surface p-2.5">Factor<br />{factorInput}</div>
        <div className="rounded-lg bg-brand p-2.5 text-white">Selling<br /><b>{priced ? `${fmt(selling)} ${currency}` : "—"}</b></div>
      </div>
      {!priced && (
        <p className="mt-2 text-xs font-semibold text-amber-600">
          {preview == null ? "Calculating the RMU price…" : "Not in the RMU price list yet — price on request."}
        </p>
      )}
    </div>
  ) : (
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

        {/* Panel name + quantity — above the cost. Same field style as the LV panel details. */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Panel name</label>
            <input className="input" value={p.name} placeholder={defaultName}
              onChange={(e) => upPanel(p.id, { name: e.target.value })} />
          </div>
          <div>
            <label className="label">Quantity</label>
            <input className="input" inputMode="numeric" value={p.qty}
              onChange={(e) => upPanel(p.id, { qty: Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 1) })} />
          </div>
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
                <span className="text-center tabular-nums">
                  <input type="number" step="0.01" min={0} value={factor}
                    onChange={(e) => upPanel(p.id, { mvRmuFactor: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className="w-12 rounded border border-line bg-transparent px-1 py-0.5 text-center text-sm tabular-nums outline-none focus:border-brand" />
                </span>
                <span className="text-right tabular-nums">{fmt(selling)} {currency}</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm [&_b]:text-base">
              <div className="rounded-lg bg-surface p-2.5">Cost<br /><b>{fmt(cost)} {currency}</b></div>
              <div className="rounded-lg bg-surface p-2.5">Factor<br />{factorInput}</div>
              <div className="rounded-lg bg-brand p-2.5 text-white">Selling<br /><b>{fmt(selling)} {currency}</b></div>
            </div>
          )
        ) : (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            This exact configuration isn't in the RMU price list yet, so it has no automatic price. It will show as “Price on request” until the price list includes it (the code above is {panelCode}).
          </p>
        )}
      </div>
  );

  return (
    <div className="animate-fade-up">
      <RmuConfigForm value={rmu} onChange={setR} onChangeMany={setMany} code={code} panelCode={panelCode}
        feederOptions={insideKiosk ? KIOSK_FEEDER_OPTIONS : undefined} costCard={costCard} hideCode={insideKiosk} />
    </div>
  );
}
