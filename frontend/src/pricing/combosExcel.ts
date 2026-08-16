// Reads the engineers' own "Combinations Database - *.xlsx" workbooks and turns
// them into the sections of combos.json, so the workbook stays the single
// reference and nobody has to convert it by hand first.
//
// The workbook is opened here in the browser, exactly like the price-list import
// (LvExcelImport.tsx) — the server only ever receives finished JSON.
//
// One workbook can carry more than one section: the MCC, ATS and photocell files
// each also contain the same "WD" tab, so loading any of them refreshes the
// withdrawable kits too.
//
// FOUR TRAPS THAT COST REAL TIME, DO NOT "TIDY" THEM AWAY
//  1. Excel writes a NON-BREAKING SPACE (character 160) inside values such as
//     "0.06 kW". Any text compared against another string must be flattened with
//     the whitespace flattener below first, or absolutely nothing matches.
//  2. The ATS tabs are a matrix: parts run down, breaker frames run across in
//     SEPARATE column blocks, each block with its own QTY column, and the blocks
//     are NOT the same on the two tabs. They must be read, never hardcoded.
//  3. The photocell tab carries two wordings per row. "DESCRIPTION" is the
//     wording used on the offer, "PL Description" is the price-list wording, and
//     it is the price-list one that combos.json stores.
//  4. MCC parts are written "Contactor# AF09-30-10-13". That prefix is a marker
//     the app relies on, and is kept exactly as it is.
//
// Where a workbook says something the app cannot store faithfully, this file
// REFUSES the upload with a plain-English reason rather than saving a version
// that quietly drops rows the configurator needs. See "Refusals" near the bottom.

import * as XLSX from "xlsx";

/** One section of combos.json, ready to hand to api.pricing.lvComboSave. */
export interface ParsedComboSection {
  section: string;
  value: unknown;
}

type Row = unknown[];
type Rows = Row[];

/** Trap 1 — collapse every kind of blank (incl. character 160) to one space. */
const flat = (v: unknown): string =>
  (v === null || v === undefined ? "" : String(v)).replace(/[\u00a0\s]+/g, " ").trim();

/** Same, lower-cased: the form used for every lookup and comparison. */
const normKey = (v: unknown): string => flat(v).toLowerCase();

/** Character 160 -> plain space, ends trimmed, INNER spacing left alone. Used for
 *  values that must survive verbatim (see the photocell notes below). */
const clean = (v: unknown): string =>
  (v === null || v === undefined ? "" : String(v)).replace(/\u00a0/g, " ").trim();

const isBlank = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === "";

/** A cell holding a plain number, or a number written as text. */
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.trim()))) return Number(v.trim());
  return null;
};

// ═══════════════════════════════════════════════════════════════════════════
// MCC — sheet "MCC"
// ═══════════════════════════════════════════════════════════════════════════
//
// Layout, verified against the real file (A1:L134):
//   cols A..C  rows 1..24    the picker legend. Not data.
//   col  F     rows 2..111   the starter key, "DOL-3Ph-0.06 kW-Type 1"
//   cols G..L  same rows     that starter's parts, left to right, blanks at the
//                            end (DOL fills G..J, Star-Delta fills G..L)
//   rows 114..134            the control-accessory block, marked "CONTROL ACC."
//                            in col A: B = group, C = qty, D = description
//
// The control parts are the thing that is easy to miss: they are NOT beside the
// starters, they sit in their own block at the bottom left of the same tab.
//
// Starters come out in the order the tab lists them. The version shipped with
// the app keeps one of them (7.5 kW type 2) in an older place, left over from
// before the tab was re-sorted, so a freshly loaded file is not character-for-
// character identical to it. Same 110 starters with the same parts either way,
// and every drop-down comes out in the same order — checked, both ways round.

interface MccCombo {
  kind: string;
  kw: string;
  type: number;
  parts: string[];
}
interface QtyDesc {
  qty: number;
  desc: string;
}

const MCC_KEY_COL = 5; // F
const MCC_PART_COL_FROM = 6; // G onward
const MCC_CTRL_MARK_COL = 0; // A — "CONTROL ACC."
const MCC_CTRL_GROUP_COL = 1; // B — "DOL" / "Star Delta"
const MCC_CTRL_QTY_COL = 2; // C
const MCC_CTRL_DESC_COL = 3; // D

