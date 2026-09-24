import { useEffect } from "react";
import { Field, NumberInput, Select, Segmented, Toggle } from "./fields";
import {
  RTU_TYPES,
  BRANDS_BY_FAMILY,
  AVAILABLE_BRANDS_BY_FAMILY,
  CLIENT_SPECS,
  AVAILABLE_CLIENT_SPECS,
} from "../options";
import type { RmuConfigInput, LbsBrand } from "../types";

/**
 * A fresh RMU configuration — the same starting point the standalone RMU offer uses
 * for a new RMU. MV seeds a new RMU panel from this.
 */
export const DEFAULT_RMU_CONFIG: RmuConfigInput = {
  productType: "PRAL",
  lbsBrand: "ABB",
  clientSpec: "EECH",
  voltageKv: 12,
  nalCount: 2,
  nalfCount: 1,
  hasMetering: false,
  rtuType: "NONE",
  installation: "INDOOR",
  busbarCurrentA: 630,
  fuseRatingA: null,
  meteringCtPrimaryA: null,
  ctClass: null,
  vtCores: 1,
  vtBurdenVa: null,
  vtClass: null,
  meteringWithFuse: false,
};

/** The RMU short code shown under the official panel code (e.g. "PRAL12(2+1+M)"). */
export function rmuShortCode(c: RmuConfigInput): string {
  return `${c.productType}${c.voltageKv}(${c.nalCount}+${c.nalfCount}${c.hasMetering ? "+M" : ""})`;
}

// The RMU feeder make-up options (ring "R" + transformer "T"), chosen from a dropdown instead of two
// separate counts. Each is [nalCount, nalfCount]. All satisfy the price engine's limits (R0–5, T0–2).
export const RMU_FEEDER_OPTIONS: [number, number][] = [
  [2, 1], [3, 1], [0, 1], [1, 0], [1, 1], [2, 2], [4, 0],
];
// Inside a kiosk (compact substation) the RMU only ever feeds one transformer plus its ring(s), so
// only 2+1 and 3+1 make sense there. The standalone RMU offer keeps the full list above.
export const KIOSK_FEEDER_OPTIONS: [number, number][] = [[2, 1], [3, 1]];
export const rmuFeederLabel = (nal: number, nalf: number): string => `${nal}+${nalf}`;

// Per-feeder accessories, priced in USD and converted like every other RMU price (aux/shunt used to
// live in the kiosk "Extra" list; they are now ticked per feeder instead).
export const RMU_AUX_USD = 301;   // Auxiliary contact — per feeder
export const RMU_SHUNT_USD = 220; // Shunt trip — per feeder

/** The feeder ids for an RMU, in order: ring feeders R1…Rn then transformer feeders T1…Tm. Each
 *  side always has at least one row, so a "0" count still gets a feeder (0+1 → R1, T1; 4+0 → R1…R4, T1). */
export function rmuFeederIds(c: RmuConfigInput): string[] {
  const rings = Array.from({ length: Math.max(1, c.nalCount || 0) }, (_, i) => `R${i + 1}`);
  const trafos = Array.from({ length: Math.max(1, c.nalfCount || 0) }, (_, i) => `T${i + 1}`);
  return [...rings, ...trafos];
}
/** Total Aux + Shunt-trip add-on for an RMU, in USD. Zero when RTU is on (the option is hidden). */
export function rmuAuxShuntUsd(c: RmuConfigInput): number {
  if (c.rtuType && c.rtuType !== "NONE") return 0;
  const ids = rmuFeederIds(c);
  const aux = ids.filter((id) => c.feederAux?.[id]).length;
  const shunt = ids.filter((id) => c.feederShunt?.[id]).length;
  return aux * RMU_AUX_USD + shunt * RMU_SHUNT_USD;
}
/** The per-feeder Aux / Shunt-trip ticks as named add-on lines (USD), for the RMU offer's add-on list. */
export function rmuAuxShuntAddOns(c: RmuConfigInput): { name: string; price: number }[] {
  if (c.rtuType && c.rtuType !== "NONE") return [];
  const out: { name: string; price: number }[] = [];
  for (const id of rmuFeederIds(c)) {
    if (c.feederAux?.[id]) out.push({ name: `Aux — ${id}`, price: RMU_AUX_USD });
    if (c.feederShunt?.[id]) out.push({ name: `Shunt trip — ${id}`, price: RMU_SHUNT_USD });
  }
  return out;
}

