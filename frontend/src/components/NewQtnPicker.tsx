import { useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { createQtn } from "../lv/qtns";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { OfferInput, RmuConfigInput } from "../types";
import { QtnNumberInput, qtnPrefix, isValidQtn } from "./QtnNumberInput";

// The Kiosk (compact-substation) mark — the same one used on the Technical Offer cover.
const ORANGE = "#F16722";
function KioskIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="#585859" strokeWidth="1.088"
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
  );
}

/**
 * New QTN card picker — desk-scoped. LV offers Panels + Standard EDMS; MV offers
 * RMU + the P-CSS selector. Everything but P-CSS takes a quotation number, then:
 *   LV / EDMS → create the LV workspace (/lv/qtn/:id)
 *   RMU       → create a DRAFT offer, then open the editor (/offers/:id/edit)
 *   P-CSS     → the selector tool (/kiosks), no number.
 * `desk="all"` (the Home dashboard) shows every type.
 */

// A fresh RMU's starting configuration (mirrors NewOfferPage's initialRmu). The
// draft is created with this, then fully edited in the LV-style offer editor.
const BLANK_RMU: RmuConfigInput = {
  productType: "PRAL", lbsBrand: "ABB", clientSpec: "EECH", voltageKv: 12,
  nalCount: 2, nalfCount: 1, hasMetering: false, rtuType: "NONE",
  installation: "INDOOR", busbarCurrentA: 630, fuseRatingA: null,
  meteringCtPrimaryA: null, ctClass: null, vtCores: 1, vtBurdenVa: null,
  vtClass: null, meteringWithFuse: false,
};

export type DeskScope = "lv" | "mv" | "all";
type Flow = "lv-panels" | "lv-edms" | "rmu" | "pcss" | "custom" | "mv";
// `adminOnly` locks the card for everyone but ADMIN-tier users while a feature is still
// being built — regular users see it disabled with a 🔒 until it is opened to everyone.
type QtnType = { key: string; label: string; icon: ReactNode; hint: string; desk: "lv" | "mv"; flow: Flow; adminOnly?: boolean };

const TYPES: QtnType[] = [
  { key: "lv", label: "LV Panels", icon: "📊", hint: "Low-voltage panels & switchboards", desk: "lv", flow: "lv-panels" },
  { key: "edms", label: "Standard EDMS", icon: "📋", hint: "Standard EDMS — same workspace as LV", desk: "lv", flow: "lv-edms" },
  // Nothing is configured or costed — the estimator types the offer lines. Project and
  // Commercial Offer are its only two tabs.
  { key: "custom", label: "Custom Commercial Offer", icon: "✍️", hint: "Type your own items and prices", desk: "lv", flow: "custom" },
  { key: "rmu", label: "RMU", icon: "⚡", hint: "Ring Main Unit offer (MV)", desk: "mv", flow: "rmu" },
  { key: "pcss", label: "P-CSS Selector", icon: "🏗️", hint: "Compact secondary substation selector", desk: "mv", flow: "pcss" },
  // The combined MV package (RMU + transformer + kiosk). Still under construction — locked
  // to admins until it is finished, then flip adminOnly off to open it to everyone.
  { key: "mv", label: "MV", icon: <KioskIcon />, hint: "RMU - TR - KIOSK", desk: "mv", flow: "mv", adminOnly: true },
];
const LETTERS: Record<"lv" | "mv", string> = { lv: "LV", mv: "MV" };

