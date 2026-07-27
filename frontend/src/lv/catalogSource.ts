// Loads the published LV catalogue from the database into the running app.
//
// The trick that makes this safe: the catalogue arrays exported by catalog.ts are
// MUTATED IN PLACE, never reassigned. Every module that did `import { COMPONENTS }`
// keeps its binding, so the configurator, the combination builders and the cell
// tables all pick up new prices with no changes anywhere else.
//
// catalog.ts is evaluated while the entry bundle loads (staff.ts -> NewOfferPage
// -> main.tsx), so it must never throw or await at module scope. That is why the
// bundled JSON stays as the initial value: the app always starts with a complete,
// working catalogue, and the database version replaces it a moment later.

import {
  COMPONENTS,
  ENCLOSURES,
  COMPONENT_TYPES,
  ENCLOSURE_FAMILIES,
  DEFAULT_FACTORS,
  rebuildDerived,
  type DbComponent,
  type DbEnclosure,
  type Factors,
} from "./catalog";

export interface CatalogPayload {
  components: DbComponent[];
  enclosures: DbEnclosure[];
  factors: Partial<Factors>;
}

const LS_KEY = "powerline-catalog"; // one key, overwritten — never version-suffixed
let loadedVersion = 0;

export function catalogVersion(): number {
  return loadedVersion;
}

/** Read the last catalogue this browser saw. Synchronous and never throws, so it
 *  can run before the first render. */
export function readCache(): { version: number; data: CatalogPayload } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data?.components?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Swap the live catalogue. Mutates in place — see the note at the top. */
export function installCatalog(p: CatalogPayload, version: number): void {
  if (!p?.components?.length) return; // never install an empty catalogue

  COMPONENTS.length = 0;
  COMPONENTS.push(...p.components);

  ENCLOSURES.length = 0;
  ENCLOSURES.push(...p.enclosures);

  if (p.factors) {
    const { forms, ...flat } = p.factors as Factors;
    Object.assign(DEFAULT_FACTORS, flat);
    if (forms) Object.assign(DEFAULT_FACTORS.forms, forms);
  }

  // The picker's Type/Family lists and the cell price index are derived at load —
  // they must be rebuilt, or a new component is priced correctly but invisible.
  rebuildDerived();
  loadedVersion = version;
}

/** Fetch the published catalogue and install it. Silent on failure: the app
 *  keeps running on the cached (or bundled) catalogue. */
export async function refreshCatalog(token: string | null): Promise<number | null> {
  try {
    const res = await fetch("/api/catalog/lv", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { source: string; version: number; data: CatalogPayload | null };
    if (!body?.data || body.source !== "db" || !body.data.components?.length) return null;
    if (body.version === loadedVersion) return body.version;

    installCatalog(body.data, body.version);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ version: body.version, data: body.data }));
    } catch {
      /* quota — the app still works, it just re-fetches next time */
    }
    return body.version;
  } catch {
    return null;
  }
}

/** Install the cached catalogue synchronously (before first paint). */
export function installCachedCatalog(): number {
  const cached = readCache();
  if (!cached) return 0;
  installCatalog(cached.data, cached.version);
  return cached.version;
}

export { COMPONENT_TYPES, ENCLOSURE_FAMILIES };
