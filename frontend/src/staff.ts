// Shared, app-wide staff registry — sales people, sales managers and support
// engineers — used by BOTH the RMU offer form and the LV Project tab and persisted
// to localStorage. A person added/removed in either section appears in both.

import { useState } from "react";
import {
  DEFAULT_SALES_PEOPLE,
  DEFAULT_SUPPORT_ENGINEERS,
  SALES_MANAGER,
  type SalesPerson,
} from "./lv/catalog";

export { SALES_MANAGER }; // re-export the fixed Sales Manager name (Ali Kamal)
export type Person = SalesPerson; // { name, mobile, email }

export interface StaffRegistry {
  salesPeople: Person[];
  salesManagers: Person[];
  supportEngineers: Person[];
}

const KEY = "powerline-staff-v1";

export function defaultStaff(): StaffRegistry {
  // The Sales Manager (Ali Kamal) carries his real contact from the sales-people list.
  const mgr = DEFAULT_SALES_PEOPLE.find((p) => p.name === SALES_MANAGER);
  return {
    salesPeople: DEFAULT_SALES_PEOPLE.map((p) => ({ ...p })),
    salesManagers: [mgr ? { ...mgr } : { name: SALES_MANAGER, mobile: "", email: "" }],
    supportEngineers: DEFAULT_SUPPORT_ENGINEERS.map((n) => ({ name: n, mobile: "", email: "" })),
  };
}

// Fill blank mobile/email from the known sales-people list, so e.g. the Sales
// Manager "Ali Kamal" always shows his real contact — even in older saved registries.
function backfillContacts(list: Person[]): Person[] {
  return list.map((p) => {
    if (p.mobile && p.email) return p;
    const known = DEFAULT_SALES_PEOPLE.find((x) => x.name === p.name);
    return known ? { name: p.name, mobile: p.mobile || known.mobile, email: p.email || known.email } : p;
  });
}

export function loadStaff(): StaffRegistry {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<StaffRegistry>;
      const d = defaultStaff();
      return {
        salesPeople: backfillContacts(s.salesPeople ?? d.salesPeople),
        salesManagers: backfillContacts(s.salesManagers ?? d.salesManagers),
        supportEngineers: s.supportEngineers ?? d.supportEngineers,
      };
    }
  } catch {
    /* corrupted — reseed below */
  }
  const d = defaultStaff();
  saveStaff(d);
  return d;
}

export function saveStaff(s: StaffRegistry): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full/blocked — non-fatal */
  }
}

/** React hook — loads the shared registry and persists on every change. */
export function useStaff(): [StaffRegistry, (next: StaffRegistry) => void] {
  const [staff, setStaffState] = useState<StaffRegistry>(() => loadStaff());
  const setStaff = (next: StaffRegistry) => {
    setStaffState(next);
    saveStaff(next);
  };
  return [staff, setStaff];
}

export const findPerson = (list: Person[], name: string): Person | undefined =>
  list.find((p) => p.name === name);