export default function NewQtnPicker({ desk, onClose }: { desk: DeskScope; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Am I an admin/owner? Used to unlock cards that are locked while still being built.
  // Starts null (treated as NOT admin, so a locked card stays locked until we know).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { api.access.me().then((a) => setIsAdmin(a.tier === "ADMIN")).catch(() => {}); }, []);
  const lockedFor = (t: QtnType) => !!t.adminOnly && !isAdmin;
  const items = desk === "all" ? TYPES : TYPES.filter((t) => t.desk === desk);
  const [pick, setPick] = useState<QtnType | null>(null);
  const [step, setStep] = useState<"choose" | "number">("choose");
  const [number, setNumber] = useState("");
  const [projectName, setProjectName] = useState(""); // RMU only
  const [customer, setCustomer] = useState(""); // RMU only
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // P-CSS is a tool, not a numbered quote — it goes straight to the selector.
  const start = () => {
    if (!pick || lockedFor(pick)) return;
    if (pick.flow === "pcss") { onClose(); navigate("/kiosks"); return; }
    if (pick.flow === "mv") { onClose(); navigate("/mv"); return; }
    setErr("");
    // Leave the number field empty (the placeholder shows the QTN-YY-00000 format); the user
    // types the whole number and create() still accepts only a complete QTN-YY-NNNNN.
    setStep("number");
  };

  const create = async () => {
    if (!pick) return;
    if (!number.trim()) { setErr("Enter the quotation number."); return; }
    if (!isValidQtn(number)) {
      setErr(`Use the format ${qtnPrefix()}00000 — "QTN-", a 2-digit year, then a 5-digit serial.`);
      return;
    }
    setBusy(true);
    try {
      if (pick.flow === "rmu") {
        // Create the DRAFT offer up front (like LV creates its workspace), then drop
        // into the editor. Project + customer are required by the offer; the rest is
        // the default RMU, edited (and autosaved) from the editor onward.
        if (!projectName.trim()) { setErr("Enter the project name."); setBusy(false); return; }
        if (!customer.trim()) { setErr("Enter the customer."); setBusy(false); return; }
        const draft: OfferInput = {
          category: "RMU",
          quotationNo: number.trim(),
          projectName: projectName.trim(),
          customer: customer.trim(),
          status: "DRAFT",
          currency: "USD",
          unitPrice: 0,
          quantity: 1,
          discountPct: 0,
          validityDays: 3,
          deliveryWeeks: 12,
          paymentTerms: "50% advance, 50% before delivery",
          warrantyMonths: 12,
          offerDate: new Date().toISOString().slice(0, 10),
          rmu: { ...BLANK_RMU },
        };
        const offer = await api.createOffer(draft);
        onClose();
        navigate(`/offers/${offer.id}/edit`);
        return;
      }
      const kind = pick.flow === "lv-edms" ? "edms" : pick.flow === "custom" ? "custom" : "panels";
      const rec = await createQtn(number, kind, user?.name || "");
      onClose();
      navigate(`/lv/qtn/${rec.id}`);
    } catch (e) {
      setErr((e as Error).message || "Could not create the quotation.");
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-lg rounded-xl2 border border-line bg-white p-5 shadow-lift animate-pop">
        {step === "choose" ? (
          <>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1.5 rounded-full bg-brand" />
              <h2 className="text-lg font-extrabold tracking-tight text-ink">New QTN</h2>
              {desk !== "all" && (
                <span className="ml-auto rounded-md bg-brand-tint px-2 py-0.5 text-xs font-bold text-brand-dark">{LETTERS[desk]}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">Choose what you're quoting</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {items.map((it) => {
                const sel = pick?.key === it.key;
                const locked = lockedFor(it);
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => { if (!locked) setPick(it); }}
                    disabled={locked}
                    aria-pressed={sel}
                    title={locked ? "Coming soon" : undefined}
                    className={`relative flex flex-col items-center rounded-xl2 border p-4 text-center transition ${
                      locked
                        ? "cursor-not-allowed border-line bg-white opacity-55"
                        : sel
                        ? "border-transparent bg-sidebar shadow-lift ring-2 ring-brand"
                        : "border-line bg-white hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft"
                    }`}
                  >
                    {locked && (
                      <span className="absolute right-2 top-2 rounded-full bg-line/60 px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted">🔒</span>
                    )}
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint">
                      {typeof it.icon === "string" ? <span className="text-2xl leading-none">{it.icon}</span> : it.icon}
                    </div>
                    <div className={`text-sm font-bold ${sel ? "text-white" : "text-ink"}`}>{it.label}</div>
                    <div className={`mt-1 text-[11px] leading-snug ${sel ? "text-white/80" : "text-muted"}`}>{it.hint}</div>
                    {locked && <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">Coming soon</div>}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn-primary ml-auto disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!pick || lockedFor(pick)}
                onClick={start}
              >
                {pick ? `Start ${pick.label} →` : "Start →"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-extrabold tracking-tight text-ink">New {pick?.label} Quotation</h2>
            <p className="mt-0.5 text-xs text-muted">
              Type the quotation number — e.g. <b className="font-mono">{qtnPrefix()}00000</b>
            </p>
            <label className="label mt-4" htmlFor="qtn-number">Quotation number <span className="text-brand">*</span></label>
            <QtnNumberInput id="qtn-number" autoFocus value={number} onChange={(v) => { setNumber(v); if (err) setErr(""); }} onEnter={create} />
            {/* RMU offers need a project + customer up front (the LV workspace fills
                these later, but an offer record requires them). */}
            {pick?.flow === "rmu" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="qtn-project">Project name <span className="text-brand">*</span></label>
                  <input id="qtn-project" className="input" value={projectName}
                    onChange={(e) => { setProjectName(e.target.value); if (err) setErr(""); }} />
                </div>
                <div>
                  <label className="label" htmlFor="qtn-customer">Customer <span className="text-brand">*</span></label>
                  <input id="qtn-customer" className="input" value={customer}
                    onChange={(e) => { setCustomer(e.target.value); if (err) setErr(""); }} />
                </div>
              </div>
            )}
            {err && <p className="mt-1.5 text-xs font-semibold text-red-600">{err}</p>}
            <div className="mt-5 flex justify-between">
              <button className="btn-ghost" onClick={() => setStep("choose")} disabled={busy}>← Back</button>
              <button
                className="btn-primary"
                onClick={create}
                disabled={busy || !isValidQtn(number) || (pick?.flow === "rmu" && (!projectName.trim() || !customer.trim()))}
              >
                {busy ? "Creating…" : pick?.flow === "rmu" ? "Create & open editor" : "Create QTN"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