// The workbook quotes the CATALOGUE wording; combos.json carries the shorter
// wording used on the offer. Two of them cannot be derived from the text at all,
// so they are a fixed pair — the exact opposite of MCC_ALIAS in lv/combos.ts,
// which the app uses in the other direction to price these same two parts. If
// one side is ever edited the other must be edited with it.
const MCC_CATALOGUE_TO_TEMPLATE: Record<string, string> = {
  "SK1-11 Signaling Contact": "SK1-11 Signal contact",
  "CAL4-11 Auxiliary Contact Block - Side (AF09..96)": "CAL4-11 (1 N.O+1 N.C) - Side",
};

/** Only the "DOL" control group is stored. The workbook's "Star Delta" group is
 *  the same ten lines plus a CT-ERC.12 ON-delay timer, and the app adds that
 *  timer itself for star-delta starters — storing it here would fit it twice. */
const MCC_CONTROL_GROUP = "dol";

/** One part cell -> the wording combos.json stores. */
function mccPartText(raw: unknown): string {
  const s = flat(raw);
  if (!s) return "";
  const fixed = MCC_CATALOGUE_TO_TEMPLATE[s];
  if (fixed) return fixed;

  // Contactor: the type code is inside the trailing brackets. Trap 4 — the
  // "Contactor# " marker in front of it is deliberate and must stay.
  const con = /^3P-CONTACTOR\b.*\(([^()]+)\)\s*$/i.exec(s);
  if (con) return `Contactor# ${con[1].trim()}`;

  // Manual motor starter: keep the model, drop the trip-class/current tail. That
  // also fixes MS165's lower-case "Manual motor starter" spelling for free.
  const mms = /^(MS\d+-[\d.]+)\s+Manual\s+motor\s+starter\b/i.exec(s);
  if (mms) return `${mms[1]} Manual Motor Starter`;

  return s;
}

/** "DOL-3Ph-0.06 kW-Type 1" -> kind / kW / type. The first group is greedy on
 *  purpose so the dash inside "DOL-3Ph" and the space inside "Star Delta" both
 *  survive into `kind`. */
function mccSplitKey(raw: unknown): { kind: string; kw: string; type: number } | null {
  const m = /^(.+)-(\S+\s*kW)-Type\s*(\d+)$/i.exec(flat(raw));
  return m ? { kind: m[1].trim(), kw: flat(m[2]), type: parseInt(m[3], 10) } : null;
}

function parseMcc(rows: Rows): { combos: MccCombo[]; control: QtyDesc[] } {
  const combos: MccCombo[] = [];
  for (const row of rows) {
    if (!row) continue;
    const key = mccSplitKey(row[MCC_KEY_COL]);
    if (!key) continue;
    const parts: string[] = [];
    for (let c = MCC_PART_COL_FROM; c < row.length; c++) {
      const p = mccPartText(row[c]);
      if (p) parts.push(p);
    }
    if (!parts.length) continue;
    combos.push({ kind: key.kind, kw: key.kw, type: key.type, parts });
  }

  const control: QtyDesc[] = [];
  let inBlock = false;
  for (const row of rows) {
    if (!row) continue;
    if (flat(row[MCC_CTRL_MARK_COL]).toUpperCase().startsWith("CONTROL ACC")) inBlock = true;
    if (!inBlock) continue;
    const group = normKey(row[MCC_CTRL_GROUP_COL]);
    const desc = flat(row[MCC_CTRL_DESC_COL]);
    const qty = Number(row[MCC_CTRL_QTY_COL]);
    if (!group || !desc || !Number.isFinite(qty)) continue;
    if (group !== MCC_CONTROL_GROUP) continue;
    control.push({ qty, desc });
  }

  return { combos, control };
}

