import { useEffect, useMemo, useRef, useState } from "react";
import {
  RMUS,
  TR_POWERS,
  LV_PANELS,
  STD_BREAKERS,
  DESIGNS,
  CAPACITOR_BOX_KG,
  TR_UPGRADE,
  rmu as findRmu,
  trPower as findTr,
  lvPanel as findLv,
  type RmuId,
  type Cfg,
  type TrId,
  type LvId,
  type IecId,
  type Design,
} from "../kiosk/catalog";
import {
  emptySelection,
  getAllowedLvPanels,
  evaluate,
  spaceInfo,
  type Selection,
  type CustomBreaker,
  type Qtys,
  type SpaceInfo,
} from "../kiosk/engine";

type Filter = "all" | "5ST" | "10ST" | "16ST";

const IEC_OPTS: { id: IecId; label: string; sub: string }[] = [
  { id: "iec", label: "IEC standard", sub: "60 mm clearance between breakers" },
  { id: "noiec", label: "No IEC spacing", sub: "Zero-clearance dense array" },
];

// ── Small presentational pieces ──────────────────────────────────────────────
function Step({
  n,
  title,
  children,
  hint,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 p-4 animate-fade-up">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Step {n} of 6</div>
      <div className="mb-3 mt-0.5 text-sm font-bold text-ink">{title}</div>
      {children}
      {hint && <p className="mt-2 text-xs text-muted/80">{hint}</p>}
    </div>
  );
}

