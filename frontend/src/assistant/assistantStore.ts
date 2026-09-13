// The QTN Assistant panel's state — a module-level store that lives ABOVE the QTN route.
//
// Why a store and not React state on the QTN page: the panel must survive opening, closing,
// pinning, navigation between the QTN's sections/tabs, and it must NEVER share local state with
// the QTN (closing it must not re-render or reset any QTN edit). The panel itself is mounted once
// at the app shell (App.tsx) and only ever translated off-screen — never unmounted. The QTN page
// only WRITES to this store (its feed + open()) and never subscribes, so the two are decoupled.
//
// Persisted per browser: the pinned state and the panel width, so the layout is the same next time.

import { useSyncExternalStore } from "react";
import type { QtnEventDto } from "../api";

/** What the current QTN hands the panel to show. Replaced whenever the QTN's data changes; set to
 *  null when no QTN is open (the launcher and panel then go idle). */
export interface AssistantFeed {
  qtnLabel: string;   // e.g. "QTN-26-01827"
  scopeLine: string;  // e.g. "Reviewing QTN-26-01827 · Panel 2 — MDB-01"
  events: QtnEventDto[];
  canReply: boolean;  // creator, on a returned quotation → the reply composer shows
  busy: boolean;
  /** Post all staged replies (each its own message, keeping its quote) and send for approval. */
  onReSend?: (approverId: string, replies: { text: string; replyToId: string | null }[]) => Promise<void> | void;
}

export interface AssistantState {
  open: boolean;
  pinned: boolean;
  width: number;
  draft: string;
  feed: AssistantFeed | null;
  mobile: boolean;    // below ~760px → full-width panel, docking disabled
  replyTo: string | null; // id of the message the composer is quoting (WhatsApp-style reply)
  /** Replies staged with Enter, not yet sent — posted together on "Reply & send for approval". */
  pendingReplies: { id: string; text: string; replyToId: string | null }[];
}

export const MIN_W = 320;
export const MAX_W = 680;
const DEFAULT_W = 400;
const MOBILE_MAX = 759; // "below ~760px" — docking leaves no usable workspace, so it's turned off

const LS_PINNED = "pl.assistant.pinned";
const LS_WIDTH = "pl.assistant.width";

const clampW = (n: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(n)));

function loadPinned(): boolean {
  try { return localStorage.getItem(LS_PINNED) === "1"; } catch { return false; }
}
function loadWidth(): number {
  try {
    const n = parseInt(localStorage.getItem(LS_WIDTH) || "", 10);
    return Number.isFinite(n) ? clampW(n) : DEFAULT_W;
  } catch { return DEFAULT_W; }
}

let state: AssistantState = {
  open: false,
  pinned: loadPinned(),
  width: loadWidth(),
  draft: "",
  feed: null,
  mobile: typeof window !== "undefined" ? window.innerWidth <= MOBILE_MAX : false,
  replyTo: null,
  pendingReplies: [],
};

let replyCtr = 0;

const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** The docked workspace margin follows the panel width. It is published as a CSS custom property
 *  (--assistant-dock, 0 while floating / closed / narrow) AND applied straight onto the workspace
 *  wrapper, so the QTN reflows beside a pinned panel with no React re-render of the route. */
function syncDockVar() {
  if (typeof document === "undefined") return;
  const dock = state.open && state.pinned && !state.mobile ? state.width : 0;
  document.documentElement.style.setProperty("--assistant-dock", `${dock}px`);
  const wrap = document.getElementById("assistant-dock-wrap");
  if (wrap) wrap.style.paddingRight = `${dock}px`;
}

function set(patch: Partial<AssistantState>) {
  state = { ...state, ...patch };
  syncDockVar();
  emit();
}

// Track narrow screens: full-width panel + no docking below ~760px. Both matchMedia (cheap,
// fires on the breakpoint) and window.resize (a reliable fallback) recompute it.
if (typeof window !== "undefined") {
  const recompute = () => {
    const m = window.innerWidth <= MOBILE_MAX;
    if (m !== state.mobile) set({ mobile: m });
  };
  window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).addEventListener?.("change", recompute);
  window.addEventListener("resize", recompute);
  syncDockVar();
}

export const assistantStore = {
  getState: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  open() { if (!state.open) set({ open: true }); },
  close() { if (state.open) set({ open: false }); },
  togglePin() {
    if (state.mobile) return; // pinning is disabled on a narrow screen
    const pinned = !state.pinned;
    try { localStorage.setItem(LS_PINNED, pinned ? "1" : "0"); } catch { /* ignore */ }
    set({ pinned });
  },
  setWidth(px: number) {
    const width = clampW(px);
    if (width === state.width) return;
    try { localStorage.setItem(LS_WIDTH, String(width)); } catch { /* ignore */ }
    set({ width });
  },
  setDraft(draft: string) { if (draft !== state.draft) set({ draft }); },
  setReplyTo(replyTo: string | null) { if (replyTo !== state.replyTo) set({ replyTo }); },
  /** Stage the current draft as a reply (Enter), keeping the panel open to write more. */
  stageReply(text: string, replyToId: string | null) {
    const t = text.trim();
    if (!t) return;
    set({ pendingReplies: [...state.pendingReplies, { id: `r${++replyCtr}`, text: t, replyToId }], draft: "", replyTo: null });
  },
  unstageReply(id: string) { set({ pendingReplies: state.pendingReplies.filter((r) => r.id !== id) }); },
  clearPending() { if (state.pendingReplies.length) set({ pendingReplies: [] }); },
  /** The QTN page pushes its conversation here. The in-progress reply (draft, quote, staged
   *  replies) is discarded in two cases: a different QTN opens, or the reply window just closed
   *  on THIS QTN (canReply went true→false) — which is how a completed "send for approval" lands,
   *  so the staged replies clear only once they've actually been sent, not before. */
  setFeed(feed: AssistantFeed | null) {
    const sameQtn = feed && state.feed && feed.qtnLabel === state.feed.qtnLabel;
    const changedQtn = feed && state.feed && !sameQtn;
    const replyClosed = sameQtn && state.feed!.canReply && !feed!.canReply;
    if (changedQtn || replyClosed) set({ feed, draft: "", replyTo: null, pendingReplies: [] });
    else set({ feed });
  },
};

export function useAssistant(): AssistantState {
  return useSyncExternalStore(assistantStore.subscribe, assistantStore.getState, assistantStore.getState);
}