// ═══════════════════════════════════════════════════════════════════════════
// ATS — sheets "ATS 1 out of 2" and "ATS 2 out of 3"
// ═══════════════════════════════════════════════════════════════════════════
//
// Trap 2 in full. The header row is the one holding the word "QTY", and it holds
// it once per column block. A block is that QTY column plus the frame columns to
// its right, up to the next blank column or the next QTY:
//     1 out of 2 : 3 blocks — [XT1..XT6] [XT7] [E1.2 E2.2 E4.2 E6.2]
//     2 out of 3 : 4 blocks — [XT1..XT6] [XT7] [E1.2] [E2.2 E4.2 E6.2]
// Assuming three blocks silently mis-reads the 2-out-of-3 air breakers.
//
// A row is a SECTION LABEL rather than a part when its QTY cell is empty AND the
// same text fills every frame column of its block. That single rule is what
// tells the 2-out-of-3 "Mecanical Interlock" heading (fills all three E-frame
// columns) apart from the 1-out-of-2 part "Support F/FP Type A,B,D E2.2...E6.2",
// which also has an empty QTY but fills only three of its block's four columns.
// An empty QTY on a real part means one.

interface AtsGroup {
  group: string;
  items: QtyDesc[];
}
type AtsType = Record<string, AtsGroup[]>;

/** The tab spells this section "Mecanical Interlock" everywhere except one
 *  column. The app has always used the correct spelling. */
const ATS_GROUP_FIX: Record<string, string> = {
  "mecanical interlock": "Mechanical Interlock",
};

// Price-list wording (what the tab prints) -> the wording the app stores and puts
// on the offer. Twenty-two of these are the exact opposite of
// ATS_ACCESSORY_ALIAS in lv/combos.ts, which the app uses in the other direction
// to find the price. The last three have no entry there and were matched against
// the app's own data. Anything not listed here is carried across unchanged —
// including the "C.B (1)" placeholders, which the app replaces with whichever
// breaker the user picks.
const ATS_DESC_MAP_RAW: Record<string, string> = {
  "MOD XT1-XT3 220...250V ac/dc": "MOD - Motor Operator with Direct Action 220...250V ac/dc- XT1-XT3",
  "MIR-HR XT1..XT4": "MIR-H - Frame unit horizontal interlock- XT1..XT4",
  "MIR-P x XT1 F": "MIR-P - Mechanical Interlock plate for- XT1 Fixed",
  "MOE XT2-XT4 220...250V ac/dc": "MOE - Stored energy motor operator 220…250Vac/dc- XT2-XT4 F/P/W*",
  "MIR-P x XT2 F": "MIR-P - Mechanical Interlock plate- XT2 Fixed",
  "MIR-P x XT3 F": "MIR-P - Mechanical Interlock plate for- XT3 Fixed",
  "MIR-P x XT4 F": "Plate for mechanical interlock of XT4 F",
  "MOE XT5 220...250V AC/DC": "MOE (Stored Energy Motor Operator) 220-250Vac/dc-XT5",
  "MIR-H XT5 MECH,LOCK REAR HO. 2 C.BREAKER": "MIR-H XT5 Chassis for interlocking between XT4-XT5 & XT5-XT5",
  "MIR-P x XT5 F": "Plate for mechanical interlock of XT5 F with XT5 F",
  "MOE XT6 220...250V AC/DC": "MOE (Stored Energy Motor Operator) 220-250Vac/dc-XT6",
  "MIR-H XT6 MECH,LOCK REAR HO. 2 C.BREAKER": "MIR-H XT6 Chassis for interlocking between XT5-XT6 & XT6-XT6",
  "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC": "YU (Under Voltage Release Uncabled) 220-240Vac/Vdc-XT7-XT7M-E1.2…E6.2",
  "YC E1.2..E6.2-XT7M 220-240 VAC/DC": "YC - Shunt Closing release Uncabled 220-240 Vac/dc- XT7-XT7M-E1.2..E6.2",
  "AUX 4Q 400V E1.2-XT7-XT7M": "AUX 4Q (Aux. Contact Uncabled) 400Vac-4 Op/Cls C/O-XT7-XT7M-E1.2 F/W",
  "M XT7M 220-250 V AC/DC": "M (Spring Charging Motor Operator) 220-250 Vac/dc-XT7M",
  "Cable interlock A - HR E1.2..E6.2-XT7/M":
    "Cables for mechanical interlock Type A horizontal- XT7-E1.2...E6.2 [Group 1]",
  "Support fixed Type A E1.2-XT7/M floor mount": "Sup. fixed Type A E1.2-XT7/M floor mount",
  "M  E1.2 220-250 VAC/DC": "M - Motor operator 220-250 Vac/dc- E1.2",
  "M  E2.2...E6.2 220-250 VAC/DC": "M - Motor operator 220-250 Vac/dc- E2.2...E6.2",
  "Lever interlock E2.2":
    "Lever for mechanical interlock of fixed circuit-breaker or mobile part- E2.2 3P[Group 2]*",
  "Lever interlock E4.2":
    "Lever for mechanical interlock of fixed circuit-breaker or mobile part- E4.2 3P [Group 2]*",
  // No entry in ATS_ACCESSORY_ALIAS — the alias table points the stored wording at
  // the cabled "-C" variants while the tab quotes the plain part. Both exist in
  // the price list as separate items, so these three are listed here explicitly.
  "UVR XT1..XT4 220-240Vac-220-250Vdc": "UVR - Under Voltage Release Uncabled 220-240Vac-220-250Vdc- XT1..XT4 F/P",
  "YU XT5-XT6 220..240 Vac - 220..250 Vdc": "YU (Under Voltage Release Uncabled) 220-240Vac -220-250Vdc-XT5-XT6 F/P",
  "MIR-P x XT6 F": "MIR-P x XT6 F, Rear mechanical interlock Chassis Plate for XT6 Fixed",
};
const ATS_DESC_MAP = new Map<string, string>();
for (const k of Object.keys(ATS_DESC_MAP_RAW)) ATS_DESC_MAP.set(normKey(k), ATS_DESC_MAP_RAW[k]);
const atsMapDesc = (raw: unknown): string => ATS_DESC_MAP.get(normKey(raw)) ?? flat(raw);

