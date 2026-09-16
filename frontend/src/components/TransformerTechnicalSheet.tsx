import type { ReactNode } from "react";
import type { TransformerConfigInput } from "../types";
import {
  type TransformerTech, TR_TECH_BY_KV, TR_TAP_LABELS, trModel, trEnclosureIp,
} from "./transformerTechData";

// Brand orange — same value the LV/RMU offers use for their accents.
const TRED = "#F16722";
// Dark banner behind the model code (matches the printed datasheet's slate header).
const INK_BAND = "#2b2f38";

// One label/value line inside a section card. Alternating rows get a faint fill (striped),
// exactly like the printed sheet. The value is bold; `accent` colours it orange for the
// figures the sheet highlights (rated capacity, weight, sound level).
function Row({ label, value, striped, accent }: { label: ReactNode; value: ReactNode; striped?: boolean; accent?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 px-3 py-[5px] ${striped ? "bg-black/[0.035]" : ""}`}>
      <span className="text-[10px] leading-tight text-muted">{label}</span>
      <span className="text-right text-[10px] font-bold leading-tight" style={accent ? { color: TRED } : undefined}>{value}</span>
    </div>
  );
}

// A numbered section header — the small orange chip + the section title, as on the sheet.
function SecHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: "rgba(0,0,0,0.045)" }}>
      <span className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[10px] font-bold text-white" style={{ background: TRED }}>{n}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-ink">{title}</span>
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-lg border border-line ${className}`}>{children}</div>;
}

/**
 * One A4 technical datasheet for a Powerline PDTR cast-resin dry-type transformer, rebuilt
 * from the official published sheet (Rev. 2026-06) so it prints inside the MV Technical offer.
 * All values are read verbatim from `t` (see transformerTechData.ts). `insideKiosk` switches
 * the two things that differ between the standalone (IP23) and in-kiosk (IP00) sheets: the
 * model-number suffix and the enclosure IP rating.
 */
