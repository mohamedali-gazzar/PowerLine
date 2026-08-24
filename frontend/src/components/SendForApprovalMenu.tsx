import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Approver } from "../api";

/**
 * "Send for approval" as a dropdown: pick a Section Head / Team Leader to send the
 * quotation (LV) or offer (RMU) to. The chosen person is the one notified; the server
 * still decides who may actually approve. Shared by the LV configurator, the RMU editor
 * and the RMU detail page — each passes its own `onSend(approverId)`.
 *
 * The menu is PORTALED to <body> with fixed positioning so it can't be clipped by an
 * `overflow` ancestor (the sticky toolbars it lives in would otherwise cut it off).
 */
export default function SendForApprovalMenu({
  onSend,
  disabled,
  busy,
  label = "Send for approval",
  className,
}: {
  onSend: (approverId: string) => Promise<void> | void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [approvers, setApprovers] = useState<Approver[] | null>(null);
  const [sending, setSending] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Anchor the fixed menu under the button (right edges aligned).
  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setPos({ top: b.bottom + 4, right: Math.max(8, window.innerWidth - b.right) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    if (!approvers) {
      api.qtns.approvers()
        .then((r) => setApprovers(r.users))
        .catch(() => setApprovers([]));
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const reposition = () => setOpen(false); // close on scroll/resize rather than drift
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = async (a: Approver) => {
    setOpen(false);
    setSending(true);
    try { await onSend(a.id); } finally { setSending(false); }
  };

  const working = busy || sending;
  return (
    <div className={`inline-block text-left ${className ?? ""}`}>
      <button
        ref={btnRef}
        type="button"
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || working}
        onClick={() => setOpen((o) => !o)}
      >
        {working ? "Sending…" : `${label} ▾`}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 60 }}
          className="w-64 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop"
        >
          <div className="border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            Send to…
          </div>
          {approvers === null ? (
            <div className="px-3 py-3 text-sm text-muted">Loading…</div>
          ) : approvers.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted">No Section Heads or Team Leaders found.</div>
          ) : (
            <ul className="max-h-72 overflow-auto py-1">
              {approvers.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => pick(a)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-brand-tint"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{a.name || a.email}</span>
                      <span className="block truncate text-[11px] text-muted">{a.email}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold text-brand-dark">{a.accessRole}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
