// The QTN Assistant — a right-side slide-in panel that replaces the old approval-chat pop-up.
//
// It shows the SAME data the app always kept (the approval conversation: the reviewer's
// return-for-revision comments and the creator's replies) and carries the same "Reply & send for
// approval" action — only the layout and interaction change. It renders ONCE from the app shell,
// is fed by whichever QTN is open (assistantStore), and is never unmounted on close, so the thread
// and the QTN never share local state.

import { useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { QtnEventDto } from "../api";
import SendForApprovalMenu from "../components/SendForApprovalMenu";
import { assistantStore, useAssistant } from "./assistantStore";

// A reply-less re-send stores a generated "Sent to … for approval" line — routing noise, not a
// message — so it is filtered out (same rule the old chat used).
const SYSTEM_SEND = /^Sent to .+ for approval$/;
type Side = "reviewer" | "creator";
interface ChatMsg { id: string; side: Side; note: string; who: string; at: string; replyToId: string | null }

function toMessages(events: QtnEventDto[]): ChatMsg[] {
  return events
    .filter((e) => {
      // RETURN_COMMENT = one per-panel comment of a Return; REPLY_COMMENT = one staged reply.
      if (e.action === "RETURN" || e.action === "RETURN_COMMENT") return !!e.note;
      if (e.action === "REQUEST_APPROVAL" || e.action === "REPLY_COMMENT") return !!e.note && !SYSTEM_SEND.test(e.note);
      return false;
    })
    .map((e) => {
      const reviewer = e.action === "RETURN" || e.action === "RETURN_COMMENT";
      return {
        id: e.id,
        side: (reviewer ? "reviewer" : "creator") as Side,
        note: e.note,
        who: e.actorEmail || (reviewer ? "Reviewer" : "Creator"),
        at: e.createdAt,
        replyToId: e.replyToId ?? null,
      };
    })
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));
}

/** A ↩ reply glyph. */
const replyGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
);

// Canned creator replies, above the composer — one tap drops the text into the box to edit.
const QUICK_REPLIES = [
  "Prices updated.",
  "Fixed — please review.",
  "Done, thank you.",
  "Could you clarify?",
];

const avatar = (
  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-white shadow-soft">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  </span>
);
const pinGlyph = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </svg>
);

