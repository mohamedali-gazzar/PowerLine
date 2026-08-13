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
  COMBOS,
  installCombos,
  type Factors,
  type CombosData,
} from "./catalog";
import { recomputeCombosDerived } from "./combos";

export interface CatalogPayload {
  components: DbComponent[];
  enclosures: DbEnclosure[];
  factors: Partial<Factors>;
  /** Optional: absent from an older server, or when the combinations table has
   *  not been seeded. Either way the bundled templates stay in use. */
  combos?: Partial<CombosData>;
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
// Same reasoning for the combination templates, which installCombos() also
// replaces in place. Deep-copied: the nested ATS/MCC arrays would otherwise be
// shared with COMBOS and mutated along with it.
const BUNDLED_COMBOS: CombosData = JSON.parse(JSON.stringify(COMBOS));

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
  combos: BUNDLED_COMBOS,
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
  // Deep-copied on the way back out too, so the pristine copy cannot be mutated
  // through COMBOS by a later install.
  installCombos(JSON.parse(JSON.stringify(BUNDLED_COMBOS)));
  recomputeCombosDerived();
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

  // Combination templates are owner-editable and published with the catalogue.
  // Guarded on all five sections being present: a partial set would leave the
  // configurator with, say, MCC starters but no ATS templates at all.
  if (p.combos && p.combos.ats && p.combos.photocell && p.combos.mcc && p.combos.wd && p.combos.motorized) {
    installCombos(p.combos);
    recomputeCombosDerived();
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

/** What a manual "check for updates" found. */
export interface CatalogUpdate {
  ok: boolean;          // false only when the catalogue could not be reached
  changed: boolean;
  version: number;
  prices: number;
  brands: number;
  descriptions: number;
  otherData: number;    // type / family / rating / poles / copper weight / stock
  added: number;
  removed: number;
}

/**
 * Fetch the published catalogue and report what moved.
 *
 * refreshCatalog() answers "am I current?" with a version number, which tells an
 * offer author nothing. This says what actually changed since their session
 * started — prices, brands, descriptions, new items — so a check before quoting
 * is worth making. Read-only as far as the price list is concerned: it only
 * swaps what THIS browser quotes from.
 */
export async function checkCatalogUpdates(token: string | null): Promise<CatalogUpdate> {
  const none = (ok: boolean, changed = false): CatalogUpdate => ({
    ok, changed, version: loadedVersion, prices: 0, brands: 0, descriptions: 0, otherData: 0, added: 0, removed: 0,
  });
  try {
    const res = await fetch("/api/catalog/lv", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return none(false);
    const body = (await res.json()) as { source: string; version: number; data: CatalogPayload | null };
    if (!body?.data?.components?.length || body.source !== "db") return none(true);
    if (body.version === loadedVersion) return none(true);

    // Snapshot BEFORE installing — installCatalog replaces the array contents.
    // Rows without a part number are spacers: they cannot be matched between two
    // catalogues, so counting them would report the same "new items" every time.
    const wasList = [...COMPONENTS].filter((c) => c.ref);
    const was = new Map(wasList.map((c) => [c.ref, c]));
    const now = body.data.components.filter((c) => c.ref);

    let prices = 0, brands = 0, descriptions = 0, otherData = 0, added = 0;
    for (const c of now) {
      const b = was.get(c.ref);
      if (!b) { added++; continue; }
      if (Math.abs((b.eur || 0) - (c.eur || 0)) > 1e-9 || Math.abs((b.egp || 0) - (c.egp || 0)) > 1e-9) prices++;
      if (String(b.brand ?? "") !== String(c.brand ?? "")) brands++;
      if (String(b.d ?? "") !== String(c.d ?? "") || String(b.n ?? "") !== String(c.n ?? "")) descriptions++;
      if (
        String(b.t ?? "") !== String(c.t ?? "") || String(b.f ?? "") !== String(c.f ?? "") ||
        String(b.r ?? "") !== String(c.r ?? "") || (b.poles || 0) !== (c.poles || 0) ||
        Math.abs((b.cuP || 0) - (c.cuP || 0)) > 1e-9 || Math.abs((b.cuC || 0) - (c.cuC || 0)) > 1e-9 ||
        String(b.stock ?? "") !== String(c.stock ?? "")
      ) otherData++;
    }
    const nowRefs = new Set(now.map((c) => c.ref));
    const removed = wasList.filter((c) => !nowRefs.has(c.ref)).length;

    installCatalog(body.data, body.version);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ version: body.version, data: body.data }));
    } catch {
      /* quota — the app still works, it just re-fetches next time */
    }
    return { ok: true, changed: true, version: body.version, prices, brands, descriptions, otherData, added, removed };
  } catch {
    return none(false);
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