/** Belt and braces beside the "fills the whole block" rule: a row with no QTY
 *  saying one of these is a heading even if a column happens to be empty. */
const ATS_GROUP_LABEL_RE =
  /^(source\s*\(\s*\d+\s*\)|bus\s*coupler|mec?hanical\s+interlock|control\s+circuit\s*&\s*acc\.?)$/i;

/** "ATS 2 out of 3" -> "2oo3". */
function atsTypeOf(sheetName: string): string | null {
  const m = /(\d+)\s*out\s*of\s*(\d+)/i.exec(flat(sheetName));
  return m ? `${m[1]}oo${m[2]}` : null;
}

function atsReadBlocks(rows: Rows): { headerRow: number; blocks: { qtyCol: number; frames: { col: number; frame: string }[] }[] } {
  const headerRow = rows.findIndex((r) => Array.isArray(r) && flat(r[0]).toUpperCase() === "QTY");
  if (headerRow < 0) throw new Error('An ATS tab has no header row — the word "QTY" was not found in its first column.');
  const h = rows[headerRow];
  const blocks: { qtyCol: number; frames: { col: number; frame: string }[] }[] = [];
  for (let c = 0; c < h.length; c++) {
    if (flat(h[c]).toUpperCase() !== "QTY") continue;
    const frames: { col: number; frame: string }[] = [];
    for (let d = c + 1; d < h.length; d++) {
      const label = flat(h[d]);
      if (!label || label.toUpperCase() === "QTY") break;
      frames.push({ col: d, frame: label.replace(/^ATS\s*/i, "") });
    }
    if (frames.length) blocks.push({ qtyCol: c, frames });
  }
  return { headerRow, blocks };
}

