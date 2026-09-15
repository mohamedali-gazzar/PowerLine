import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

const ORANGE = "#F16722";

/**
 * MV workspace — the combined MV package offer (RMU + transformer + kiosk).
 *
 * Under construction: opened only to ADMIN-tier users while it is being built (the New QTN
 * "MV" card is locked for everyone else). This is the canvas the real flow is built on; a
 * non-admin who reaches /mv directly is sent home. Flip the New QTN card's `adminOnly` off
 * and replace this stub when the flow is ready for everyone.
 */
export default function MvWorkspace() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qtn = params.get("qtn"); // the number typed on the New QTN card (if it came from there)
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  useEffect(() => {
    api.access
      .me()
      .then((a) => setState(a.tier === "ADMIN" ? "ok" : "denied"))
      .catch(() => setState("denied"));
  }, []);

  if (state === "checking") return <div className="skeleton mx-auto mt-10 h-64 max-w-2xl" />;
  if (state === "denied") return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-xl2 border border-line bg-white p-8 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint">
          <svg viewBox="0 0 32 32" className="h-10 w-10" fill="none" stroke="#585859" strokeWidth="1.088"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <g transform="translate(-2.383 -2.785) scale(1.149)">
              <path d="M3.8 10.6 L16 4.6 L28.2 10.6 Z" fill="rgba(88,88,89,0.12)" />
              <rect x="12.6" y="7.6" width="6.8" height="2.1" rx="0.35" fill={ORANGE} stroke="none" />
              <rect x="5.4" y="10.6" width="21.2" height="15.2" rx="0.6" fill="rgba(88,88,89,0.06)" />
              <line x1="16" y1="10.6" x2="16" y2="25.8" />
              <rect x="15.2" y="16.6" width="1.6" height="3" rx="0.4" fill="rgba(88,88,89,0.6)" stroke="none" />
              <line x1="14.6" y1="13.4" x2="17.4" y2="13.4" strokeWidth="0.87" />
              <line x1="14.6" y1="22.6" x2="17.4" y2="22.6" strokeWidth="0.87" />
              <rect x="4.6" y="25.8" width="22.8" height="2.3" rx="0.4" fill="rgba(88,88,89,0.5)" stroke="none" />
            </g>
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">MV</h1>
        <p className="mt-1 text-sm font-semibold text-muted">RMU · TR · Kiosk</p>
        {qtn && (
          <p className="mt-2 inline-block rounded-md bg-brand-tint px-2.5 py-1 font-mono text-sm font-bold text-brand-dark">{qtn}</p>
        )}
        <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-bold text-brand-dark">
          🔒 Under construction
        </div>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
          The combined MV package — Ring Main Unit, transformer and kiosk in one offer — is being
          built here. It stays hidden from everyone else until it's ready; this is the canvas we shape it on.
        </p>
        <button className="btn-ghost mt-6" onClick={() => navigate("/")}>← Back to Home</button>
      </div>
    </div>
  );
}
