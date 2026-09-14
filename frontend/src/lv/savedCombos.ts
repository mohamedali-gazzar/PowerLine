// The current user's SAVED COMBINATIONS — a small module store shared by the heart button (on each
// combination) and the QTN Assistant's "Saved combinations" tab. A saved combination is just its
// definition (the component list), so it can be inserted as a fresh copy into any panel. Everything
// is per-user (the server scopes it to the caller); the store caches the list and keeps both the
// heart's filled state and the Assistant's list in sync.

import { useSyncExternalStore } from "react";
import { api, type SavedComboDto } from "../api";
import type { PanelComponent } from "./store";

export interface SavedCombo {
  id: string;
  name: string;
  sig: string;
  comps: PanelComponent[];
  createdAt: string;
}

const norm = (d: SavedComboDto): SavedCombo => ({
  id: d.id, name: d.name, sig: d.sig, comps: (d.comps as PanelComponent[]) ?? [], createdAt: d.createdAt,
});

/** Content signature so the same combination isn't saved twice — its name plus each item's
 *  reference / description / qty / brand, order-independent. */
export function comboSig(name: string, comps: PanelComponent[]): string {
  const parts = comps.map((c) => `${c.ref || ""}~${c.name || ""}~${c.qty || 0}~${c.brand || ""}`).sort();
  return `${name.trim()}||${parts.join("|")}`;
}

let items: SavedCombo[] = [];
let loaded = false;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

async function load() {
  if (loading) return;
  loading = true;
  try { const r = await api.savedCombos.list(); items = r.items.map(norm); loaded = true; }
  catch { /* leave as-is; another mount will retry */ }
  finally { loading = false; emit(); }
}

export const savedCombosStore = {
  subscribe(l: () => void) { listeners.add(l); if (!loaded && !loading) void load(); return () => { listeners.delete(l); }; },
  getItems: () => items,
  isLoaded: () => loaded,
  hasSig: (sig: string) => items.some((i) => i.sig === sig),
  reload: () => load(),
  async save(name: string, comps: PanelComponent[]) {
    const sig = comboSig(name, comps);
    const r = await api.savedCombos.save({ name, sig, comps });
    const it = norm(r.item);
    items = items.some((i) => i.id === it.id) ? items.map((i) => (i.id === it.id ? it : i)) : [it, ...items];
    emit();
  },
  async removeBySig(sig: string) {
    const it = items.find((i) => i.sig === sig);
    if (!it) return;
    await api.savedCombos.remove(it.id);
    items = items.filter((i) => i.id !== it.id); emit();
  },
  async remove(id: string) {
    await api.savedCombos.remove(id);
    items = items.filter((i) => i.id !== id); emit();
  },
  /** Save if not already saved (by signature), otherwise remove — the heart toggle. */
  async toggle(name: string, comps: PanelComponent[]) {
    const sig = comboSig(name, comps);
    if (items.some((i) => i.sig === sig)) await this.removeBySig(sig);
    else await this.save(name, comps);
  },
};

const snapshot = () => items;
export function useSavedCombos(): SavedCombo[] {
  return useSyncExternalStore(savedCombosStore.subscribe, snapshot, snapshot);
}