function OptCard({
  active,
  disabled,
  title,
  sub,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-all duration-150 ${
        active
          ? "border-brand bg-brand-light ring-1 ring-brand/30"
          : disabled
          ? "cursor-not-allowed border-line bg-surface opacity-40"
          : "border-line bg-white hover:border-accent/60 hover:bg-brand-tint"
      }`}
    >
      <div className={`text-sm font-semibold ${active ? "text-brand-dark" : "text-ink"}`}>{title}</div>
      {sub && <div className={`mt-0.5 text-xs leading-snug ${active ? "text-brand" : "text-muted"}`}>{sub}</div>}
    </button>
  );
}

function Qty({ value, onDelta }: { value: number; onDelta: (d: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onDelta(-1)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-white text-ink hover:bg-brand-tint"
      >
        −
      </button>
      <span className="min-w-6 text-center text-sm font-bold">{value}</span>
      <button
        type="button"
        onClick={() => onDelta(1)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-white text-ink hover:bg-brand-tint"
      >
        +
      </button>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[11px] text-muted">
      {label}
      <span className="mt-0.5 block text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

/** Breaker space-usage bar. Rendered both in the output pane and inside the
 *  breaker step so the user always sees remaining width while configuring. */
function SpaceBar({ si, sel }: { si: SpaceInfo; sel: Selection }) {
  // No explicit LV panel → nothing to validate against.
  if (sel.lv == null || sel.lv === "any" || si.em == null) {
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
        Select an explicit LV panel and breakers to calculate spatial clearance.
      </div>
    );
  }

  const over = si.status === "over";
  const barColor = over ? "bg-red-500" : si.status === "warn" ? "bg-amber-500" : "bg-green-500";
  const noteColor = over ? "text-red-700" : si.status === "warn" ? "text-amber-700" : "text-green-700";
  const gapNote =
    si.count > 1 ? ` (incl. ${si.count - 1}× ${si.gap}mm ${sel.iec === "iec" ? "IEC" : "no-IEC"} gaps)` : "";

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap justify-between gap-x-4 text-xs text-muted">
          <span>
            Allocated <strong className="text-ink">{si.total} mm</strong> / {si.em} mm{gapNote}
          </span>
          <span>
            Remaining <strong className="text-ink">{si.remain} mm</strong>
          </span>
        </div>
        <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-line">
          <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${si.pct}%` }} />
        </div>
        <div className={`mt-1.5 text-xs font-medium ${noteColor}`}>
          {si.remain! < 0
            ? `⚠ Exceeds limit by ${Math.abs(si.remain!)} mm`
            : si.remain === 0
            ? "✔ Max utilization reached"
            : `✔ ${si.remain} mm remaining`}
        </div>
      </div>

      {over &&
        (() => {
          const upgrade = sel.trPower ? TR_UPGRADE[sel.trPower] : null;
          return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 animate-fade-in">
              <div className="flex items-center gap-2 text-sm font-bold text-red-700">
                <span>🏭</span>
                {upgrade ? `You need a Special Kiosk — or upgrade to ${upgrade}` : "Special Kiosk required"}
              </div>
              <p className="mt-0.5 text-xs leading-snug text-red-600">
                The breaker layout ({si.total} mm) exceeds the {si.em} mm usable width of LV panel {sel.lv} cm by{" "}
                {Math.abs(si.remain!)} mm.{" "}
                {upgrade
                  ? `Raise the PCSS rating to ${upgrade}, or request a custom “Special Kiosk”.`
                  : "No standard P-CSS enclosure fits — a custom “Special Kiosk” is required."}
              </p>
            </div>
          );
        })()}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function KioskSelectorPage() {
  const [sel, setSel] = useState<Selection>(emptySelection());
  const [qtys, setQtys] = useState<Qtys>(() => Object.fromEntries(STD_BREAKERS.map((b) => [b.id, 0])));
  const [customs, setCustoms] = useState<CustomBreaker[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [custName, setCustName] = useState("");
  const [custW, setCustW] = useState("");
  const customCtr = useRef(0);

  // Cascading selectors — each choice resets the downstream steps.
  const selectRmu = (id: RmuId) => setSel({ rmu: id, cfg: null, trPower: null, lv: null, iec: null });
  const selectCfg = (c: Cfg) => setSel((s) => ({ ...s, cfg: c, trPower: null, lv: null, iec: null }));
  const selectTr = (p: TrId) => setSel((s) => ({ ...s, trPower: p, lv: null, iec: null }));
  const selectLv = (id: LvId) => setSel((s) => ({ ...s, lv: id, iec: null }));
  const selectIec = (id: IecId) => setSel((s) => ({ ...s, iec: id }));

  const allowedLv = useMemo(() => getAllowedLvPanels(sel), [sel]);
  const visibleLv = LV_PANELS.filter((p) => allowedLv.includes(p.id));

  // Auto-select the LV panel when the selection forces a single option.
  useEffect(() => {
    if (sel.trPower && visibleLv.length === 1 && sel.lv !== visibleLv[0].id) {
      selectLv(visibleLv[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.rmu, sel.cfg, sel.trPower]);

  const changeQty = (id: string, d: number) =>
    setQtys((q) => ({ ...q, [id]: Math.max(0, (q[id] || 0) + d) }));

  const addCustom = () => {
    const name = custName.trim();
    const w = parseInt(custW, 10);
    if (!name || isNaN(w) || w < 1) return;
    customCtr.current += 1;
    setCustoms((cs) => [...cs, { id: `c${customCtr.current}`, label: name, widthMm: w, qty: 1 }]);
    setCustName("");
    setCustW("");
  };

  const changeCustomQty = (id: string, d: number) =>
    setCustoms((cs) =>
      cs
        .map((c) => (c.id === id ? { ...c, qty: Math.max(0, c.qty + d) } : c))
        .filter((c) => c.qty > 0)
    );

  const result = useMemo(() => evaluate(sel, qtys, customs, filter), [sel, qtys, customs, filter]);
  const si = useMemo(() => spaceInfo(sel, qtys, customs), [sel, qtys, customs]);

  const rmuMeta = findRmu(sel.rmu);
  const trMeta = findTr(sel.trPower);

  const crumbs: string[] = [];
  if (rmuMeta) crumbs.push(rmuMeta.label);
  if (sel.cfg) crumbs.push(sel.cfg);
  if (trMeta) crumbs.push(trMeta.label);
  if (sel.lv) crumbs.push(findLv(sel.lv)!.label);
  if (sel.iec) crumbs.push(sel.iec === "iec" ? "IEC" : "No IEC");

  return (
    <div>
      {/* Header */}
      <div className="mb-5 animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight">Kiosk — PCSS Design Selector</h1>
        <p className="text-sm text-muted">
          Packaged compact secondary substation sizing engine · {DESIGNS.length} P-CSS designs
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* ── LEFT: stepper ─────────────────────────────────────────────── */}
        <div className="card space-y-4 p-5 animate-fade-up">
          {/* Breadcrumb */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {crumbs.length === 0 ? (
              <span>Select specifications below to begin…</span>
            ) : (
              crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="rounded-md bg-sidebar px-2 py-0.5 font-medium text-white/85">{c}</span>
                  {i < crumbs.length - 1 && <span className="text-muted/50">›</span>}
                </span>
              ))
            )}
          </div>

          {/* Step 1 — RMU */}
          <Step n={1} title="Select MV panel (RMU) type">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {RMUS.map((r) => (
                <OptCard
                  key={r.id}
                  active={sel.rmu === r.id}
                  title={r.label}
                  sub={r.sub}
                  onClick={() => selectRmu(r.id)}
                />
              ))}
            </div>
          </Step>

          {/* Step 2 — Config */}
          {rmuMeta && (
            <Step n={2} title="Select switching configuration">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {rmuMeta.configs.map((c) => (
                  <OptCard key={c} active={sel.cfg === c} title={c} onClick={() => selectCfg(c)} />
                ))}
              </div>
            </Step>
          )}

          {/* Step 3 — TR power */}
          {sel.cfg && (
            <Step n={3} title="Select PCSS rated effective power">
              <div className="grid grid-cols-3 gap-2.5">
                {TR_POWERS.map((t) => (
                  <OptCard
                    key={t.id}
                    active={sel.trPower === t.id}
                    title={t.label}
                    sub={t.sub}
                    onClick={() => selectTr(t.id)}
                  />
                ))}
              </div>
            </Step>
          )}

          {/* Step 4 — LV panel */}
          {sel.trPower && (
            <Step n={4} title="Select LV panel size" hint="Options are filtered to what fits your RMU + TR choice.">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {visibleLv.map((p) => (
                  <OptCard
                    key={p.id}
                    active={sel.lv === p.id}
                    title={p.label}
                    sub={p.sub}
                    onClick={() => selectLv(p.id)}
                  />
                ))}
              </div>
            </Step>
          )}

          {/* Step 5 — IEC */}
          {sel.lv && (
            <Step n={5} title="IEC spacing standard">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {IEC_OPTS.map((o) => (
                  <OptCard
                    key={o.id}
                    active={sel.iec === o.id}
                    title={o.label}
                    sub={o.sub}
                    onClick={() => selectIec(o.id)}
                  />
                ))}
              </div>
            </Step>
          )}

          {/* Step 6 — Breakers */}
          {sel.iec && (
            <Step n={6} title="Select LV circuit breakers">
              {/* Inline space bar so the fit is visible right while adding breakers */}
              <div className="mb-3">
                <SpaceBar si={si} sel={sel} />
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Width</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2 text-right">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {STD_BREAKERS.map((b) => (
                    <tr key={b.id} className="border-t border-line/70">
                      <td className="py-1.5 font-semibold">{b.label}</td>
                      <td className="py-1.5 text-muted">{b.widthMm} mm</td>
                      <td className="py-1.5">
                        <Qty value={qtys[b.id] || 0} onDelta={(d) => changeQty(b.id, d)} />
                      </td>
                      <td className="py-1.5 text-right text-[11px] text-muted">
                        {qtys[b.id] > 0 ? `${qtys[b.id]}× = ${qtys[b.id] * b.widthMm} mm` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Custom breaker */}
              <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-muted">Custom width</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <input
                  className="input h-9 w-36"
                  placeholder="Name (e.g. XT7)"
                  maxLength={12}
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                />
                <input
                  className="input h-9 w-32"
                  placeholder="Width (mm)"
                  type="number"
                  min={1}
                  value={custW}
                  onChange={(e) => setCustW(e.target.value)}
                />
                <button type="button" onClick={addCustom} className="btn-ghost h-9">
                  + Add
                </button>
              </div>

              {customs.length > 0 && (
                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {customs.map((c) => (
                      <tr key={c.id} className="border-t border-line/70">
                        <td className="py-1.5 font-semibold">{c.label}</td>
                        <td className="py-1.5 text-muted">{c.widthMm} mm</td>
                        <td className="py-1.5">
                          <Qty value={c.qty} onDelta={(d) => changeCustomQty(c.id, d)} />
                        </td>
                        <td className="py-1.5 text-right text-[11px] text-muted">
                          {c.qty}× = {c.qty * c.widthMm} mm
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Step>
          )}
        </div>

        {/* ── RIGHT: live output ────────────────────────────────────────── */}
        <div className="card space-y-4 p-5 animate-fade-up lg:sticky lg:top-6">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Live output</div>

          {/* Space validation */}
          <SpaceBar si={si} sel={sel} />

          {/* Series filter */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "5ST", "10ST", "16ST"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === f
                    ? "border-brand bg-brand-light text-brand-dark"
                    : "border-line bg-white text-muted hover:border-brand/40"
                }`}
              >
                {f === "all" ? "All series" : f}
              </button>
            ))}
          </div>

          {/* Summary */}
          {sel.rmu && sel.cfg ? (
            <div className="rounded-lg bg-surface p-3 text-xs text-muted">
              <strong className="text-ink">{result.compatible.length}</strong> compatible design
              {result.compatible.length === 1 ? "" : "s"} · <strong className="text-ink">{rmuMeta?.label}</strong> (
              {sel.cfg}) · PCSS {trMeta ? trMeta.label : "—"}
              {si.total > 0 && (
                <>
                  <br />
                  Breaker footprint <strong className="text-ink">{si.total} mm</strong>
                  {si.em ? ` / ${si.em} mm limit` : ""}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-surface p-3 text-xs text-muted">
              Choose an RMU and switching configuration to evaluate compatible kiosks.
            </div>
          )}

          {/* Results */}
          <div className="space-y-2.5">
            {!sel.rmu || !sel.cfg ? (
              <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
                Select structural components on the left to compute options.
              </div>
            ) : result.compatible.length === 0 && result.incompatible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
                No standard P-CSS design matches the current constraints.
              </div>
            ) : (
              <>
                {result.compatible.map((d) => (
                  <DesignCard key={d.name} d={d} ok={result.spaceOk} si={si} sel={sel} recommended={d === result.recommended} />
                ))}
                {result.incompatible.map((d) => (
                  <DesignCard key={d.name} d={d} ok={false} si={si} sel={sel} recommended={false} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Full Excel catalog reference */}
      <details className="card mt-6 p-5 animate-fade-up">
        <summary className="cursor-pointer text-sm font-bold text-ink">
          Full P-CSS catalog ({DESIGNS.length} designs from PCSS Designs.xlsx)
        </summary>
        <p className="mt-1 text-xs text-muted">
          Capacitor box add-on: {CAPACITOR_BOX_KG} kg. “Selector” = part of the 6 standard “most-used” designs.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-3 py-2">Design</th>
                <th className="px-3 py-2">Series</th>
                <th className="px-3 py-2">Outer (cm)</th>
                <th className="px-3 py-2">Inner (cm)</th>
                <th className="px-3 py-2">TR depth</th>
                <th className="px-3 py-2">Weight</th>
                <th className="px-3 py-2">LV panel</th>
                <th className="px-3 py-2">Compatible RMU</th>
                <th className="px-3 py-2">Selector</th>
              </tr>
            </thead>
            <tbody>
              {DESIGNS.map((d) => (
                <tr key={d.name} className="border-t border-line">
                  <td className="px-3 py-2 font-bold text-ink">{d.name}</td>
                  <td className="px-3 py-2 text-muted">{d.series}</td>
                  <td className="px-3 py-2 text-muted">{d.outer}</td>
                  <td className="px-3 py-2 text-muted">{d.inner}</td>
                  <td className="px-3 py-2 text-muted">{d.tr} cm</td>
                  <td className="px-3 py-2 text-muted">{d.kg} kg</td>
                  <td className="px-3 py-2 text-muted">{findLv(d.lvp)?.sizeCm ?? d.lvp}</td>
                  <td className="px-3 py-2 text-muted">{compatLabel(d)}</td>
                  <td className="px-3 py-2">
                    {d.preferred ? (
                      <span className="chip bg-green-100 text-green-700">✓</span>
                    ) : (
                      <span className="chip bg-line text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

const RMU_SHORT: Record<RmuId, string> = {
  psec50: "PSEC ABB 50",
  psec375: "PSEC ABB 37.5",
  murge: "Murge",
  pral12: "PRAL-12",
  pral24: "PRAL-24",
};

function compatLabel(d: Design): string {
  const parts = Object.entries(d.compat)
    .filter(([, cfgs]) => cfgs && cfgs.length)
    .map(([id, cfgs]) => `${RMU_SHORT[id as RmuId]} (${cfgs!.join(", ")})`);
  return parts.length ? parts.join(" · ") : "—";
}

function DesignCard({
  d,
  ok,
  si,
  sel,
  recommended,
}: {
  d: Design;
  ok: boolean;
  si: ReturnType<typeof spaceInfo>;
  sel: Selection;
  recommended: boolean;
}) {
  const lvMatch = !sel.lv || sel.lv === "any" || d.lvp === sel.lv;
  const gapNote = sel.iec === "iec" ? "IEC spaced" : "Dense (no IEC)";
  const spaceOk = si.em == null || si.total === 0 || si.total <= si.em;
  const remain = si.em != null ? si.em - si.total : null;

  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-200 ${
        ok ? "border-line border-l-4 border-l-green-500 bg-white shadow-soft" : "border-line bg-white opacity-40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold text-ink">
          {d.name}
          {recommended && ok && <span className="chip bg-brand-light text-brand-dark">Recommended</span>}
        </span>
        <span className={`chip ${ok ? "bg-green-100 text-green-700" : "bg-line text-muted"}`}>
          {ok ? "✔ Verified fit" : "Incompatible"}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-surface p-2.5 sm:grid-cols-3">
        <Spec label="Outer shell" value={`${d.outer} cm`} />
        <Spec label="Inner clearance" value={`${d.inner} cm`} />
        <Spec label="Weight" value={`${d.kg} kg`} />
        <Spec label="LV depth" value={`${d.lv} cm`} />
        <Spec label="TR depth" value={`${d.tr} cm`} />
        <Spec label="Series" value={d.series} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`chip ${lvMatch ? "bg-brand-light text-brand-dark" : "bg-surface text-muted"}`}>
          LV chassis {d.lvp} cm
        </span>
        <span className="chip bg-surface text-muted">{gapNote}</span>
        {si.em != null && si.total > 0 && (
          <span className={`chip ${spaceOk ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {si.total} mm · {remain! >= 0 ? `${remain} mm clear` : `⚠ ${Math.abs(remain!)} mm over`}
          </span>
        )}
      </div>
    </div>
  );
}
