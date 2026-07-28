import { useMemo, useState, type ReactNode } from "react";
import {
  EEHC_ITEMS,
  LV_CONFIGS,
  LV_MODES,
  METERING_COMMON,
  MV_VOLTAGES,
  RMUS,
  SMART_TYPES,
  SWITCHFUSE_AMPS,
  SWITCH_FUSE_LABEL,
  FUSE_LINK_LABEL,
  TR_BRANDS,
  TR_CONNECTIONS,
  TR_PRESENCE,
  TR_RATINGS,
  TR_TYPES,
  lvPanelById,
  rmuById,
  type Brand,
  type Design,
  type EehcId,
  type LvConfigId,
  type LvModeId,
  type MeteringRow,
  type Opt,
  type RmuId,
  type SmartTypeId,
  type TrConnId,
  type TrPresenceId,
  type TrTypeId,
} from "../pcss/data";
import {
  emptyQtys,
  emptySelection,
  getActiveBreakers,
  getMeteringForRating,
  getPfForRating,
  isSmartEligible,
  mccbAmps,
  mccbBrands,
  mccbModels,
  mccbScLevels,
  mccbTrips,
  missingProjectFields,
  pfEffectiveKvar,
  pfStepConfigLabel,
  voltageSides,
  type CustomItem,
  type MccbItem,
  type Selection,
  type SwitchFuseItem,
  type Workspace,
} from "../pcss/engine";
import { allBomRows, isAutoRow, pfSizingFrame, brandOptions } from "../pcss/bom";
import { evaluateDesigns, isConfigComplete, spaceBreakdown, spaceInfo, type SpaceLine } from "../pcss/sizing";
import { SALES_MANAGER, findPerson, useStaff } from "../staff";
import { Field, TextInput, Toggle } from "../components/fields";

type SeriesFilter = "all" | "5ST" | "10ST" | "16ST";

const today = () => new Date().toISOString().slice(0, 10);

// ── Small presentational pieces ──────────────────────────────────────────────

function Step({
  n,
  of,
  title,
  children,
  hint,
}: {
  n: number;
  of: number;
  title: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="animate-fade-up rounded-xl border border-line bg-surface/70 p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
        Step {n} of {of}
      </div>
      <div className="mb-3 mt-0.5 text-sm font-bold text-ink">{title}</div>
      {children}
      {hint && <p className="mt-2 text-xs text-muted/80">{hint}</p>}
    </div>
  );
}

