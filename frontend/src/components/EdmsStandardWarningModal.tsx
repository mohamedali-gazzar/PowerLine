import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * EdmsStandardWarningModal — shown the first time a user edits a protected field
 * (qty / sizing / copper) of an EDMS *standard* panel, to remind them that these
 * panels are pre-approved and any change must be re-checked.
 *
 * Theme-aware: the charcoal/white prototype palette is re-expressed through the
 * app's CSS variables so it follows light/dark; brand orange (#F16722) is constant.
 *
 * Props:
 *   open           show/hide
 *   userName       signed-in display name; first word is used in the title
 *   onRevert       "Revert changes" — restore the standard snapshot
 *   onAcknowledge  "Got it — I'll recheck" (also × and Esc)
 */

const STEPS = ["Recheck sizing", "Recheck copper", "Recheck EDMS approval"];

export function PanelWarningIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 420" aria-hidden="true" focusable="false">
      <g stroke="rgb(var(--c-muted) / 0.28)" strokeWidth="1.5" fill="none">
        <line x1="64" y1="48" x2="64" y2="338" />
        <line x1="56" y1="48" x2="72" y2="48" />
        <line x1="56" y1="338" x2="72" y2="338" />
        <line x1="80" y1="48" x2="92" y2="48" />
        <line x1="80" y1="338" x2="92" y2="338" />
        <line x1="92" y1="372" x2="302" y2="372" />
        <line x1="92" y1="364" x2="92" y2="380" />
        <line x1="302" y1="364" x2="302" y2="380" />
        <line x1="92" y1="346" x2="92" y2="358" />
        <line x1="302" y1="346" x2="302" y2="358" />
      </g>
      <rect x="84" y="338" width="226" height="18" rx="2" fill="rgb(var(--c-ink))" />
      <rect x="92" y="48" width="210" height="290" rx="8" fill="var(--c-card)" stroke="rgb(var(--c-ink))" strokeWidth="7" />
      <rect x="108" y="64" width="178" height="258" rx="4" fill="none" stroke="rgb(var(--c-muted) / 0.35)" strokeWidth="2.5" />
      <rect x="124" y="78" width="44" height="36" rx="3" fill="var(--c-card)" stroke="rgb(var(--c-ink))" strokeWidth="3" />
      <line x1="130" y1="106" x2="162" y2="106" stroke="rgb(var(--c-muted) / 0.35)" strokeWidth="2" />
      <line x1="146" y1="106" x2="158" y2="87" stroke="#F16722" strokeWidth="3" strokeLinecap="round" />
      <rect x="176" y="78" width="44" height="36" rx="3" fill="var(--c-card)" stroke="rgb(var(--c-ink))" strokeWidth="3" />
      <line x1="182" y1="106" x2="214" y2="106" stroke="rgb(var(--c-muted) / 0.35)" strokeWidth="2" />
      <line x1="198" y1="106" x2="204" y2="85" stroke="#F16722" strokeWidth="3" strokeLinecap="round" />
      <circle cx="246" cy="96" r="6" fill="#F16722" />
      <circle cx="266" cy="96" r="6" fill="var(--c-card)" stroke="rgb(var(--c-ink))" strokeWidth="2.5" />
      <line x1="108" y1="132" x2="286" y2="132" stroke="rgb(var(--c-muted) / 0.35)" strokeWidth="2" />
      <rect x="124" y="142" width="146" height="52" rx="4" fill="rgb(var(--c-ink) / 0.05)" stroke="rgb(var(--c-ink))" strokeWidth="3" />
      <rect x="186" y="150" width="22" height="36" rx="5" fill="#F16722" />
      <line x1="146" y1="160" x2="158" y2="160" stroke="rgb(var(--c-muted) / 0.4)" strokeWidth="2.5" />
      <line x1="146" y1="176" x2="158" y2="176" stroke="rgb(var(--c-muted) / 0.4)" strokeWidth="2.5" />
      <line x1="236" y1="160" x2="248" y2="160" stroke="rgb(var(--c-muted) / 0.4)" strokeWidth="2.5" />
      <line x1="236" y1="176" x2="248" y2="176" stroke="rgb(var(--c-muted) / 0.4)" strokeWidth="2.5" />
      <line x1="108" y1="206" x2="286" y2="206" stroke="rgb(var(--c-muted) / 0.35)" strokeWidth="2" />
      <g fill="var(--c-card)" stroke="rgb(var(--c-ink))" strokeWidth="2.5">
        <rect x="124" y="214" width="74" height="30" rx="3" />
        <rect x="206" y="214" width="74" height="30" rx="3" />
        <rect x="124" y="248" width="74" height="30" rx="3" />
        <rect x="206" y="248" width="74" height="30" rx="3" />
        <rect x="124" y="282" width="74" height="30" rx="3" />
        <rect x="206" y="282" width="74" height="30" rx="3" />
      </g>
      <g fill="#F16722">
        <rect x="132" y="225" width="18" height="8" rx="3" />
        <rect x="214" y="225" width="18" height="8" rx="3" />
        <rect x="132" y="259" width="18" height="8" rx="3" />
        <rect x="214" y="259" width="18" height="8" rx="3" />
        <rect x="132" y="293" width="18" height="8" rx="3" />
        <rect x="214" y="293" width="18" height="8" rx="3" />
      </g>
      <polygon points="310,240 256,336 364,336" fill="var(--c-card)" stroke="var(--c-card)" strokeWidth="46" strokeLinejoin="round" />
      <polygon points="310,240 256,336 364,336" fill="#F16722" stroke="#F16722" strokeWidth="28" strokeLinejoin="round" />
      <rect x="303.5" y="256" width="13" height="46" rx="6.5" fill="#FFFFFF" />
      <circle cx="310" cy="322" r="8" fill="#FFFFFF" />
    </svg>
  );
}

