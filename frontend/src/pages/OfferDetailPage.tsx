import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import OfferView from "../components/OfferView";
import CommercialView from "../components/CommercialView";
import type { Offer } from "../types";

export default function OfferDetailPage() {
  const { id } = useParams();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"technical" | "commercial">("technical");

  useEffect(() => {
    if (!id) return;
    api.getOffer(id).then(setOffer).catch((e) => setError((e as Error).message));
  }, [id]);

  if (error)
    return <div className="card border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (!offer)
    return (
      <div className="space-y-3">
        <div className="skeleton h-20" />
        <div className="skeleton h-64" />
      </div>
    );

  const pdfHref =
    tab === "technical" ? api.pdfUrl(offer.id) : api.commercialPdfUrl(offer.id);

  return (
    <div className="animate-fade-up">
      <Link to="/" className="text-sm font-semibold text-brand hover:underline">
        ← All offers
      </Link>

      {/* Hero header */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-line bg-white p-5 shadow-soft">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{offer.offerNumber}</h1>
            <span className="code-chip">{offer.generated.panelCode}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {offer.projectName} · {offer.customer}
            {offer.location ? ` · ${offer.location}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/offers/new" className="btn-ghost">+ New</Link>
          <a href={pdfHref} target="_blank" rel="noreferrer" className="btn-primary">
            ⬇ {tab === "technical" ? "Technical" : "Commercial"} PDF
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-line">
        {(["technical", "commercial"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? "border-brand text-brand-dark"
                : "border-transparent text-muted hover:text-brand-dark"
            }`}
          >
            {t} offer
          </button>
        ))}
      </div>

      <div className="card mt-4 p-6">
        {tab === "technical" ? (
          <OfferView g={offer.generated} />
        ) : offer.commercial ? (
          <CommercialView c={offer.commercial} />
        ) : (
          <p className="text-muted">No commercial data.</p>
        )}
      </div>
    </div>
  );
}
