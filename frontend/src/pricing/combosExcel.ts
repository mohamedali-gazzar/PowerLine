// Reads the engineers' own "Combinations Database - *.xlsx" workbooks and turns
// them into the sections of combos.json, so the workbook stays the single
// reference and nobody has to convert it by hand first.
//
// The workbook is opened here in the browser, exactly like the price-list import
// (LvExcelImport.tsx) — the server only ever receives finished JSON.
//
// One workbook CAN carry more than one section, and the engineers' own MCC, ATS
// and photocell files do: each of them repeats the same "WD" tab, so loading any
// of the three also refreshes the withdrawable kits. That is their file and this
// reader keeps accepting it exactly as it is.
//
// What the app itself HANDS BACK is one file per combination — see the long note
// above `buildSectionWorkbook` for why those do not repeat the WD tab.
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

/** The three blocks a WD tab has to carry. Each one is the ONLY source of one of
 *  the groups the app files a kit under — "3P", "4P" and "3P-Air" — so a tab
 *  missing a block is a tab that would empty that group on save. */
const WD_REQUIRED_BLOCKS: { heading: string; words: string }[] = [
  { heading: "MCCB-3P", words: "the 3-pole moulded-case block (MCCB-3P)" },
  { heading: "MCCB-4P", words: "the 4-pole moulded-case block (MCCB-4P)" },
  { heading: "Air-3P", words: "the air circuit-breaker block (Air-3P — the E1.2 kit)" },
];

/** Which of those blocks a WD tab does NOT have. This judges the FILE and never
 *  how it arrived: a complete WD tab is complete whether it came on its own or
 *  inside the MCC workbook, and an incomplete one is incomplete either way. */
function missingWdBlocks(headings: string[]): string[] {
  const have = new Set(headings.map((h) => normKey(h)));
  return WD_REQUIRED_BLOCKS.filter((b) => !have.has(normKey(b.heading))).map((b) => b.words);
}

/** "a", "a and b", "a, b and c" — these go into a sentence, not a list. */
const andList = (xs: string[]): string =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

// ── Motorized breaker ────────────────────────────────────────────────────────
// One tab, laid out as one COLUMN per breaker frame: the top cell is the frame
// (e.g. "XT1/XT3", "E1.2", "E2.2 - E6.2") and the cells beneath it are that
// frame's parts, in order, down to the first empty cell. Read verbatim (`clean`
// keeps inner spacing) so the descriptions still match the price list.
//
// The value is exactly the app's `motorized` shape: { [frame]: string[] }.
function parseMotorized(rows: Rows): Record<string, string[]> {
  const header = rows[0] ?? [];
  const out: Record<string, string[]> = {};
  for (let c = 0; c < header.length; c++) {
    const frame = clean(header[c]);
    if (!frame) continue; // a column with no frame heading is not a frame
    const parts: string[] = [];
    for (let r = 1; r < rows.length; r++) {
      const v = clean(rows[r]?.[c]);
      if (v) parts.push(v);
    }
    if (parts.length) out[frame] = parts;
  }
  return out;
}

// ── P.F.C (power-factor correction) ──────────────────────────────────────────
// The P.F.C workbook is a sizing sheet, not a parts template like the others: a
// worked example on the left, a parts list in the middle, reference lists down
// the side. The app still works the capacitor bank out for itself and does not
// consume this — it is kept as an editable REFERENCE that round-trips through
// Excel. So it is stored as the sheet's own grid, cell for cell, verbatim.
function parsePfc(rows: Rows): { grid: unknown[][] } {
  const grid = rows.map((row) => (Array.isArray(row) ? row.map((c) => (c === undefined ? null : c)) : []));
  return { grid };
}

