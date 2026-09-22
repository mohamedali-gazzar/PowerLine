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
  code,
  panelCode,
}: {
  value: RmuConfigInput;
  onChange: <K extends keyof RmuConfigInput>(key: K, v: RmuConfigInput[K]) => void;
  code: string;
  panelCode: string;
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
            <Field label="Installation" hint="Outdoor adds an enclosure (priced in the commercial offer)">
              <Segmented
                value={rmu.installation}
                onChange={(v) => setR("installation", v)}
                options={["INDOOR", "OUTDOOR"] as const}
                renderLabel={(v) => (v === "INDOOR" ? "Indoor" : "Outdoor")}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={isLucy ? "Feeders (R)" : "Ring feeders (R)"}
              hint={isLucy ? "Load-break switches (L)" : "NAL — R0 to R5"}
            >
              <NumberInput value={rmu.nalCount} min={0} onChange={(v) => setR("nalCount", v)} />
            </Field>
            <Field
              label={isLucy ? "Transformer feeders (T)" : "Transformer feeders (T)"}
              hint={isLucy ? "Circuit breakers (V)" : "NALF — T0 to T2"}
            >
              <NumberInput value={rmu.nalfCount} min={0} onChange={(v) => setR("nalfCount", v)} />
            </Field>
          </div>

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
