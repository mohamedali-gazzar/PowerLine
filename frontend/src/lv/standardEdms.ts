// Standard LV EDMS panels — the house standard, transcribed from
// "Database/Standard LV EDMS.xlsx" (one sheet per transformer size).
//
// Picking TR kVA + P.F.C + Outgoings on a panel's "Standard Panels" view fills the
// whole panel from here: name, components, PLP cells and main-busbar copper.
//
// The workbook's "mm2" column is just the PLP C.S.A ladder (250→100, 400→300,
// 630→400, 800→500, 1000→600, 1250→800, 1600→1000), which csaFor() already knows,
// so only the LENGTHS are stored below — as the Copper Tool stores them: mm, per
// rating, split into phase / neutral / earth.
//
// Only four of the six P.F.C × Outgoings combinations are standardised (there is no
// "no P.F.C with outgoings" panel); stdPanel() returns undefined for the rest.

import { findByName } from "./catalog";
import { cellTable, type CellConfig } from "./cells";
import { copperTotal, type CopperTool } from "./copper";
import {
  DEFAULT_SECTIONS, toPanelComponent, freeComponent,
  type LvPanel, type PanelComponent,
} from "./store";

/** One line of a standard panel: how many, and the catalogue description.
 *  `poles` overrides the catalogue's pole count — connection copper is costed as
 *  cuC × poles, so a part the catalogue left at 0 poles would contribute none. */
interface StdPart { qty: number; desc: string; poles?: number }

export interface StdPanel {
  name: string;              // e.g. "MDB 630A+4SWF+15kVAR"
  ratingA: number;           // busbar / incomer rating
  pfcSection: string | null; // the P.F.C section's name, e.g. "P.F.C 15 kVAR"
  cells: Record<string, number>; // PLP cell width (mm) → qty; sides are always 1
  /** PLP depth in cm (70 or 90). Varies BY VARIANT, not by transformer size — the
   *  base panel of each large size is 900 deep while its other variants are 700. */
  depth: number;
  copper: CopperTool;        // rating → { p, n, e } lengths in mm
  main: StdPart[];           // Main Incoming
  pfc: StdPart[];            // the P.F.C section (empty when pfcSection is null)
  out: StdPart[];            // Outgoings
}

// ── Shared building blocks ──────────────────────────────────────────────────
/** The auxiliaries every standard panel's Main Incoming carries, after the incomer. */
const MAIN_AUX = (ctRatio: string): StdPart[] => [
  { qty: 1, desc: "Pilot Light Red LED 230V AC" },
  { qty: 1, desc: "Pilot Light Yellow LED 230V AC" },
  { qty: 1, desc: "Pilot Light Green LED 230V AC" },
  { qty: 3, desc: `Current Transformer (${ctRatio}) A` },
  { qty: 1, desc: "Digital Meter (V,I)" },
  { qty: 2, desc: "S201-C16 Miniature Circuit Breaker - 1P - C - 16 A - Icu 10kA" },
  { qty: 1, desc: "LV Socket 220V" },
  { qty: 1, desc: "LV LED Lamp, 220V" },
];
// The standard capacitor is the Frako part (it replaced the Hitachi one). The 500
// kVA sheet writes the "- 14.5kVAR @400V" suffix twice; that is the same single
// catalogue item, so the canonical name is used for all three sizes.
const PFC_CAPACITOR = "Capacitor 25 kVAR @ 525V - 14.5kVAR @400V";
/** A capacitor bank: its breaker, capacitors, and the cubicle's ventilation kit. */
const PFC_BANK = (breaker: string, caps: number): StdPart[] => [
  { qty: 1, desc: breaker },
  { qty: caps, desc: PFC_CAPACITOR },
  { qty: 1, desc: "Filter  25*25" },
  { qty: 1, desc: "Fan 25*25" },
  { qty: 1, desc: "Thermostat" },
];
/** Switch-fuse outgoings: each way is one switch fuse plus three HRC fuses.
 *  Poles are pinned at 3 deliberately. Connection copper is costed as cuC ×
 *  poles, and these rows were catalogued at 0 poles — which silently zeroed the
 *  whole section's copper. The catalogue is fixed, but a standard panel should
 *  not go back to costing nothing if that data ever regresses. */