export default function EdmsStandardWarningModal({
  open,
  userName,
  onRevert,
  onAcknowledge,
}: {
  open: boolean;
  userName?: string;
  onRevert: () => void;
  onAcknowledge: () => void;
}) {
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  // First word of the account name; "engineer" when nothing is available.
  const firstName = (userName || "").trim().split(/\s+/)[0] || "engineer";

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onAcknowledge(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onAcknowledge]);

  if (!open) return null;

  return createPortal(
    <div className="edms-warn-backdrop">
      <div className="edms-warn-modal" role="alertdialog" aria-modal="true" aria-labelledby="edmsWarnTitle" aria-describedby="edmsWarnMsg">
        <button className="edms-warn-close" aria-label="Close" onClick={onAcknowledge}>&#10005;</button>

        <div className="edms-warn-body">
          <div className="edms-warn-icon"><PanelWarningIcon /></div>

          <div className="edms-warn-col">
            <span className="edms-warn-badge">EDMS STANDARD PANEL</span>
            <h2 id="edmsWarnTitle">Hold on, {firstName}.</h2>
            <p className="edms-warn-msg" id="edmsWarnMsg">
              These panels are <strong>standard</strong> — qty, sizing and copper.
            </p>
            <div className="edms-warn-callout">
              <h3>MADE ANY CHANGES? DON&rsquo;T FORGET:</h3>
              {STEPS.map((step, i) => (
                <div className="edms-warn-step" key={step}>
                  <span className="edms-warn-n">{i + 1}</span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="edms-warn-foot">
          <button className="edms-warn-ghost" onClick={onRevert}>Revert changes</button>
          <button className="edms-warn-primary" ref={primaryRef} onClick={onAcknowledge}>Got it — I&rsquo;ll recheck</button>
        </div>
      </div>
      <style>{CSS}</style>
    </div>,
    document.body,
  );
}

// Colours resolve through the app's theme variables so the dialog follows light/dark;
// brand orange #F16722 is intentionally constant.
const CSS = `
.edms-warn-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}
.edms-warn-modal{position:relative;background:var(--c-card);border-radius:12px;max-width:640px;width:100%;box-shadow:0 18px 50px rgba(0,0,0,.4);overflow:hidden;animation:edmsWarnPop .26s ease-out;color:rgb(var(--c-ink))}
@keyframes edmsWarnPop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}
.edms-warn-modal::before{content:"";display:block;height:7px;background:#F16722}
.edms-warn-close{position:absolute;top:12px;right:14px;border:0;background:none;font-size:18px;line-height:1;color:rgb(var(--c-muted));cursor:pointer;padding:4px}
.edms-warn-close:hover{color:rgb(var(--c-ink))}
.edms-warn-body{display:flex;gap:24px;padding:24px 28px 4px;align-items:center}
.edms-warn-icon{flex:0 0 195px}
.edms-warn-icon svg{display:block;width:100%;height:auto}
.edms-warn-col{flex:1;min-width:0}
.edms-warn-badge{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:1.2px;padding:4px 10px;border-radius:4px;background:rgba(241,103,34,.12);color:#F16722;margin:0 0 10px}
.edms-warn-col h2{font-size:26px;font-weight:800;margin:0 0 10px;color:rgb(var(--c-ink))}
.edms-warn-msg{font-size:14px;margin:0 0 14px;color:rgb(var(--c-muted))}
.edms-warn-msg strong{color:rgb(var(--c-ink))}
.edms-warn-callout{background:rgb(var(--c-ink) / .05);border-left:4px solid #F16722;border-radius:0 8px 8px 0;padding:12px 15px;margin:0 0 4px}
.edms-warn-callout h3{font-size:12px;font-weight:700;letter-spacing:.8px;margin:0 0 10px;color:rgb(var(--c-ink))}
.edms-warn-step{display:flex;align-items:center;gap:9px;font-size:13.5px;margin:0 0 8px}
.edms-warn-step:last-child{margin:0}
.edms-warn-n{flex:0 0 21px;height:21px;border-radius:50%;background:#F16722;color:#FFFFFF;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:center}
.edms-warn-foot{display:flex;justify-content:flex-end;gap:12px;border-top:1px solid rgb(var(--c-line));margin-top:18px;padding:16px 28px 20px}
.edms-warn-ghost{font:inherit;font-size:13.5px;font-weight:500;color:rgb(var(--c-ink));background:var(--c-card);border:1.2px solid rgb(var(--c-line));border-radius:6px;padding:9px 18px;cursor:pointer}
.edms-warn-ghost:hover{background:rgb(var(--c-ink) / .05)}
.edms-warn-primary{font:inherit;font-size:13.5px;font-weight:700;color:#FFFFFF;background:#F16722;border:0;border-radius:6px;padding:9px 20px;cursor:pointer}
.edms-warn-primary:hover{background:rgba(241,103,34,.9)}
@media (max-width:620px){.edms-warn-body{flex-direction:column}.edms-warn-icon{flex-basis:160px;width:160px}}
`;
