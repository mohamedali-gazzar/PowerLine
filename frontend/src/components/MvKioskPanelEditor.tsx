import { useState, type ReactNode } from "react";
import { DEFAULT_MV_CABLE_EGP_PER_M, type LvState, type LvPanel } from "../lv/store";
import type { KioskLvConfigInput } from "../types";
import MvRmuPanelEditor from "./MvRmuPanelEditor";
import MvTransformerPanelEditor from "./MvTransformerPanelEditor";
import { DEFAULT_RMU_CONFIG } from "./RmuConfigForm";
import { rmuKioskLimitation } from "../pcss/kioskRmu";
import {
  KIOSK_SIZE_CODES, MV_CABLE_METERS, lvCopperKg,
  KIOSK_EXTRAS, DEFAULT_KIOSK_ACCESSORIES,
} from "../lv/kioskParts";
import {
  DEFAULT_KIOSK_FACTORS, kioskCostsEgp, kioskPartSellingEgp,
  kioskTotalCostEgp, kioskTotalSellingEgp, type KioskPartKey,
} from "../lv/kioskPricing";

// A kiosk (packaged compact secondary substation) is ONE unit holding an MV ring main unit, a
// transformer and the LV panel. The panel stores the RMU + transformer in the SAME fields a
// standalone RMU / Transformer panel uses (mvRmuConfig / mvTransformerConfig), so this editor
// reuses those two editors unchanged. The "Low" (LV) section is a REAL LV panel with two build
// modes — Standard EDMS (the house-standard panel for the transformer rating, built components-only
// so the engineer sizes it) and Private Sector (build from the component search). Both share the
// ordinary LV component editor + sizing card, passed in as `lvEditor` (avoids a circular import).
export const DEFAULT_KIOSK_LV: KioskLvConfigInput = {
  iec: "eehc", lvConfig: "inout", lvMode: "sizing", includePf: false, pfBrand: "ABB", includeSwitchFuse: false, lvSource: "standard",
};

/** A collapsible accordion section, numbered chip + brand header. `warn` flags a section whose
 *  configuration breaks a P-CSS limitation; `code` shows the part's code in the header. */
function Section({ n, title, subtitle, open, onToggle, warn, code, children }: {
  n: number; title: string; subtitle?: string; open: boolean; onToggle: () => void; warn?: boolean;
  code?: string;
  children: ReactNode;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border bg-white ${warn ? "border-amber-400/70" : "border-line"}`}>
      <button type="button" onClick={onToggle}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${open ? "bg-brand-light" : "bg-surface hover:bg-brand-tint/50"}`}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-extrabold text-white">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold uppercase tracking-wide text-brand-dark">{title}</span>
          {subtitle && <span className="block text-[11px] text-muted">{subtitle}</span>}
        </span>
        {code && <span className="hidden shrink-0 rounded-md bg-white px-2.5 py-1 font-mono text-[12px] font-bold tracking-wide text-brand-dark shadow-sm sm:inline-block dark:bg-neutral-900">{code}</span>}
        {warn && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">⚠ Not available</span>}
        <span className={`text-brand-dark transition-transform duration-150 ${open ? "rotate-90" : ""}`}>▶</span>
      </button>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </div>
  );
}

