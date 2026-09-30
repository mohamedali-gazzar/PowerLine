// The current user's SAVED and PINNED COMBINATIONS — a small module store shared by the heart button
// (on each combination) and the QTN Assistant's two combination tabs. A combination is just its
// definition (the component list), so it can be inserted as a fresh copy into any panel.
//
// There are two shelves, and the difference is the point:
//
//   SAVED   belongs to the quotation it was saved in, and is offered only there. Most combinations
//           are specific to a job, and a list shared across every quotation filled up with other
//           jobs' work until it was no use.
//   PINNED  the user's own shelf, offered in every quotation. Pinning takes a COPY, so emptying a
//           project's list never touches the shelf and tidying the shelf never touches a project.
//
// Both are private to the user — the server scopes every call to the caller and there is no way to
// see anybody else's.
//
// The store caches both lists and keeps the heart's filled state and the Assistant in sync. It has
// to be told which quotation is open (`setQtn`), because that is what "saved here" means.

import { useSyncExternalStore } from "react";
import { api, type SavedComboDto } from "../api";
import type { PanelComponent } from "./store";

export interface SavedCombo {
  id: string;
  /** The quotation it lives in; "" means pinned. */
  qtnId: string;
  name: string;
  sig: string;
  comps: PanelComponent[];
  createdAt: string;
}

const norm = (d: SavedComboDto): SavedCombo => ({
  id: d.id, qtnId: d.qtnId ?? "", name: d.name, sig: d.sig,
  comps: (d.comps as PanelComponent[]) ?? [], createdAt: d.createdAt,
});

/** Content signature so the same combination isn't saved twice — its name plus each item's
 *  reference / description / qty / brand, order-independent. */
export function comboSig(name: string, comps: PanelComponent[]): string {
  const parts = comps.map((c) => `${c.ref || ""}~${c.name || ""}~${c.qty || 0}~${c.brand || ""}`).sort();
  return `${name.trim()}||${parts.join("|")}`;
}

let items: SavedCombo[] = [];   // both shelves; split by qtnId below
let qtn = "";                   // the quotation currently open, "" outside one
let loadedFor: string | null = null;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

// Split lazily and cached, so useSyncExternalStore gets a STABLE array each time. Returning a fresh
// `items.filter(...)` from a snapshot re-renders forever: React compares by identity.
let savedView: SavedCombo[] = [];
let pinnedView: SavedCombo[] = [];
function reslice() {
  savedView = qtn ? items.filter((i) => i.qtnId === qtn) : [];
  pinnedView = items.filter((i) => i.qtnId === "");
}

async function load() {
  if (loading) return;
  loading = true;
  const want = qtn;
  try {
    const r = await api.savedCombos.list(want || undefined);
    // A quotation may have been opened or closed while this was in flight — drop a stale answer
    // rather than showing another project's list.
    if (want !== qtn) return;
    items = r.items.map(norm);
    loadedFor = want;
    reslice();
  } catch { /* leave as-is; another mount will retry */ }
  finally { loading = false; emit(); }
}

/** Put one item into the cache (added or refreshed) and rebuild the views. */
function absorb(it: SavedCombo) {
  items = items.some((i) => i.id === it.id) ? items.map((i) => (i.id === it.id ? it : i)) : [it, ...items];
  reslice();
  emit();
}

export const savedCombosStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    if (loadedFor !== qtn && !loading) void load();
    return () => { listeners.delete(l); };
  },
  /** Tell the store which quotation is open. Reloads when it changes; "" outside a quotation. */
  setQtn(id: string) {
    const next = id || "";
    if (next === qtn) return;
    qtn = next;
    items = [];
    reslice();
    emit();          // clear the old project's list straight away rather than showing it briefly
    void load();
  },
  getQtn: () => qtn,
  getItems: () => savedView,
  getPinned: () => pinnedView,
  isLoaded: () => loadedFor === qtn,
  /** Is this combination saved IN THE OPEN QUOTATION? (What the heart shows.) */
  hasSig: (sig: string) => savedView.some((i) => i.sig === sig),
  reload: () => load(),
  async save(name: string, comps: PanelComponent[]) {
    const sig = comboSig(name, comps);
    const r = await api.savedCombos.save({ name, sig, comps, qtnId: qtn || undefined });
    absorb(norm(r.item));
  },
  /** Put a copy of a saved combination on the pinned shelf. */
  async pin(id: string) {
    const r = await api.savedCombos.pin(id);
    absorb(norm(r.item));
  },
  /** Is this combination already on the pinned shelf? */
  isPinned: (sig: string) => pinnedView.some((i) => i.sig === sig),
  async removeBySig(sig: string) {
    const it = savedView.find((i) => i.sig === sig);
    if (!it) return;
    await this.remove(it.id);
  },
  async remove(id: string) {
    await api.savedCombos.remove(id);
    items = items.filter((i) => i.id !== id);
    reslice();
    emit();
  },
  /** Save if not already saved in this quotation (by signature), otherwise remove — the heart. */
  async toggle(name: string, comps: PanelComponent[]) {
    const sig = comboSig(name, comps);
    if (savedView.some((i) => i.sig === sig)) await this.removeBySig(sig);
    else await this.save(name, comps);
  },
};

const savedSnapshot = () => savedView;
const pinnedSnapshot = () => pinnedView;
/** This quotation's saved combinations. */
export function useSavedCombos(): SavedCombo[] {
  return useSyncExternalStore(savedCombosStore.subscribe, savedSnapshot, savedSnapshot);
}
/** The user's pinned combinations, offered in every quotation. */
export function usePinnedCombos(): SavedCombo[] {
  return useSyncExternalStore(savedCombosStore.subscribe, pinnedSnapshot, pinnedSnapshot);
}
