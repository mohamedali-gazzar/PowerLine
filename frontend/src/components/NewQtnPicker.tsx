import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { createQtn } from "../lv/qtns";
import { api } from "../api";
import type { OfferInput, RmuConfigInput } from "../types";
import { QtnNumberInput, qtnPrefix, isValidQtn } from "./QtnNumberInput";

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
type Flow = "lv-panels" | "lv-edms" | "rmu" | "pcss";
type QtnType = { key: string; label: string; icon: string; hint: string; desk: "lv" | "mv"; flow: Flow };

const TYPES: QtnType[] = [
  { key: "lv", label: "LV Panels", icon: "📊", hint: "Low-voltage panels & switchboards", desk: "lv", flow: "lv-panels" },
  { key: "edms", label: "Standard EDMS", icon: "📋", hint: "Standard EDMS — same workspace as LV", desk: "lv", flow: "lv-edms" },
  { key: "rmu", label: "RMU", icon: "⚡", hint: "Ring Main Unit offer (MV)", desk: "mv", flow: "rmu" },
  { key: "pcss", label: "P-CSS Selector", icon: "🏗️", hint: "Compact secondary substation selector", desk: "mv", flow: "pcss" },
];
const LETTERS: Record<"lv" | "mv", string> = { lv: "LV", mv: "MV" };

export default function NewQtnPicker({ desk, onClose }: { desk: DeskScope; onClose: () => void }) {
  const navigate = useNavigate();
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
    if (!pick) return;
    if (pick.flow === "pcss") { onClose(); navigate("/kiosks"); return; }
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
      const rec = await createQtn(number, pick.flow === "lv-edms" ? "edms" : "panels");
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
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => setPick(it)}
                    aria-pressed={sel}
                    className={`flex flex-col items-center rounded-xl2 border p-4 text-center transition ${
                      sel
                        ? "border-transparent bg-sidebar shadow-lift ring-2 ring-brand"
                        : "border-line bg-white hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft"
                    }`}
                  >
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint">
                      <span className="text-2xl leading-none">{it.icon}</span>
                    </div>
                    <div className={`text-sm font-bold ${sel ? "text-white" : "text-ink"}`}>{it.label}</div>
                    <div className={`mt-1 text-[11px] leading-snug ${sel ? "text-white/80" : "text-muted"}`}>{it.hint}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn-primary ml-auto disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!pick}
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
