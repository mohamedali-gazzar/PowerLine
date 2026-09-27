import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  DEFAULT_KIOSK_FACTORS, kioskCostsEgp, kioskPartSellingEgp, kioskFactorOf,
  kioskTotalCostEgp, kioskTotalSellingEgp, trTransportationUsd, type KioskPartKey,
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
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${open ? "bg-brand-light" : "bg-white hover:bg-brand-tint/50 dark:bg-neutral-900"}`}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-extrabold text-white">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold uppercase tracking-wide text-brand-dark">{title}</span>
          {subtitle && <span className="block text-[11px] text-muted">{subtitle}</span>}
        </span>
        {/* The header is white now, so the chip carries a hairline ring — without it a white chip
            on a white header disappears. */}
        {code && <span className="hidden shrink-0 rounded-md bg-white px-2.5 py-1 font-mono text-[12px] font-bold tracking-wide text-brand-dark shadow-sm ring-1 ring-line sm:inline-block dark:bg-neutral-900">{code}</span>}
        {warn && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">⚠ Not available</span>}
        <span className={`text-brand-dark transition-transform duration-150 ${open ? "rotate-90" : ""}`}>▶</span>
      </button>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </div>
  );
}

/** A crosshair — the "aim at a price" button beside each Selling figure. */
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </svg>
  );
}

/** One row of the target-price sheet, in the table's DISPLAY currency. */
interface TargetRow {
  key: KioskPartKey;
  label: string;
  cost: number;
  selling: number;
  factor: number;
  /** A flat amount added AFTER the factor (the transformer's transportation), so the factor only has
   *  to bridge cost → (target − extra). */
  extra: number;
  /** False when the part has no price yet — nothing to work a factor out from. */
  priced: boolean;
  /** The target applied last time, so the sheet reopens showing it. */
  current?: number;
}

/**
 * "Target price" — one sheet for the whole kiosk. Every part is listed with its cost, factor and
 * selling price; type the price you want in any of them and the factor that gets you there appears
 * beside it, before anything is committed. Apply commits every row you filled in at once.
 *
 * Emptying a row that already had a target clears it on Apply (the factor stays where it is).
 * Everything here is in the table's display currency; the caller converts to EGP.
 */
function TargetPriceDialog({ open, rows, currency, onApply, onClose }: {
  open: boolean;
  rows: TargetRow[];
  currency: "EGP" | "USD";
  /** Every row the engineer filled in or emptied. `target`/`newFactor` are null when cleared. */
  onApply: (changes: { key: KioskPartKey; target: number | null; newFactor: number | null }[]) => void;
  onClose: () => void;
}) {
  const [txt, setTxt] = useState<Record<string, string>>({});
  // `closing` runs the exit animation; the sheet is only torn down once it finishes. It is also the
  // guard that stops a second Esc / backdrop click firing the close twice mid-animation.
  const [closing, setClosing] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);

  // Reopening starts from whatever was applied last time.
  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string> = {};
    for (const r of rows) seed[r.key] = r.current != null ? String(Math.round(r.current)) : "";
    setTxt(seed);
    setClosing(false);
    firstRef.current?.focus();
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Play the exit animation, then do `after`. Under reduce-motion it happens at once. Ignored while
   *  an exit is already running, so a second Esc or backdrop click cannot close it twice. */
  const leave = (after: () => void) => {
    if (closing) return;
    const reduced = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { after(); return; }
    setClosing(true);
    timer.current = window.setTimeout(after, 220);
  };

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") leave(onClose); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, closing]);
  if (!open) return null;

  const fmt = (n: number) => Math.round(n).toLocaleString();

  /** What one row's typed text means: nothing, a problem to explain, or a factor to apply. */
  const readRow = (r: TargetRow) => {
    const raw = (txt[r.key] ?? "").trim();
    const cleared = raw === "" && r.current != null;   // emptied a row that had a target → clear it
    if (raw === "") return { state: cleared ? "cleared" as const : "empty" as const };
    const target = Number(raw);
    if (!isFinite(target) || target <= 0) return { state: "empty" as const };
    if (!r.priced) return { state: "unpriced" as const };
    // Selling below cost is a loss, so it is refused rather than warned about.
    if (target < r.cost) return { state: "below" as const, target };
    if (target - r.extra <= 0) return { state: "under-extra" as const, target };
    // Rounded to 4 decimals because that is what goes in the factor box, so the selling shown here is
    // worked out from the ROUNDED factor — what the sheet promises is what the table will show.
    const newFactor = Math.round((r.cost / (target - r.extra)) * 10000) / 10000;
    if (!(newFactor > 0)) return { state: "empty" as const };
    return { state: "ok" as const, target, newFactor, resulting: Math.round(r.cost / newFactor) + r.extra };
  };

  const read = rows.map((r) => ({ r, v: readRow(r) }));
  const problems = read.filter((x) => x.v.state === "below" || x.v.state === "under-extra" || x.v.state === "unpriced");
  const changes = read.filter((x) => x.v.state === "ok" || x.v.state === "cleared");
  const canApply = problems.length === 0 && changes.length > 0;

  const commit = () => {
    if (!canApply) return;
    leave(() => onApply(changes.map(({ r, v }) => (
      v.state === "ok"
        ? { key: r.key, target: v.target, newFactor: v.newFactor }
        : { key: r.key, target: null, newFactor: null }
    ))));
  };

  // The whole kiosk, as it stands and as the typed targets would leave it.
  const totalNow = rows.reduce((sum, r) => sum + (r.priced ? r.selling : 0), 0);
  const totalNext = read.reduce((sum, { r, v }) => sum + (v.state === "ok" ? v.resulting : (r.priced ? r.selling : 0)), 0);

  return createPortal(
    <div className={`tp-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 ${closing ? "is-closing" : ""}`}
      role="dialog" aria-modal="true" aria-label="Target price"
      onMouseDown={(e) => { if (e.target === e.currentTarget) leave(onClose); }}>
      <div className={`tp-card max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-12px_rgba(12,20,40,.55)] dark:bg-neutral-900 ${closing ? "is-closing" : ""}`}>
        {/* Navy band with the same crosshair the Selling column carries, so it is obvious which
            control opened this. */}
        <div className="relative bg-[#16264a] px-5 pb-4 pt-5 text-center">
          <button type="button" onClick={() => leave(onClose)} disabled={closing}
            className="absolute right-3 top-2.5 text-lg leading-none text-white/55 transition hover:text-white" aria-label="Close">×</button>
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-brand text-white shadow-lg">
            <TargetIcon />
          </span>
          <h2 className="mt-2 text-base font-extrabold text-white">Target price</h2>
          <p className="mt-0.5 text-[11px] text-white/65">
            Type the price you want for any part · figures in {currency}
          </p>
        </div>

        <div className="max-h-[calc(90vh-13rem)] overflow-y-auto p-5">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2 text-left">Part</th>
                <th className="py-1.5 pr-2 text-right">Cost</th>
                <th className="py-1.5 pr-2 text-right">Factor</th>
                <th className="py-1.5 pr-2 text-right">Selling</th>
                <th className="py-1.5 text-right">Target</th>
              </tr>
            </thead>
            <tbody>
              {read.map(({ r, v }, i) => {
                const bad = v.state === "below" || v.state === "under-extra" || v.state === "unpriced";
                return (
                  <tr key={r.key} className="border-b border-line/50 align-middle">
                    <td className="py-2 pr-2 font-semibold text-ink">{r.label}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-muted">{r.priced ? fmt(r.cost) : "—"}</td>
                    {/* Factor and Selling preview what the typed target would make them. */}
                    <td className={`py-2 pr-2 text-right tabular-nums ${v.state === "ok" ? "font-bold text-brand" : "text-muted"}`}>
                      {v.state === "ok" ? v.newFactor : (r.priced ? r.factor : "—")}
                    </td>
                    <td className={`py-2 pr-2 text-right tabular-nums ${v.state === "ok" ? "font-bold text-brand" : "font-semibold text-ink"}`}>
                      {v.state === "ok" ? fmt(v.resulting) : (r.priced ? fmt(r.selling) : "—")}
                    </td>
                    <td className="py-2 text-right">
                      <input ref={i === 0 ? firstRef : undefined} type="number" inputMode="decimal" min={0}
                        value={txt[r.key] ?? ""} disabled={!r.priced}
                        onChange={(e) => setTxt((t) => ({ ...t, [r.key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
                        placeholder={r.priced ? fmt(r.selling) : "—"}
                        aria-label={`Target price for ${r.label}`}
                        className={`w-28 rounded-md border px-2 py-1 text-right text-sm tabular-nums focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${bad ? "border-red-400 bg-red-50/60 text-red-700 dark:bg-red-500/10" : "border-line focus:border-brand"}`} />
                    </td>
                  </tr>
                );
              })}
              <tr className="text-sm font-extrabold text-brand-dark">
                <td className="py-2 pr-2">Whole kiosk</td>
                <td />
                <td />
                <td className="py-2 pr-2 text-right tabular-nums">{fmt(totalNow)}</td>
                <td className={`py-2 text-right tabular-nums ${Math.round(totalNext) !== Math.round(totalNow) ? "text-brand" : "text-muted"}`}>
                  {fmt(totalNext)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3 min-h-[2.75rem] rounded-lg bg-surface p-3 text-sm">
            {problems.length > 0 ? (
              <ul className="space-y-0.5">
                {problems.map(({ r, v }) => (
                  <li key={r.key} className="font-semibold text-red-600">
                    {v.state === "unpriced"
                      ? `${r.label} has no price yet, so there is nothing to work a factor out from.`
                      : v.state === "under-extra"
                        ? `${r.label}: the transportation charge alone is ${fmt(r.extra)} ${currency}, so the target has to be above it.`
                        : `${r.label}: that is below the cost of ${fmt(r.cost)} ${currency} — it would sell at a loss.`}
                  </li>
                ))}
              </ul>
            ) : changes.length > 0 ? (
              <span className="text-muted">
                {changes.length === 1 ? "1 part" : `${changes.length} parts`} will change when you apply.
                {changes.some((c) => c.v.state === "cleared") && " Emptied rows have their target cleared — their factor stays where it is."}
              </span>
            ) : (
              <span className="text-muted">Type a price in any row and the factor that reaches it appears beside it.</span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => leave(onClose)} disabled={closing}
              className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-surface">Discard</button>
            {/* The main button: a pill that grows and tilts on hover, and presses in on click. */}
            <button type="button" disabled={!canApply || closing} onClick={commit}
              className="rounded-full bg-brand px-5 py-1.5 text-sm font-bold text-white shadow-soft transition-transform duration-150 hover:scale-105 hover:-rotate-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:rotate-0 motion-reduce:transform-none motion-reduce:transition-none">Apply</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}


export default function MvKioskPanelEditor({ s, p, upPanel, lvEditor, defaultName }: {
  s: LvState; p: LvPanel; upPanel: (id: string, patch: Partial<LvPanel>) => void;
  /** The auto name this item shows in the panel list (e.g. "Kiosk-01"), used as the Panel name
   *  placeholder so an unnamed item reads the same here as in the list. */
  defaultName?: string;
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
  const setPrice = (key: string, patch: Partial<{ code: string; cost: number; factor: number; target: number; sellOverride: number }>) =>
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
  // Per-accessory quantity override (currently the Fire extinguisher's 1/2/3 dropdown). Absent ⇒ default.
  const accQty = p.mvKioskAccQty ?? {};
  const setAccQty = (id: string, qty: number) => upPanel(p.id, { mvKioskAccQty: { ...accQty, [id]: qty } });
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
    // The Fire extinguisher's quantity is a 1/2/3 dropdown (default 2); the other fixed items keep theirs.
    ...DEFAULT_KIOSK_ACCESSORIES.map((a) => {
      const qty = accQty[a.id] ?? a.qty;
      return { key: a.id, name: a.name, qty, unit: "-", price: a.cost, total: (a.cost || 0) * (qty || 0), qtyOptions: a.id === "acc-fire" ? [1, 2, 3] : undefined };
    }),
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
  // EGP/USD is a way of reading the sheet, not a property of one kiosk — so switching it here
  // switches every kiosk in the quotation, and the engineer doesn't have to set it item by item.
  const setKioskCurrency = (c: "EGP" | "USD") => {
    for (const k of s.panels) if (k.mvType === "kiosk") upPanel(k.id, { mvKioskCurrency: c });
  };
  const disp = (egp: number | null): string => {
    if (egp == null) return "—";
    const v = kioskCurrency === "USD" ? egp / usdRate : egp;
    return Math.round(v).toLocaleString();
  };
  // ── Target price: one sheet for the whole kiosk, opened from the Selling column. Everything is
  // stored in EGP; the sheet talks in whatever currency the table is showing.
  const [targetOpen, setTargetOpen] = useState(false);
  /** Close it and hand focus back to the crosshair beside the Selling header. The button is looked
   *  up fresh rather than held as a reference — the table re-renders while the sheet is open, so a
   *  reference taken on opening would point at a node that is no longer on the page. */
  const closeTarget = () => {
    setTargetOpen(false);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-target-all]')?.focus(), 0);
  };
  const toDisp = (egp: number) => (kioskCurrency === 'USD' ? egp / usdRate : egp);
  const toEgp = (v: number) => (kioskCurrency === 'USD' ? v * usdRate : v);
  /** Apply every target typed on the sheet in one edit, so it is a single undo step. A change with a
   *  null target is a cleared row: the target is forgotten and the factor left where it is. */
  const applyTargets = (changes: { key: KioskPartKey; target: number | null; newFactor: number | null }[]) => {
    let cost: NonNullable<LvPanel['mvKioskCost']> = { ...priceMap };
    let rmuFactor = p.mvRmuFactor;
    for (const c of changes) {
      const target = c.target != null ? Math.round(toEgp(c.target)) : undefined;
      if (c.key === 'rmu') {
        // The RMU's factor lives on the panel (mvRmuFactor). `sellOverride` goes with it: kiosks
        // saved before the factor drove the RMU's selling price carry one, and it would keep pinning
        // the price no matter what factor this works out.
        if (c.newFactor != null) rmuFactor = c.newFactor;
        cost = { ...cost, rmu: { ...cost.rmu, target, sellOverride: undefined } };
      } else {
        cost = { ...cost, [c.key]: { ...cost[c.key], ...(c.newFactor != null ? { factor: c.newFactor } : {}), target } };
      }
    }
    upPanel(p.id, { mvKioskCost: cost, mvRmuFactor: rmuFactor });
    closeTarget();
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
        {/* Panel name + quantity — above the code. Same field style as the LV panel details. */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kiosk name</label>
            {/* The kiosk's OWN name — it starts as the name shown in the panel list ("Kiosk-01") and
                editing it renames the kiosk there too. Deliberately NOT `p.name`: that belongs to the
                LV panel inside the kiosk (the house standard writes "MDB 2000A…" into it). */}
            <input className="input" value={p.mvKioskName || defaultName || ""} placeholder={defaultName}
              onChange={(e) => upPanel(p.id, { mvKioskName: e.target.value })} />
          </div>
          <div>
            <label className="label">Quantity</label>
            <input className="input" inputMode="numeric" value={p.qty}
              onChange={(e) => upPanel(p.id, { qty: Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 1) })} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2 text-left">Kiosk</th>
                <th className="py-1.5 pr-2 text-left">Code</th>
                <th className="py-1.5 pr-2 text-right">Cost</th>
                <th className="py-1.5 pr-2 text-right">Factor</th>
                <th className="py-1.5 text-right">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    Selling
                    {/* Opens the target-price sheet for every part at once. */}
                    <button type="button" data-target-all onClick={() => setTargetOpen(true)}
                      title="Target price — set the selling price you want for any part"
                      aria-label="Target price" className="rounded-md p-1 text-muted transition hover:bg-brand-tint/60 hover:text-brand-dark">
                      <TargetIcon />
                    </button>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((row) => {
                const cost = costOf(row.key);
                const sell = sellingOf(row.key);
                const mainRow = (
                  <tr key={row.key} className="border-b border-line/50">
                    <td className="py-1.5 pr-2 font-semibold text-ink">{row.label}</td>
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
                    <td className="py-1.5 pr-2 text-right">
                      <span className="tabular-nums text-ink">{disp(cost)}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {/* The RMU's factor lives on the panel itself (mvRmuFactor), because the RMU
                          section has the same box — typing in either one moves the other. */}
                      {row.key === "rmu" ? (
                        <input type="number" inputMode="decimal" value={p.mvRmuFactor ?? kioskFactorOf(p, "rmu") ?? ""}
                          onChange={(e) => upPanel(p.id, { mvRmuFactor: e.target.value === "" ? undefined : Number(e.target.value) })}
                          title="The same factor as the RMU section above"
                          className="w-20 rounded-md border border-line px-2 py-1 text-right text-sm tabular-nums focus:border-brand focus:outline-none" />
                      ) : (
                        <input type="number" inputMode="decimal" value={priceMap[row.key]?.factor ?? DEFAULT_KIOSK_FACTORS[row.key] ?? ""}
                          onChange={(e) => setPrice(row.key, { factor: e.target.value === "" ? undefined : Number(e.target.value) })}
                          className="w-20 rounded-md border border-line px-2 py-1 text-right text-sm tabular-nums focus:border-brand focus:outline-none" />
                      )}
                    </td>
                    {/* A part whose price was aimed at with the Target-price sheet is marked, so it
                        is clear at a glance which figures were chosen rather than worked out. */}
                    <td className={`py-1.5 text-right font-bold tabular-nums ${priceMap[row.key]?.target != null ? "text-brand" : "text-brand-dark"}`}
                      title={priceMap[row.key]?.target != null ? "Set from a target price" : undefined}>
                      {disp(sell)}
                    </td>
                  </tr>
                );
                return mainRow;
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
        <KioskAccessoriesEditor rows={accRows} checks={checkRows} onCheck={setAccCheck} onQty={setAccQty} />
      </Section>

      <TargetPriceDialog open={targetOpen} currency={kioskCurrency} onApply={applyTargets} onClose={closeTarget}
        rows={priceRows.map((row) => {
          const c = costOf(row.key);
          // The transformer's transportation is added after the factor, so the factor only has to
          // bridge cost → (target − transportation).
          const extraEgp = row.key === "transformer" ? Math.round(trTransportationUsd(p) * usdRate) : 0;
          const stored = priceMap[row.key]?.target;
          return {
            key: row.key, label: row.label, priced: c != null,
            cost: toDisp(c ?? 0), selling: toDisp(sellingOf(row.key) ?? 0),
            factor: kioskFactorOf(p, row.key) ?? 0, extra: toDisp(extraEgp),
            current: stored != null ? toDisp(stored) : undefined,
          };
        })} />
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
function KioskAccessoriesEditor({ rows, checks, onCheck, onQty }: {
  rows: { key: string; name: string; qty: number; unit: string; price: number; total: number; qtyOptions?: number[] }[];
  checks: { key: string; name: string; price: number; total: number; checked: boolean }[];
  onCheck: (key: string, on: boolean) => void;
  onQty: (id: string, qty: number) => void;
}) {
  const total = rows.reduce((sum, r) => sum + r.total, 0) + checks.reduce((sum, c) => sum + c.total, 0);
  return (
    <div className="space-y-2">
      <KioskAccHeader />
      {rows.map((r) => (
        <div key={r.key} className={KIOSK_ACC_ROW}>
          <span className="min-w-0 truncate text-sm font-semibold text-ink">{r.name}</span>
          {r.qtyOptions ? (
            <span className="flex justify-end">
              {/* Styled to blend with the plain qty cells — no box, right-aligned muted — but still a dropdown. */}
              <select value={r.qty} aria-label={`${r.name} quantity`}
                onChange={(e) => onQty(r.key, Number(e.target.value))}
                className="cursor-pointer border-0 bg-transparent p-0 text-right text-sm tabular-nums text-muted focus:outline-none focus:ring-0">
                {r.qtyOptions.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </span>
          ) : (
            <span className="text-right text-sm tabular-nums text-muted">{r.qty}</span>
          )}
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