const SWF_WAYS = (ways: number): StdPart[] => [
  { qty: ways, desc: "Switch Fuse 630A V", poles: 3 },
  { qty: ways * 3, desc: "HRC Fuse 400A" },
];

/** What each transformer size is built from — everything the four variants share. */
interface StdFamily {
  base: string;        // the panel name's stem, e.g. "MDB 630A"
  ratingA: number;
  incomer: string;
  ctRatio: string;
  kvar: number;        // the standard bank size for this TR
  pfcBreaker: string;
  pfcCaps: number;
  swfWays: number;     // outgoing ways in the SWF variant
  cbWays: number;      // outgoing ways in the C.B variant
  cbBreaker: string;
  /** The outgoing breaker's rating as it appears in the panel name. Not always
   *  250 A — from 1600 kVA up the standard uses 400 A ways. */
  cbRating: string;
}

const FAMILIES: Record<string, StdFamily> = {
  "300": {
    base: "MDB 630A", ratingA: 630,
    incomer: "MCCB XT5N 630A-36kA 630 AF Ekip Dip LS/i 3P", ctRatio: "800/5",
    kvar: 15, pfcBreaker: "MCCB A1N 40A-36kA 125 AF TMF 3P", pfcCaps: 1,
    swfWays: 4, cbWays: 4, cbBreaker: "MCCB XT4N 250A-36kA 250 AF TMA 3P", cbRating: "250A",
  },
  "500": {
    base: "MDB 1000A", ratingA: 1000,
    incomer: "ACB E1.2C 1000A-50kA 1000 AF Ekip Touch LI 3P F F", ctRatio: "1000/5",
    kvar: 25, pfcBreaker: "MCCB A1N 63A-36kA 125 AF TMF 3P", pfcCaps: 2,
    swfWays: 6, cbWays: 5, cbBreaker: "MCCB XT4N 250A-36kA 250 AF TMA 3P", cbRating: "250A",
  },
  "800": {
    base: "MDB 1600A", ratingA: 1600,
    incomer: "ACB E1.2C 1600A-50kA 1600 AF Ekip Touch LI 3P F F", ctRatio: "1600/5",
    kvar: 40, pfcBreaker: "MCCB XT1S 100A-50kA 160 AF TMD 3P", pfcCaps: 3,
    swfWays: 8, cbWays: 6, cbBreaker: "MCCB XT4S 250A-50kA 250 AF TMA 3P", cbRating: "250A",
  },
  "1000": {
    base: "MDB 2000A", ratingA: 2000,
    incomer: "ACB E2.2N 2000A-66kA 2000 AF Ekip Touch LI 3P FHR", ctRatio: "2000/5",
    kvar: 50, pfcBreaker: "MCCB XT1S 125A-50kA 160 AF TMD 3P", pfcCaps: 4,
    swfWays: 12, cbWays: 8, cbBreaker: "MCCB XT4S 250A-50kA 250 AF TMA 3P", cbRating: "250A",
  },
  "1600": {
    base: "MDB 3200A", ratingA: 3200,
    incomer: "ACB E4.2N 3200A-66kA 3200 AF Ekip Touch LI 3P FHR", ctRatio: "4000/5",
    kvar: 75, pfcBreaker: "MCCB XT4H 200A-70kA 250 AF TMA 3P", pfcCaps: 6,
    swfWays: 18, cbWays: 8, cbBreaker: "MCCB XT5H 400A-70kA 400 AF TMA 3P", cbRating: "400A",
  },
  "2000": {
    base: "MDB 4000A", ratingA: 4000,
    incomer: "ACB E4.2N 4000A-66kA 4000 AF Ekip Touch LI 3P FHR", ctRatio: "4000/5",
    kvar: 100, pfcBreaker: "MCCB XT4H 250A-70kA 250 AF TMA 3P", pfcCaps: 7,
    swfWays: 20, cbWays: 12, cbBreaker: "MCCB XT5H 400A-70kA 400 AF TMA 3P", cbRating: "400A",
  },
  "2500": {
    base: "MDB 5000A", ratingA: 5000,
    incomer: "ACB E6.2H 5000A-100kA 5000 AF Ekip Touch LI 3P FHR", ctRatio: "5000/5",
    kvar: 125, pfcBreaker: "MCCB XT5H 400A-70kA 400 AF TMA 3P", pfcCaps: 9,
    swfWays: 20, cbWays: 16, cbBreaker: "MCCB XT5H 400A-70kA 400 AF TMA 3P", cbRating: "400A",
  },
};