export function TransformerTechnicalSheet({ t, insideKiosk }: { t: TransformerTech; insideKiosk: boolean }) {
  const kv = TR_TECH_BY_KV[t.primaryKv];
  const model = trModel(t, insideKiosk);
  const enclosureIp = trEnclosureIp(insideKiosk);
  const protections: { label: string; value: string }[] = [
    { label: "Cooling fans", value: "IP ≥ 20" },
    { label: "Enclosure", value: enclosureIp },
    { label: "Transformer", value: "IP00" },
    { label: "Climatic class", value: "C1" },
    { label: "Environmental", value: "E2" },
    { label: "Fire class", value: "F1" },
    { label: "Max. altitude", value: "1000 m" },
    { label: "Max. humidity", value: "100 %" },
  ];
  const design: { label: ReactNode; value: ReactNode }[] = [
    { label: "Load loss, W", value: t.loadLossW.toLocaleString() },
    { label: "Impedance voltage, %", value: t.impedancePct },
    { label: "No-load loss, W", value: t.noLoadLossW.toLocaleString() },
    { label: "HV phase resistance, Ω", value: t.hvResistance },
    { label: "LV phase resistance, Ω", value: t.lvResistance },
    { label: "Temperature rise, K @ ambient 40 °C", value: t.tempRise },
  ];

  return (
    <section className="a4-sheet relative flex flex-col overflow-hidden bg-white" style={{ breakAfter: "page" }}>
      <div className="flex flex-1 flex-col px-10 py-8 text-ink">
        {/* Header — logo + sheet title, over the orange rule. */}
        <div className="flex items-end justify-between border-b-2 pb-3" style={{ borderColor: TRED }}>
          <img src="/brand/logo-horizontal.png" alt="PowerLine" className="h-9 w-auto" />
          <div className="text-right">
            <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: TRED }}>Cast-Resin Dry-Type Transformer</div>
            <div className="text-[10px] text-muted">PDTR Series · {t.primaryKv} kV · Technical Data Sheet</div>
          </div>
        </div>

        {/* Banner — rating chip + model code. */}
        <div className="mt-4 flex items-stretch overflow-hidden rounded-xl" style={{ background: INK_BAND }}>
          <div className="flex min-w-[92px] flex-col items-center justify-center px-5 py-4 text-white" style={{ background: TRED }}>
            <div className="text-[34px] font-extrabold leading-none">{t.ratingKva}</div>
            <div className="mt-1 text-[10px] font-bold tracking-[0.3em]">kVA</div>
          </div>
          <div className="flex flex-col justify-center px-5 py-3 text-white">
            <div className="text-2xl font-extrabold leading-tight">{model}</div>
            <div className="text-[11px] text-white/70">Cast-resin (epoxy) dry-type · three-phase · indoor</div>
            <div className="text-[10px] text-white/55">Product code: {t.productCode}</div>
          </div>
        </div>

        {/* Sections 1 & 2 — Identification & Service, side by side. */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Card>
            <SecHead n="1" title="Identification & Ratings" />
            <Row label="Product code" value={t.productCode} />
            <Row label="Model" value={model} striped />
            <Row label="Rated capacity" value={`${t.ratingKva} kVA`} accent />
            <Row label="Voltage combination" value={`${t.primaryKv} (+2 × 2.5 % / −4 × 2.5 %) / 0.4 kV`} striped />
            <Row label="Rated current — HV / LV" value={t.ratedCurrent} />
            <Row label="Vector group" value="Dyn11" striped />
            <Row label="Frequency" value="50 Hz" />
          </Card>
          <Card>
            <SecHead n="2" title="Service & Mechanical" />
            <Row label="Service condition" value="Indoor" />
            <Row label="Cooling method" value="AN / AF" striped />
            <Row label="Insulation class" value="F" />
            <Row label="Transformer dimensions (L × W × H)" value={t.trDims} striped />
            <Row label="Enclosure dimensions (L × W × H)" value={t.enclosureDims} />
            <Row label="Approx. total weight" value={`${t.weightKg.toLocaleString()} kg`} striped accent />
            <Row label="Thermal short-circuit withstand" value="2 s" />
            <Row label="Sound level" value={`${t.soundDb} dB`} striped accent />
          </Card>
        </div>

        {/* Section 3 — Protection & service conditions (8 columns). */}
        <Card className="mt-4">
          <SecHead n="3" title="Protection & Service Conditions" />
          <div className="grid grid-cols-8 divide-x divide-line">
            {protections.map((p) => (
              <div key={p.label} className="px-2 py-2 text-center">
                <div className="text-[8px] font-bold uppercase leading-tight tracking-wide text-muted">{p.label}</div>
                <div className="mt-1 text-[11px] font-extrabold" style={{ color: TRED }}>{p.value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Section 4 — Technical data (design values). */}
        <Card className="mt-4">
          <SecHead n="4" title="Technical Data (Design Values) — Reference Temperature 75 °C" />
          <div className="flex items-center justify-between px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-white" style={{ background: INK_BAND }}>
            <span>Parameter</span>
            <span className="rounded px-2 py-0.5" style={{ background: TRED }}>Design value</span>
          </div>
          {design.map((d, i) => (
            <Row key={i} label={d.label} value={d.value} striped={i % 2 === 1} />
          ))}
        </Card>

        {/* Section 5 — HV off-circuit tap changer. */}
        <Card className="mt-4">
          <SecHead n="5" title="HV Off-Circuit Tap Changer (+2 × 2.5 % / −4 × 2.5 %)" />
          <table className="w-full border-collapse text-center text-[10px]">
            <thead>
              <tr>
                <th className="border border-line px-2 py-1 text-left text-[9px] font-bold uppercase text-muted">Tap position</th>
                {TR_TAP_LABELS.map((lbl, i) => {
                  const rated = i === 2;
                  return (
                    <th key={i} className="border border-line px-1 py-1 font-bold" style={rated ? { background: TRED, color: "#fff" } : undefined}>
                      <div>{i + 1}</div>
                      <div className="text-[8px] font-semibold opacity-80">{lbl}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-line px-2 py-1 text-left text-muted">HV voltage (V)</td>
                {kv.tapVoltages.map((v, i) => (
                  <td key={i} className="border border-line px-1 py-1 font-semibold" style={i === 2 ? { color: TRED, fontWeight: 800 } : undefined}>{v}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-line px-2 py-1 text-left text-muted">HV current (A)</td>
                {t.tapCurrentsA.map((a, i) => (
                  <td key={i} className="border border-line px-1 py-1 font-semibold" style={i === 2 ? { color: TRED, fontWeight: 800 } : undefined}>{a}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="px-3 py-1.5 text-[8px] text-muted">
            LV: 400 V / {t.ratedCurrent.split(" / ")[1]} · rated tap = position 3 ({kv.ratedHv} V) · tap currents = S / (√3 · U).
          </div>
        </Card>

        {/* Section 6 — Tests & insulation. */}
        <Card className="mt-4">
          <SecHead n="6" title="Tests & Insulation" />
          <Row label="Test basis & method" value="IEC 60076-11" />
          <Row label="Insulation level" value={`HV: ${kv.hvInsulation}   LV: AC 5 kV`} striped />
          <Row label="Temperature-rise limit @ ambient 40 °C" value="< 100 K" />
        </Card>

        {/* Footer. */}
        <div className="mt-auto flex items-center justify-between pt-3 text-[9px] text-muted">
          <span className="font-bold">POWERLINE · Cast-Resin Dry-Type Transformers</span>
          <span>Reproduced from original technical sheets · Rev. 2026-06</span>
        </div>
      </div>
    </section>
  );
}

// Family name + tagline for the transformer cover, chosen by insulation type.
function trFamily(insulation: string): { family: string; tagline: string } {
  const k = (insulation || "").trim().toLowerCase();
  if (k === "oil") return { family: "PDTR · Oil", tagline: "Oil-Immersed Distribution Transformer" };
  return { family: "PDTR Series", tagline: "Cast-Resin Dry-Type Distribution Transformer" };
}

/**
 * A branded cover page for one transformer item — the transformer twin of the RMU cover. Same
 * treatment (orange left strip, a faint corner motif, family name + code chip + a four-cell
 * spec strip), so the two MV products read as one family. `code` is the transformer's model /
 * catalogue code; the spec strip surfaces the rating, voltage, insulation and protection (IP).
 */
export function TransformerCover({ config, code, insideKiosk, index, total, project }: {
  config: TransformerConfigInput; code: string; insideKiosk: boolean; index: number; total: number; project: string;
}) {
  const fam = trFamily(config.insulation);
  const specs: { label: string; value: string }[] = [
    { label: "Rated power", value: config.ratingKva ? `${config.ratingKva} kVA` : "—" },
    { label: "Primary voltage", value: config.primaryKv ? `${config.primaryKv} / 0.4 kV` : "—" },
    { label: "Insulation", value: config.insulation ? `${config.insulation} type` : "—" },
    { label: "Protection", value: trEnclosureIp(insideKiosk) },
  ];
  return (
    <section className="a4-sheet relative flex flex-col overflow-hidden bg-white" style={{ breakAfter: "page" }}>
      {/* Orange left strip — same as the RMU / LV offer covers. */}
      <div className="absolute inset-y-0 left-0 w-[10px]" style={{ background: TRED }} />
      {/* Powerline "P" mark watermark, bleeding off the top-right corner, very faint. */}
      <img src="/brand/mark-color.png" alt="" aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-[24rem] w-auto" style={{ opacity: 0.06 }} />

      <div className="relative flex flex-1 flex-col px-16 py-14">
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-bold uppercase tracking-[0.25em] text-muted">Medium Voltage · Distribution Transformer</div>
          {total > 1 && <div className="rounded-full bg-surface px-3 py-1 text-[11px] font-bold text-muted">Transformer {index + 1} of {total}</div>}
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center py-10">
          <div className="text-7xl font-extrabold leading-none text-ink">{fam.family}</div>
          <div className="mt-4 text-2xl font-semibold text-muted">{fam.tagline}</div>
          <div className="mt-10">
            <div className="mb-2 text-[15px] font-bold uppercase tracking-[0.25em] text-muted">Type code</div>
            <div className="font-mono text-2xl font-bold tracking-wide text-ink">{code || "…"}</div>
          </div>
        </div>

        <div className="border-t-2 pt-6" style={{ borderColor: TRED }}>
          <div className="grid grid-cols-4 gap-4">
            {specs.map((sp) => (
              <div key={sp.label}>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">{sp.label}</div>
                <div className="mt-1 text-lg font-bold text-ink">{sp.value}</div>
              </div>
            ))}
          </div>
          {project && <div className="mt-5 text-sm text-muted">{project}</div>}
        </div>
      </div>
    </section>
  );
}