export default function AssistantPanel() {
  const { feed, open, pinned, width, draft, mobile, replyTo, pendingReplies } = useAssistant();
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sendWrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const longPressRef = useRef<number | null>(null);

  const messages = feed ? toMessages(feed.events) : [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  const canReply = !!feed?.canReply && !!feed?.onReSend;
  const effPinned = pinned && !mobile;
  const replyTarget = replyTo ? byId.get(replyTo) ?? null : null;

  // Jump to the quoted original: centre it and flash an orange ring for ~1.4s. The whole thread is
  // loaded at once (no pagination), so the target is always on the page.
  const jumpTo = (id: string) => {
    const el = listRef.current?.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("assistant-flash");
    void el.offsetWidth; // restart the animation if it's still mid-flash
    el.classList.add("assistant-flash");
    window.setTimeout(() => el.classList.remove("assistant-flash"), 1500);
  };
  const startReply = (id: string) => { assistantStore.setReplyTo(id); setTimeout(() => taRef.current?.focus(), 0); };

  // Keep the newest message (or a freshly-staged reply) in view when the thread grows or opens.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length, pendingReplies.length]);

  // Auto-grow the composer (max ~110px), reset once it's cleared.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(110, el.scrollHeight)}px`;
  }, [draft, open]);

  // Escape cancels a pending reply first; otherwise it closes a FLOATING panel (a docked one
  // stays — it's part of the workspace).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (assistantStore.getState().replyTo) { assistantStore.setReplyTo(null); return; }
      if (!effPinned) assistantStore.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, effPinned]);

  // Left-edge resize: width is clamped in the store and drives --assistant-dock, so the docked
  // workspace margin follows automatically. col-resize cursor + no text selection while dragging.
  const onHandleDown = (e: ReactMouseEvent) => {
    if (mobile) return;
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      assistantStore.setWidth(window.innerWidth - ev.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const doReSend = async (approverId: string) => {
    if (!feed?.onReSend) return;
    const st = assistantStore.getState();
    // Everything staged with Enter, plus whatever is still in the box — each becomes its own message.
    const replies = [
      ...st.pendingReplies.map((r) => ({ text: r.text, replyToId: r.replyToId })),
      ...(st.draft.trim() ? [{ text: st.draft.trim(), replyToId: st.replyTo }] : []),
    ];
    // Don't clear the staged replies here. onReSend resolves early when the "Review before
    // sending" confirmation appears (before the user has actually sent), so clearing now would
    // wipe the staged bubbles while that dialog is still open. The store clears them once the
    // send truly lands — the reply window closes (canReply goes false) — see setFeed().
    await feed.onReSend(approverId, replies);
  };

  /** Renders a one-level quote block (never a nested chain). `variant` tints it for the bubble it
   *  sits in. In the composer bar it's shown from `replyTarget` instead. */
  const QuoteBlock = ({ srcId, variant, onJump }: { srcId: string; variant: "own" | "incoming"; onJump?: () => void }) => {
    const src = byId.get(srcId);
    const deleted = !src;
    const author = src ? (src.side === "creator" ? "You" : `Reviewer · ${src.who}`) : "";
    const snippet = src ? src.note.replace(/\s+/g, " ").trim() : "Message deleted";
    const base = variant === "own"
      ? "border-white/40 bg-white/15 text-white/90"
      : "border-brand/50 bg-brand-tint/60 text-ink dark:bg-brand/10";
    return (
      <button
        type="button"
        disabled={deleted}
        onClick={deleted ? undefined : onJump}
        className={`mb-1 flex w-full items-stretch gap-2 overflow-hidden rounded-lg border-l-[3px] ${base} px-2 py-1 text-left ${deleted ? "cursor-default opacity-70" : "cursor-pointer hover:brightness-95"}`}
      >
        <span className="min-w-0">
          {src && <span className={`block text-[10px] font-bold ${variant === "own" ? "text-white/80" : "text-brand-dark"}`}>{author}</span>}
          <span className={`block truncate text-[11px] ${deleted ? "italic text-muted" : ""}`}>{snippet}</span>
        </span>
      </button>
    );
  };

  const onComposerKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // Enter STAGES this reply so several can be written — "Reply & send for approval" posts them
      // all together (choosing an approver). Shift+Enter is a newline.
      e.preventDefault();
      if (draft.trim()) assistantStore.stageReply(draft, replyTo);
    }
  };

  const panelStyle: CSSProperties = {
    width: mobile ? "100vw" : `${width}px`,
    transform: open ? "translateX(0)" : "translateX(100%)",
    transition: "transform 280ms cubic-bezier(.4,0,.2,1)",
  };

  return createPortal(
    <div className="no-print" aria-hidden={!open}>
      {/* Floating launcher, bottom-right — fades out while the panel is open. Only on a QTN. */}
      <button
        type="button"
        onClick={() => assistantStore.open()}
        title="Open the QTN Assistant"
        className={`fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-bold text-white shadow-lift transition-all duration-300 hover:bg-brand-dark ${
          feed && !open ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Assistant
      </button>

      {/* A very faint tint behind a FLOATING open panel — never intercepts pointer events, so the
          QTN stays fully editable underneath. No tint when docked (nothing is covered). */}
      <div
        className="pointer-events-none fixed inset-0 z-[85] bg-ink/5 transition-opacity duration-300"
        style={{ opacity: open && !effPinned ? 1 : 0 }}
      />

      {/* The panel. Always mounted; only translated off-screen when closed. */}
      <aside
        role="dialog"
        aria-label="QTN Assistant"
        style={panelStyle}
        className={`fixed right-0 top-0 z-[90] flex h-screen max-w-full flex-col border-l border-line bg-white dark:bg-surface ${
          effPinned ? "shadow-none" : "shadow-[-14px_0_40px_-18px_rgba(0,0,0,0.35)]"
        }`}
      >
        {/* Left-edge resize handle. */}
        {!mobile && (
          <div
            onMouseDown={onHandleDown}
            title="Drag to resize"
            className="group absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize"
          >
            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-brand/60" />
          </div>
        )}

        {/* Header — avatar + title · pin · close. */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {avatar}
          <h2 className="flex-1 truncate text-sm font-extrabold tracking-tight text-ink">QTN Assistant</h2>
          {!mobile && (
            <button
              type="button"
              onClick={() => assistantStore.togglePin()}
              aria-pressed={effPinned}
              title={effPinned ? "Unpin panel" : "Pin panel"}
              className={`rounded-lg p-1.5 transition-colors ${
                effPinned ? "bg-brand-light text-brand-dark" : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {pinGlyph}
            </button>
          )}
          <button
            type="button"
            onClick={() => assistantStore.close()}
            title="Close"
            aria-label="Close"
            className="rounded-lg p-1.5 text-lg leading-none text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* Context line — what the chat is scoped to. */}
        <div className="truncate border-b border-line bg-surface/70 px-4 py-1.5 text-[11px] font-semibold text-muted">
          {feed?.scopeLine || "No quotation open"}
        </div>

        {/* Message list — scrollable. Hover a bubble (or long-press on touch) to reveal a ↩ reply
            button on its outer edge; a reply carries a one-level quote of the message it answers. */}
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">
              {feed ? "No messages yet." : "Open a quotation to start."}
            </p>
          ) : (
            messages.map((m) => {
              const own = m.side === "creator";
              const replyBtn = canReply ? (
                <button
                  type="button"
                  onClick={() => startReply(m.id)}
                  title="Reply"
                  aria-label="Reply to this message"
                  className="shrink-0 rounded-full border border-line bg-white p-1.5 text-muted opacity-0 shadow-soft transition hover:border-brand/40 hover:text-brand-dark group-hover:opacity-100 dark:bg-surface"
                >
                  {replyGlyph}
                </button>
              ) : null;
              const bubble = (
                <div
                  data-msg-id={m.id}
                  onTouchStart={canReply ? () => { longPressRef.current = window.setTimeout(() => startReply(m.id), 480); } : undefined}
                  onTouchEnd={() => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } }}
                  onTouchMove={() => { if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; } }}
                  className={`max-w-[85%] px-3.5 py-2 ${own ? "rounded-2xl rounded-br-sm bg-brand text-white shadow-soft" : "rounded-2xl rounded-tl-sm border border-line bg-surface text-ink"}`}
                >
                  {!own && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">Reviewer · {m.who}</p>}
                  {m.replyToId && <QuoteBlock srcId={m.replyToId} variant={own ? "own" : "incoming"} onJump={() => jumpTo(m.replyToId!)} />}
                  <p className="whitespace-pre-wrap text-sm">{m.note}</p>
                  <p className={`mt-1 text-[10px] ${own ? "text-right text-white/70" : "text-muted"}`}>{new Date(m.at).toLocaleString()}</p>
                </div>
              );
              return (
                <div key={m.id} className={`group flex items-center gap-1.5 ${own ? "justify-end" : "justify-start"}`}>
                  {own && replyBtn}
                  {bubble}
                  {!own && replyBtn}
                </div>
              );
            })
          )}

          {/* Staged replies — written with Enter, not yet sent. Hover to remove one. */}
          {canReply && pendingReplies.map((r) => (
            <div key={r.id} className="group flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => assistantStore.unstageReply(r.id)}
                title="Remove this staged reply"
                aria-label="Remove staged reply"
                className="shrink-0 rounded-full border border-line bg-white p-1.5 text-muted opacity-0 shadow-soft transition hover:border-red-300 hover:text-red-500 group-hover:opacity-100 dark:bg-surface"
              >
                ✕
              </button>
              <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-dashed border-brand/60 bg-brand/10 px-3.5 py-2 text-ink">
                {r.replyToId && <QuoteBlock srcId={r.replyToId} variant="incoming" onJump={() => jumpTo(r.replyToId!)} />}
                <p className="whitespace-pre-wrap text-sm">{r.text}</p>
                <p className="mt-1 text-right text-[10px] font-semibold text-brand-dark/70">Draft — sends on “Reply &amp; send”</p>
              </div>
            </div>
          ))}
        </div>

        {/* Composer — only when the creator can reply (a returned quotation). */}
        {canReply ? (
          <div className="border-t border-line px-3 py-3">
            {/* Reply quote bar — orange rail, author, one-line snippet, ✕ to cancel (Escape too). */}
            {replyTarget && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border-l-[3px] border-brand bg-brand-tint/50 px-2.5 py-1.5 dark:bg-brand/10">
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold text-brand-dark">
                    Replying to {replyTarget.side === "creator" ? "You" : `Reviewer · ${replyTarget.who}`}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{replyTarget.note.replace(/\s+/g, " ").trim()}</span>
                </span>
                <button type="button" onClick={() => assistantStore.setReplyTo(null)} title="Cancel reply" aria-label="Cancel reply"
                  className="shrink-0 rounded-full px-1.5 text-muted transition hover:bg-surface hover:text-ink">✕</button>
              </div>
            )}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { assistantStore.setDraft(draft ? `${draft} ${q}` : q); taRef.current?.focus(); }}
                  className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-dark transition hover:border-brand/40 hover:bg-brand-tint/50 dark:bg-surface"
                >
                  {q}
                </button>
              ))}
            </div>
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => assistantStore.setDraft(e.target.value)}
              onKeyDown={onComposerKey}
              rows={1}
              placeholder="Reply to a message… (Enter to add another · Shift+Enter for a new line)"
              className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-brand/15 dark:bg-surface"
              style={{ maxHeight: 110 }}
            />
            <div ref={sendWrapRef} className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted">
                {pendingReplies.length > 0
                  ? `${pendingReplies.length} repl${pendingReplies.length === 1 ? "y" : "ies"} ready${draft.trim() ? " + this one" : ""}`
                  : "Press Enter to add each reply, then send."}
              </span>
              <SendForApprovalMenu
                busy={feed?.busy}
                label={pendingReplies.length + (draft.trim() ? 1 : 0) > 1 ? "Send replies for approval" : "Reply & send for approval"}
                onSend={doReSend}
              />
            </div>
          </div>
        ) : (
          feed && messages.length > 0 && (
            <div className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
              Replying is available when the quotation is returned for revision.
            </div>
          )
        )}
      </aside>
    </div>,
    document.body,
  );
}
