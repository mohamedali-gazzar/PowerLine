import type { CommercialData } from "../types";

// Styled to match the commercial PDF (backend/src/services/pdf-commercial.service.ts):
// an understated "Main Offer" table (grey labels over an orange rule), a plain totals
// block closed by an orange rule, and the terms summary.
const ORANGE = "#ff6600";
const ORANGE_DK = "#d95500";
const INK = "#2b2421";
const MUTED = "#767070";
const HAIR = "#e7e7eb";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function CommercialView({ c }: { c: CommercialData }) {
  const money = (n: number) => `${c.currency} ${fmt(n)}`;
  const lbl = "text-[11px] font-bold uppercase tracking-wide";
  return (
    <div className="space-y-6" style={{ color: INK }}>
      {!c.priceFound && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This configuration isn’t in the price list — the unit price was entered manually
          (or is zero). Set a unit price on the offer to complete the commercial offer.
        </p>
      )}

      {/* Main Offer */}
      <div>
        <h3 className="text-xl font-extrabold" style={{ color: INK }}>Main Offer</h3>
        <div className="mt-1 h-[3px] w-16 rounded-full" style={{ background: ORANGE }} />
        <table className="mt-4 w-full" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "34px" }} />
            <col />
            <col style={{ width: "48px" }} />
            <col style={{ width: "112px" }} />
            <col style={{ width: "112px" }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `2px solid ${ORANGE}` }}>
              <th className={`pb-1.5 text-left ${lbl}`} style={{ color: MUTED }}>Item</th>
              <th className={`pb-1.5 text-left ${lbl}`} style={{ color: MUTED }}>Description</th>
              <th className={`pb-1.5 text-center ${lbl}`} style={{ color: MUTED }}>Qty</th>
              <th className={`pb-1.5 text-right ${lbl}`} style={{ color: MUTED }}>Unit ({c.currency})</th>
              <th className={`pb-1.5 text-right ${lbl}`} style={{ color: MUTED }}>Total ({c.currency})</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((it, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td className="py-2.5 align-middle text-sm" style={{ color: MUTED }}>{i + 1}</td>
                <td className="py-2.5 pr-3 align-middle text-sm font-bold" style={{ color: INK }}>{it.description}</td>
                <td className="py-2.5 text-center align-middle text-sm">{it.qty}</td>
                <td className="py-2.5 text-right align-middle text-sm">
                  {it.unitPrice > 0 ? fmt(it.unitPrice) : <span className="font-bold text-amber-600">POA</span>}
                </td>
                <td className="py-2.5 text-right align-middle text-sm font-bold">
                  {it.unitPrice > 0 ? fmt(it.total) : <span className="text-amber-600">POA</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals — plain rows closed by an orange rule + bold Total */}
        <div className="mt-5 flex justify-end">
          <div className="w-72 text-sm">
            <TRow label="Subtotal (excl. VAT)" value={money(c.totalExclVat)} />
            {c.discountPct > 0 && <TRow label={`Discount (${c.discountPct}%)`} value={`− ${money(c.discountAmount)}`} />}
            <TRow label={`VAT (${c.vatPct}%)`} value={money(c.vatAmount)} />
            <div className="mt-1 flex justify-between border-t-2 pt-2 text-lg font-extrabold" style={{ borderColor: ORANGE }}>
              <span style={{ color: INK }}>Total ({c.currency})</span>
              <span style={{ color: ORANGE_DK }}>{money(c.totalInclVat)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Terms summary */}
      <div>
        <h3 className="text-xl font-extrabold" style={{ color: INK }}>Terms</h3>
        <div className="mt-1 h-[3px] w-16 rounded-full" style={{ background: ORANGE }} />
        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Term k="Validity" v={`${c.validityDays} days`} />
          <Term k="Delivery" v={c.deliveryWeeks ? `${c.deliveryWeeks} weeks` : "To be confirmed"} />
          <Term k="Payment" v={c.paymentTerms || "To be agreed"} />
          <Term k="Warranty" v={c.warrantyMonths ? `${c.warrantyMonths} months` : "Standard"} />
        </div>
        <p className="mt-3 text-xs" style={{ color: MUTED }}>
          Prices are linked to the US Dollar exchange rate at the Central Bank until the date of receipt.
        </p>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          The downloadable PDF includes the full General &amp; Special Terms &amp; Conditions and contact details.
        </p>
      </div>
    </div>
  );
}

function TRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1" style={{ color: MUTED }}>
      <span>{label}</span>
      <span style={{ color: INK, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Term({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 font-bold" style={{ color: MUTED }}>{k}:</span>
      <span style={{ color: INK }}>{v}</span>
    </div>
  );
}
