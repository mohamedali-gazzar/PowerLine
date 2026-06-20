import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { label } from "../options";
import type { Offer } from "../types";

const statusColors: Record<string, string> = {
  DRAFT: "bg-line text-muted",
  SENT: "bg-blue-100 text-blue-700",
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
};

export default function OffersListPage() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const all = await api.listOffers();
      setOffers(all.filter((o) => o.category === "RMU"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this offer?")) return;
    await api.deleteOffer(id);
    load();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">RMU — Technical Offers</h1>
          <p className="text-sm text-muted">{offers.length} saved · Ring Main Units</p>
        </div>
        <Link to="/offers/new" className="btn-primary">
          + New RMU Offer
        </Link>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700 animate-fade-in">
          {error}
          <p className="mt-1 text-xs text-red-500">
            Is the backend running on port 4000? Start it with <code>npm run dev</code> in the backend folder.
          </p>
        </div>
      )}

      {!loading && !error && offers.length === 0 && (
        <div className="card p-12 text-center animate-fade-up">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-2xl">
            ⚡
          </div>
          <p className="text-muted">No offers yet.</p>
          <Link to="/offers/new" className="btn-primary mt-4">
            Create your first RMU offer
          </Link>
        </div>
      )}

      {offers.length > 0 && (
        <div className="card overflow-hidden animate-fade-up">
          <table className="w-full text-sm">
            <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-4 py-3">Offer No</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Lineup</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o, i) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-brand-tint animate-fade-up"
                  style={{ animationDelay: `${i * 0.04}s` }}
                  onClick={() => navigate(`/offers/${o.id}`)}
                >
                  <td className="px-4 py-3 font-bold text-ink">{o.offerNumber}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs font-bold text-brand-dark">
                      {o.generated.panelCode}
                    </span>
                  </td>
                  <td className="px-4 py-3">{o.projectName}</td>
                  <td className="px-4 py-3 text-muted">{o.customer}</td>
                  <td className="px-4 py-3 text-muted">
                    {o.generated.summary.totalCubicles} ways
                    {o.generated.summary.smart && " · Smart"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`chip ${statusColors[o.status] ?? ""}`}>{label(o.status)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={api.pdfUrl(o.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-brand hover:underline"
                      >
                        PDF
                      </a>
                      <button onClick={(e) => remove(e, o.id)} className="text-red-500 hover:underline">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
