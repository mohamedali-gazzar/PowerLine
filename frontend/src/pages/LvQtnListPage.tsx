import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listQtns, createQtn, deleteQtn, duplicateQtn, type QtnListItem } from "../lv/qtns";
import { fmtEgp } from "../lv/catalog";

/** LV landing page — the list of quotations. "+ New QTN" opens a fresh
 *  workspace (Project / Pricing / Panels / Technical / Commercial / Material). */
export default function LvQtnListPage() {
  const navigate = useNavigate();
  const [qtns, setQtns] = useState<QtnListItem[]>([]);

  const reload = () => setQtns(listQtns());
  useEffect(reload, []);

  const onNew = () => {
    const rec = createQtn();
    navigate(`/lv/qtn/${rec.id}`);
  };
  const onDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this QTN?")) return;
    deleteQtn(id);
    reload();
  };
  const onDuplicate = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const rec = duplicateQtn(id);
    if (rec) navigate(`/lv/qtn/${rec.id}`);
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">LV — Quotations</h1>
          <p className="text-sm text-muted">{qtns.length} saved · ABB panel configurator</p>
        </div>
        <button className="btn-primary" onClick={onNew}>+ New QTN</button>
      </div>

      {qtns.length === 0 ? (
        <div className="card p-12 text-center animate-fade-up">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-2xl">⚡</div>
          <p className="text-muted">No quotations yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">
            A QTN holds the whole job — project data, pricing settings, panels &amp; components,
            and generates the Technical / Commercial offers and Material List.
          </p>
          <button className="btn-primary mt-4" onClick={onNew}>Create your first QTN</button>
        </div>
      ) : (
        <div className="card overflow-hidden animate-fade-up">
          <table className="w-full text-sm">
            <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-4 py-3">QTN No</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Panels</th>
                <th className="px-4 py-3">Total (EGP incl. VAT)</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {qtns.map((q, i) => (
                <tr key={q.id}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-brand-tint animate-fade-up"
                  style={{ animationDelay: `${i * 0.04}s` }}
                  onClick={() => navigate(`/lv/qtn/${q.id}`)}>
                  <td className="px-4 py-3 font-bold text-ink">
                    <span className="rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs font-bold text-brand-dark">{q.number}</span>
                  </td>
                  <td className="px-4 py-3">{q.projectName || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-muted">{q.customer || "—"}</td>
                  <td className="px-4 py-3 text-muted">{q.panels}</td>
                  <td className="px-4 py-3 font-semibold">{fmtEgp(q.totalEgp)}</td>
                  <td className="px-4 py-3 text-xs text-muted">{new Date(q.updatedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => onDuplicate(e, q.id)} className="font-semibold text-brand hover:underline">Duplicate</button>
                      <button onClick={(e) => onDelete(e, q.id)} className="text-red-500 hover:underline">Delete</button>
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
