// QTN registry — the LV section is a list of quotations ("New QTN" → its own
// workspace page with Project / Pricing / Panels / Technical / Commercial /
// Material List inside it, like the Excel configurator files QTN-26-XXXX).
// Stored client-side; backend persistence is a later phase.

import { initialState, grandTotals, type LvState } from "./store";

export interface QtnRecord {
  id: string;
  number: string;     // e.g. "QTN-26-0001"
  createdAt: string;
  updatedAt: string;
  state: LvState;
}
interface Registry {
  seq: number;
  qtns: QtnRecord[];
}

const KEY = "powerline-lv-qtns-v1";
const OLD_SINGLE = "powerline-lv-v1"; // pre-QTN single-state storage → migrated

function loadRegistry(): Registry {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Registry;
  } catch {
    /* corrupted — start fresh */
  }
  const reg: Registry = { seq: 0, qtns: [] };
  // migrate the old single-configurator state into QTN #1, if present
  try {
    const old = localStorage.getItem(OLD_SINGLE);
    if (old) {
      const state = JSON.parse(old) as LvState;
      reg.seq = 1;
      reg.qtns.push({
        id: "migrated-1",
        number: qtnNumber(1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        state,
      });
      localStorage.removeItem(OLD_SINGLE);
      saveRegistry(reg);
    }
  } catch {
    /* ignore */
  }
  return reg;
}
function saveRegistry(reg: Registry) {
  try {
    localStorage.setItem(KEY, JSON.stringify(reg));
  } catch {
    /* storage full — non-fatal */
  }
}

export function qtnNumber(seq: number): string {
  const yy = String(new Date().getFullYear() % 100).padStart(2, "0");
  return `QTN-${yy}-${String(seq).padStart(4, "0")}`;
}

export interface QtnListItem {
  id: string;
  number: string;
  updatedAt: string;
  projectName: string;
  customer: string;
  panels: number;
  totalEgp: number;
}

export function listQtns(): QtnListItem[] {
  return loadRegistry()
    .qtns.map((q) => ({
      id: q.id,
      number: q.number,
      updatedAt: q.updatedAt,
      projectName: q.state.project.name,
      customer: q.state.project.customer,
      panels: q.state.panels.length,
      totalEgp: grandTotals(q.state).incl,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createQtn(): QtnRecord {
  const reg = loadRegistry();
  reg.seq += 1;
  const rec: QtnRecord = {
    id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    number: qtnNumber(reg.seq),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: initialState(),
  };
  reg.qtns.push(rec);
  saveRegistry(reg);
  return rec;
}

export function getQtn(id: string): QtnRecord | null {
  const rec = loadRegistry().qtns.find((q) => q.id === id) ?? null;
  if (rec) {
    // normalize older stored shapes (incl. the earlier multi-add panelItems)
    rec.state.panels.forEach((p) => {
      p.code ??= "";
      p.panelItems = ((p as any).panelItems ?? []).map((it: any, i: number) => ({
        ...it,
        qty: 1,
        slot: it.slot ?? (i === 0 ? 1 : 2),
      }));
    });
  }
  return rec;
}

export function saveQtn(id: string, state: LvState) {
  const reg = loadRegistry();
  const q = reg.qtns.find((x) => x.id === id);
  if (!q) return;
  q.state = state;
  q.updatedAt = new Date().toISOString();
  saveRegistry(reg);
}

export function deleteQtn(id: string) {
  const reg = loadRegistry();
  reg.qtns = reg.qtns.filter((q) => q.id !== id);
  saveRegistry(reg);
}

export function duplicateQtn(id: string): QtnRecord | null {
  const reg = loadRegistry();
  const src = reg.qtns.find((q) => q.id === id);
  if (!src) return null;
  reg.seq += 1;
  const rec: QtnRecord = {
    id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    number: qtnNumber(reg.seq),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: structuredClone(src.state),
  };
  reg.qtns.push(rec);
  saveRegistry(reg);
  return rec;
}