/** One row per feeder (R1…Rn, T1…Tm), each with an Aux and a Shunt-trip tick-box. Shown only when
 *  RTU is off; each ticked box adds its price (RMU_AUX_USD / RMU_SHUNT_USD) to the RMU. */
function FeederAccessories({
  rmu,
  onChange,
}: {
  rmu: RmuConfigInput;
  onChange: <K extends keyof RmuConfigInput>(k: K, v: RmuConfigInput[K]) => void;
}) {
  const ids = rmuFeederIds(rmu);
  if (!ids.length) return null;
  const aux = rmu.feederAux ?? {};
  const shunt = rmu.feederShunt ?? {};
  const cols = "grid grid-cols-[1fr_5rem_5rem] items-center gap-2";
  return (
    <div className="rounded-lg border border-line p-3 animate-fade-up">
      <div className={`${cols} pb-1 text-[11px] font-bold uppercase tracking-wide text-muted`}>
        <span>Feeder</span>
        <span className="text-center">Aux.</span>
        <span className="text-center">Shunt trip</span>
      </div>
      {ids.map((id) => (
        <div key={id} className={`${cols} border-t border-line/60 py-1.5`}>
          <span className="text-sm font-semibold text-ink">{id}</span>
          <span className="flex justify-center">
            <input type="checkbox" checked={!!aux[id]} aria-label={`${id} Aux`}
              onChange={(e) => onChange("feederAux", { ...aux, [id]: e.target.checked })}
              className="h-4 w-4 cursor-pointer rounded border-line text-brand focus:ring-brand" />
          </span>
          <span className="flex justify-center">
            <input type="checkbox" checked={!!shunt[id]} aria-label={`${id} Shunt trip`}
              onChange={(e) => onChange("feederShunt", { ...shunt, [id]: e.target.checked })}
              className="h-4 w-4 cursor-pointer rounded border-line text-brand focus:ring-brand" />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The RMU configurator form — Product/RMU-code card + Metering + Smart/RTU.
 *
 * This is the SAME form used by the live RMU offer editor (NewOfferPage) and the
 * MV quotation's RMU panel. It is purely presentational: it reads `value`, calls
 * `onChange(key, v)` for every edit, and shows the two codes it is handed. The
 * three effects only heal an invalid combination (a brand/spec/RTU that has no
 * data for the chosen product) — the same rules the RMU offer has always used.
 */
export default function RmuConfigForm({
  value,
  onChange,
  onChangeMany,
  code,
  panelCode,
  feederOptions = RMU_FEEDER_OPTIONS,
}: {
  value: RmuConfigInput;
  onChange: <K extends keyof RmuConfigInput>(key: K, v: RmuConfigInput[K]) => void;
  /** Set several config keys at once (the RMU-feeder dropdown sets nalCount + nalfCount together). */
  onChangeMany: (patch: Partial<RmuConfigInput>) => void;
  code: string;
  panelCode: string;
  /** The RMU-feeder dropdown choices. Defaults to the full list; a kiosk passes KIOSK_FEEDER_OPTIONS. */
  feederOptions?: readonly [number, number][];
}) {
  const rmu = value;
  const setR = onChange;
  const isLucy = rmu.productType === "LUCY";

  // Keep the brand to one we actually have data for (PSEC: ABB/Murge, PRAL: ABB)
  // — reset to ABB if the current brand isn't available for the family.
  useEffect(() => {
    if (rmu.productType === "LUCY") return; // Lucy has no LBS brand
    const available = AVAILABLE_BRANDS_BY_FAMILY[rmu.productType];
    if (rmu.lbsBrand && !available.includes(rmu.lbsBrand)) {
      setR("lbsBrand", "ABB");
    }
  }, [rmu.productType, rmu.lbsBrand]);

  // Client spec: only EECH has data — reset to EECH if KAHRABA somehow set.
  useEffect(() => {
    if (rmu.clientSpec && !AVAILABLE_CLIENT_SPECS.includes(rmu.clientSpec)) {
      setR("clientSpec", "EECH");
    }
  }, [rmu.clientSpec]);

  // PRAL has no smart option — force it off (standard) whenever PRAL is selected.
  useEffect(() => {
    if (rmu.productType === "PRAL" && rmu.rtuType !== "NONE") {
      setR("rtuType", "NONE");
    }
  }, [rmu.productType, rmu.rtuType]);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      {/* Tighter vertical rhythm than the other cards (py-3 + 5px row gaps) so
          this half-width column finishes level with Metering + Smart/RTU on the
          right instead of running past them. */}
      <section className="card px-5 py-3 min-w-0 animate-fade-up">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="sec-head !mb-0 !pb-0 after:hidden">RMU Code</h2>
          <div className="text-right">
            <span key={panelCode} className="code-chip animate-pop">{panelCode}</span>
            <div className="mt-1 text-xs text-muted">{code}</div>
          </div>
        </div>

        <div className="space-y-[5px]">
          <Field label="Product type">
            <Segmented
              value={rmu.productType}
              onChange={(v) => setR("productType", v)}
              options={["PRAL", "PSEC", "LUCY"] as const}
              renderLabel={(v) =>
                v === "PRAL" ? "PRAL · Air" : v === "PSEC" ? "PSEC · SF6" : "LUCY · GIS"
              }
            />
          </Field>

          {/* Lucy has no LBS brand or client specification — hidden for it. */}
          {!isLucy && (
            <>
              <Field
                label="LBS brand / type"
                hint={
                  rmu.productType === "PSEC"
                    ? "ABB · Murge available · Schneider locked (no data)"
                    : "ABB available · Chint locked (no data)"
                }
              >
                <Segmented
                  value={(rmu.lbsBrand ?? "ABB") as LbsBrand}
                  onChange={(v) => setR("lbsBrand", v)}
                  options={BRANDS_BY_FAMILY[rmu.productType] as readonly LbsBrand[]}
                  disabledOptions={
                    BRANDS_BY_FAMILY[rmu.productType].filter(
                      (b) => !AVAILABLE_BRANDS_BY_FAMILY[rmu.productType].includes(b)
                    ) as readonly LbsBrand[]
                  }
                />
              </Field>

              <Field label="Client specification" hint="EECH available · KAHRABA locked (no technical offer)">
                <Segmented
                  value={rmu.clientSpec ?? "EECH"}
                  onChange={(v) => setR("clientSpec", v)}
                  options={CLIENT_SPECS}
                  disabledOptions={
                    CLIENT_SPECS.filter(
                      (s) => !AVAILABLE_CLIENT_SPECS.includes(s)
                    ) as readonly ("EECH" | "KAHRABA")[]
                  }
                />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rated voltage">
              <Segmented
                value={String(rmu.voltageKv) as "12" | "24"}
                onChange={(v) => setR("voltageKv", Number(v) as 12 | 24)}
                options={["12", "24"] as const}
                renderLabel={(v) => `${v} kV`}
              />
            </Field>
            <Field label="RMU feeder" hint={isLucy ? "Feeders (R) + circuit breakers (T)" : "Ring feeders (R) + transformer feeders (T)"}>
              <select
                value={rmuFeederLabel(rmu.nalCount, rmu.nalfCount)}
                onChange={(e) => { const [n, m] = e.target.value.split("+").map(Number); onChangeMany({ nalCount: n, nalfCount: m }); }}
                className="input cursor-pointer"
              >
                {(feederOptions.some(([a, b]) => a === rmu.nalCount && b === rmu.nalfCount)
                  ? feederOptions
                  : [[rmu.nalCount, rmu.nalfCount] as [number, number], ...feederOptions]
                ).map(([a, b]) => {
                  const lbl = rmuFeederLabel(a, b);
                  return <option key={lbl} value={lbl}>{lbl}</option>;
                })}
              </select>
            </Field>
          </div>

          {/* Per-feeder Aux / Shunt-trip — one row per ring + transformer feeder, each with two
              tick-boxes. Only offered when RTU is OFF (an RTU covers these functions itself). */}
          {rmu.rtuType === "NONE" && <FeederAccessories rmu={rmu} onChange={setR} />}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Busbar current">
              <NumberInput value={rmu.busbarCurrentA} suffix="A" onChange={(v) => setR("busbarCurrentA", v)} />
            </Field>
            {/* Lucy has no fuse (transformer feeders are circuit breakers). */}
            {!isLucy && (
              <Field label="Fuse rating" hint="Blank = catalogue max ('up to')">
                <NumberInput
                  value={rmu.fuseRatingA ?? NaN}
                  suffix="A"
                  placeholder="standard"
                  onChange={(v) => setR("fuseRatingA", Number.isNaN(v) ? null : v)}
                />
              </Field>
            )}
          </div>
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-5">
        {/* Metering — a toggle for every type; CT/VT options for PRAL/PSEC only.
            Cards keep their natural height and pack from the top, so Smart/RTU
            sits directly under Metering instead of a card being stretched into
            a tall empty white box to force the columns to match. */}
        <section className="card p-5 animate-fade-up">
          <Toggle
            checked={rmu.hasMetering}
            onChange={(v) => setR("hasMetering", v)}
            label="Include Metering cubicle (+M)"
          />
          {rmu.hasMetering && isLucy && (
            <p className="mt-2 text-xs text-muted">
              Lucy metering is a fixed Air-Insulated Metering Unit (100/5A CT, 50 VA VT) — no extra options.
            </p>
          )}
          {rmu.hasMetering && !isLucy && (
            <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg bg-brand-tint p-4 sm:grid-cols-2 animate-fade-up">
              <Field label="CT primary current" hint="Fills X/5 & Ip — blank keeps 'X'">
                <NumberInput
                  value={rmu.meteringCtPrimaryA ?? NaN}
                  suffix="A"
                  placeholder="e.g. 200"
                  onChange={(v) => setR("meteringCtPrimaryA", Number.isNaN(v) ? null : v)}
                />
              </Field>
              <Field label="CT class (CL)" hint="Metering CT accuracy class">
                <Segmented
                  value={(rmu.ctClass ?? "0.5") as "0.5" | "0.5S" | "0.2"}
                  onChange={(v) => setR("ctClass", v)}
                  options={["0.5", "0.5S", "0.2"] as const}
                  renderLabel={(v) => v}
                />
              </Field>
              <Field label="Voltage transformer" hint="Two core → with fuse · single core → without fuse">
                <Segmented
                  value={String(rmu.vtCores ?? 1) as "1" | "2"}
                  onChange={(v) => {
                    const cores = Number(v);
                    setR("vtCores", cores);
                    // Fuse follows the core count: two core = with fuse, single = without.
                    setR("meteringWithFuse", cores === 2);
                  }}
                  options={["1", "2"] as const}
                  renderLabel={(v) => (v === "1" ? "Single core" : "Two core")}
                />
              </Field>
              <Field label="VT burden (VA)" hint="Fixed (non-editable)">
                <input className="input bg-surface" value="50-100" readOnly />
              </Field>
              <Field label="VT class (CL)" hint="Fixed (non-editable)">
                <input className="input bg-surface" value="0.5" readOnly />
              </Field>
            </div>
          )}
        </section>

        {/* Smart / RTU — optional, PSEC & Lucy only (PRAL has no smart). Works
            like the metering toggle: turn it on, then pick the level. */}
        {rmu.productType !== "PRAL" && (
          <section className="card p-5 animate-fade-up">
            <Toggle
              checked={rmu.rtuType !== "NONE"}
              onChange={(on) => setR("rtuType", on ? "READY1" : "NONE")}
              label="Smart / RTU (optional)"
            />
            {rmu.rtuType !== "NONE" && (
              <div className="mt-4 sm:max-w-md animate-fade-up">
                <Field label="Smart level" hint="Priced as a separate line in the commercial offer">
                  <Select value={rmu.rtuType} onChange={(v) => setR("rtuType", v)} options={RTU_TYPES} />
                </Field>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