/** Cells and copper per variant — the only things that don't follow from the family.
 *  Keyed "<kva>|<pfc>|<outgoings>"; cells are PLP widths in mm. */
const VARIANTS: Record<string, { cells: Record<string, number>; depth?: number; copper: CopperTool }> = {
  // ── 300 kVA ──
  "300|No|None":   { cells: { 400: 1 },                 copper: { 250: { p: 0, n: 0, e: 400 },  400: { p: 0, n: 400, e: 0 } } },
  "300|Yes|None":  { cells: { 400: 1, 600: 1 },         copper: { 250: { p: 0, n: 0, e: 1000 }, 400: { p: 0, n: 400, e: 0 },  630: { p: 1000, n: 0, e: 0 } } },
  "300|Yes|SWF":   { cells: { 600: 3 },                 copper: { 250: { p: 0, n: 0, e: 1800 }, 400: { p: 0, n: 1200, e: 0 }, 630: { p: 2600, n: 0, e: 0 } } },
  "300|Yes|C.B":   { cells: { 400: 1, 600: 1, 800: 1 }, copper: { 250: { p: 0, n: 0, e: 1800 }, 400: { p: 0, n: 1800, e: 0 }, 630: { p: 1800, n: 0, e: 0 } } },
  // ── 500 kVA ──
  "500|No|None":   { cells: { 600: 1 },                 copper: { 400: { p: 0, n: 0, e: 600 },  630: { p: 0, n: 600, e: 0 } } },
  "500|Yes|None":  { cells: { 600: 2 },                 copper: { 400: { p: 0, n: 0, e: 1200 }, 630: { p: 0, n: 600, e: 0 },  1000: { p: 1200, n: 0, e: 0 } } },
  "500|Yes|SWF":   { cells: { 600: 1, 800: 2 },         copper: { 400: { p: 0, n: 0, e: 2200 }, 630: { p: 0, n: 1600, e: 0 }, 1000: { p: 3000, n: 0, e: 0 } } },
  "500|Yes|C.B":   { cells: { 600: 2, 1000: 1 },        copper: { 400: { p: 0, n: 0, e: 2200 }, 630: { p: 0, n: 2200, e: 0 }, 1000: { p: 2200, n: 0, e: 0 } } },
  // ── 800 kVA ──
  "800|No|None":   { cells: { 600: 1 },                 copper: { 400: { p: 0, n: 0, e: 600 },  1000: { p: 0, n: 600, e: 0 } } },
  "800|Yes|None":  { cells: { 600: 2 },                 copper: { 400: { p: 0, n: 0, e: 1200 }, 1000: { p: 0, n: 600, e: 0 },  1600: { p: 1200, n: 0, e: 0 } } },
  "800|Yes|SWF":   { cells: { 600: 1, 800: 1, 1000: 1 },copper: { 400: { p: 0, n: 0, e: 2400 }, 1000: { p: 0, n: 1800, e: 0 }, 1600: { p: 3200, n: 0, e: 0 } } },
  "800|Yes|C.B":   { cells: { 600: 4 },                 copper: { 400: { p: 0, n: 0, e: 2400 }, 1000: { p: 0, n: 1800, e: 0 }, 1600: { p: 2400, n: 0, e: 0 } } },
  // ── 1000 kVA ──
  "1000|No|None":  { cells: { 600: 1 }, depth: 90,        copper: { 400: { p: 0, n: 0, e: 600 },  1250: { p: 0, n: 600, e: 0 } } },
  "1000|Yes|None": { cells: { 600: 2 }, depth: 90,                 copper: { 400: { p: 0, n: 0, e: 1200 }, 1250: { p: 0, n: 600, e: 0 },  2000: { p: 1200, n: 0, e: 0 } } },
  "1000|Yes|SWF":  { cells: { 600: 1, 800: 3 }, depth: 90,         copper: { 400: { p: 0, n: 0, e: 3000 }, 1250: { p: 0, n: 2400, e: 0 }, 2000: { p: 3800, n: 0, e: 0 } } },
  "1000|Yes|C.B":  { cells: { 600: 2, 800: 2 }, depth: 90,         copper: { 400: { p: 0, n: 0, e: 2800 }, 1250: { p: 0, n: 2200, e: 0 }, 2000: { p: 2800, n: 0, e: 0 } } },
  // ── 1600 kVA ──
  "1600|No|None":  { cells: { 600: 1 }, depth: 90,        copper: { 800: { p: 0, n: 0, e: 600 },  2000: { p: 0, n: 600, e: 0 } } },
  "1600|Yes|None": { cells: { 600: 2 }, depth: 90,                 copper: { 800: { p: 0, n: 0, e: 1200 }, 2000: { p: 0, n: 600, e: 0 },  3200: { p: 1200, n: 0, e: 0 } } },
  "1600|Yes|SWF":  { cells: { 600: 2, 800: 2, 1000: 1 }, depth: 90,copper: { 800: { p: 0, n: 0, e: 3800 }, 2000: { p: 0, n: 3200, e: 0 }, 3200: { p: 4600, n: 0, e: 0 } } },
  "1600|Yes|C.B":  { cells: { 600: 2, 1000: 2 }, depth: 90,        copper: { 800: { p: 0, n: 0, e: 3200 }, 2000: { p: 0, n: 3200, e: 0 }, 3200: { p: 3200, n: 0, e: 0 } } },
  // ── 2000 kVA ──
  "2000|No|None":  { cells: { 600: 1 }, depth: 90,        copper: { 1000: { p: 0, n: 0, e: 600 },  2500: { p: 0, n: 600, e: 0 } } },
  "2000|Yes|None": { cells: { 600: 2 }, depth: 90,                 copper: { 1000: { p: 0, n: 0, e: 1200 }, 2500: { p: 0, n: 600, e: 0 },  4000: { p: 1200, n: 0, e: 0 } } },
  "2000|Yes|SWF":  { cells: { 600: 2, 800: 1, 1000: 2 }, depth: 90,copper: { 1000: { p: 0, n: 0, e: 4000 }, 2500: { p: 0, n: 3400, e: 0 }, 4000: { p: 4800, n: 0, e: 0 } } },
  "2000|Yes|C.B":  { cells: { 600: 2, 1000: 3 }, depth: 90,        copper: { 1000: { p: 0, n: 0, e: 4200 }, 2500: { p: 0, n: 4200, e: 0 }, 4000: { p: 4200, n: 0, e: 0 } } },
  // ── 2500 kVA ──
  "2500|No|None":  { cells: { 1000: 1 }, depth: 90,       copper: { 1250: { p: 0, n: 0, e: 1000 }, 3200: { p: 0, n: 1000, e: 0 } } },
  "2500|Yes|None": { cells: { 600: 1, 1000: 1 }, depth: 90,        copper: { 1250: { p: 0, n: 0, e: 1600 }, 3200: { p: 0, n: 1000, e: 0 }, 5000: { p: 1600, n: 0, e: 0 } } },
  "2500|Yes|SWF":  { cells: { 600: 1, 800: 1, 1000: 3 }, depth: 90,copper: { 1250: { p: 0, n: 0, e: 4400 }, 3200: { p: 0, n: 3800, e: 0 }, 5000: { p: 5200, n: 0, e: 0 } } },
  "2500|Yes|C.B":  { cells: { 600: 1, 1000: 4 }, depth: 90,        copper: { 1250: { p: 0, n: 0, e: 4600 }, 3200: { p: 0, n: 4600, e: 0 }, 5000: { p: 4600, n: 0, e: 0 } } },
};

