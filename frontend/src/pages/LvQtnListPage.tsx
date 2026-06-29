import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listQtns, createQtn, deleteQtn, duplicateQtn, nextQtnNumber, qtnNumberExists, type QtnListItem } from "../lv/qtns";
import { fmtEgp } from "../lv/catalog";

/** LV landing page — the list of quotations. "+ New QTN" opens a fresh
 *  workspace (Project / Pricing / Panels / Technical / Commercial / Material). */
export default function LvQtnListPage() {
  const navigate = useNavigate();
  const [qtns, setQtns] = useState<QtnListItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [num, setNum] = useState("");
  const [err, setErr] = useState("");

  const reload = () => setQtns(listQtns());
  useEffect(reload, []);

  const onNew = () => {
    // Pre-fill with the year-aware "QTN-26-" prefix; fully editable (prefix included).
    setNum(`QTN-${String(new Date().getFullYear() % 100).padStart(2, "0")}-`);
    setErr("");
    setCreating(true);
  };
  const confirmNew = () => {
    const n = num.trim();
    if (!n) { setErr("Quotation number is required."); return; }
    if (qtnNumberExists(n)) { setErr("A quotation with this number already exists."); return; }
    const rec = createQtn(n);
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

      {creating && (
        <NewQtnModal
          value={num}
          error={err}
          suggestion={nextQtnNumber()}
          onChange={(v) => { setNum(v); if (err) setErr(""); }}
          onUseSuggestion={(s) => { setNum(s); setErr(""); }}
          onCancel={() => setCreating(false)}
          onConfirm={confirmNew}
        />
      )}
    </div>
  );
}

/** Required-number dialog shown when creating a new quotation. */
function NewQtnModal({ value, error, suggestion, onChange, onUseSuggestion, onCancel, onConfirm }: {
  value: string;
  error: string;
  suggestion: string;
  onChange: (v: string) => void;
  onUseSuggestion: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); } // cursor after the prefix
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-label="New quotation"
        className="relative w-full max-w-sm rounded-xl2 border border-line bg-white p-5 shadow-lift animate-pop">
        <h2 className="text-lg font-extrabold tracking-tight text-ink">New Quotation</h2>
        <p className="mt-0.5 text-xs text-muted">Enter the quotation number for this job.</p>
        <label className="label mt-4" htmlFor="qtn-number">
          Quotation number <span className="text-brand">*</span>
        </label>
        <input id="qtn-number" ref={inputRef} className="input" placeholder="e.g. QTN-26-0001"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onConfirm(); }} />
        {error ? (
          <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>
        ) : (
          <button type="button" className="mt-1.5 text-[11px] text-muted hover:text-brand"
            onClick={() => onUseSuggestion(suggestion)}>
            Suggested next: <b>{suggestion}</b> — click to use
          </button>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={onConfirm} disabled={!value.trim()}>Create QTN</button>
        </div>
      </div>
    </div>
  );
}