function parseAtsSheet(rows: Rows): AtsType {
  const { headerRow, blocks } = atsReadBlocks(rows);
  const out: AtsType = {};
  for (const b of blocks) {
    for (const f of b.frames) {
      const groups: AtsGroup[] = [];
      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const text = flat(row[f.col]);
        if (!text) continue;
        const qRaw = row[b.qtyCol];
        const qtyBlank = qRaw === null || qRaw === undefined || flat(qRaw) === "";
        const fillsBlock = b.frames.every((g) => flat(row[g.col]) !== "");
        if (qtyBlank && (fillsBlock || ATS_GROUP_LABEL_RE.test(text))) {
          groups.push({ group: ATS_GROUP_FIX[normKey(text)] ?? text, items: [] });
          continue;
        }
        if (!groups.length) groups.push({ group: "(ungrouped)", items: [] });
        groups[groups.length - 1].items.push({ qty: qtyBlank ? 1 : Number(qRaw), desc: atsMapDesc(text) });
      }
      // A heading with no parts in this particular column is not a group at all —
      // that is how the smaller frames end up with four sections and the big ones
      // with five.
      out[f.frame] = groups.filter((g) => g.items.length);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Photocell — sheet "Photocell"
// ═══════════════════════════════════════════════════════════════════════════
//
// Two blocks share the same three columns with different meanings:
//   rows 1..19   the ratings: Rating of CB | DESCRIPTION | PL Description | Aux
//   rows 24..33  the parts list: qty | description | note
// The ratings must be read as one unbroken run and stopped at the first gap. The
// parts block starts with a row whose first cell is ALSO a number, so scanning
// the whole tab invents an extra 1 A rating that does not exist.
//
// Trap 3: the stored contactor is the "PL Description" column, not "DESCRIPTION".
//
// The seven parts that never change are found by the word "fixed" in the note
// column rather than by row number, so the block can move down the tab without
// breaking this. The other two notes say the part depends on the chosen breaker.
//
// Values here are trimmed but NOT flattened: the price-list wording contains
// deliberate double spaces ("3P-CONTACTOR  9A @ AC3  25A@AC1 …") that the app
// stores exactly as written, while every cell also carries trailing spaces it
// must not keep.

interface PhotocellRating {
  a: number;
  contactor: string;
  aux: string;
}

function parsePhotocell(rows: Rows): { ratings: PhotocellRating[]; fixed: QtyDesc[] } {
  // Columns are found by their heading, never by position: this tab starts at
  // column E, so the first cell of each row is E and not A.
  let hdr = -1;
  let cRating = -1;
  let cPl = -1;
  let cAux = -1;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const rating = row.findIndex((c) => normKey(c) === "rating of cb");
    const pl = row.findIndex((c) => normKey(c) === "pl description");
    const aux = row.findIndex((c) => normKey(c) === "aux contactor");
    if (rating !== -1 && pl !== -1 && aux !== -1) {
      hdr = r;
      cRating = rating;
      cPl = pl;
      cAux = aux;
      break;
    }
  }
  if (hdr === -1) {
    throw new Error(
      'The Photocell tab has no heading row — "Rating of CB", "PL Description" and "Aux Contactor" were all expected on the same line.',
    );
  }

  const ratings: PhotocellRating[] = [];
  let r = hdr + 1;
  for (; r < rows.length; r++) {
    const row = rows[r] || [];
    const a = num(row[cRating]);
    if (a === null || isBlank(row[cPl])) break; // the first gap ends the ratings
    ratings.push({ a, contactor: clean(row[cPl]), aux: clean(row[cAux]) });
  }

  const fixed: QtyDesc[] = [];
  for (let i = r; i < rows.length; i++) {
    const row = rows[i] || [];
    const mark = row.findIndex((c) => normKey(c) === "fixed");
    if (mark === -1) continue;
    const desc = clean(row[mark - 1]);
    let qty = num(row[mark - 2]);
    if (qty === null) {
      for (let c = 0; c < mark - 1; c++) {
        const n = num(row[c]);
        if (n !== null) {
          qty = n;
          break;
        }
      }
    }
    if (desc === "") continue;
    fixed.push({ qty: qty === null ? 1 : qty, desc });
  }

  return { ratings, fixed };
}

// ═══════════════════════════════════════════════════════════════════════════
// WD — sheet "WD" (withdrawable kits)
// ═══════════════════════════════════════════════════════════════════════════
//
// A stack of blocks, four rows each, labelled down the first column:
//     <heading>              "MCCB-3P" / "MCCB-4P" / "Air-3P"
//     (blank) | frame keys   "XT2-3P-WD", "XT5-400-3P-WD", …
//     "CB"    | (always empty)
//     "FP"    | the fixed parts
//     "MP"    | the moving parts
//
// Two things only the heading can tell you:
//  • the poles. "Air-3P" becomes "3P-Air", which is the only way the app can
//    tell an air breaker kit from a moulded-case one — the frame key itself says
//    only "3P".
//  • that the air block exists at all. It is one column wide, its CB/FP labels
//    are empty and it has no MP row, so roles are taken from the row position
//    whenever the label cell is blank. A missing MP row stores an empty text,
//    which is correct: that breaker has a fixed part and no moving-part kit.
//
// Trap 1 bites hardest here — every 4-pole value carries 39 trailing spaces.

interface WdEntry {
  frame: string;
  poles: string;
  fp: string;
  mp: string;
}

const WD_HEADER_RE = /^(.+)-(\d+P)$/i;
const WD_KEY_RE = /-WD$/i;
const WD_ROLE_BY_OFFSET: Record<number, string> = { 1: "CB", 2: "FP", 3: "MP" };

function parseWd(rows: Rows): { wd: WdEntry[]; headings: string[] } {
  const cell = (r: number, c: number) => flat((rows[r] || [])[c]);
  const rowIsEmpty = (r: number) => (rows[r] || []).every((v) => flat(v) === "");

  // A frame-key row: nothing in the label column, at least one "*-WD" to its right.
  const keyRows: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r] || [];
    const hasKey = cells.some((v, c) => c > 0 && WD_KEY_RE.test(flat(v)));
    if (hasKey && cell(r, 0) === "") keyRows.push(r);
  }

  const out: WdEntry[] = [];
  const headings: string[] = [];

  keyRows.forEach((kr, blockIdx) => {
    const heading = cell(kr - 1, 0);
    const m = WD_HEADER_RE.exec(heading);
    if (!m) {
      // Skipping the block would quietly delete six kits from the app, so this
      // stops the whole upload instead.
      throw new Error(
        `The WD tab has a block whose heading reads "${heading || "(empty)"}". It should read like "MCCB-3P" or "Air-3P" — the pole count and the breaker type are taken from it.`,
      );
    }
    const type = m[1].trim(); // "MCCB" | "Air"
    const headingPoles = m[2].toUpperCase(); // "3P" | "4P"
    headings.push(heading);
    const poles = /^MCCB$/i.test(type) ? headingPoles : `${headingPoles}-${type}`;

    const nextKr = keyRows[blockIdx + 1];
    const hardEnd = nextKr === undefined ? rows.length - 1 : nextKr - 2;
    const end = Math.min(kr + 3, hardEnd);

    const byRole: Record<string, number> = {};
    for (let r = kr + 1; r <= end; r++) {
      if (rowIsEmpty(r) && !WD_ROLE_BY_OFFSET[r - kr]) continue;
      const label = cell(r, 0).toUpperCase();
      // Use the label when the block has one; fall back to the row's position in
      // the block when it does not (the air block ships without labels).
      const role = WD_ROLE_BY_OFFSET[r - kr] && (label === "" ? WD_ROLE_BY_OFFSET[r - kr] : label);
      if (role === "FP" || role === "MP") byRole[role] = r;
    }

    const keyCells = rows[kr] || [];
    for (let c = 1; c < keyCells.length; c++) {
      const k = flat(keyCells[c]);
      if (!k || !WD_KEY_RE.test(k)) continue;
      // "XT5-400-3P-WD" -> "XT5-400": the 400/630 band is part of the frame name
      // and stays, only the "-WD" and the pole count come off.
      const noWd = k.replace(/-WD$/i, "");
      const pm = /-(\d+P)$/i.exec(noWd);
      const frame = pm ? noWd.slice(0, noWd.length - pm[0].length) : noWd;
      out.push({
        frame,
        poles,
        fp: byRole.FP === undefined ? "" : cell(byRole.FP, c),
        mp: byRole.MP === undefined ? "" : cell(byRole.MP, c),
      });
    }
  });

  return { wd: out, headings };
}