/** The transformer sizes a standard panel exists for. */
export const STD_EDMS_KVA = Object.keys(FAMILIES);

/** The standard panel for a TR kVA / P.F.C / Outgoings choice, or undefined when
 *  that combination isn't standardised. */
export function stdPanel(kva: string, pfc: string, outgoings: string): StdPanel | undefined {
  const fam = FAMILIES[kva];
  const variant = VARIANTS[`${kva}|${pfc}|${outgoings}`];
  if (!fam || !variant) return undefined;
  const withPfc = pfc === "Yes";
  // The name reads incomer → outgoing ways → bank, e.g. "MDB 630A+4SWF+15kVAR".
  const ways =
    outgoings === "SWF" ? `+${fam.swfWays}SWF` :
    outgoings === "C.B" ? `+${fam.cbWays}*${fam.cbRating}` : "";
  const bank = withPfc ? `+${fam.kvar}kVAR` : "";
  return {
    name: `${fam.base}${ways}${bank}`,
    ratingA: fam.ratingA,
    pfcSection: withPfc ? `P.F.C ${fam.kvar} kVAR` : null,
    cells: variant.cells,
    depth: variant.depth ?? 70,
    copper: variant.copper,
    main: [{ qty: 1, desc: fam.incomer }, ...MAIN_AUX(fam.ctRatio)],
    pfc: withPfc ? PFC_BANK(fam.pfcBreaker, fam.pfcCaps) : [],
    out:
      outgoings === "SWF" ? SWF_WAYS(fam.swfWays) :
      outgoings === "C.B" ? [{ qty: fam.cbWays, desc: fam.cbBreaker }] : [],
  };
}

