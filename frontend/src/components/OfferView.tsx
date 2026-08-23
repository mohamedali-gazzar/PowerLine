import type { GeneratedOffer, Row, CubicleItem } from "../types";

// Renders an assembled RMU technical offer, styled to match the exported PDF
// (backend/src/services/pdf.service.ts): peach-label data cards, numbered white
// notes, and grey-zebra structure tables under an ink title. Used for both the
// live create-form preview and the saved-offer view.

// Palette copied from the PDF generator so screen and print read the same.
const ORANGE = "#ff6600";
const ORANGE_DK = "#d95500";
const INK = "#2b2421";
const PEACH = "#fcebe1";
const SHADE = "#ededed";
const DESC = "#454545";
const HAIR = "#e7e7eb";
const MUTED = "#767070";

export default function OfferView({ g }: { g: GeneratedOffer }) {
  const cubicles = [...g.cubicles];
  const extra = g.communication && g.communication.length
    ? [{ code: "RTU", name: "Communication", qty: 1, items: g.communication }]
    : [];
  return (
    <div className="space-y-5" style={{ color: INK }}>
      {/* Header — system code + product identity, like the PDF running header */}
      <div className="flex items-start justify-between gap-4 border-b pb-2" style={{ borderColor: HAIR }}>
        <div>
          <div className="text-lg font-extrabold leading-tight" style={{ color: INK }}>{g.titleProduct}</div>
          {g.titleFamily && <div className="text-sm" style={{ color: MUTED }}>{g.titleFamily}</div>}
        </div>
        <div className="text-right leading-tight">
          <div className="text-base font-extrabold" style={{ color: INK }}>{g.panelCode}</div>
          {g.configCode && <div className="text-xs font-bold" style={{ color: MUTED }}>{g.configCode.replace("(", " (")}</div>}
        </div>
      </div>

      <DataCard title="General Data / Type of apparatus" rows={g.generalData} />
      <DataCard title="Electrical Data" rows={g.electricalData} />
      {g.additionalData.length > 0 && <DataCard title="Additional Data" rows={g.additionalData} />}

      {g.installationNote && (
        <p className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: PEACH, color: ORANGE_DK }}>
          ⚑ {g.installationNote}
        </p>
      )}

      {g.generalNotes.length > 0 && <NotesCard notes={g.generalNotes} />}

      {/* Ring Main Unit Structure — ink title + orange rule, then one grey-zebra
          table per cubicle (same as the PDF). */}
      <div>
        <h3 className="text-xl font-extrabold" style={{ color: INK }}>Ring Main Unit Structure</h3>
        <div className="mt-1 h-[3px] w-16 rounded-full" style={{ background: ORANGE }} />
        <div className="mt-3 space-y-4">
          {[...cubicles, ...extra].map((c, i) => (
            <CubicleCard
              key={i}
              qty={c.code === "RTU" || c.code === "EXTRA" ? "" : String(c.qty)}
              heading={
                c.code === "RTU" ? "Communication:"
                : c.code === "EXTRA" ? `${c.name}:`
                : `Cubical: ${c.name}, each consisting of:`
              }
              items={c.items}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionBar({ title }: { title: string }) {
  return (
    <div className="px-3 py-1.5 text-[12.5px] font-bold uppercase tracking-wide text-white" style={{ background: ORANGE }}>
      {title}
    </div>
  );
}

function DataCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-lg">
      <SectionBar title={title} />
      <table className="w-full" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "32%" }} />
          <col />
        </colgroup>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td
                className="px-3 py-1.5 align-middle text-[12px] font-bold"
                style={{ background: PEACH, color: ORANGE_DK, borderRight: `1px solid ${HAIR}`, borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}
              >
                {r.label}
              </td>
              <td
                className="px-3 py-1.5 align-middle text-[12px]"
                style={{ color: INK, borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}
              >
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotesCard({ notes }: { notes: string[] }) {
  return (
    <div className="overflow-hidden rounded-lg">
      <SectionBar title="General Notes" />
      <table className="w-full" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "34px" }} />
          <col />
        </colgroup>
        <tbody>
          {notes.map((n, i) => (
            <tr key={i}>
              <td
                className="pl-3 py-1.5 align-middle text-[12px] font-bold"
                style={{ color: INK, borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}
              >
                {i + 1}
              </td>
              <td
                className="pr-3 py-1.5 align-middle text-[12px]"
                style={{ color: INK, borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}
              >
                {n}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CubicleCard({ qty, heading, items }: { qty: string; heading: string; items: CubicleItem[] }) {
  return (
    <div className="overflow-hidden rounded-lg">
      <table className="w-full" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "56px" }} />
          <col />
        </colgroup>
        <thead>
          <tr style={{ background: ORANGE }}>
            <th className="px-3 py-1.5 text-center align-middle text-[12.5px] font-bold text-white">Qty</th>
            <th className="px-3 py-1.5 text-left align-middle text-[12.5px] font-bold text-white">Description</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: SHADE }}>
            <td className="px-3 py-1.5 text-center align-middle text-[12.5px] font-bold" style={{ color: INK }}>{qty}</td>
            <td className="px-3 py-1.5 align-middle text-[12.5px] font-bold" style={{ color: INK }}>{heading}</td>
          </tr>
          {items.map((it, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? SHADE : "#fff", borderTop: `1px solid ${HAIR}` }}>
              <td className="px-3 py-1.5 text-center align-middle text-[12px] font-bold" style={{ color: INK }}>{it.qty}</td>
              <td className="px-3 py-1.5 align-middle text-[12px]" style={{ color: DESC }}>{it.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