export default function MvKioskPanelEditor({ s, p, upPanel, lvEditor }: {
  s: LvState; p: LvPanel; upPanel: (id: string, patch: Partial<LvPanel>) => void;
  /** The LV editor (component list + sizing card) for THIS panel, supplied by the configurator
   *  page so the kiosk reuses it without a circular import. */
  lvEditor: ReactNode;
}) {
  const [open, setOpen] = useState({ rmu: true, tr: true, low: true, acc: true, extra: true });
  const toggle = (k: "rmu" | "tr" | "low" | "acc" | "extra") => setOpen((o) => ({ ...o, [k]: !o[k] }));
  // The RMU / transformer codes, reported up by their editors, shown in the section headers.
  const [rmuCode, setRmuCode] = useState("");
  const [trCode, setTrCode] = useState("");
  // The RMU / transformer costs (EGP), reported up by their editors (async — null until priced).
  const [rmuCostEgp, setRmuCostEgp] = useState<number | null>(null);
  const [trCostEgp, setTrCostEgp] = useState<number | null>(null);

  // P-CSS limitation for the RMU section (e.g. PRAL/Air has no 3+1+M kiosk configuration).
  const rmuLimit = rmuKioskLimitation(p.mvRmuConfig ?? DEFAULT_RMU_CONFIG);

  // LV build mode: Standard EDMS (default) vs Private Sector.
  const lv = p.mvLvConfig ?? DEFAULT_KIOSK_LV;
  const lvSource = lv.lvSource ?? "standard";
  const setSource = (v: "standard" | "private") => upPanel(p.id, { mvLvConfig: { ...lv, lvSource: v } });

  // ── "Kiosk price (live)": one combined cost sheet for the whole unit. Five parts, each with a
  // code, a cost and a factor; selling is worked out (cost ÷ factor). The RMU + Transformer codes
  // fill themselves in from their live configuration; the other three codes are typed by hand.
  // The LV panel's code follows the transformer rating, e.g. a 1000 kVA transformer → "MDB-1000KVA".
  const trRating = p.mvTransformerConfig?.ratingKva;
  const lvCode = trRating ? `MDB-${trRating}KVA` : "";
  const priceRows: { key: KioskPartKey; label: string; autoCode?: string }[] = [
    { key: "rmu", label: "RMU", autoCode: rmuCode },
    { key: "transformer", label: "Transformer", autoCode: trCode },
    { key: "lv", label: "LV", autoCode: lvCode },
    { key: "size", label: "Kiosk Size" },
    { key: "accessories", label: "Accessories", autoCode: "Acc." },
  ];
  const priceMap = p.mvKioskCost ?? {};
  const setPrice = (key: string, patch: Partial<{ code: string; cost: number; factor: number }>) =>
    upPanel(p.id, { mvKioskCost: { ...priceMap, [key]: { ...priceMap[key], ...patch } } });

  // ── Computed costs (EGP), from the QTN's Pricing Settings rates so a rate change reprices live.
  const usdRate = s.factors?.usd || 1;
  const sheetMetalRate = s.factors.sheetMetal || 0;
  const copperRate = s.factors.copper || 0;
  const mvCableRate = s.mvCableEgpPerM ?? DEFAULT_MV_CABLE_EGP_PER_M;
  // Kiosk Size code drives the enclosure-steel cost (inside kioskCostsEgp); kept for the dropdown.
  const sizeCode = priceMap.size?.code || "";
  // Accessories tick-box state — Capacitor Box / Stone Paint (moved here from the old Extra section).
  const accChecks = p.mvKioskAccChecks ?? {};
  const setAccCheck = (key: string, on: boolean) => upPanel(p.id, { mvKioskAccChecks: { ...accChecks, [key]: on } });
  const mvCableCost = Math.round(MV_CABLE_METERS * mvCableRate);
  const lvCopperKgVal = lvCopperKg(trRating);
  const lvCopperCost = lvCopperKgVal != null ? Math.round(lvCopperKgVal * copperRate) : 0;
  // The optional tick-box accessories (Capacitor Box / Stone Paint): ticked ⇒ its price counts.
  const checkRows = KIOSK_EXTRAS.map((e) => {
    const price = e.usd != null ? Math.round(e.usd * usdRate) : Math.round((e.kg || 0) * sheetMetalRate);
    const checked = !!accChecks[e.key];
    return { key: e.key, name: e.name, price, total: checked ? price : 0, checked };
  });
  // The read-only standard accessory rows: connections (by length/weight) + the fixed item list.
  const accRows = [
    { key: "mvcable", name: "MV cable", qty: MV_CABLE_METERS, unit: "m", price: mvCableRate, total: mvCableCost },
    { key: "lvcopper", name: "LV copper", qty: lvCopperKgVal ?? 0, unit: "kg", price: copperRate, total: lvCopperCost },
    ...DEFAULT_KIOSK_ACCESSORIES.map((a) => ({ key: a.id, name: a.name, qty: a.qty, unit: "-", price: a.cost, total: (a.cost || 0) * (a.qty || 0) })),
  ];

  // The whole cost sheet — RMU + Transformer from their databases (fetched above by the child
  // editors), the other four parts from the panel + rates — comes from the shared kioskPricing
  // helpers, so this live table and the kiosk line on the Commercial offer use the same math.
  const costs = kioskCostsEgp(p, s, rmuCostEgp, trCostEgp);
  const costOf = (key: KioskPartKey): number | null => costs[key];
  const sellingOf = (key: KioskPartKey): number | null => kioskPartSellingEgp(costs, p, key, usdRate);
  const totalCost = kioskTotalCostEgp(costs);
  const totalSelling = kioskTotalSellingEgp(costs, p, usdRate);
  const totalFactor = totalSelling > 0 ? totalCost / totalSelling : 0;

  // Display currency for the table (EGP default). Internals stay EGP; USD divides by the rate.
  const kioskCurrency = p.mvKioskCurrency ?? "EGP";
  const setKioskCurrency = (c: "EGP" | "USD") => upPanel(p.id, { mvKioskCurrency: c });
  const disp = (egp: number | null): string => {
    if (egp == null) return "—";
    const v = kioskCurrency === "USD" ? egp / usdRate : egp;
    return Math.round(v).toLocaleString();
  };

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Kiosk price (live): the one combined cost sheet for the whole kiosk, above the parts. */}
      <section className="card px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-brand-dark">Kiosk price (live)</h3>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted">Selling = cost ÷ factor</span>
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
              {(["EGP", "USD"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setKioskCurrency(c)}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${kioskCurrency === c ? "bg-brand text-white shadow-soft" : "text-muted hover:text-brand-dark"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2 text-left">Code</th>
                <th className="py-1.5 pr-2 text-left">Kiosk</th>
                <th className="py-1.5 pr-2 text-right">Cost</th>
                <th className="py-1.5 pr-2 text-right">Factor</th>
                <th className="py-1.5 text-right">Selling</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((row) => {
                const cost = costOf(row.key);
                const sell = sellingOf(row.key);
                return (
                  <tr key={row.key} className="border-b border-line/50">
                    <td className="py-1.5 pr-2">
                      {row.key === "size" ? (
                        <select value={sizeCode} onChange={(e) => setPrice("size", { code: e.target.value })}
                          className="-ml-1 cursor-pointer border-0 bg-transparent px-1 text-sm font-semibold text-ink focus:outline-none focus:ring-0 dark:bg-transparent">
                          <option value="">—</option>
                          {KIOSK_SIZE_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className="text-sm font-semibold text-ink">{row.autoCode || "—"}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 font-semibold text-ink">{row.label}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <span className="tabular-nums text-ink">{disp(cost)}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <input type="number" inputMode="decimal" value={priceMap[row.key]?.factor ?? DEFAULT_KIOSK_FACTORS[row.key] ?? ""}
                        onChange={(e) => setPrice(row.key, { factor: e.target.value === "" ? undefined : Number(e.target.value) })}
                        className="w-20 rounded-md border border-line px-2 py-1 text-right text-sm tabular-nums focus:border-brand focus:outline-none" />
                    </td>
                    <td className="py-1.5 text-right font-bold tabular-nums text-brand-dark">{disp(sell)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line text-sm font-extrabold text-brand-dark">
                <td className="py-2" colSpan={2}>Total</td>
                <td className="py-2 pr-2 text-right tabular-nums">{disp(totalCost)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{totalFactor ? totalFactor.toFixed(2) : "—"}</td>
                <td className="py-2 text-right tabular-nums">{disp(totalSelling)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* RMU first, then the Transformer stacked below it — each full width. */}
      <Section n={1} title="RMU" subtitle="Medium-voltage ring main unit" open={open.rmu} onToggle={() => toggle("rmu")} warn={!!rmuLimit} code={rmuCode}>
        {rmuLimit && (
          <div className="mb-3 rounded-lg border border-amber-400/70 bg-amber-50 p-2.5 text-[12px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            ⚠ {rmuLimit}
          </div>
        )}
        <MvRmuPanelEditor s={s} p={p} upPanel={upPanel} insideKiosk onPanelCode={setRmuCode} onCost={setRmuCostEgp} />
      </Section>

      <Section n={2} title="Transformer" subtitle="MV / LV distribution transformer" open={open.tr} onToggle={() => toggle("tr")} code={trCode}>
        <MvTransformerPanelEditor p={p} upPanel={upPanel} insideKioskOnly onCode={setTrCode} onCost={setTrCostEgp} usdRate={usdRate} />
      </Section>

      <Section n={3} title="Low" subtitle="LV panel — standard or private build" open={open.low} onToggle={() => toggle("low")}>
        <div className="space-y-3">
          {/* How to build the LV panel: the house standard for the transformer rating, or from scratch. */}
          <div>
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
              {([["standard", "Standard EDMS"], ["private", "Private Sector"]] as const).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setSource(m)}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-bold transition-colors ${lvSource === m ? "bg-brand text-white shadow-soft" : "text-muted hover:text-brand-dark"}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              {lvSource === "standard"
                ? "Standard EDMS — pick the house-standard panel for the transformer's rating (it fills the components; you size the panel yourself below)."
                : "Private Sector — build the panel yourself: search for components and add them, then size it below."}
            </p>
          </div>

          {/* The LV component editor + sizing card (Standard mode also shows the standard picker). */}
          {lvEditor}
        </div>
      </Section>

      <Section n={4} title="Accessories" subtitle="MV cable, LV copper, items, capacitor box & stone paint" open={open.acc} onToggle={() => toggle("acc")}
        code={costs.accessories ? `${costs.accessories.toLocaleString()} EGP` : undefined}>
        <KioskAccessoriesEditor rows={accRows} checks={checkRows} onCheck={setAccCheck} />
      </Section>
    </div>
  );
}

// The shared 5-column grid for both the accessories and extra tables.
const KIOSK_ACC_COLS = "grid grid-cols-[1fr_3.5rem_3rem_6rem_7rem] items-center gap-2";
// Every data row shares one height so the numeric rows and the tick-box rows line up evenly.
const KIOSK_ACC_ROW = `${KIOSK_ACC_COLS} min-h-[2.25rem]`;

function KioskAccHeader() {
  return (
    <div className={`${KIOSK_ACC_COLS} text-[11px] font-bold uppercase tracking-wide text-muted`}>
      <span>Item</span><span className="text-right">Qty</span><span className="text-right">Unit</span><span className="text-right">Price</span><span className="text-right">Total</span>
    </div>
  );
}

/** The Accessories accordion body: the read-only standard list (MV cable + LV copper connections and
 *  the fixed accessory items) followed by the optional tick-box items (Capacitor Box / Stone Paint,
 *  moved here from the old "Extra" section). Its total feeds the "Accessories" row of the price table. */
function KioskAccessoriesEditor({ rows, checks, onCheck }: {
  rows: { key: string; name: string; qty: number; unit: string; price: number; total: number }[];
  checks: { key: string; name: string; price: number; total: number; checked: boolean }[];
  onCheck: (key: string, on: boolean) => void;
}) {
  const total = rows.reduce((sum, r) => sum + r.total, 0) + checks.reduce((sum, c) => sum + c.total, 0);
  return (
    <div className="space-y-2">
      <KioskAccHeader />
      {rows.map((r) => (
        <div key={r.key} className={KIOSK_ACC_ROW}>
          <span className="min-w-0 truncate text-sm font-semibold text-ink">{r.name}</span>
          <span className="text-right text-sm tabular-nums text-muted">{r.qty}</span>
          <span className="text-right text-sm text-muted">{r.unit}</span>
          <span className="text-right text-sm tabular-nums text-muted">{r.price.toLocaleString()}</span>
          <span className="text-right text-sm font-semibold tabular-nums text-ink">{r.total ? r.total.toLocaleString() : "—"}</span>
        </div>
      ))}
      {checks.map((c) => (
        <div key={c.key} className={KIOSK_ACC_ROW}>
          <span className="min-w-0 truncate text-sm font-semibold text-ink">{c.name}</span>
          <span className="flex justify-end pr-1">
            <input type="checkbox" checked={c.checked} onChange={(ev) => onCheck(c.key, ev.target.checked)}
              aria-label={c.name}
              className="h-4 w-4 cursor-pointer rounded border-line text-brand focus:ring-brand" />
          </span>
          <span className="text-right text-sm text-muted">-</span>
          <span className="text-right text-sm tabular-nums text-muted">{c.price.toLocaleString()}</span>
          <span className="text-right text-sm font-semibold tabular-nums text-ink">{c.total ? c.total.toLocaleString() : "—"}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-line pt-2 text-sm font-extrabold text-brand-dark">
        <span>Accessories total</span>
        <span className="tabular-nums">{total.toLocaleString()} EGP</span>
      </div>
    </div>
  );
}