// ── Standard LV EDMS ─────────────────────────────────────────────────────────
// A whole workbook of standard-panel definitions — one sheet per transformer size
// (300 KVA … 2500 KVA), each holding several panel blocks. The app builds the
// standard panels in code, so this is kept as an editable REFERENCE: every sheet
// stored cell for cell, and written straight back. A "Read me" tab (added by the
// download) is skipped so it never accumulates on a round trip.
function parseStdLvEdms(names: string[], rowsOf: (n: string) => Rows): { sheets: { name: string; grid: unknown[][] }[] } {
  const sheets = names
    .filter((n) => !isReadMeSheet(n))
    .map((name) => ({
      name,
      grid: rowsOf(name).map((row) => (Array.isArray(row) ? row.map((c) => (c === undefined ? null : c)) : [])),
    }));
  return { sheets };
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
/** The motorised-breaker tab. The engineers' own file names its one tab generically
 *  ("Sheet1"), so the WORKBOOK is ALSO recognised by its file name (see
 *  parseCombosWorkbook). The download this screen makes names the tab "Motorized",
 *  so a re-load is recognised by the tab too. */
const isMotorizedSheet = (n: string) => /motori[sz]/.test(normKey(n)); // "motorized" (z) or "motorised" (s)
/** The prose tab in a downloaded file — the reader skips it. */
const isReadMeSheet = (n: string) => normKey(n).replace(/[^a-z]/g, "") === "readme";

/** The two ATS arrangements the app offers. A workbook that carries only one of
 *  them would wipe the other on save, so both are required — see "Refusals". */
const ATS_REQUIRED_TYPES = ["1oo2", "2oo3"] as const;
const ATS_TYPE_WORDS: Record<string, string> = { "1oo2": "1 out of 2", "2oo3": "2 out of 3" };

/**
 * Read one of the engineers' combinations workbooks.
 *
 * The uploaded file is the NEW SOURCE OF TRUTH: each section it carries comes
 * back with exactly the rows in it, so a load can add, change OR remove rows
 * freely. A section the file does not mention is simply not returned, so it is
 * left as it is — loading an MCC file never touches the ATS or photocell lists.
 * Completeness is judged against the FILE, never against the previous version.
 *
 * `removals` lists the two COARSE removals that used to be refused outright — a
 * whole ATS arrangement, or a whole withdrawable-kit block, that this file
 * leaves out. They are no longer rejected; the caller shows them and asks once
 * before saving, because each takes an option out of the app for new work.
 *
 * Still throws (in plain words) only when the file is not a combinations
 * workbook at all, or a tab in it is malformed — that is "nothing the app can
 * read", not "different content".
 */
export async function parseCombosWorkbook(file: File): Promise<{ sections: ParsedComboSection[]; removals: string[] }> {
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
  const pfcSheet = names.find(isPfcSheet);

  // Motorized is a dedicated workbook in its own right and must NOT be required to
  // carry MCC / ATS / photocell / WD tabs. Its tab has no distinctive name in the
  // engineers' file (it is "Sheet1"), so the workbook counts as the Motorized one
  // when a tab is actually named "Motorized" (what this screen's download makes) OR
  // its FILE name says so and it is none of the other workbooks. Its single table
  // is then read on its own format.
  const otherKnown = Boolean(mccSheet || photocellSheet || wdSheet || atsSheets.length || pfcSheet);
  const nameSaysMotorized = /motori[sz]/i.test(file.name); // "Motorized" (z) or "Motorised" (s)
  const motorizedSheet =
    names.find(isMotorizedSheet) ??
    (nameSaysMotorized && !otherKnown ? names.find((n) => !isReadMeSheet(n) && !isPfcSheet(n)) : undefined);

  // Standard LV EDMS — recognised by its file name (its tabs are transformer sizes,
  // "300 KVA" … "2500 KVA", which match no combination tab). Stored as a reference.
  const nameSaysStdLvEdms = /(standard|std)\s*lv\s*edms/i.test(file.name);
  const hasStdLvData = nameSaysStdLvEdms && !otherKnown && !motorizedSheet && names.some((n) => !isReadMeSheet(n));

  // Standard ATS EDMS — recognised by its file name (tabs are ratings, "630A", "800A",
  // "MCCB-1000A" …, which match no combination tab and no LV EDMS tab). Its "lv" and
  // "ats" name checks are mutually exclusive, so the two never collide.
  const nameSaysStdAtsEdms = /(standard|std)\s*ats\s*edms/i.test(file.name);
  const hasStdAtsData =
    nameSaysStdAtsEdms && !otherKnown && !motorizedSheet && !hasStdLvData && names.some((n) => !isReadMeSheet(n));

  const recognised = otherKnown || Boolean(motorizedSheet) || hasStdLvData || hasStdAtsData;

  // ── Refusals ────────────────────────────────────────────────────────────
  // Each of these stops the upload rather than saving something the app would
  // read as "that option no longer exists".

  if (!recognised) {
    throw new Error(
      `"${file.name}" is not one of the combinations workbooks. It should contain a tab called MCC, Photocell or WD, or tabs called "ATS 1 out of 2" and "ATS 2 out of 3". This file has: ${names.join(", ") || "no tabs at all"}.`,
    );
  }

  const out: ParsedComboSection[] = [];
  const removals: string[] = [];

  if (atsSheets.length) {
    const ats: Record<string, AtsType> = {};
    for (const name of atsSheets) {
      const type = atsTypeOf(name);
      if (type) ats[type] = parseAtsSheet(rowsOf(name));
    }
    // An arrangement the file leaves out is dropped, not refused — the file is
    // the new source of truth. It is a coarse removal though (that arrangement
    // can no longer be offered for new work), so it goes on `removals` for the
    // caller to confirm once before saving.
    for (const t of ATS_REQUIRED_TYPES) {
      if (!ats[t]) removals.push(`the "${ATS_TYPE_WORDS[t]}" ATS arrangement`);
    }
    out.push({ section: "ats", value: ats });
  }

  if (photocellSheet) out.push({ section: "photocell", value: parsePhotocell(rowsOf(photocellSheet)) });
  if (mccSheet) out.push({ section: "mcc", value: parseMcc(rowsOf(mccSheet)) });

  if (wdSheet) {
    const { wd, headings } = parseWd(rowsOf(wdSheet));
    // A WD tab is judged on WHAT IS IN IT. A block it leaves out is removed, not
    // refused — but each dropped block empties a group of withdrawable kits
    // (Air-3P is the E1.2 kit), so it is a coarse removal the caller confirms.
    // This is how the engineers' own "Combinations Database - WD.xlsx", which
    // stops after the two MCCB blocks, now loads: it takes the E1.2 kit out,
    // with a confirmation first instead of a flat refusal.
    for (const words of missingWdBlocks(headings)) removals.push(words);
    out.push({ section: "wd", value: wd });
  }

  if (motorizedSheet) {
    // Validated on the Motorized format alone: a top row of frame columns with
    // parts beneath. Nothing about the general combinations tabs is required.
    const value = parseMotorized(rowsOf(motorizedSheet));
    if (Object.keys(value).length === 0) {
      throw new Error(
        `"${file.name}" looks like the Motorized workbook, but its first row has no breaker-frame columns with parts beneath them. ` +
          'The top row should name the frames (for example "XT1/XT3", "XT5", "E1.2"), and each frame\'s parts run down its column.',
      );
    }
    out.push({ section: "motorized", value });
  }

  if (pfcSheet) {
    // Stored as a reference, cell for cell — validated as "a sheet with rows",
    // nothing more, because the app does not consume it.
    out.push({ section: "pfc", value: parsePfc(rowsOf(pfcSheet)) });
  }

  if (hasStdLvData) {
    // Every sheet stored cell for cell — a reference, not consumed by the builder.
    out.push({ section: "stdlvedms", value: parseStdLvEdms(names, rowsOf) });
  }

  if (hasStdAtsData) {
    // Stored cell for cell like Standard LV EDMS — but the Standard ATS builder DOES
    // read these sheets back (frontend/src/lv/standardAtsEdms.ts parses them).
    out.push({ section: "stdatsedms", value: parseStdLvEdms(names, rowsOf) });
  }

  return { sections: out, removals };
}

// ═══════════════════════════════════════════════════════════════════════════
// The other direction — hand back a workbook instead of combos.json
// ═══════════════════════════════════════════════════════════════════════════
//
// ONE FILE PER COMBINATION — the owner's decision, and it replaced the old
// single all-tabs download
// ─────────────────────────────────────────────────────────────────────────
//     "when i download any excel of combination it download all combinations,
//      i need every combination to be independent"
//
// So each combination comes out as its own workbook, named exactly like the
// file he already keeps for it on disk:
//
//     Combinations Database - MCC.xlsx         Read me + MCC
//     Combinations Database - ATS.xlsx         Read me + ATS 1 out of 2 + ATS 2 out of 3
//     Combinations Database - photocell.xlsx   Read me + Photocell
//     Combinations Database - WD.xlsx          Read me + WD
//
// Two of those files hold more than one tab and that is not a contradiction:
// "ATS" is ONE combination whose two arrangements are two tabs, and the reader
// refuses an ATS file carrying only one of them, because loading it would take
// the other arrangement out of the app. The "Read me" tab is a page of prose;
// the reader ignores it, because it is none of MCC / ATS / Photocell / WD.
//
// There is a fifth file beside those on his disk, "Combinations Database -
// P.F.C.xlsx". It is a sizing calculator, not a combination: the app works
// power-factor correction out for itself and stores nothing for it, so there is
// nothing to write and no file is offered.
//
// WHY THE MCC, ATS AND PHOTOCELL FILES DO NOT CARRY THE WD TAB
// ────────────────────────────────────────────────────────────
// The engineers' own three files each repeat it, so carrying it would have been
// the more faithful copy — but it is exactly the behaviour he is objecting to.
// A WD tab inside the MCC file means loading MCC ALSO rewrites the withdrawable
// kits. Worse, it rewrites them from a snapshot: edit the kits in the WD file,
// load it, then load an MCC file downloaded an hour earlier, and the old kits
// come silently back. That is the "not independent" trap, and it is the one
// that costs data rather than time.
//
// So each file carries its own tab and nothing else, and the WD file is the one
// and only way to change the kits. That is only safe because a stand-alone WD
// file is now loadable at all — see the WD refusal in `parseCombosWorkbook`,
// which judges whether the tab has all three blocks instead of whether it
// arrived alone. The two changes are one decision and must stay together.
//
// Nothing was lost on the reading side: the engineers' three files still carry
// their WD tab, the reader still reads it, and loading their MCC file still
// refreshes the kits exactly as it always did.
//
// WHAT IS NOT IN ANY OF THEM, AND WHY
// ───────────────────────────────────
//  • 'motorized' has no file, because it has no Excel shape anywhere: no
//    engineers' workbook contains it and the reader above has no parser for it.
//    Inventing a layout would mean inventing the round trip too. It is left out
//    and named by `combosWorkbookOmissions()` so the caller can say so on
//    screen. Leaving it out is SAFE, not lossy: the reader never returns a
//    'motorized' section either, so no file it makes can overwrite it.
//  • The photocell "DESCRIPTION" column is written as an empty column. The app
//    stores only the price-list wording (trap 3); the short offer wording is
//    not derivable — the engineers' own file writes "Contactor# AF460-30-00"
//    against a part whose code is "AF460-30-00-00" — so it is left blank rather
//    than guessed. The reader ignores that column.
//  • The MCC control block is written with its "DOL" group only, because that
//    is the only one stored (see MCC_CONTROL_GROUP above). The workbook's
//    "Star Delta" group is the same list plus a timer the app adds itself.
//
// HOW THE ROUND TRIP IS KEPT EXACT
// ────────────────────────────────
// Every value is written in the form the app STORES, never the price-list form,
// because the reader's two translation tables (MCC_CATALOGUE_TO_TEMPLATE and
// ATS_DESC_MAP) leave an already-translated value alone — verified by building
// each combination's file from combos.json, feeding it back through
// `parseCombosWorkbook` on its own, and comparing: all four come back
// character-for-character identical.
//
// The one deliberate difference from the engineers' ATS tabs is how many frames
// share a QTY column. Their file lets frames of DIFFERENT length share one
// block and leaves the odd cell empty — which works on paper, but rebuilding it
// would mean guessing how to align rows that are not the same, and a wrong
// guess turns a part into a heading (trap 2). So frames are grouped into a
// block only while they agree exactly on groups and quantities, which is the
// rule that makes "blank QTY + fills the whole block = heading" provably right.
// The block count is read, never hardcoded, so this is inside the format's own
// rules: the 1-out-of-2 tab comes back as 4 blocks instead of 3, and reads back
// identically.

/** The combinations that have a workbook of their own, in the order the screen
 *  offers them. Anything not on this list has no Excel shape at all. */
export const COMBOS_WORKBOOK_SECTIONS = ["mcc", "ats", "photocell", "wd", "motorized", "pfc", "stdlvedms", "stdatsedms"] as const;

/** True when this combination can be downloaded as a file — so the caller can
 *  grey the button out instead of finding out by catching an error. */
export function sectionHasWorkbook(section: string): boolean {
  return (COMBOS_WORKBOOK_SECTIONS as readonly string[]).includes(normKey(section));
}

/** Plain-English names of the sections handed in that no workbook can
 *  carry, for the caller to show on screen. Empty when everything fits. */
export function combosWorkbookOmissions(sections: ParsedComboSection[]): string[] {
  const known = new Set<string>(COMBOS_WORKBOOK_SECTIONS);
  const words: Record<string, string> = { motorized: "the motorised circuit-breaker table" };
  return sections.filter((s) => !known.has(s.section)).map((s) => words[s.section] ?? `the "${s.section}" list`);
}

/** The reader compares this lower-cased (MCC_CONTROL_GROUP); this is how the
 *  workbook itself spells it. Edit the two together. */
const MCC_CONTROL_GROUP_LABEL = "DOL";

type Grid = unknown[][];

/** Sheets are filled cell by cell, so every hole must become a real `null`:
 *  XLSX.utils.aoa_to_sheet reads `.length` on every row it is given. */
function put(g: Grid, r: number, c: number, v: unknown): void {
  while (g.length <= r) g.push([]);
  const row = g[r];
  while (row.length <= c) row.push(null);
  row[c] = v;
}

const asObj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Written when the app hands over something this file cannot lay out. Same
 *  voice as the refusals above: say what is wrong, not what threw. */
function badShape(section: string): Error {
  return new Error(
    `The "${section}" list is not in the shape this download expects, so no Excel file was made. Nothing was changed — please send this message on.`,
  );
}

// ── MCC tab ────────────────────────────────────────────────────────────────
// Same geometry the reader walks: key in F, parts from G, and the control block
// underneath in A..D behind the "CONTROL ACC." marker. Columns A..C carry the
// picker legend, which is rebuilt from the starters (the app does not store it)
// and which the reader ignores.
function mccGrid(value: unknown): Grid {
  const o = asObj(value);
  const combos = o && Array.isArray(o.combos) ? (o.combos as MccCombo[]) : null;
  const control = o && Array.isArray(o.control) ? (o.control as QtyDesc[]) : null;
  if (!combos || !control) throw badShape("mcc");

  const g: Grid = [];
  combos.forEach((c, i) => {
    const r = i + 1;
    put(g, r, MCC_KEY_COL, `${c.kind}-${c.kw}-Type ${c.type}`);
    c.parts.forEach((p, k) => put(g, r, MCC_PART_COL_FROM + k, p));
  });

  const uniq = (xs: string[]): string[] => xs.filter((x, i) => xs.indexOf(x) === i);
  put(g, 0, 0, "MCC");
  put(g, 0, 1, "Rating");
  put(g, 0, 2, "Type");
  uniq(combos.map((c) => c.kind)).forEach((v, i) => put(g, i + 1, 0, v));
  uniq(combos.map((c) => c.kw)).forEach((v, i) => put(g, i + 1, 1, v));
  uniq(combos.map((c) => `Type ${c.type}`)).forEach((v, i) => put(g, i + 1, 2, v));

  const start = g.length + 2; // two blank rows, as in the engineers' file
  control.forEach((it, i) => {
    const r = start + i;
    if (i === 0) put(g, r, MCC_CTRL_MARK_COL, "CONTROL ACC.");
    put(g, r, MCC_CTRL_GROUP_COL, MCC_CONTROL_GROUP_LABEL);
    put(g, r, MCC_CTRL_QTY_COL, it.qty);
    put(g, r, MCC_CTRL_DESC_COL, it.desc);
  });
  return g;
}

// ── ATS tabs ───────────────────────────────────────────────────────────────

/** "1oo2" -> "1 out of 2", for the tab name and the banner. */
function atsWordsOf(type: string): string {
  const known = ATS_TYPE_WORDS[type];
  if (known) return known;
  const m = /^(\d+)oo(\d+)$/i.exec(type);
  return m ? `${m[1]} out of ${m[2]}` : type;
}

/** Two frames may share a QTY column only when they agree on every group name
 *  and every quantity — see the note above about not guessing an alignment. */
const atsSkeleton = (groups: AtsGroup[]): string =>
  groups.map((g) => `${g.group} ${g.items.map((i) => i.qty).join(",")}`).join("");

/** The header cell for a frame. The reader strips a leading "ATS", so a frame
 *  that already begins with it is written bare rather than doubled. */
const atsFrameHeader = (frame: string): string => (/^ats/i.test(frame) ? frame : `ATS${frame}`);

function atsGrid(type: AtsType, words: string): Grid {
  const frames = Object.keys(type);
  const blocks: { frames: string[]; groups: AtsGroup[] }[] = [];
  for (const f of frames) {
    const groups = type[f];
    if (!Array.isArray(groups)) throw badShape("ats");
    const last = blocks[blocks.length - 1];
    if (last && atsSkeleton(last.groups) === atsSkeleton(groups)) last.frames.push(f);
    else blocks.push({ frames: [f], groups });
  }

  const TITLE_ROW = 4;
  const HEADER_ROW = 5;
  const g: Grid = [];
  put(g, 0, 0, "ATS");
  put(g, 0, 1, words);

  let col = 0;
  for (const b of blocks) {
    put(g, TITLE_ROW, col, words);
    put(g, HEADER_ROW, col, "QTY");
    b.frames.forEach((f, i) => put(g, HEADER_ROW, col + 1 + i, atsFrameHeader(f)));

    let r = HEADER_ROW + 1;
    b.groups.forEach((grp, gi) => {
      // A heading: QTY left empty and the same text in every frame column of
      // the block. That is exactly the rule the reader uses.
      b.frames.forEach((_, i) => put(g, r, col + 1 + i, grp.group));
      r += 1;
      grp.items.forEach((item, ii) => {
        put(g, r, col, item.qty);
        b.frames.forEach((f, i) => put(g, r, col + 1 + i, type[f][gi].items[ii].desc));
        r += 1;
      });
    });
    col += b.frames.length + 2; // this block's columns, plus a blank spacer
  }
  return g;
}

// ── Photocell tab ──────────────────────────────────────────────────────────
// Ratings first, stopped by a blank row, then the fixed parts as
// qty | description | "fixed" — the two shapes the reader looks for.
function photocellGrid(value: unknown): Grid {
  const o = asObj(value);
  const ratings = o && Array.isArray(o.ratings) ? (o.ratings as PhotocellRating[]) : null;
  const fixed = o && Array.isArray(o.fixed) ? (o.fixed as QtyDesc[]) : null;
  if (!ratings || !fixed) throw badShape("photocell");

  const g: Grid = [];
  put(g, 0, 0, "Rating of CB");
  put(g, 0, 1, "DESCRIPTION"); // left empty on purpose — see the note above
  put(g, 0, 2, "PL Description");
  put(g, 0, 3, "Aux Contactor");
  ratings.forEach((rt, i) => {
    const r = i + 1;
    put(g, r, 0, rt.a);
    put(g, r, 2, rt.contactor);
    put(g, r, 3, rt.aux);
  });

  const start = g.length + 2; // the blank row is what ends the ratings run
  fixed.forEach((it, i) => {
    const r = start + i;
    put(g, r, 0, it.qty);
    put(g, r, 1, it.desc);
    put(g, r, 2, "fixed");
  });
  return g;
}

// ── WD tab ─────────────────────────────────────────────────────────────────
// One four-row block per heading, in the order the kits are stored.

/** "3P" -> "MCCB-3P", "3P-Air" -> "Air-3P". The exact reverse of the reader,
 *  which takes the breaker type and the pole count out of the heading. */
function wdHeadingOf(poles: string): { heading: string; digits: string } {
  const m = /^(\d+P)(?:-(.+))?$/i.exec(flat(poles));
  if (!m) {
    throw new Error(
      `A withdrawable kit is filed under "${poles}", which does not say how many poles it has. The download expects something like "3P" or "3P-Air". Nothing was changed — please send this message on.`,
    );
  }
  const digits = m[1].toUpperCase();
  return { heading: `${m[2] ? m[2].trim() : "MCCB"}-${digits}`, digits };
}

function wdGrid(value: unknown): Grid {
  if (!Array.isArray(value)) throw badShape("wd");
  const wd = value as WdEntry[];

  const order: string[] = [];
  const byPoles = new Map<string, WdEntry[]>();
  for (const e of wd) {
    const list = byPoles.get(e.poles);
    if (list) list.push(e);
    else {
      byPoles.set(e.poles, [e]);
      order.push(e.poles);
    }
  }

  // Never write a WD file the reader would then refuse. The kits are a complete
  // set or they are nothing, so if the app has somehow lost a whole group, say
  // so here rather than handing over a file that fails on the way back in.
  const headings = order.map((p) => wdHeadingOf(p).heading);
  const short = missingWdBlocks(headings);
  if (short.length) {
    throw new Error(
      `The withdrawable kits in the app are missing ${andList(short)}, so no Excel file was made — it would be ` +
        "refused when you tried to load it back. Nothing was changed — please send this message on.",
    );
  }

  const g: Grid = [];
  let r = 0;
  for (const poles of order) {
    const { heading, digits } = wdHeadingOf(poles);
    put(g, r, 0, heading);
    const kr = r + 1;
    put(g, kr, 0, null); // the key row's label cell must be empty
    put(g, kr + 1, 0, "CB");
    put(g, kr + 2, 0, "FP");
    put(g, kr + 3, 0, "MP");
    (byPoles.get(poles) ?? []).forEach((e, i) => {
      const c = i + 1;
      put(g, kr, c, `${e.frame}-${digits}-WD`);
      put(g, kr + 2, c, e.fp);
      put(g, kr + 3, c, e.mp);
    });
    r = kr + 5; // four rows of block, then one blank row
  }
  return g;
}

// ── Motorized tab ────────────────────────────────────────────────────────────
// The mirror of parseMotorized: one column per frame, the frame in the top cell
// and its parts down the column. Written in the same shape the engineers' file
// uses, so a download loads straight back.
function motorizedGrid(value: unknown): Grid {
  const o = asObj(value);
  if (!o) throw badShape("motorized");
  const frames = Object.keys(o);
  if (frames.length === 0) {
    // Never hand over an empty workbook — it would look like a backup of nothing.
    throw new Error(
      "There is no motorised-breaker data to write yet, so no Excel file was made. Load a Motorized workbook first. Nothing was changed.",
    );
  }
  const g: Grid = [];
  frames.forEach((frame, c) => {
    put(g, 0, c, frame);
    const parts = Array.isArray(o[frame]) ? (o[frame] as unknown[]) : [];
    parts.forEach((p, i) => put(g, i + 1, c, typeof p === "string" ? p : String(p ?? "")));
  });
  return g;
}

// ── P.F.C tab ────────────────────────────────────────────────────────────────
// The mirror of parsePfc: the stored grid, written straight back cell for cell.
function pfcGrid(value: unknown): Grid {
  const o = asObj(value);
  const grid = o && Array.isArray(o.grid) ? (o.grid as Grid) : null;
  if (!grid || grid.length === 0) {
    // Never hand over an empty workbook — it would look like a backup of nothing.
    throw new Error(
      "There is no P.F.C reference to write yet, so no Excel file was made. Load a P.F.C workbook first. Nothing was changed.",
    );
  }
  return grid;
}

// ── Standard LV EDMS sheets ──────────────────────────────────────────────────
// The mirror of parseStdLvEdms: every stored sheet written straight back, in order.
function stdLvEdmsSheets(value: unknown): Sheet[] {
  const o = asObj(value);
  const sheets = o && Array.isArray(o.sheets) ? (o.sheets as { name?: unknown; grid?: unknown }[]) : null;
  if (!sheets || sheets.length === 0) {
    throw new Error(
      "There is no Standard LV EDMS reference to write yet, so no Excel file was made. Load the workbook first. Nothing was changed.",
    );
  }
  return sheets.map((sh, i) => ({
    name: String(sh.name || `Sheet ${i + 1}`).slice(0, 31), // Excel tab-name limit
    grid: Array.isArray(sh.grid) ? (sh.grid as Grid) : [],
  }));
}

// ── One combination, one workbook ──────────────────────────────────────────

/** The file each combination is handed back as — the engineers' own names, so a
 *  download drops into the same folder and beside the same file it replaces.
 *  Note the small "photocell": their file spells it that way. */
const SECTION_FILE_NAME: Record<string, string> = {
  mcc: "Combinations Database - MCC.xlsx",
  ats: "Combinations Database - ATS.xlsx",
  photocell: "Combinations Database - photocell.xlsx",
  wd: "Combinations Database - WD.xlsx",
  motorized: "Combinations Database - Motorized.xlsx",
  pfc: "Combinations Database - P.F.C.xlsx",
  stdlvedms: "Standard LV EDMS.xlsx",
  stdatsedms: "Standard ATS EDMS.xlsx",
};

/** What each file is, in one line, for the top of its Read me tab. */
const SECTION_BLURB: Record<string, string> = {
  mcc: "the motor starters, and the control parts that go with them",
  ats: "the automatic transfer switches — the parts for every breaker frame",
  photocell: "the photocell contactor for each breaker rating, and the fixed parts",
  wd: "the withdrawable kits — the fixed part and the moving part of each one",
  motorized: "the motorised breaker parts, listed down a column per breaker frame",
  pfc: "the power-factor-correction sizing sheet — kept as a reference, cell for cell",
  stdlvedms: "the standard LV EDMS panels, one sheet per transformer size — a reference",
  stdatsedms: "the standard ATS panels for EDMS, one sheet per rating and breaker — the app builds from these",
};

/** The line every file except WD carries, so nobody goes looking for the kits
 *  in the wrong file. This is the "independence" decision, said out loud. */
const WD_ELSEWHERE = [
  "The withdrawable kits are NOT in this file. They have a file of their own,",
  '"Combinations Database - WD.xlsx". Loading this one leaves them untouched.',
];

/** The one thing about each tab somebody editing it has to know. */
const SECTION_NOTES: Record<string, string[]> = {
  mcc: [
    "MCC tab: the control block lists the DOL parts only. Star-delta uses the",
    "same parts plus the ON-delay timer, which the app adds by itself.",
    "",
    ...WD_ELSEWHERE,
  ],
  ats: [
    "Both arrangements have to stay in this file. A file carrying only one of",
    "them is refused, because loading it would take the other one out of the app.",
    "",
    ...WD_ELSEWHERE,
  ],
  photocell: [
    "Photocell tab: the DESCRIPTION column is left empty on purpose. The app",
    "keeps only the price-list wording beside it, and works the short wording",
    "out itself.",
    "",
    ...WD_ELSEWHERE,
  ],
  wd: [
    "All three blocks have to stay in this file — MCCB-3P, MCCB-4P and Air-3P.",
    "A file missing one of them is refused, because loading it would take that",
    "whole group of kits out of the app.",
    "",
    "This is the only file that changes the withdrawable kits. The MCC, ATS and",
    "photocell files the app hands back do not carry them, so they cannot put an",
    "older version of the kits back by accident.",
  ],
  motorized: [
    "Motorized tab: one COLUMN per breaker frame. The top cell of a column is the",
    "frame (for example XT1/XT3, XT5, E1.2), and that frame's parts run down the",
    "column beneath it. Add a part by typing it in the next empty cell of a column;",
    "remove one by clearing its cell and closing the gap. Add a new frame by",
    "filling a new column. This file is the whole motorised list — loading it",
    "replaces what the app has, so anything you leave out is dropped.",
  ],
  pfc: [
    "PFC tab: this is a REFERENCE the app keeps for you — it is not used to build a",
    "quotation. The app still sizes the capacitor bank itself from the kVAR and the",
    "number of steps. Edit the cells freely and load the file back to update the",
    "reference; the layout is kept as-is. Cell formatting (colours, merged cells) is",
    "not stored — only the values in the cells are.",
  ],
  stdlvedms: [
    "This is a REFERENCE the app keeps for you — it is not used to build the",
    "standard panels (the app builds those in code). One sheet per transformer size.",
    "Edit the cells freely and load the file back to update the reference; every",
    "sheet is kept as-is. Cell formatting (colours, merged cells) is not stored —",
    "only the values in the cells are.",
  ],
  stdatsedms: [
    "The app BUILDS the standard ATS panels from this file — one sheet per rating",
    "and breaker (630A, 800A, MCCB-1000A, ACB-1000A, …). Editing a sheet and loading",
    "it back changes what the Standard ATS builder produces: the parts list, the",
    "enclosure and the busbar copper all come from here.",
    "",
    "Keep each sheet's layout: row 1 names it (\"ATS 1000A 3P MCCB 1 out of 2\") and",
    "says the enclosure (SR-Basic + a box size, or PLP + a depth); the parts run down",
    "with a quantity in the first column; the PLP cell sizes and the copper lengths sit",
    "in their own columns to the right. Cell formatting is not stored — only the values.",
  ],
};

/** Written when the app is asked for a file it has no layout for. Same voice as
 *  the refusals above: say what is wrong, not what threw. */
function noWorkbookFor(section: string): Error {
  return new Error(
    `There is no Excel file for the "${section}" list. The combinations that have one are MCC, ATS, photocell, WD, Motorized, P.F.C, Standard LV EDMS and Standard ATS EDMS. Nothing was changed.`,
  );
}

/** The file name one combination is downloaded as. Throws, in plain English,
 *  for a combination that has no file. */
export function sectionWorkbookFilename(section: string): string {
  const name = SECTION_FILE_NAME[normKey(section)];
  if (!name) throw noWorkbookFor(section);
  return name;
}

interface Sheet {
  name: string;
  grid: Grid;
}

/** Both ATS tabs. The pair is checked here rather than on the way back in, so a
 *  half-file is never written in the first place. */
function atsSheetsOf(value: unknown): Sheet[] {
  const ats = asObj(value);
  if (!ats) throw badShape("ats");
  const missing = ATS_REQUIRED_TYPES.filter((t) => !asObj(ats[t]));
  if (missing.length) {
    throw new Error(
      `The app has no "${missing.map((t) => ATS_TYPE_WORDS[t]).join('" and no "')}" arrangement, so no ATS file was made — ` +
        "it would be refused when you tried to load it back. Nothing was changed — please send this message on.",
    );
  }
  return Object.keys(ats).map((type) => {
    const table = asObj(ats[type]);
    if (!table) throw badShape("ats");
    const words = atsWordsOf(type);
    return { name: `ATS ${words}`, grid: atsGrid(table as AtsType, words) };
  });
}

/** The data tabs of one combination's workbook, in tab order. One place, so the
 *  per-combination files cannot drift away from each other. */
function sectionSheets(section: string, value: unknown): Sheet[] {
  switch (normKey(section)) {
    case "mcc":
      return [{ name: "MCC", grid: mccGrid(value) }];
    case "ats":
      return atsSheetsOf(value);
    case "photocell":
      return [{ name: "Photocell", grid: photocellGrid(value) }];
    case "wd":
      return [{ name: "WD", grid: wdGrid(value) }];
    case "motorized":
      return [{ name: "Motorized", grid: motorizedGrid(value) }];
    case "pfc":
      return [{ name: "PFC", grid: pfcGrid(value) }];
    case "stdlvedms":
      return stdLvEdmsSheets(value);
    case "stdatsedms":
      return stdLvEdmsSheets(value); // same shape: sheets written back cell for cell
    default:
      throw noWorkbookFor(section);
  }
}

// ── Read me tab ────────────────────────────────────────────────────────────
// Ignored by the reader — "Read me" is none of MCC / ATS / Photocell / WD, and
// it is not "PFC" either, so the file-recognition logic cannot mistake it for a
// data tab. It is there so the file explains itself to whoever opens it.
function readMeGrid(section: string, sheets: Sheet[]): Grid {
  const key = normKey(section);
  const lines = [
    `PowerLine — ${SECTION_BLURB[key] ?? section}, as the app has them right now`,
    "",
    `Downloaded from the Combinations tab as "${sectionWorkbookFilename(section)}".`,
    "Edit the tab next to this one and load this same file back on that screen to",
    "change what the app builds.",
    "",
    "THIS FILE HOLDS ONE COMBINATION AND NOTHING ELSE. Loading it changes only",
    "that one — every other combination stays exactly as it is.",
    "",
    "Tabs in this file:",
    "    Read me — this page. The app ignores it.",
    ...sheets.map((s) => `    ${s.name}`),
    "",
    "Please do not rename the tabs or move the columns — the app finds the",
    "figures by tab name and by heading.",
    "",
    'Leaving a description or a quantity cell EMPTY is read as "this row is a',
    'heading", which drops that row and the ones under it. Change the words in',
    "the cells, not the shape of the tab.",
    "",
    ...(SECTION_NOTES[key] ?? []),
  ];
  return lines.map((l) => [l]);
}

// ── The download itself ────────────────────────────────────────────────────

/** Roughly how wide each column should open, so the file is readable. */
const widthsFor = (g: Grid): { wch: number }[] => {
  const n = g.reduce((m, row) => Math.max(m, row.length), 0);
  const out: { wch: number }[] = [];
  for (let c = 0; c < n; c++) {
    let w = 8;
    for (const row of g) w = Math.max(w, Math.min(60, flat(row[c]).length + 2));
    out.push({ wch: w });
  }
  return out;
};

function addSheet(wb: XLSX.WorkBook, name: string, g: Grid): void {
  const ws = XLSX.utils.aoa_to_sheet(g);
  ws["!cols"] = widthsFor(g);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function toBlob(wb: XLSX.WorkBook): Blob {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Build ONE combination's workbook — the file the Combinations tab hands back
 * for the list that is on screen, and the same file the app can read again, so
 * download → edit → load is a safe loop.
 *
 * `section` is the combination's name as the app stores it ("mcc", "ats",
 * "photocell", "wd", "motorized") and `value` is that section's saved value.
 * Use `sectionWorkbookFilename()` for the name to save it under.
 *
 * The file carries that combination and nothing else, so loading it back cannot
 * touch any other one — see the long note above for why, and in particular why
 * the MCC, ATS and photocell files no longer repeat the WD tab.
 *
 * Throws an Error written for a non-programmer when the value arrives in a shape
 * that cannot be laid out — rather than writing a file that will not load again.
 */
export function buildSectionWorkbook(section: string, value: unknown): Blob {
  const sheets = sectionSheets(section, value);
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Read me", readMeGrid(section, sheets));
  for (const s of sheets) addSheet(wb, s.name, s.grid);
  return toBlob(wb);
}

// The old all-in-one download — one workbook carrying every combination — was
// deleted here once the Combinations screen switched to `buildSectionWorkbook`.
// It was the behaviour the owner objected to, and leaving it in the file as dead
// code is an invitation to wire a button back to it by mistake. There is now one
// way to make a download, and it makes one combination.
