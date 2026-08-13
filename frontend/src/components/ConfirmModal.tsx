// A PowerLine-themed replacement for window.confirm().
//
// The browser's own dialog says "powerline-chi.vercel.app says", cannot be styled,
// and looks like a scam warning rather than part of the app. This one follows the
// app's light/dark theme, names the action on its buttons ("Send for approval"
// rather than "OK"), and can mark an irreversible step in red.
//
// Portalled to document.body: a `position: fixed` overlay rendered inside a
// configurator tab is clipped by the tab's own stacking context.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ConfirmOptions {
  /** Short heading, e.g. "Send for approval". Falls back to a neutral one. */
  title?: string;
  /** The sentence explaining what is about to happen. */
  message: string;
  /** Names the action, e.g. "Send for approval". Never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for anything that cannot be undone. */
  tone?: "brand" | "danger";
}

function ConfirmModal({
  opts,
  onConfirm,
  onCancel,
}: {
  opts: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      // Enter confirms only while focus is on the confirm button, so a stray
      // keypress elsewhere cannot approve a quotation by accident.
      if (e.key === "Enter" && document.activeElement === confirmRef.current) {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  const danger = opts.tone === "danger";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pl-confirm-title"
        aria-describedby="pl-confirm-msg"
        className="relative w-full max-w-md overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop dark:bg-surface"
      >
        {/* Brand bar — the one thing the browser dialog could never have. */}
        <div className={`h-1.5 ${danger ? "bg-red-500" : "bg-brand"}`} />
        <div className="p-6">
          <h2 id="pl-confirm-title" className="text-lg font-extrabold text-ink">
            {opts.title ?? "Are you sure?"}
          </h2>
          <p id="pl-confirm-msg" className="mt-2 text-sm leading-relaxed text-muted">
            {opts.message}
          </p>
          <div className="mt-6 flex items-center justify-end gap-2">
            <button className="btn-ghost" onClick={onCancel}>
              {opts.cancelLabel ?? "Cancel"}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              className={
                danger
                  ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
                  : "btn-primary"
              }
            >
              {opts.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Promise-based confirm, so a call site reads almost exactly like the old one:
 *
 *   const [askConfirm, confirmModal] = useConfirm();
 *   if (!(await askConfirm({ title: …, message: … }))) return;
 *   …
 *   return <>{confirmModal}</>;   // render it once, anywhere in the tree
 *
 * Resolves false on Cancel, Esc, or a click on the backdrop.
 */
export function useConfirm(): [(o: ConfirmOptions | string) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const ask = useCallback(
    (o: ConfirmOptions | string) =>
      new Promise<boolean>((resolve) => {
        setPending({ opts: typeof o === "string" ? { message: o } : o, resolve });
      }),
    [],
  );

  const settle = (v: boolean) => {
    setPending((p) => {
      p?.resolve(v);
      return null;
    });
  };

  const node = pending ? (
    <ConfirmModal opts={pending.opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return [ask, node];
}

export default ConfirmModal;