// ═══════════════════════════════════════════════════════════════════════════
// Which workbook is this?
// ═══════════════════════════════════════════════════════════════════════════

const isMccSheet = (n: string) => normKey(n) === "mcc";
const isPhotocellSheet = (n: string) => normKey(n).includes("photocell");
const isWdSheet = (n: string) => normKey(n) === "wd";
const isAtsSheet = (n: string) => /^ats\b/.test(normKey(n)) && atsTypeOf(n) !== null;
/** "PFC", "P.F.C", "P F C" — the power-factor workbook. */
const isPfcSheet = (n: string) => normKey(n).replace(/[^a-z]/g, "") === "pfc";

/** The two ATS arrangements the app offers. A workbook that carries only one of
 *  them would wipe the other on save, so both are required — see "Refusals". */
const ATS_REQUIRED_TYPES = ["1oo2", "2oo3"] as const;
const ATS_TYPE_WORDS: Record<string, string> = { "1oo2": "1 out of 2", "2oo3": "2 out of 3" };

/**
 * Read one of the engineers' combinations workbooks.
 *
 * Returns one entry per section the file could fill in — an MCC, ATS or
 * photocell workbook also refreshes the withdrawable kits, because all three
 * carry the same WD tab.
 *
 * Throws an Error written for a non-programmer when the file is not one of them,
 * or when it is one of them but is missing something the app needs.
 */