/** Resolve a standard part against the catalogue. A description with no catalogue
 *  match becomes a free line (the same fallback the combination builders use) so a
 *  missing part is visible on the panel instead of silently dropped. */
function partToComponent(part: StdPart, section: string): PanelComponent {
  const db = findByName(part.desc);
  const c = db
    ? toPanelComponent(db, section, part.qty)
    : freeComponent(part.desc, section, part.qty);
  return part.poles != null ? { ...c, poles: part.poles } : c;
}

/** The PLP cell table for a standard panel: the catalogue rows at its own depth,
 *  with this variant's quantities filled in. Sides stay locked at 1. */
function stdCellConfig(std: StdPanel): CellConfig {
  const rows = cellTable("PLP", std.depth, "1.5", "IP54").map((r) => {
    if (r.locked) return { ...r };
    // Rows are named "2000x<width>x700" — pull the width back out to look up the qty.
    const width = /^2000x(\d+)x/.exec(r.desc)?.[1] ?? "";
    return { ...r, qty: std.cells[width] ?? 0 };
  });
  return { type: "PLP", depth: std.depth, thickness: "1.5", ip: "IP54", rows };
}

/** Apply a standard panel to a panel: name, rating, components, PLP cells and
 *  copper. REPLACES the panel's components, cells and copper — everything the
 *  standard defines — while leaving the panel's own identity fields (fed from,
 *  quantity, project specs like ambient temp and copper type) untouched. */
export function applyStdPanel(p: LvPanel, std: StdPanel): LvPanel {
  const sections = [...DEFAULT_SECTIONS];
  if (std.pfcSection) {
    // P.F.C is its own cubicle beside Outgoings — the same position normalize()
    // puts it in, so loading the quotation back doesn't reshuffle the tabs.
    const oi = sections.indexOf("Outgoings");
    sections.splice(oi >= 0 ? oi + 1 : sections.length, 0, std.pfcSection);
  }
  const components: PanelComponent[] = [
    ...std.main.map((x) => partToComponent(x, "Main Incoming")),
    ...(std.pfcSection ? std.pfc.map((x) => partToComponent(x, std.pfcSection as string)) : []),
    ...std.out.map((x) => partToComponent(x, "Outgoings")),
  ];
  return {
    ...p,
    name: std.name,
    ratingA: std.ratingA,
    sections,
    activeSection: "Main Incoming",
    components,
    sizingMode: "cells",
    cellConfig: stdCellConfig(std),
    // The standard's copper is the whole main busbar, so the manual override and
    // the panels-mode auto rule must not also apply.
    copperTool: { ...std.copper },
    // The Copper Tool derives the busbar weight from its lengths on every edit;
    // do the same on apply (same rounding) so the panel cost is right immediately
    // instead of reading 0 KG until someone touches a length.
    mainBusbarKg: Math.round(copperTotal("PLP", std.copper) * 10) / 10,
    mainBusbarOverride: false,
  };
}
