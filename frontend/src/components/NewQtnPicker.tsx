import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { createQtn } from "../lv/qtns";
import { QtnNumberInput, qtnPrefix } from "./QtnNumberInput";

/**
 * New QTN card picker — desk-scoped. LV offers Panels + Standard EDMS; MV offers
 * RMU + the P-CSS selector. Everything but P-CSS takes a quotation number, then:
 *   LV / EDMS → create the LV workspace (/lv/qtn/:id)
 *   RMU       → the offer form, carrying the number (/offers/new?qtn=…)
 *   P-CSS     → the selector tool (/kiosks), no number.
 * `desk="all"` (the Home dashboard) shows every type.
 */

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
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // P-CSS is a tool, not a numbered quote — it goes straight to the selector.
  const start = () => {
    if (!pick) return;
    if (pick.flow === "pcss") { onClose(); navigate("/kiosks"); return; }
    setErr("");
    setStep("number");
  };

  const create = async () => {
    if (!pick) return;
    if (!number.trim()) { setErr("Enter the quotation number."); return; }
    if (pick.flow === "rmu") {
      onClose();
      navigate(`/offers/new?qtn=${encodeURIComponent(number)}`);
      return;
    }
    setBusy(true);
    try {
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
            {err && <p className="mt-1.5 text-xs font-semibold text-red-600">{err}</p>}
            <div className="mt-5 flex justify-between">
              <button className="btn-ghost" onClick={() => setStep("choose")} disabled={busy}>← Back</button>
              <button className="btn-primary" onClick={create} disabled={busy || !number.trim()}>
                {busy ? "Creating…" : pick?.flow === "rmu" ? "Continue" : "Create QTN"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
