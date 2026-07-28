// The rows the tool adds to the technical offer on your behalf — power-factor
// correction, the main incoming breaker, and the EEHC metering accessories.
//
// The original tool pushed these into the item list and then tried to unpick
// them again whenever a selection changed. Here they are derived from the
// selection instead, so they can never go stale or get orphaned.

import {
  CAP_STEP_RATED_525,
  MCCB_CATALOG,
  METERING_COMMON,
  type Brand,
} from "./data";
import {
  getMeteringForRating,
  getPfForRating,
  mainIncomingCatalogRow,
  mainIncomingId,
  pfEffectiveKvar,
  type MccbItem,
  type Selection,
  type Workspace,
} from "./engine";

const isTechnical = (sel: Selection) => sel.lvConfig === "inout" && sel.lvMode === "technical";

/** Power-factor rows: the protection breaker (takes width) + the bank itself (does not). */
export function pfRows(sel: Selection): MccbItem[] {
  if (!sel.includePf || !isTechnical(sel)) return [];
  const pf = getPfForRating(sel.trRating);
  if (!pf) return [];

  const model = sel.pfBrand === "ABB" ? pf.abbModel : pf.himelModel;
  const cat = MCCB_CATALOG.find((r) => r.brand === sel.pfBrand && r.model === model && r.amp === pf.mccbAmp);

  return [
    {
      id: "auto-pf-mccb",
      brand: sel.pfBrand,
      model,
      amp: pf.mccbAmp,
      sc: cat?.sc ?? "",
      trip: cat?.trip ?? pf.trip,
      qty: 1,
      isPf: true,
    },
    {
      id: "auto-pf-bank",
      brand: "—",
      model: `PF Capacitor ${pfEffectiveKvar(pf)} kVAr @400V (${pf.steps} × ${CAP_STEP_RATED_525} kVAr@525V)`,
      amp: "—",
      sc: "—",
      trip: `${pf.relay} relay · ${pf.contactors} contactors`,
      qty: 1,
      isPf: true,
      excludeFromSizing: true,
    },
  ];
}

/** The frame the power-factor breaker occupies when working in Sizing mode. */
export function pfSizingFrame(sel: Selection): string | null {
  if (!sel.includePf || sel.lvConfig !== "inout" || sel.lvMode !== "sizing") return null;
  const pf = getPfForRating(sel.trRating);
  if (!pf) return null;
  const frame = pf.abbModel.match(/^XT\d/);
  return frame ? frame[0].toLowerCase() : null;
}

export function mainIncomingRow(sel: Selection): MccbItem[] {
  const mainId = mainIncomingId(sel);
  if (!isTechnical(sel) || !mainId) return [];

  if (mainId.startsWith("xt")) {
    // The EEHC metering table names ABB models, so it sets the brand too.
    const row = mainIncomingCatalogRow(mainId, "ABB", sel.trRating);
    if (!row) return [];
    return [
      {
        id: "auto-main-incoming",
        brand: row.brand,
        model: row.model,
        amp: row.amp,
        sc: row.sc,
        trip: row.trip,
        qty: 1,
        isMainIncoming: true,
      },
    ];
  }

  // Emax frames have no catalogue part number here — carried as a size reference.
  const label = mainId === "emax12" ? "Emax 1.2" : mainId === "emax22" ? "Emax 2.2" : "Emax 4.2";
  const m = getMeteringForRating(sel.trRating);
  return [
    {
      id: "auto-main-incoming",
      brand: "ABB",
      model: label,
      amp: m?.amp ?? "—",
      sc: "—",
      trip: m?.trip ?? "—",
      qty: 1,
      isMainIncoming: true,
    },
  ];
}

/** The fixed EEHC metering kit that ships with every incoming panel. */
export function meteringAccessoryRows(sel: Selection): MccbItem[] {
  if (!isTechnical(sel)) return [];
  const m = getMeteringForRating(sel.trRating);
  if (!m) return [];

  const c = METERING_COMMON;
  const accessories: { name: string; qty: number }[] = [
    { name: `CT ${m.ct.replace(/^3\s*×\s*CT\s*/, "")}`, qty: 3 },
    { name: "Digital Ammeter", qty: c.ammeters },
    { name: "Digital Voltmeter", qty: c.voltmeter },
    { name: `Voltmeter Selector Switch (${c.voltSelector})`, qty: 1 },
    { name: `Ammeter Selector Switch (${c.ampSelector})`, qty: 1 },
    { name: `Indication Lamps (${c.lamps})`, qty: 1 },
    { name: "Socket 220V", qty: 1 },
    { name: "MCB S201-C16", qty: 1 },
  ];

  return accessories.map((a, i) => ({
    id: `auto-metering-${i}`,
    brand: "—",
    model: a.name,
    amp: "—",
    sc: "—",
    trip: "—",
    qty: a.qty,
    isMetering: true,
    isMeteringAccessory: true,
    excludeFromSizing: true,
  }));
}

/** Auto rows first, then whatever the engineer added by hand. */
export function allBomRows(ws: Workspace): MccbItem[] {
  const { sel } = ws;
  if (!isTechnical(sel)) return [];
  return [...mainIncomingRow(sel), ...meteringAccessoryRows(sel), ...pfRows(sel), ...ws.mccbItems];
}

/** Auto rows are locked — their quantity follows the selection, not a button. */
export const isAutoRow = (item: MccbItem) => item.id.startsWith("auto-");

export const brandOptions: Brand[] = ["ABB", "Himel"];
