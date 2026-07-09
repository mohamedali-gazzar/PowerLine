import type { GeneratedOffer, Row, CubicleItem } from "../types";

// Renders an assembled RMU technical offer (the same structure the backend
// puts into the PDF). Used for both the live form preview and the saved offer.
export default function OfferView({ g }: { g: GeneratedOffer }) {
  const s = g.summary;
  return (
    <div className="space-y-6">
      {/* Title banner */}
      <div className="overflow-hidden rounded-xl2 bg-brand p-5 text-white shadow-soft animate-fade-up">
        <div className="font-mono text-sm font-bold tracking-wide text-white">
          {g.panelCode}
          <span className="ml-2 text-xs font-normal text-white/70">{g.configCode}</span>
        </div>
        <div className="mt-1 text-xl font-extrabold">{g.titleProduct}</div>
        <div className="text-sm text-white/85">{g.titleFamily}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {s.productType === "LUCY" ? (
            <>
              <Tag>Lucy Electric</Tag>
              <Tag>AEGIS PLUS</Tag>
              <Tag>{s.insulation} insulated</Tag>
              <Tag>{s.voltageKv} kV</Tag>
              <Tag>{s.nalCount} feeder</Tag>
              <Tag>{s.nalfCount} transformer</Tag>
              {s.hasMetering && <Tag>Metering</Tag>}
              <Tag>{s.installation}</Tag>
            </>
          ) : (
            <>
              <Tag>{s.lbsBrand}</Tag>
              <Tag>{s.smart ? "Smart" : "Standard"}</Tag>
              <Tag>{s.clientSpec}</Tag>
              <Tag>{s.insulation} insulated</Tag>
              <Tag>{s.voltageKv} kV</Tag>
              <Tag>R{s.nalCount} ring</Tag>
              <Tag>T{s.nalfCount} transformer</Tag>
              {s.hasMetering && <Tag>Metering</Tag>}
              <Tag>{s.smart ? "Smart" : "Ready"} type {/2$/.test(s.rtuType) ? "2" : "1"}</Tag>
              <Tag>{s.installation}</Tag>
            </>
          )}
        </div>
      </div>

      <DataTable title="General Data / Type of apparatus" rows={g.generalData} delay={0.05} />
      <DataTable title="Electrical Data" rows={g.electricalData} delay={0.1} />
      {g.additionalData.length > 0 && (
        <DataTable title="Additional Data" rows={g.additionalData} delay={0.15} />
      )}

      {g.installationNote && (
        <p className="rounded-lg border border-accent/30 bg-brand-tint px-3 py-2 text-sm font-medium text-brand-dark animate-fade-in">
          ⚑ {g.installationNote}
        </p>
      )}

      {g.generalNotes.length > 0 && (
        <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <h3 className="sec-head">General Notes</h3>
          <ul className="space-y-1.5 text-sm text-ink/90">
            {g.generalNotes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 text-brand">▸</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="animate-fade-up" style={{ animationDelay: "0.25s" }}>
        <h3 className="sec-head">Ring Main Unit Structure</h3>
        <div className="space-y-4">
          {g.cubicles.map((c, i) => (
            <CubicleBlock
              key={i}
              index={i}
              heading={
                c.code === "EXTRA"
                  ? `${c.name}:` // not a cubicle — plain heading
                  : `QTY ${c.qty} Cubical: ${c.name}, each consisting of:`
              }
              items={c.items}
            />
          ))}
          {g.communication && g.communication.length > 0 && (
            <CubicleBlock
              index={g.cubicles.length}
              heading="Communication:"
              items={g.communication}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/20">
      {children}
    </span>
  );
}

function DataTable({ title, rows, delay = 0 }: { title: string; rows: Row[]; delay?: number }) {
  return (
    <div className="animate-fade-up" style={{ animationDelay: `${delay}s` }}>
      <h3 className="sec-head">{title}</h3>
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={`transition-colors hover:bg-brand-tint ${
                  i % 2 === 0 ? "bg-brand-tint/40" : "bg-white"
                }`}
              >
                <td className="w-1/2 border-r border-line px-3 py-2 align-top font-semibold text-muted">
                  {r.label}
                </td>
                <td className="px-3 py-2 font-medium text-ink">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CubicleBlock({
  heading,
  items,
  index,
}: {
  heading: string;
  items: CubicleItem[];
  index: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-line shadow-sm animate-fade-up"
      style={{ animationDelay: `${0.3 + index * 0.06}s` }}
    >
      <div className="bg-brand-dark px-3 py-2 text-sm font-bold text-white">
        {heading}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-brand/10 text-left text-[11px] uppercase tracking-wide text-brand-dark">
          <tr>
            <th className="w-14 px-3 py-1.5">QTY</th>
            <th className="px-3 py-1.5">Description</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr
              key={i}
              className={`border-t border-line transition-colors hover:bg-brand-tint ${
                i % 2 === 0 ? "bg-white" : "bg-surface"
              }`}
            >
              <td className="px-3 py-1.5 font-bold text-brand">{it.qty}</td>
              <td className="px-3 py-1.5 text-ink">{it.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
