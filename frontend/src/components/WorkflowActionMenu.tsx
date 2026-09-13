import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface WfAction {
  key: string;
  label: string;               // full label incl. icon, e.g. "✓ Approve", "↩ Return for revision"
  onClick: () => void;
  tone?: "brand" | "approve" | "muted"; // menu-item accent
}

/**
 * A workflow split button: the primary action is a normal button; a ▾ caret opens a menu of
 * every available action (the primary marked "Default"). With a single action it collapses to
 * a plain button. Portaled to <body> with fixed positioning so an `overflow` ancestor can't
 * clip it, and it flips upward when there isn't room below — the same pattern as
 * SendForApprovalMenu.
 *
 * Used for the reviewer (Return / Approve) and for a self-approver, who at each stage gets the
 * forward action (send → approve → submit) plus its alternatives (return, withdraw).
 */
export default function WorkflowActionMenu({
  actions,
  primaryKey,
  menuTitle = "Move this quotation",
  busy,
  disabled,
  title,
}: {
  actions: WfAction[];
  primaryKey?: string;   // which action is the default (the main button); falls back to the first
  menuTitle?: string;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const primary = actions.find((a) => a.key === primaryKey) ?? actions[0];

  // Anchor the fixed menu to the button (right edges aligned); flip upward when there isn't room
  // below and there's more room above.
  const place = () => {
    const b = wrapRef.current?.getBoundingClientRect();
    if (!b) return;
    const right = Math.max(8, window.innerWidth - b.right);
    const MENU_H = 52 + actions.length * 44;
    const below = window.innerHeight - b.bottom;
    if (below < MENU_H && b.top > below) setPos({ bottom: window.innerHeight - b.top + 4, right });
    else setPos({ top: b.bottom + 4, right });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const close = () => setOpen(false); // close on scroll/resize rather than drift
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!primary) return null;

  // A single action needs no dropdown.
  if (actions.length <= 1) {
    return (
      <button
        type="button"
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || busy}
        title={title}
        onClick={primary.onClick}
      >
        {busy ? "Working…" : primary.label}
      </button>
    );
  }

  const toneClass = (tone?: string) =>
    tone === "approve" ? "text-emerald-700 hover:bg-emerald-50"
      : tone === "muted" ? "text-ink hover:bg-surface"
      : "text-ink hover:bg-brand-tint";

  return (
    <div ref={wrapRef} className="inline-flex items-stretch" title={title}>
      <button
        type="button"
        className="btn-primary rounded-r-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || busy}
        onClick={primary.onClick}
      >
        {busy ? "Working…" : primary.label}
      </button>
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        className="btn-primary rounded-l-none border-l border-white/30 px-2 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || busy}
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }), right: pos.right, zIndex: 120 }}
          className="w-60 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop"
        >
          <div className="border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            {menuTitle}
          </div>
          <ul className="py-1">
            {actions.map((a) => (
              <li key={a.key}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); a.onClick(); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors ${toneClass(a.tone)}`}
                >
                  {a.label}
                  {a.key === primary.key && (
                    <span className="ml-auto rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase text-brand-dark">Default</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}