function OptCard({
  active,
  title,
  sub,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  sub?: string;
  /** Raw inline SVG, for the transformer insulation tiles. */
  icon?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-all duration-150 ${
        active
          ? "border-brand bg-brand-light ring-1 ring-brand/30"
          : "border-line bg-white hover:border-brand/40 hover:shadow-soft"
      }`}
    >
      {icon && (
        <span
          className={`mb-1 block ${active ? "text-brand" : "text-muted"}`}
          dangerouslySetInnerHTML={{ __html: icon }}
        />
      )}
      <div className="text-sm font-bold text-ink">{title}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </button>
  );
}

function OptGrid<T extends string>({
  items,
  value,
  onSelect,
  cols = 2,
  withIcons,
}: {
  items: Opt<T>[];
  value: T | null;
  onSelect: (id: T) => void;
  cols?: 1 | 2 | 3;
  withIcons?: boolean;
}) {
  const grid = cols === 1 ? "grid-cols-1" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div className={`grid gap-2 ${grid}`}>
      {items.map((it) => (
        <OptCard
          key={it.id}
          active={value === it.id}
          title={it.label}
          sub={it.sub}
          icon={withIcons ? it.icon : undefined}
          onClick={() => onSelect(it.id)}
        />
      ))}
    </div>
  );
}

/** A small label-over-value recap tile. */
function Tile({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" | "warn" }) {
  const toneCls = tone === "danger" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-white p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "danger" | "warn" | "info"; children: ReactNode }) {
  const cls =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-line bg-surface text-muted";
  return <p className={`rounded-lg border p-3 text-xs font-semibold ${cls}`}>{children}</p>;
}

function SubHead({ children }: { children: ReactNode }) {
  return <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-brand-dark">{children}</div>;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PcssSelectorPage() {
  const [staff] = useStaff();
  const [sel, setSel] = useState<Selection>(() => ({ ...emptySelection(), projectDate: today(), salesManager: SALES_MANAGER }));
  const [qtys, setQtys] = useState(emptyQtys);
  const [customs, setCustoms] = useState<CustomItem[]>([]);
  const [mccbItems, setMccbItems] = useState<MccbItem[]>([]);
  const [switchFuseItems, setSwitchFuseItems] = useState<SwitchFuseItem[]>([]);
  const [filter, setFilter] = useState<SeriesFilter>("all");

  const ws: Workspace = useMemo(
    () => ({ sel, qtys, customs, mccbItems, switchFuseItems }),
    [sel, qtys, customs, mccbItems, switchFuseItems],
  );

  const space = useMemo(() => spaceInfo(ws), [ws]);
  const complete = useMemo(() => isConfigComplete(ws), [ws]);
  const results = useMemo(() => evaluateDesigns(ws, filter), [ws, filter]);
  const bom = useMemo(() => allBomRows(ws), [ws]);
  const breakdown = useMemo(() => spaceBreakdown(ws), [ws]);

  const patch = (p: Partial<Selection>) => setSel((s) => ({ ...s, ...p }));

  // ── Step reveal chain ──────────────────────────────────────────────────────
  const smartEligible = isSmartEligible(sel);
  const showCfg = !!sel.rmu;
  const showSmart = !!sel.cfg && smartEligible;
  const showTrf = !!sel.cfg && (!smartEligible || !!sel.smartType);
  const trfReady = sel.trPresence === "without" ? !!sel.trRating : !!sel.trRating && !!sel.trConn;
  const showEehc = showTrf && !!sel.trPresence && trfReady;
  const showLv = showEehc && !!sel.iec;

  // PRAL enclosures have no smart option, so that step drops out entirely and
  // the ones after it shuffle up — a PRAL job is a 6-step job, not 7 with a
  // hole in it. The count is the whole journey, not just what's on screen yet.
  const SMART_STEP = 3;
  const skipSmart = !!sel.rmu && !smartEligible;
  const totalSteps = skipSmart ? 6 : 7;
  const stepNo = (i: number) => i + 1 - (skipSmart && i > SMART_STEP ? 1 : 0);

  // ── Selection handlers (each clears what it invalidates) ───────────────────
  const selectRmu = (id: RmuId) =>
    patch({
      rmu: id,
      cfg: null,
      smartType: null,
      trPresence: null,
      trRating: null,
      trBrand: null,
      trType: null,
      trConn: null,
      primaryV: null,
      secondaryV: null,
      iec: null,
      lvConfig: null,
    });

  const selectCfg = (cfg: string) =>
    patch({
      cfg,
      smartType: null,
      trPresence: null,
      trRating: null,
      trBrand: null,
      trType: null,
      trConn: null,
      primaryV: null,
      secondaryV: null,
      iec: null,
      lvConfig: null,
    });

  const selectSmart = (id: SmartTypeId) => patch({ smartType: id, iec: null, lvConfig: null });

  const selectTrPresence = (id: TrPresenceId) =>
    patch(
      id === "without"
        ? { trPresence: id, trType: null, trConn: null, primaryV: null, secondaryV: null, trBrand: null }
        : { trPresence: id },
    );

  const selectTrConn = (id: TrConnId) => {
    const next: Partial<Selection> = { trConn: id, primaryV: null, secondaryV: null };
    const opts = voltageSides({ ...sel, trConn: id }).options;
    // 0.4 kV side is fixed; if the RMU only allows one MV level, take it.
    if (id === "stepup") {
      next.primaryV = "0.4";
      if (opts.length === 1) next.secondaryV = opts[0];
    } else {
      next.secondaryV = "0.4";
      if (opts.length === 1) next.primaryV = opts[0];
    }
    patch(next);
  };

  const selectLvConfig = (id: LvConfigId) => {
    if (id === sel.lvConfig) return;
    setQtys(emptyQtys());
    setCustoms([]);
    setMccbItems([]);
    setSwitchFuseItems([]);
    patch({
      lvConfig: id,
      lvMode: "sizing",
      includePf: id === "incoming" ? false : sel.includePf,
    });
  };

  const selectLvMode = (id: LvModeId) => {
    setMccbItems([]);
    setSwitchFuseItems([]);
    setQtys(emptyQtys());
    setCustoms([]);
    patch({ lvMode: id });
  };

  /** Turning switch fuses off clears them, so nothing hidden keeps taking width. */
  const toggleSwitchFuse = (on: boolean) => {
    patch({ includeSwitchFuse: on });
    if (!on) {
      setSwitchFuseItems([]);
      setMccbItems((list) => list.filter((i) => i.model !== SWITCH_FUSE_LABEL && i.model !== FUSE_LINK_LABEL));
    }
  };

  // ── Breaker quantities ─────────────────────────────────────────────────────
  const changeQty = (id: string, delta: number) => {
    setQtys((q) => {
      // Incoming Only is a single breaker, so picking one clears the rest.
      if (sel.lvConfig === "incoming") {
        const next = emptyQtys();
        if (delta > 0) next[id] = 1;
        return next;
      }
      return { ...q, [id]: Math.max(0, (q[id] || 0) + delta) };
    });
  };

  const resetBreakers = () => {
    setQtys(emptyQtys());
    setCustoms([]);
    setMccbItems([]);
    setSwitchFuseItems([]);
  };

  const resetAll = () => {
    if (!window.confirm("Clear the whole configuration? Project and sales details are kept.")) return;
    setSel((s) => ({
      ...emptySelection(),
      projectName: s.projectName,
      customer: s.customer,
      qtnNo: s.qtnNo,
      revisionNo: s.revisionNo,
      optyNo: s.optyNo,
      projectDate: s.projectDate,
      supportEngineer: s.supportEngineer,
      salesManager: s.salesManager,
      salesPerson: s.salesPerson,
    }));
    resetBreakers();
    setFilter("all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Derived bits for the LV step ───────────────────────────────────────────
  const metering = getMeteringForRating(sel.trRating);
  const pf = getPfForRating(sel.trRating);
  const isTechnical = sel.lvConfig === "inout" && sel.lvMode === "technical";
  const isIncomingOnly = sel.lvConfig === "incoming";
  const pfFrame = pfSizingFrame(sel);
  const missing = missingProjectFields(sel);

  const manager = findPerson(staff.salesPeople, sel.salesManager || SALES_MANAGER);
  const person = findPerson(staff.salesPeople, sel.salesPerson);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">P-CSS Engineering Selector</h1>
          <p className="text-sm text-muted">
            Work through the steps to size a packaged compact secondary substation and check it against the standard
            blueprints.
          </p>
        </div>
        <button className="btn-ghost" onClick={resetAll}>
          ↺ Reset configuration
        </button>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── Left: the wizard ─────────────────────────────────────────────── */}
        <div className="card space-y-4 p-5 animate-fade-up">
          {/* Step 1 — project data */}
          <Step n={stepNo(0)} of={totalSteps} title="Project data">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project name">
                <TextInput
                  value={sel.projectName}
                  onChange={(v) => patch({ projectName: v })}
                  placeholder="e.g. New Cairo Substation"
                />
              </Field>
              <Field label="Customer">
                <TextInput
                  value={sel.customer}
                  onChange={(v) => patch({ customer: v })}
                  placeholder="Customer / client name"
                />
              </Field>
              <Field label="Quotation no.">
                <TextInput value={sel.qtnNo} onChange={(v) => patch({ qtnNo: v })} placeholder="QTN-00000" />
              </Field>
              <Field label="Revision no.">
                <TextInput value={sel.revisionNo} onChange={(v) => patch({ revisionNo: v })} placeholder="e.g. 0" />
              </Field>
              <Field label="Opportunity no.">
                <TextInput value={sel.optyNo} onChange={(v) => patch({ optyNo: v })} placeholder="OPTY-00000" />
              </Field>
              <Field label="Date">
                <TextInput type="date" value={sel.projectDate} onChange={(v) => patch({ projectDate: v })} />
              </Field>
              <Field label="Sales support engineer">
                <select
                  className="input cursor-pointer"
                  value={sel.supportEngineer}
                  onChange={(e) => patch({ supportEngineer: e.target.value })}
                >
                  <option value="">Select engineer…</option>
                  {staff.supportEngineers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sales person">
                <select
                  className="input cursor-pointer"
                  value={sel.salesPerson}
                  onChange={(e) => patch({ salesPerson: e.target.value })}
                >
                  <option value="">Select sales person…</option>
                  {staff.salesPeople.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Tile label="Sales manager" value={sel.salesManager || SALES_MANAGER} />
              <Tile label="Manager contact" value={manager ? `${manager.mobile} · ${manager.email}` : "—"} />
              {person && <Tile label="Sales person contact" value={`${person.mobile} · ${person.email}`} />}
            </div>

            {missing.length > 0 && (
              <div className="mt-3">
                <Notice tone="danger">Still needed: {missing.join(", ")}</Notice>
              </div>
            )}
          </Step>

          {/* Step 2 — MV panel */}
          <Step n={stepNo(1)} of={totalSteps} title="Select MV panel (RMU) type">
            <OptGrid items={RMUS} value={sel.rmu} onSelect={selectRmu} />
          </Step>

          {/* Step 3 — switching configuration */}
          {showCfg && (
            <Step n={stepNo(2)} of={totalSteps} title="Select switching configuration">
              <div className="grid gap-2 sm:grid-cols-4">
                {(rmuById(sel.rmu)?.configs ?? []).map((c) => (
                  <OptCard key={c} active={sel.cfg === c} title={c} onClick={() => selectCfg(c)} />
                ))}
              </div>
            </Step>
          )}

          {/* Step 4 — smart switchgear */}
          {showSmart && (
            <Step n={stepNo(3)} of={totalSteps} title="Select smart switchgear type">
              <OptGrid items={SMART_TYPES} value={sel.smartType} onSelect={selectSmart} />
            </Step>
          )}

          {/* Step 5 — transformer */}
          {showTrf && (
            <Step
              n={stepNo(4)}
              of={totalSteps}
              title="Transformer specification"
              hint="5ST series ≤ 500 KVA · 10ST series 500–1000 KVA · 16ST series 1000–2000 KVA"
            >
              <SubHead>Transformer presence</SubHead>
              <OptGrid items={TR_PRESENCE} value={sel.trPresence} onSelect={selectTrPresence} />

              {sel.trPresence && (
                <>
                  <SubHead>Transformer rating (KVA)</SubHead>
                  <select
                    className="input cursor-pointer"
                    value={sel.trRating ?? ""}
                    onChange={(e) => patch({ trRating: e.target.value ? Number(e.target.value) : null, iec: null, lvConfig: null })}
                  >
                    <option value="">Select rating…</option>
                    {TR_RATINGS.map((r) => (
                      <option key={r} value={r}>
                        {r} KVA
                      </option>
                    ))}
                  </select>
                </>
              )}

              {sel.trPresence === "with" && (
                <>
                  <SubHead>Transformer brand</SubHead>
                  <select
                    className="input cursor-pointer"
                    value={sel.trBrand ?? ""}
                    onChange={(e) => patch({ trBrand: e.target.value || null })}
                  >
                    <option value="">Select brand…</option>
                    {TR_BRANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>

                  <SubHead>Insulation type</SubHead>
                  <OptGrid
                    items={TR_TYPES}
                    value={sel.trType}
                    onSelect={(id: TrTypeId) => patch({ trType: id })}
                    withIcons
                  />

                  <SubHead>Step type</SubHead>
                  <OptGrid items={TR_CONNECTIONS} value={sel.trConn} onSelect={selectTrConn} />

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <VoltageSelect
                      label="Primary voltage"
                      sel={sel}
                      side="primary"
                      onChange={(v) => patch({ primaryV: v })}
                    />
                    <VoltageSelect
                      label="Secondary voltage"
                      sel={sel}
                      side="secondary"
                      onChange={(v) => patch({ secondaryV: v })}
                    />
                  </div>
                </>
              )}
            </Step>
          )}

          {/* Step 6 — LV standard */}
          {showEehc && (
            <Step n={stepNo(5)} of={totalSteps} title="Select LV configuration standard">
              <OptGrid
                items={EEHC_ITEMS}
                value={sel.iec}
                onSelect={(id: EehcId) => patch({ iec: id, lvConfig: sel.lvConfig ?? "inout" })}
              />
            </Step>
          )}

          {/* Step 7 — LV breakers */}
          {showLv && (
            <Step n={stepNo(6)} of={totalSteps} title="Select LV circuit breakers">
              <SubHead>Breaker configuration</SubHead>
              <OptGrid items={LV_CONFIGS} value={sel.lvConfig} onSelect={selectLvConfig} />

              {isIncomingOnly && (
                <div className="mt-3">
                  <Notice tone="warn">
                    Incoming Only: LV panel fixed at 1400 mm · limited to a single breaker selection
                  </Notice>
                </div>
              )}

              {/* Selection mode */}
              {!isIncomingOnly && (
                <>
                  <SubHead>Selection mode</SubHead>
                  <OptGrid items={LV_MODES} value={sel.lvMode} onSelect={selectLvMode} />
                </>
              )}

              {/* What EEHC prescribes for this transformer — computed, read-only. */}
              {metering && <EehcRecommendation metering={metering} incomingOnly={isIncomingOnly} />}

              {/* Sizing mode */}
              {!isTechnical && (
                <>
                  <SubHead>{isIncomingOnly ? "Incoming breaker" : "Outgoing breakers"}</SubHead>
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-sm">
                      <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-3 py-2 font-bold">Frame</th>
                          <th className="px-3 py-2 font-bold">Width</th>
                          <th className="px-3 py-2 text-right font-bold">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getActiveBreakers(sel).map((b) => {
                          const extra = pfFrame === b.id ? 1 : 0;
                          return (
                            <tr key={b.id} className="border-t border-line">
                              <td className="px-3 py-2 font-semibold text-ink">
                                {b.label}
                                {extra > 0 && <span className="ml-2 chip bg-brand-light text-brand-dark">+1 P.F.</span>}
                              </td>
                              <td className="px-3 py-2 text-muted">{b.widthMm} mm</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-end gap-2">
                                  <button className="btn-ghost px-2 py-0.5" onClick={() => changeQty(b.id, -1)}>
                                    −
                                  </button>
                                  <span className="w-8 text-center font-bold">{(qtys[b.id] || 0) + extra}</span>
                                  <button className="btn-ghost px-2 py-0.5" onClick={() => changeQty(b.id, 1)}>
                                    +
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* The same live bar as the output pane, right under the
                      buttons that move it. */}
                  <div className="mt-3">
                    <SpaceBar space={space} iec={sel.iec} breakdown={breakdown} />
                  </div>

                  {!isIncomingOnly && (
                    <>
                      <SubHead>Switch fuse</SubHead>
                      <div className="rounded-lg border border-line bg-white p-3">
                        <Toggle
                          checked={sel.includeSwitchFuse}
                          onChange={toggleSwitchFuse}
                          label="Include switch fuses"
                        />
                        {sel.includeSwitchFuse && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        {SWITCHFUSE_AMPS.map((a) => {
                          const item = switchFuseItems.find((i) => i.amp === a);
                          return (
                            <div key={a} className="rounded-lg border border-line bg-surface p-2.5">
                              <div className="text-sm font-bold text-ink">{a} A</div>
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <button
                                  className="btn-ghost px-2 py-0.5"
                                  onClick={() =>
                                    setSwitchFuseItems((list) =>
                                      list
                                        .map((i) => (i.amp === a ? { ...i, qty: i.qty - 1 } : i))
                                        .filter((i) => i.qty > 0),
                                    )
                                  }
                                >
                                  −
                                </button>
                                <span className="font-bold">{item?.qty ?? 0}</span>
                                <button
                                  className="btn-ghost px-2 py-0.5"
                                  onClick={() =>
                                    setSwitchFuseItems((list) =>
                                      list.some((i) => i.amp === a)
                                        ? list.map((i) => (i.amp === a ? { ...i, qty: i.qty + 1 } : i))
                                        : [...list, { amp: a, qty: 1 }],
                                    )
                                  }
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                        )}
                      </div>
                    </>
                  )}

                  <SubHead>Custom width</SubHead>
                  <CustomAdder onAdd={(c) => setCustoms((list) => [...list, c])} />
                  {customs.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {customs.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-1.5 text-sm"
                        >
                          <span className="font-semibold text-ink">
                            {c.label} — {c.widthMm} mm × {c.qty}
                          </span>
                          <button
                            className="text-xs font-bold text-red-600 hover:underline"
                            onClick={() => setCustoms((list) => list.filter((x) => x.id !== c.id))}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {/* Technical mode */}
              {isTechnical && (
                <>
                  <SubHead>Circuit breaker catalogue selection</SubHead>
                  <MccbPicker onAdd={(item) => setMccbItems((list) => mergeMccb(list, item))} />

                  <SubHead>Switch fuse</SubHead>
                  <div className="rounded-lg border border-line bg-white p-3">
                    <Toggle
                      checked={sel.includeSwitchFuse}
                      onChange={toggleSwitchFuse}
                      label="Include switch fuses"
                    />
                    {sel.includeSwitchFuse && (
                      <>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                          {SWITCHFUSE_AMPS.map((a) => (
                            <button
                              key={a}
                              className="btn-ghost"
                              onClick={() => setMccbItems((list) => addTechSwitchFuse(list, a))}
                            >
                              + {a} A
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-muted/70">
                          Each switch fuse brings a set of three fuse links onto the offer automatically.
                        </p>
                      </>
                    )}
                  </div>

                  <SubHead>Technical offer items</SubHead>
                  {bom.length === 0 ? (
                    <Notice tone="info">Nothing added yet — pick a breaker from the catalogue above.</Notice>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-line">
                      <table className="w-full text-sm">
                        <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
                          <tr>
                            <th className="px-3 py-2 font-bold">Brand</th>
                            <th className="px-3 py-2 font-bold">Model</th>
                            <th className="px-3 py-2 font-bold">Amp</th>
                            <th className="px-3 py-2 font-bold">Trip</th>
                            <th className="px-3 py-2 text-right font-bold">Qty</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {bom.map((i) => {
                            const locked = isAutoRow(i) || i.model === FUSE_LINK_LABEL;
                            return (
                              <tr key={i.id} className="border-t border-line">
                                <td className="px-3 py-2 text-muted">{i.brand}</td>
                                <td className="px-3 py-2 font-semibold text-ink">
                                  {i.model}
                                  {isAutoRow(i) && (
                                    <span className="ml-2 chip bg-brand-light text-brand-dark">auto</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-muted">{i.amp}</td>
                                <td className="px-3 py-2 text-muted">{i.trip}</td>
                                <td className="px-3 py-2 text-right font-bold">{i.qty}</td>
                                <td className="px-3 py-2 text-right">
                                  {!locked && (
                                    <button
                                      className="text-xs font-bold text-red-600 hover:underline"
                                      onClick={() => setMccbItems((list) => removeMccb(list, i.id))}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {isTechnical && (
                <div className="mt-3">
                  <SpaceBar space={space} iec={sel.iec} breakdown={breakdown} />
                </div>
              )}

              {/* Power factor correction */}
              {!isIncomingOnly && (
                <>
                  <SubHead>EEHC fixed power factor correction</SubHead>
                  <div className="rounded-lg border border-line bg-white p-3">
                    <Toggle
                      checked={sel.includePf}
                      onChange={(v) => patch({ includePf: v })}
                      label="Include power factor correction"
                    />
                    {sel.includePf &&
                      (pf ? (
                        <>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <Tile label="Effective output" value={`${pfEffectiveKvar(pf)} kVAr @400V`} />
                            <Tile label="Step configuration" value={pfStepConfigLabel(pf)} />
                            <Tile label="Relay" value={pf.relay} />
                            <Tile label="Contactors" value={pf.contactors} />
                            <Tile label="Capacitor current" value={`${pf.capCurrent} A`} />
                            <Tile label="Protection MCCB" value={`${pf.mccbAmp} A`} />
                          </div>
                          {isTechnical && (
                            <div className="mt-3">
                              <Field label="Power factor MCCB brand">
                                <select
                                  className="input cursor-pointer"
                                  value={sel.pfBrand}
                                  onChange={(e) => patch({ pfBrand: e.target.value as Brand })}
                                >
                                  {brandOptions.map((b) => (
                                    <option key={b} value={b}>
                                      {b}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="mt-3">
                          <Notice tone="warn">
                            No EEHC fixed power factor bracket for {sel.trRating ?? "—"} KVA. Brackets cover 0–800,
                            1000–1250, 1500–1600 and 2000 KVA.
                          </Notice>
                        </div>
                      ))}
                  </div>
                </>
              )}

              <div className="mt-4">
                <button className="btn-ghost" onClick={resetBreakers}>
                  Clear breakers
                </button>
              </div>
            </Step>
          )}
        </div>

        {/* ── Right: live execution & output ───────────────────────────────── */}
        <div className="card space-y-4 p-5 animate-fade-up xl:sticky xl:top-6">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Live execution &amp; output</div>

          <SpaceBar space={space} iec={sel.iec} />

          {complete && <ConfigSummary ws={ws} bom={bom} />}

          <div className="flex flex-wrap gap-1.5">
            {(["all", "5ST", "10ST", "16ST"] as SeriesFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filter === f
                    ? "border-brand bg-brand text-white shadow-soft"
                    : "border-line bg-white text-muted hover:border-brand/40"
                }`}
              >
                {f === "all" ? "All series" : f}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 text-xs font-semibold text-ink">
            {!sel.rmu || !sel.cfg ? (
              "Please complete your system specifications to evaluate compatibility."
            ) : (
              <>
                <strong>{results.compatible.length}</strong> functional fit
                {results.compatible.length === 1 ? "" : "s"} identified ·{" "}
                <strong>{rmuById(sel.rmu)?.label}</strong> ({sel.cfg}) ·{" "}
                <strong>TR: {sel.trRating ? `${sel.trRating} KVA` : "—"}</strong>
                {space.footprint.total > 0 && (
                  <>
                    <br />
                    Breaker footprint: <strong>{space.footprint.total} mm</strong>
                    {space.emptyMm ? ` / ${space.emptyMm} mm limit` : ""}
                  </>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            {!sel.rmu || !sel.cfg ? (
              <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
                Select structural components on the left to compute options.
              </p>
            ) : results.compatible.length + results.incompatible.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
                No standard blueprints match the current constraints.
              </p>
            ) : (
              <>
                {results.compatible.map((d) => (
                  <DesignCard
                    key={d.name}
                    d={d}
                    fits={results.spaceOk}
                    recommended={d.lvp === results.recommendedLv}
                    space={space}
                    iec={sel.iec}
                  />
                ))}
                {results.incompatible.map((d) => (
                  <DesignCard key={d.name} d={d} fits={false} recommended={false} space={space} iec={sel.iec} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function VoltageSelect({
  label,
  sel,
  side,
  onChange,
}: {
  label: string;
  sel: Selection;
  side: "primary" | "secondary";
  onChange: (v: string) => void;
}) {
  const { primaryLocked, secondaryLocked, options } = voltageSides(sel);
  const locked = side === "primary" ? primaryLocked : secondaryLocked;
  const value = (side === "primary" ? sel.primaryV : sel.secondaryV) ?? "";

  if (!sel.trConn) {
    return (
      <Field label={label}>
        <select className="input" disabled>
          <option>Select step type first…</option>
        </select>
      </Field>
    );
  }

  return (
    <Field label={label}>
      <select
        className="input cursor-pointer"
        disabled={locked}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {locked ? (
          <option value={value}>{value} kV</option>
        ) : (
          <>
            <option value="">Select voltage…</option>
            {(options.length ? options : MV_VOLTAGES).map((v) => (
              <option key={v} value={v}>
                {v} kV
              </option>
            ))}
          </>
        )}
      </select>
    </Field>
  );
}

/**
 * What the EEHC standard prescribes for this transformer rating — the incoming
 * breaker and the metering kit. Read-only: it is decided by the rating, not
 * chosen, so it is kept compact rather than given a tile each.
 */
function EehcRecommendation({ metering, incomingOnly }: { metering: MeteringRow; incomingOnly: boolean }) {
  const specs: [string, ReactNode][] = [
    ["Incoming CB", metering.incoming],
    ["Model", `${metering.brand} ${metering.model}`],
    ["FLC @400V", `${metering.flc} A`],
    ["Trip unit", metering.trip],
  ];
  const metering2: [string, ReactNode][] = incomingOnly
    ? []
    : [
        ["Type", metering.type],
        ["Rated", `${metering.amp} A`],
        ["CTs", metering.ct],
        ["Metering", METERING_COMMON.meteringType],
        ["Ammeters", METERING_COMMON.ammeters],
        ["Voltmeter", METERING_COMMON.voltmeter],
        ["Volt selector", METERING_COMMON.voltSelector],
        ["Amp selector", METERING_COMMON.ampSelector],
        ["kWh space", METERING_COMMON.kwhSpace],
        ["Lamps", METERING_COMMON.lamps],
      ];

  return (
    <>
      <SubHead>EEHC recommended configuration</SubHead>
      <div className="rounded-lg border border-line bg-white px-3 py-2">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          {[...specs, ...metering2].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-1.5">
              <dt className="text-muted/80">{k}</dt>
              <dd className="font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-1 text-[11px] text-muted/70">
        Set by the transformer rating — the incoming breaker is added to the panel and the offer automatically.
      </p>
    </>
  );
}

function SpaceBar({
  space,
  iec,
  breakdown,
}: {
  space: ReturnType<typeof spaceInfo>;
  iec: EehcId | null;
  /** Itemised list of what is filling the panel — shown next to the controls. */
  breakdown?: SpaceLine[];
}) {
  const { footprint, emptyMm, remainingMm, pct, status, escalated, basePanel, panel } = space;

  if (emptyMm === null) {
    return (
      <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
        Space validation loads once a transformer rating and breaker configuration are picked.
      </p>
    );
  }

  const barColor = status === "over" ? "bg-red-500" : status === "warn" ? "bg-amber-500" : "bg-brand";
  const gapNote =
    footprint.count === 0
      ? ""
      : footprint.stdGaps + footprint.swGaps > 0
      ? ` (incl. ${footprint.stdGaps}× 60 mm + ${footprint.swGaps}× 20 mm EEHC gaps)`
      : iec === "eehc"
      ? " (selected breakers only — EEHC gaps and the incoming breaker are counted in Technical)"
      : " (no EEHC spacing)";

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          Space allocated: <b className="text-ink">{footprint.total} mm</b> / {emptyMm} mm
          <span className="text-muted/70">{gapNote}</span>
        </span>
        <span className={`whitespace-nowrap font-bold ${status === "over" ? "text-red-700" : "text-ink"}`}>
          {remainingMm} mm left
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p
        className={`mt-2 text-xs font-semibold ${
          status === "over" ? "text-red-700" : status === "warn" ? "text-amber-700" : "text-muted"
        }`}
      >
        {remainingMm !== null && remainingMm < 0
          ? `⚠ Structural deficit — exceeds the panel by ${Math.abs(remainingMm)} mm.`
          : remainingMm === 0
          ? "✔ Maximum utilisation reached."
          : `✔ ${remainingMm} mm structural buffer remaining.`}
      </p>

      {/* Free space can go UP when something is added, because overflowing the
          chassis moves the whole job to the next panel size. Say so, or it
          reads as a bug. */}
      {escalated && (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
          ⬆ Panel upgraded to {panel} cm — {basePanel} cm is what {""}
          the transformer rating alone needs, but the components no longer fit it.
        </p>
      )}

      {breakdown && breakdown.length > 0 && (
        <table className="mt-3 w-full text-[11px]">
          <tbody>
            {breakdown.map((l) => (
              <tr key={l.label} className="border-t border-line/60">
                <td className={`py-1 ${l.auto ? "text-brand-dark" : "text-muted"}`}>
                  {l.label}
                  {l.auto && <span className="ml-1 text-[10px] uppercase tracking-wide">auto</span>}
                </td>
                <td className="py-1 text-right text-muted/80">
                  {l.qty} × {l.eachMm} mm
                </td>
                <td className="py-1 text-right font-semibold text-ink">{l.totalMm} mm</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line">
              <td className="py-1 font-bold text-ink" colSpan={2}>
                Total
              </td>
              <td className="py-1 text-right font-bold text-ink">{footprint.total} mm</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function ConfigSummary({ ws, bom }: { ws: Workspace; bom: MccbItem[] }) {
  const { sel } = ws;
  const space = spaceInfo(ws);
  const rmu = rmuById(sel.rmu);
  const trType = TR_TYPES.find((t) => t.id === sel.trType);
  const trConn = TR_CONNECTIONS.find((t) => t.id === sel.trConn);
  const eehc = EEHC_ITEMS.find((e) => e.id === sel.iec);
  const lvCfg = LV_CONFIGS.find((c) => c.id === sel.lvConfig);
  const pf = getPfForRating(sel.trRating);
  const panel = lvPanelById(space.panel);

  const breakers =
    sel.lvConfig === "inout" && sel.lvMode === "technical"
      ? bom.map((i) => `${i.brand} ${i.model} ${i.amp}A ×${i.qty}`)
      : [
          ...getActiveBreakers(sel)
            .filter((b) => (ws.qtys[b.id] || 0) > 0)
            .map((b) => `${b.label} ×${ws.qtys[b.id]}`),
          ...ws.switchFuseItems.map((i) => `Switch fuse ${i.amp}A ×${i.qty}`),
          ...ws.customs.map((c) => `${c.label} ×${c.qty}`),
        ];

  return (
    <div className="rounded-lg border border-brand/30 bg-brand-tint p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-dark">✓ Configuration complete</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Tile label="Project" value={[sel.projectName, sel.customer, sel.qtnNo, sel.optyNo].filter(Boolean).join(" · ")} />
        <Tile
          label="Sales team"
          value={`Mgr: ${sel.salesManager || SALES_MANAGER} · Sales: ${sel.salesPerson} · Support: ${sel.supportEngineer}`}
        />
        <Tile label="MV panel" value={`${rmu?.label} · ${sel.cfg}`} />
        {sel.smartType && (
          <Tile label="Smart type" value={SMART_TYPES.find((s) => s.id === sel.smartType)?.label ?? "—"} />
        )}
        {sel.trPresence === "without" ? (
          <Tile label="Transformer" value={`Not installed · sized for ${sel.trRating} KVA`} />
        ) : (
          <>
            <Tile label="Transformer" value={`${sel.trBrand} · ${trType?.label} · ${sel.trRating} KVA`} />
            <Tile label="Connection" value={`${trConn?.label} (${sel.primaryV}→${sel.secondaryV} kV)`} />
          </>
        )}
        <Tile label="LV standard" value={eehc?.label ?? "—"} />
        <Tile label="Breaker config" value={lvCfg?.label ?? "—"} />
        <Tile
          label="LV panel"
          value={sel.lvConfig === "incoming" ? "1400 mm (fixed · incoming only)" : panel?.label ?? "Not specified"}
          tone={sel.lvConfig === "incoming" ? "warn" : undefined}
        />
        {sel.includePf && (
          <Tile
            label="EEHC fixed P.F."
            value={pf ? `${pfEffectiveKvar(pf)} kVAr@400V (${pfStepConfigLabel(pf)})` : "No matching bracket"}
          />
        )}
        <Tile
          label="LV footprint used"
          value={`${space.footprint.total} / ${space.emptyMm ?? "—"} mm (${space.footprint.count} unit${
            space.footprint.count === 1 ? "" : "s"
          })`}
        />
      </div>
      <div className="mt-2">
        <Tile label="Breakers selected" value={breakers.length ? breakers.join(" · ") : "None selected"} />
      </div>
    </div>
  );
}

function DesignCard({
  d,
  fits,
  recommended,
  space,
  iec,
}: {
  d: Design;
  fits: boolean;
  recommended: boolean;
  space: ReturnType<typeof spaceInfo>;
  iec: EehcId | null;
}) {
  const remain = space.remainingMm;
  return (
    <div
      className={`rounded-lg border p-3 transition ${
        fits ? "border-l-4 border-l-green-500 border-line bg-white" : "border-line bg-white opacity-40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-bold text-ink">{d.name}</div>
        <span
          className={`chip ${fits ? "bg-green-100 text-green-800" : "bg-surface text-muted"}`}
        >
          {fits ? "✔ Verified fit" : "— Incompatible"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          Outer shell: <b className="text-ink">{d.outer} cm</b>
        </span>
        <span>
          Inner clearance: <b className="text-ink">{d.inner} cm</b>
        </span>
        <span>
          Gross mass: <b className="text-ink">{d.kg} kg</b>
        </span>
        <span>
          LV depth: <b className="text-ink">{d.lv} cm</b>
        </span>
        <span>
          TR enclosure: <b className="text-ink">{d.tr} cm</b>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {recommended && <span className="chip bg-brand text-white">Recommended</span>}
        <span className={`chip ${recommended ? "bg-blue-100 text-blue-800" : "bg-surface text-muted"}`}>
          LV chassis: {d.lvp} cm
        </span>
        <span className="chip bg-surface text-muted">{iec === "eehc" ? "EEHC spaced" : "Dense array"}</span>
        {space.emptyMm && space.footprint.total > 0 && remain !== null && (
          <span className={`chip ${remain < 0 ? "bg-red-100 text-red-800" : "bg-surface text-muted"}`}>
            {remain < 0
              ? `⚠ ${Math.abs(remain)} mm deficit`
              : `${space.footprint.total} mm configured · ${remain} mm clear`}
          </span>
        )}
      </div>
    </div>
  );
}

/** Name + width + quantity, added to the panel as a one-off. */
function CustomAdder({ onAdd }: { onAdd: (c: CustomItem) => void }) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [qty, setQty] = useState("1");

  const add = () => {
    const w = Number(width);
    const q = Number(qty);
    if (!name.trim() || !(w >= 1)) return;
    onAdd({ id: `c-${Date.now()}`, label: name.trim(), widthMm: w, qty: q >= 1 ? q : 1 });
    setName("");
    setWidth("");
    setQty("1");
  };

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_120px_90px_auto]">
      <input className="input" placeholder="Component name" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className="input"
        type="number"
        min={1}
        placeholder="Width mm"
        value={width}
        onChange={(e) => setWidth(e.target.value)}
      />
      <input
        className="input"
        type="number"
        min={1}
        placeholder="Qty"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <button className="btn-primary" onClick={add}>
        Add
      </button>
    </div>
  );
}

/** Brand → ampere → breaking capacity → trip → model, each step narrowing the next. */
function MccbPicker({ onAdd }: { onAdd: (i: MccbItem) => void }) {
  const [brand, setBrand] = useState<Brand | "">("");
  const [amp, setAmp] = useState<number | "">("");
  const [sc, setSc] = useState("");
  const [trip, setTrip] = useState("");
  const [model, setModel] = useState("");
  const [qty, setQty] = useState("1");

  const amps = brand ? mccbAmps(brand) : [];
  const scs = brand && amp !== "" ? mccbScLevels(brand, amp) : [];
  const trips = brand && amp !== "" && sc ? mccbTrips(brand, amp, sc) : [];
  const models = brand && amp !== "" && sc && trip ? mccbModels(brand, amp, sc, trip) : [];
  const resolvedModel = models.length === 1 ? models[0] : model;

  const add = () => {
    if (!brand || amp === "" || !sc || !trip || !resolvedModel) return;
    const q = Number(qty);
    onAdd({
      id: `m-${Date.now()}`,
      brand,
      model: resolvedModel,
      amp,
      sc,
      trip,
      qty: q >= 1 ? q : 1,
    });
  };

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Field label="Brand">
        <select
          className="input cursor-pointer"
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value as Brand);
            setAmp("");
            setSc("");
            setTrip("");
            setModel("");
          }}
        >
          <option value="">Select brand…</option>
          {mccbBrands().map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ampere">
        <select
          className="input cursor-pointer"
          disabled={!brand}
          value={amp}
          onChange={(e) => {
            setAmp(Number(e.target.value));
            setSc("");
            setTrip("");
            setModel("");
          }}
        >
          <option value="">{brand ? "Select ampere…" : "Select brand first…"}</option>
          {amps.map((a) => (
            <option key={a} value={a}>
              {a} A
            </option>
          ))}
        </select>
      </Field>

      <Field label="Breaking capacity">
        <select
          className="input cursor-pointer"
          disabled={amp === ""}
          value={sc}
          onChange={(e) => {
            setSc(e.target.value);
            setTrip("");
            setModel("");
          }}
        >
          <option value="">{amp === "" ? "Select ampere first…" : "Select capacity…"}</option>
          {scs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Trip unit">
        <select
          className="input cursor-pointer"
          disabled={!sc}
          value={trip}
          onChange={(e) => {
            setTrip(e.target.value);
            setModel("");
          }}
        >
          <option value="">{sc ? "Select trip unit…" : "Select capacity first…"}</option>
          {trips.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Model">
        <select
          className="input cursor-pointer"
          disabled={models.length <= 1}
          value={resolvedModel}
          onChange={(e) => setModel(e.target.value)}
        >
          {models.length === 0 ? (
            <option value="">{trip ? "No match found" : "Auto from previous selections…"}</option>
          ) : (
            models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))
          )}
        </select>
      </Field>

      <Field label="Quantity">
        <div className="flex gap-2">
          <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          <button className="btn-primary whitespace-nowrap" disabled={!resolvedModel} onClick={add}>
            Add
          </button>
        </div>
      </Field>
    </div>
  );
}

// ── Bill-of-materials helpers ────────────────────────────────────────────────

/** Identical lines merge instead of stacking up. */
function mergeMccb(list: MccbItem[], item: MccbItem): MccbItem[] {
  const same = list.find(
    (i) => i.brand === item.brand && i.model === item.model && i.amp === item.amp && i.sc === item.sc && i.trip === item.trip,
  );
  if (same) return list.map((i) => (i === same ? { ...i, qty: i.qty + item.qty } : i));
  return [...list, item];
}

/** A switch fuse always comes with a set of three fuse links. */
function addTechSwitchFuse(list: MccbItem[], amp: number): MccbItem[] {
  const withSf = mergeMccb(list, {
    id: `sf-${amp}-${Date.now()}`,
    brand: "—",
    model: SWITCH_FUSE_LABEL,
    amp,
    sc: "—",
    trip: "—",
    qty: 1,
  });
  return mergeMccb(withSf, {
    id: `fl-${amp}-${Date.now()}`,
    brand: "—",
    model: FUSE_LINK_LABEL,
    amp,
    sc: "—",
    trip: "—",
    qty: 3,
  });
}

/** Removing a switch fuse takes its fuse links with it. */
function removeMccb(list: MccbItem[], id: string): MccbItem[] {
  const item = list.find((i) => i.id === id);
  if (!item) return list;
  if (item.model === SWITCH_FUSE_LABEL) {
    return list.filter((i) => i.id !== id && !(i.model === FUSE_LINK_LABEL && i.amp === item.amp));
  }
  return list.filter((i) => i.id !== id);
}