export async function parseCombosWorkbook(file: File): Promise<ParsedComboSection[]> {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  } catch {
    throw new Error(`"${file.name}" could not be opened as an Excel file. Save it as .xlsx and try again.`);
  }

  const names = wb.SheetNames;
  const rowsOf = (name: string): Rows =>
    XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null }) as Rows;

  const mccSheet = names.find(isMccSheet);
  const photocellSheet = names.find(isPhotocellSheet);
  const wdSheet = names.find(isWdSheet);
  const atsSheets = names.filter(isAtsSheet);

  const recognised = Boolean(mccSheet || photocellSheet || wdSheet || atsSheets.length);

  // ── Refusals ────────────────────────────────────────────────────────────
  // Each of these stops the upload rather than saving something the app would
  // read as "that option no longer exists".

  if (!recognised && names.some(isPfcSheet)) {
    throw new Error(
      "There is nothing to load from the power-factor-correction workbook. The app works the capacitor bank out for itself from the kVAR and the number of steps, so it does not keep a parts list for it. Load the MCC, ATS, photocell or WD workbook instead.",
    );
  }

  if (!recognised) {
    throw new Error(
      `"${file.name}" is not one of the combinations workbooks. It should contain a tab called MCC, Photocell or WD, or tabs called "ATS 1 out of 2" and "ATS 2 out of 3". This file has: ${names.join(", ") || "no tabs at all"}.`,
    );
  }

  const out: ParsedComboSection[] = [];

  if (atsSheets.length) {
    const ats: Record<string, AtsType> = {};
    for (const name of atsSheets) {
      const type = atsTypeOf(name);
      if (type) ats[type] = parseAtsSheet(rowsOf(name));
    }
    const missing = ATS_REQUIRED_TYPES.filter((t) => !ats[t]);
    if (missing.length) {
      throw new Error(
        `The ATS workbook is missing the "${missing.map((t) => ATS_TYPE_WORDS[t]).join('" and "')}" tab. Loading it would take that arrangement out of the app, so nothing was changed. Use the full ATS workbook.`,
      );
    }
    out.push({ section: "ats", value: ats });
  }

  if (photocellSheet) out.push({ section: "photocell", value: parsePhotocell(rowsOf(photocellSheet)) });
  if (mccSheet) out.push({ section: "mcc", value: parseMcc(rowsOf(mccSheet)) });

  if (wdSheet) {
    const { wd, headings } = parseWd(rowsOf(wdSheet));
    // The stand-alone "Combinations Database - WD.xlsx" stops after the two MCCB
    // blocks and has no air-breaker block, so loading it would take the E1.2
    // withdrawable kit out of the app without saying so. The same tab inside the
    // MCC, ATS and photocell workbooks is complete.
    if (!headings.some((h) => !/^MCCB-/i.test(h))) {
      throw new Error(
        "The WD tab in this file stops after the two MCCB blocks — the air circuit breaker block (E1.2) is missing, and loading it would take the E1.2 withdrawable kit out of the app. Nothing was changed. Use the WD tab inside the MCC, ATS or photocell workbook, which has all three blocks.",
      );
    }
    out.push({ section: "wd", value: wd });
  }

  return out;
}
