// PowerLine-themed replacements for window.confirm / alert / prompt.
//
// The browser's own dialogs say "powerline-chi.vercel.app says", cannot be styled,
// and look like a scam warning rather than part of the app. These follow the app's
// light/dark theme, name the action on their buttons ("Approve" rather than "OK"),
// and can mark an irreversible step in red.
//
// Portalled to document.body: a `position: fixed` overlay rendered inside a
// configurator tab is clipped by the tab's own stacking context.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ConfirmOptions {
  /** Short heading, e.g. "Send for approval". Falls back to a neutral one. */
  title?: string;
  /** The sentence explaining what is about to happen. Newlines become paragraphs. */
  message: string;
  /** Names the action, e.g. "Send for approval". Never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for anything that cannot be undone. */
  tone?: "brand" | "danger";
}

export interface PromptOptions extends ConfirmOptions {
  defaultValue?: string;
  placeholder?: string;
}

type Kind = "confirm" | "notify" | "prompt";

interface Pending {
  kind: Kind;
  opts: PromptOptions;
  resolve: (v: unknown) => void;
}

function Dialog({ kind, opts, onResolve }: { kind: Kind; opts: PromptOptions; onResolve: (v: unknown) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(opts.defaultValue ?? "");

  const cancel = useCallback(
    () => onResolve(kind === "confirm" ? false : kind === "prompt" ? null : undefined),
    [kind, onResolve],
  );
  const accept = useCallback(
    () => onResolve(kind === "confirm" ? true : kind === "prompt" ? text : undefined),
    [kind, onResolve, text],
  );

  useEffect(() => {
    // A prompt wants the field; everything else wants the action button.
    if (kind === "prompt") inputRef.current?.select();
    else confirmRef.current?.focus();
  }, [kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      // Enter confirms from the field, or while the action button holds focus — so a
      // stray keypress elsewhere cannot approve or delete anything by accident.
      if (
        e.key === "Enter" &&
        (document.activeElement === confirmRef.current ||
          (kind === "prompt" && document.activeElement === inputRef.current))
      ) {
        e.preventDefault();
        accept();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [kind, accept, cancel]);

  const danger = opts.tone === "danger";
  const paragraphs = opts.message.split("\n").filter((l) => l.trim() !== "");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={cancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pl-dialog-title"
        aria-describedby="pl-dialog-msg"
        className="relative w-full max-w-md overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop dark:bg-surface"
      >
        {/* Brand bar — the one thing the browser dialog could never have. */}
        <div className={`h-1.5 ${danger ? "bg-red-500" : "bg-brand"}`} />
        <div className="p-6">
          <h2 id="pl-dialog-title" className="text-lg font-extrabold text-ink">
            {opts.title ?? (kind === "notify" ? "Just so you know" : "Are you sure?")}
          </h2>
          <div id="pl-dialog-msg" className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
            {paragraphs.map((line, i) => <p key={i}>{line}</p>)}
          </div>

          {kind === "prompt" && (
            <input
              ref={inputRef}
              className="input mt-4 w-full"
              value={text}
              placeholder={opts.placeholder}
              onChange={(e) => setText(e.target.value)}
            />
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            {kind !== "notify" && (
              <button className="btn-ghost" onClick={cancel}>{opts.cancelLabel ?? "Cancel"}</button>
            )}
            <button
              ref={confirmRef}
              onClick={accept}
              disabled={kind === "prompt" && !text.trim()}
              className={
                danger
                  ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                  : "btn-primary disabled:opacity-50"
              }
            >
              {opts.confirmLabel ?? (kind === "notify" ? "Got it" : kind === "prompt" ? "Save" : "Confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Themed stand-ins for the three browser dialogs. Render `dialogs` once anywhere in
 * the component; each call resolves when the user answers.
 *
 *   const { confirm, notify, prompt, dialogs } = useDialogs();
 *   if (!(await confirm({ title: …, message: … }))) return;   // false on cancel/Esc
 *   await notify("That didn't work.");                        // alert
 *   const name = await prompt({ message: …, defaultValue: … });// null on cancel
 *   return <>{dialogs}</>;
 */
export function useDialogs() {
  const [pending, setPending] = useState<Pending | null>(null);

  const open = useCallback(
    <T,>(kind: Kind, o: PromptOptions | string) =>
      new Promise<T>((resolve) => {
        setPending({
          kind,
          opts: typeof o === "string" ? { message: o } : o,
          resolve: resolve as (v: unknown) => void,
        });
      }),
    [],
  );

  const confirm = useCallback((o: ConfirmOptions | string) => open<boolean>("confirm", o), [open]);
  const notify = useCallback((o: ConfirmOptions | string) => open<void>("notify", o), [open]);
  const promptFor = useCallback((o: PromptOptions | string) => open<string | null>("prompt", o), [open]);

  const resolveWith = (v: unknown) => {
    setPending((p) => {
      p?.resolve(v);
      return null;
    });
  };

  const dialogs = pending ? (
    <Dialog kind={pending.kind} opts={pending.opts} onResolve={resolveWith} />
  ) : null;

  return { confirm, notify, prompt: promptFor, dialogs };
}

/** Confirm-only convenience, kept for call sites that need nothing else. */
export function useConfirm(): [(o: ConfirmOptions | string) => Promise<boolean>, ReactNode] {
  const { confirm, dialogs } = useDialogs();
  return [confirm, dialogs];
}

export default Dialog;
