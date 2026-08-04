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

// The catalogue arrays are mutated in place, so React cannot see a new version
// land. Anything that publishes (a price edit, an import, the publish button)
// calls refreshCatalog, and every screen already on screen has to hear about it
// — otherwise the configurator keeps showing the catalogue it was signed in
// with while the price list shows the new one.
type CatalogListener = (version: number) => void;
const listeners = new Set<CatalogListener>();

/** Subscribe to catalogue swaps. Returns the unsubscribe function. */
export function onCatalogChange(fn: CatalogListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(loadedVersion);
    } catch {
      /* a bad listener must never break a catalogue swap */
    }
  }
}

// A pristine copy of the catalogue shipped in this build, taken before anything
// can overwrite it. installCatalog() mutates COMPONENTS/ENCLOSURES in place, so
// without this the bundled prices are unrecoverable once a cached catalogue has
// been installed — and a browser that cached a database catalogue would keep
// serving it forever, even after a release with new prices. Captured at module
// scope, which runs before installCachedCatalog() is called.
const BUNDLED_COMPONENTS: DbComponent[] = [...COMPONENTS];
const BUNDLED_ENCLOSURES: DbEnclosure[] = [...ENCLOSURES];
const BUNDLED_FACTORS: Factors = JSON.parse(JSON.stringify(DEFAULT_FACTORS));

/**
 * The catalogue shipped in this build, whatever is loaded right now.
 *
 * Anything comparing "what the release contains" against the database MUST read
 * this and not COMPONENTS: once the database catalogue is installed, COMPONENTS
 * holds the database's own prices, so comparing it to the database always
 * reports a match and a genuinely stale price list looks up to date.
 */
export const bundledCatalog = () => ({
  components: BUNDLED_COMPONENTS,
  enclosures: BUNDLED_ENCLOSURES,
});

/** Put the catalogue shipped in this build back in place. */
function restoreBundled(): void {
  COMPONENTS.length = 0;
  COMPONENTS.push(...BUNDLED_COMPONENTS);
  ENCLOSURES.length = 0;
  ENCLOSURES.push(...BUNDLED_ENCLOSURES);
  const { forms, ...flat } = BUNDLED_FACTORS;
  Object.assign(DEFAULT_FACTORS, flat);
  Object.assign(DEFAULT_FACTORS.forms, forms);
  rebuildDerived();
  loadedVersion = 0;
  notify();
}

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
  notify();
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

    // The server is serving the catalogue shipped with the build. Any catalogue
    // this browser cached earlier is now wrong, so drop it and go back to the
    // bundled prices — otherwise the cache would outlive every future release.
    if (!body?.data || body.source !== "db" || !body.data.components?.length) {
      if (loadedVersion !== 0 || readCache()) {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {
          /* ignore */
        }
        restoreBundled();
      }
      return null;
    }
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
