import type { CommercialData } from "../types";

const money = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function CommercialView({ c }: { c: CommercialData }) {
  return (
    <div className="space-y-5 animate-fade-up">
      {!c.priceFound && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This configuration isn’t in the price list — the unit price was entered manually
          (or is zero). Set a unit price on the offer to complete the commercial offer.
        </p>
      )}

      <div>
        <h3 className="sec-head">Main Offer</h3>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-brand text-left text-xs uppercase text-white">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-center">QTY</th>
                <th className="px-3 py-2 text-right">Unit</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {c.items.map((it, i) => (
                <tr key={i} className="border-t border-line align-top">
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2 text-ink">{it.description}</td>
                  <td className="px-3 py-2 text-center">{it.qty}</td>
                  <td className="px-3 py-2 text-right">
                    {it.unitPrice > 0 ? money(it.unitPrice, c.currency) : <span className="text-amber-600 font-semibold">POA</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {it.unitPrice > 0 ? money(it.total, c.currency) : <span className="text-amber-600">POA</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ml-auto max-w-sm space-y-1 text-sm">
        <Row label="Total (excl. VAT)" value={money(c.totalExclVat, c.currency)} />
        {c.discountPct > 0 && (
          <Row label={`Discount (${c.discountPct}%)`} value={`− ${money(c.discountAmount, c.currency)}`} />
        )}
        <Row label={`VAT (${c.vatPct}%)`} value={money(c.vatAmount, c.currency)} />
        <div className="flex items-center justify-between rounded-lg bg-brand px-3 py-2 text-base font-extrabold text-white">
          <span>Total (incl. VAT)</span>
          <span>{money(c.totalInclVat, c.currency)}</span>
        </div>
      </div>

      <div>
        <h3 className="sec-head">Terms</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Term k="Validity" v={`${c.validityDays} days`} />
          <Term k="Delivery" v={c.deliveryWeeks ? `${c.deliveryWeeks} weeks` : "To be confirmed"} />
          <Term k="Payment" v={c.paymentTerms || "To be agreed"} />
          <Term k="Warranty" v={c.warrantyMonths ? `${c.warrantyMonths} months` : "Standard"} />
        </dl>
        <p className="mt-3 text-xs text-muted">
          Prices are linked to the US Dollar exchange rate at the Central Bank until the date of receipt.
        </p>
        <p className="mt-1 text-xs text-muted">
          The downloadable PDF includes the full General &amp; Special Terms &amp; Conditions and contact details.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function Term({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-semibold text-muted">{k}:</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}
