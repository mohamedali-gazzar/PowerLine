// PanelsBulkImport — read a quote workbook holding MANY panels (stacked "Item"
// blocks) and append them all to the current quote's panel list, after a preview.
//
// PANELS ARE SEPARATED ONLY BY "Item No.". Each "Item No." row starts one panel;
// everything below it — the detail grid AND the component table — belongs to that
// same panel until the next "Item No." header. A stray "Item No." inside a
// component row does not start a panel: a header must also carry Item Qty./Item Name.
//
// Each panel block has two parts:
//   Part A — the label→value detail grid (labels scattered; value is the cell to a
//            label's right).
//   Part B — the component table: a "Qty / Description / Brand / Reference" header,
//            then rows grouped under section labels ("Main Incoming", "Outgoings").
//            Components are matched to the tool by REFERENCE (descriptions vary).
//
// The server is the source of truth: this preview is display-only, and Confirm
// calls onImportPanels(panels), which the parent maps to real panels (with their
// components) and writes through the backend. The modal is portalled to
// document.body — a fixed overlay inside a configurator tab is otherwise clipped.

import { Fragment, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";

// ── One imported component / panel (raw parsed, before mapping to LvPanel) ───
export interface ImportedComponent {
  section: string;
  qty: number | string;
  description: string;
  brand: string;
  reference: string;
}
export interface ImportedPanel {
  panelName?: string;
  quantity?: number | string;
  fedFrom?: string;
  panelType?: string;
  mounting?: string;
  ral?: string;
  copper?: string;
  incomingCables?: string;
  outgoingCables?: string;
  shortCircuit?: string;
  busbarRating?: string;
  ambTemp?: string;
  neutral?: string;
  earth?: string;
  form?: string;
  enclosureSize?: string; // e.g. "1400x800x300" — the chosen box, from the top-left summary
  layout?: string;        // "Single" | "Double"
  // Cell-type panels (Pro-E / IS2 / PLP): the "Pro-E_70_IP65" descriptor and the cell
  // table (cell size + quantity) from the panel's top-left area.
  cellType?: string;      // "Pro-E" | "IS2" | "PLP"
  cellDepth?: number;     // 70 / 90 / …
  cellIp?: string;        // "IP65" / "IP31" …
  cells?: { desc: string; qty: number }[];
  // Main-busbar copper lengths (mm) per rating, read from the "Copper Tool" sheet.
  // (Distinct from `copper`, which is the copper TYPE — Bare / Raychem …)
  busbarCopper?: Record<string, { p: number; n: number; e: number }>;
  components: ImportedComponent[];
}

// Brand orange — matches the tool's panel item bar, spec labels and table header.
const TRED = "#F16722";

// ── Field map: Excel label → panel field (EDIT HERE) ─────────────────────────
interface FieldDef { label: string; field: keyof ImportedPanel; header?: boolean; aliases?: string[] }
const FIELD_MAP: FieldDef[] = [
  { label: "Item Name", field: "panelName", header: true },
  { label: "Item Qty.", field: "quantity", header: true, aliases: ["Item Qty", "Qty", "Quantity"] },
  { label: "Fed From", field: "fedFrom", aliases: ["Fed From:", "Fed-From"] },
  { label: "Panel Type", field: "panelType" },
  { label: "Mounting", field: "mounting" },
  { label: "RAL", field: "ral" },
  { label: "Copper", field: "copper" },
  { label: "Incoming Cables", field: "incomingCables", aliases: ["Incoming Cable", "Incoming"] },
  { label: "Outgoing Cables", field: "outgoingCables", aliases: ["Outgoing Cable", "Outgoing"] },
  { label: "Short Circuit", field: "shortCircuit", aliases: ["Short-Circuit", "SC"] },
  // NOTE: bare "IP" is deliberately NOT an alias — on the real sheet "IP" (e.g. 65)
  // and "Rating" (e.g. 160A) are separate cells; only "Rating" is the busbar rating.
  { label: "IP / Rating", field: "busbarRating", aliases: ["IP/Rating", "Rating", "IP Rating"] },
  { label: "Amb. Temp.", field: "ambTemp", aliases: ["Amb. Temp", "Amb Temp", "Ambient Temp", "Ambient Temperature", "Amb Temperature"] },
  { label: "Neutral", field: "neutral" },
  { label: "Earth", field: "earth" },
  { label: "Form", field: "form" },
];

const DROPDOWN_OPTIONS: Record<string, string[]> = {
  panelType: ["Local", "SR-Basic", "Unikit", "Local (Sheet Metal)", "Minicenter", "Primo", "Pillars", "Coffree", "Pro-E", "IS2", "PLP"],
  copper: ["Bare", "Raychem", "Tin-plated", "Silver-Plated Connections"],
  incomingCables: ["Bottom", "Top", "Top Busway"],
  outgoingCables: ["Bottom", "Top", "Top Busway", "Bottom & Top", "Bottom & Top Busway"],
  ambTemp: ["35°C", "40°C", "45°C", "50°C", "55°C"],
  neutral: ["25% Phase", "50% Phase", "100% Phase"],
  earth: ["25% Phase", "50% Phase", "100% Phase"],
  form: ["1", "2", "3", "3b", "4", "4a", "4b"],
};

type Cell = unknown;
type Row = Cell[];

const clean = (v: Cell): string => (v === null || v === undefined ? "" : String(v)).replace(/ /g, " ").trim();
const normLabel = (v: Cell): string => clean(v).toLowerCase().replace(/[.:]/g, " ").replace(/\s+/g, " ").trim();
const normVal = (v: Cell): string => clean(v).toLowerCase().replace(/[°˚º]/g, "°").replace(/\s+/g, "");

interface Matcher { field: keyof ImportedPanel; header: boolean; keys: Set<string> }
const MATCHERS: Matcher[] = FIELD_MAP.map((f) => ({
  field: f.field, header: !!f.header,
  keys: new Set([f.label, ...(f.aliases || [])].map(normLabel)),
}));
const keysFor = (field: keyof ImportedPanel) => MATCHERS.find((m) => m.field === field)!.keys;

// Component-table header column keys.
const QTY_KEYS = new Set(["qty", "quantity", "qnty", "no"].map(normLabel));
const DESC_KEYS = new Set(["description", "desc", "item", "component"].map(normLabel));
const BRAND_KEYS = new Set(["brand", "supplier", "make", "manufacturer"].map(normLabel));
const REF_KEYS = new Set(["reference", "ref", "comp ref", "comp reference", "component ref", "component reference", "code", "part no", "part number", "cat no", "catalogue no"].map(normLabel));

const isItemNoCell = (v: Cell) => /^item\s*no\.?/i.test(clean(v));
const hasKey = (row: Row, keys: Set<string>) => (row || []).some((c) => keys.has(normLabel(c)));
// A genuine panel header: an "Item No." cell PLUS an "Item Qty." / "Item Name" on
// the same row. This is what stops a stray "Item No." inside a component row from
// starting a new panel.
const isPanelHeader = (row: Row) =>
  (row || []).some(isItemNoCell) && (hasKey(row, keysFor("quantity")) || hasKey(row, keysFor("panelName")));

function valueRightOf(row: Row, idx: number, isLabel: (c: Cell) => boolean): string {
  for (let c = idx + 1; c <= idx + 2 && c < row.length; c++) {
    const v = clean(row[c]);
    if (v === "") continue;
    if (isLabel(row[c])) return "";
    return v;
  }
  return "";
}

interface CompHeader { row: number; qtyCol: number; descCol: number; brandCol: number; refCol: number }
function findCompHeader(block: Row[]): CompHeader | null {
  for (let r = 1; r < block.length; r++) {
    const row = block[r] || [];
    let qtyCol = -1, descCol = -1, brandCol = -1, refCol = -1;
    row.forEach((c, ci) => {
      const n = normLabel(c);
      if (qtyCol < 0 && QTY_KEYS.has(n)) qtyCol = ci;
      if (descCol < 0 && DESC_KEYS.has(n)) descCol = ci;
      if (brandCol < 0 && BRAND_KEYS.has(n)) brandCol = ci;
      if (refCol < 0 && REF_KEYS.has(n)) refCol = ci;
    });
    if (qtyCol >= 0 && descCol >= 0) return { row: r, qtyCol, descCol, brandCol, refCol };
  }
  return null;
}

// The reference column is often a single SHEET-WIDE header at the very top (e.g.
// "Comp. Ref." on the Technical sheet), NOT repeated in each panel's Qty/Description/
// Brand sub-header. So find it once across the whole sheet and use it for every block.
function findRefColumn(rows: Row[]): number {
  for (const row of rows) {
    const r = row || [];
    for (let c = 0; c < r.length; c++) if (REF_KEYS.has(normLabel(r[c]))) return c;
  }
  return -1;
}

interface ParsedPanel { itemNo: string; fields: Partial<ImportedPanel>; matchedFields: string[]; components: ImportedComponent[] }

function parseBlock(block: Row[], globalRefCol: number): ParsedPanel {
  const header = block[0] || [];
  const isLabelCell = (cell: Cell) => {
    const n = normLabel(cell);
    if (!n) return false;
    if (isItemNoCell(cell)) return true;
    return MATCHERS.some((m) => m.keys.has(n));
  };

  const fields: Partial<ImportedPanel> = {};
  const matchedFields: string[] = [];

  const itemNoIdx = header.findIndex(isItemNoCell);
  const itemNo = (clean(header[itemNoIdx]).match(/(\d+)/) || [])[1] || "";

  let panelName = "";
  const nameLabelIdx = header.findIndex((c) => keysFor("panelName").has(normLabel(c)));
  if (nameLabelIdx >= 0) panelName = valueRightOf(header, nameLabelIdx, isLabelCell);
  if (!panelName && itemNoIdx >= 0) {
    const cand = clean(header[itemNoIdx + 1]);
    if (cand && !isLabelCell(header[itemNoIdx + 1])) panelName = cand;
  }
  if (panelName) { fields.panelName = panelName; matchedFields.push("panelName"); }

  const qtyIdx = header.findIndex((c) => keysFor("quantity").has(normLabel(c)));
  if (qtyIdx >= 0) {
    const raw = valueRightOf(header, qtyIdx, isLabelCell);
    if (raw !== "") {
      const n = Number(raw.replace(/[^\d.]/g, ""));
      fields.quantity = Number.isFinite(n) && n > 0 ? n : raw;
      matchedFields.push("quantity");
    }
  }

  // Part A ends where the component table begins (if any).
  const comp = findCompHeader(block);
  const detailEnd = comp ? comp.row : block.length;
  const bodyMatchers = MATCHERS.filter((m) => !m.header);
  for (let r = 1; r < detailEnd; r++) {
    const row = block[r] || [];
    for (let c = 0; c < row.length; c++) {
      const n = normLabel(row[c]);
      if (!n) continue;
      const m = bodyMatchers.find((mm) => mm.keys.has(n));
      if (m && fields[m.field] === undefined) {
        const v = valueRightOf(row, c, isLabelCell);
        if (v !== "") { (fields as Record<string, unknown>)[m.field] = v; matchedFields.push(m.field as string); }
      }
    }
  }

  // Enclosure box size ("1400x800x300") and layout (Single/Double) — usually in the
  // panel's top-left summary, not the label grid, so scan the whole detail area
  // (the header row included).
  for (let r = 0; r < detailEnd; r++) {
    const rr = block[r] || [];
    for (const cell of rr) {
      const s = clean(cell);
      // Allow a leading prefix on the box size — Local boxes read "L700x500x200",
      // SR-Basic can read "new1400x800x300"; parseEnclDims strips those on lookup.
      if (!fields.enclosureSize && /^[a-z]*\s*\d{2,4}\s*[x×*]\s*\d{2,4}\s*[x×*]\s*\d{2,4}$/i.test(s)) fields.enclosureSize = s;
      const n = normLabel(cell);
      if (!fields.layout && (n === "single" || n === "double")) fields.layout = s;
    }
  }

  // Cell panels (Pro-E / IS2 / PLP): the "Pro-E_70_IP65" descriptor gives type/depth/IP,
  // and the cell table (a cell-size label with its quantity in the next cell) gives the
  // cells. Both sit in the panel's top-left area.
  const toNum = (v: Cell): number => { const x = parseFloat(clean(v).replace(/[^\d.]/g, "")); return Number.isFinite(x) ? x : 0; };
  const cells: { desc: string; qty: number }[] = [];
  for (let r = 0; r < detailEnd; r++) {
    const rr = block[r] || [];
    for (let c = 0; c < rr.length; c++) {
      const s = clean(rr[c]);
      if (!s) continue;
      const dm = /^(pro-?e|is2|plp)[ _]+(\d{2,3})(?:[ _]+(ip\d{2}))?/i.exec(s);
      if (dm && !fields.cellType) {
        fields.cellType = /pro/i.test(dm[1]) ? "Pro-E" : dm[1].toUpperCase();
        fields.cellDepth = +dm[2];
        if (dm[3]) fields.cellIp = dm[3].toUpperCase();
      }
      // Cell rows come two ways: Pro-E names ("Cell 60 x 70.", "C.C x 70.", "Sides_70.")
      // and dimension names for PLP/IS2 ("2000x1000x700", "40x60"). The dimension form is
      // only treated as a cell on a cell-type panel, so it never grabs an enclosure box.
      const named = /^(c\.?c|cell|l?sides)/i.test(s) && /[x_]\s*\d/i.test(s);
      const dimCell = !!fields.cellType && /^\d{2,4}\s*x\s*\d{2,4}(\s*x\s*\d{2,4})?\.?$/i.test(s);
      if (named || dimCell) {
        const q = toNum(rr[c + 1]);
        if (q > 0) cells.push({ desc: s, qty: q });
      }
    }
  }
  if (cells.length) fields.cells = cells;

  // Part B — the component table, grouped by section labels.
  const components: ImportedComponent[] = [];
  if (comp) {
    // Prefer a Reference column in the panel's own sub-header; else the sheet-wide one.
    const refCol = comp.refCol >= 0 ? comp.refCol : globalRefCol;
    // Blank template cells often read "0" or "-"; treat those as empty so they don't
    // leak in as a component called "0" or a reference of "0".
    const ph = (s: string) => s === "" || s === "0" || s === "-";
    let currentSection = "";
    for (let r = comp.row + 1; r < block.length; r++) {
      const row = block[r] || [];
      const qtyRaw = clean(row[comp.qtyCol]);
      const desc = clean(row[comp.descCol]);
      const brand = comp.brandCol >= 0 ? clean(row[comp.brandCol]) : "";
      let ref = refCol >= 0 ? clean(row[refCol]) : "";
      if (ph(ref)) ref = "";
      if (ph(desc)) continue; // placeholder / blank description → not a component or section
      if (qtyRaw) {
        const q = Number(qtyRaw.replace(/[^\d.]/g, ""));
        components.push({ section: currentSection, qty: Number.isFinite(q) && q > 0 ? q : qtyRaw, description: desc, brand, reference: ref });
      } else {
        currentSection = desc; // description-only row → section label
      }
    }
  }

  return { itemNo, fields, matchedFields, components };
}

function parseSheetRows(rows: Row[], globalRefCol: number): ParsedPanel[] {
  const headerRows: number[] = [];
  rows.forEach((r, i) => { if (isPanelHeader(r)) headerRows.push(i); });
  const panels: ParsedPanel[] = [];
  for (let b = 0; b < headerRows.length; b++) {
    const start = headerRows[b];
    const end = b + 1 < headerRows.length ? headerRows[b + 1] : rows.length;
    panels.push(parseBlock(rows.slice(start, end), globalRefCol));
  }
  // Ignore blocks with no name — e.g. the empty "Item No." slots a blank template
  // carries — so they don't come in as unnamed panels.
  return panels.filter((p) => String(p.fields.panelName ?? "").trim() !== "");
}

// The "Copper Tool" sheet holds per-item main-busbar lengths (mm): a Rating column
// and Length Phase / Neutral / Earth columns, repeated for each item number. Returns
// itemNo → { rating: { p, n, e } }.
function parseCopperTool(wb: XLSX.WorkBook): Map<string, Record<string, { p: number; n: number; e: number }>> {
  const map = new Map<string, Record<string, { p: number; n: number; e: number }>>();
  const sheet = wb.SheetNames.find((n) => /copper\s*tool/i.test(n));
  if (!sheet) return map;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", raw: false }) as Row[];
  const toNum = (v: Cell): number => { const x = parseFloat(clean(v).replace(/[^\d.]/g, "")); return Number.isFinite(x) ? x : 0; };
  let ratingCol = -1, pCol = -1, nCol = -1, eCol = -1, itemCol = -1, hdr = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const rat = r.findIndex((c) => /^rating/.test(normLabel(c)));
    const p = r.findIndex((c) => normLabel(c) === "phase");
    const n = r.findIndex((c) => normLabel(c) === "neutral");
    const e = r.findIndex((c) => normLabel(c) === "earth");
    if (rat >= 0 && p >= 0 && n >= 0 && e >= 0) { hdr = i; ratingCol = rat; pCol = p; nCol = n; eCol = e; itemCol = r.findIndex((c) => /^item no/.test(normLabel(c))); break; }
  }
  if (hdr < 0) return map;
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const rating = toNum(r[ratingCol]);
    if (!rating) continue;
    const p = toNum(r[pCol]), n = toNum(r[nCol]), e = toNum(r[eCol]);
    if (!p && !n && !e) continue; // no copper on this rating → skip
    let item = itemCol >= 0 ? (clean(r[itemCol]).match(/(\d+)/) || [])[1] || "" : "";
    if (!item) item = String(toNum(r[0]) || "");
    if (!item) continue;
    if (!map.has(item)) map.set(item, {});
    map.get(item)![String(rating)] = { p, n, e };
  }
  return map;
}

function parseWorkbook(buf: ArrayBuffer): { sheet: string; panels: ParsedPanel[] } {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const copper = parseCopperTool(wb);
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false }) as Row[];
    if (rows.some(isPanelHeader)) {
      const panels = parseSheetRows(rows, findRefColumn(rows));
      for (const p of panels) { const c = copper.get(p.itemNo); if (c && Object.keys(c).length) p.fields.busbarCopper = c; }
      return { sheet: name, panels };
    }
  }
  return { sheet: wb.SheetNames[0] || "", panels: [] };
}

interface EvalRow { field: string; label: string; value: string; status: "matched" | "check" | "empty" }
interface Evaluated { rows: EvalRow[]; matchedCount: number; checkCount: number; name: string; problem: boolean }
function evaluate(panel: ParsedPanel): Evaluated {
  const rows: EvalRow[] = FIELD_MAP.map((f) => {
    const raw = (panel.fields as Record<string, unknown>)[f.field as string];
    const has = raw !== undefined && String(raw).trim() !== "";
    let status: EvalRow["status"] = "empty";
    if (has) {
      const opts = DROPDOWN_OPTIONS[f.field as string];
      status = !opts ? "matched" : opts.some((o) => normVal(o) === normVal(raw)) ? "matched" : "check";
    }
    return { field: f.field as string, label: f.label, value: has ? String(raw) : "", status };
  });
  const matchedCount = rows.filter((r) => r.status === "matched").length;
  const checkCount = rows.filter((r) => r.status === "check").length;
  const name = panel.fields.panelName ? String(panel.fields.panelName) : "";
  return { rows, matchedCount, checkCount, name, problem: !name || panel.matchedFields.length === 0 };
}

// ── Template download ────────────────────────────────────────────────────────
interface TmplComp { qty: number; desc: string; brand: string; ref: string }
interface TmplSection { section: string; rows: TmplComp[] }
function buildTemplateBlocks(): Cell[][] {
  const g: Cell[][] = [];
  let r = 0;
  const put = (row: number, col: number, v: Cell) => { while (g.length <= row) g.push([]); const rr = g[row]; while (rr.length <= col) rr.push(null); rr[col] = v; };
  const fieldsFor = (rating: string, fedFrom: string): [string, string][] => [
    ["Panel Type", "Local"], ["IP / Rating", rating],
    ["Mounting", "Floor Standing"], ["Amb. Temp.", "35°C"],
    ["RAL", "7035"], ["Neutral", "50% Phase"],
    ["Copper", "Bare"], ["Earth", "25% Phase"],
    ["Incoming Cables", "Bottom"], ["Form", "1"],
    ["Outgoing Cables", "Bottom"], ["Fed From", fedFrom],
    ["Short Circuit", "50kA"],
  ];
  const block = (no: number, name: string, qty: number, fields: [string, string][], comps: TmplSection[]) => {
    put(r, 0, `Item No. ${no}`); put(r, 1, name); put(r, 3, "Item Qty."); put(r, 4, qty); r++;
    for (let i = 0; i < fields.length; i += 2) {
      put(r, 0, fields[i][0]); put(r, 1, fields[i][1]);
      if (fields[i + 1]) { put(r, 3, fields[i + 1][0]); put(r, 4, fields[i + 1][1]); }
      r++;
    }
    r++; // blank spacer before the component table
    put(r, 0, "Qty"); put(r, 1, "Description"); put(r, 2, "Brand"); put(r, 3, "Reference"); r++;
    for (const sec of comps) {
      put(r, 1, sec.section); r++; // section label: text in Description column only
      for (const c of sec.rows) { put(r, 0, c.qty); put(r, 1, c.desc); put(r, 2, c.brand); put(r, 3, c.ref); r++; }
    }
    r++; // blank spacer between panels
  };
  block(1, "MDB-01 Main Distribution", 1, fieldsFor("IP54 / 2000A", "Transformer 1"), [
    { section: "Main Incoming", rows: [
      { qty: 1, desc: "ACB 2000A 3P Fixed", brand: "ABB", ref: "ACB-E2.2-2000" },
      { qty: 3, desc: "Current Transformer 2000/5A", brand: "ABB", ref: "CT-2000-5" },
    ] },
    { section: "Outgoings", rows: [
      { qty: 2, desc: "MCCB 250A 3P", brand: "ABB", ref: "XT4-250-3P" },
      { qty: 1, desc: "MCCB 100A 4P (leave Reference blank if unknown)", brand: "ABB", ref: "" },
    ] },
  ]);
  block(2, "SMDB-02 Sub Main", 2, fieldsFor("IP42 / 630A", "MDB-01"), [
    { section: "Main Incoming", rows: [
      { qty: 1, desc: "MCCB 630A 3P", brand: "ABB", ref: "XT5-630-3P" },
    ] },
    { section: "Outgoings", rows: [
      { qty: 4, desc: "MCCB 160A 3P", brand: "ABB", ref: "XT2-160-3P" },
      { qty: 6, desc: "MCB 63A 4P", brand: "ABB", ref: "XT1-100-4P" },
    ] },
  ]);
  return g;
}
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet(buildTemplateBlocks());
  ws["!cols"] = [{ wch: 18 }, { wch: 42 }, { wch: 16 }, { wch: 20 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Panels");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = "Panels import template.xlsx";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  onImportPanels: (panels: ImportedPanel[]) => void;
  knownComponentRefs?: string[] | Set<string>;
}
interface Preview { fileName: string; sheet: string; panels: { parsed: ParsedPanel; ev: Evaluated }[] }
interface ProblemPanel { label: string; bad: { ref: string; desc: string }[] }

export default function PanelsBulkImport({ onImportPanels, knownComponentRefs = [] }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");

  const known = useMemo(() => {
    const s = new Set<string>();
    (Array.isArray(knownComponentRefs) ? knownComponentRefs : [...knownComponentRefs]).forEach((r) => { if (r) s.add(normVal(r)); });
    return s;
  }, [knownComponentRefs]);

  const isKnown = (ref: string) => !!ref.trim() && known.has(normVal(ref));

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setError("");
    try {
      const { sheet, panels } = parseWorkbook(await f.arrayBuffer());
      if (!panels.length) {
        setError(`No panels found in "${f.name}". Each panel block must start with a row containing "Item No." plus "Item Qty.". Try Download template for a known-good file.`);
        return;
      }
      setPreview({ fileName: f.name, sheet, panels: panels.map((p) => ({ parsed: p, ev: evaluate(p) })) });
    } catch {
      setError(`"${f.name}" could not be read as an Excel file. Save it as .xlsx and try again.`);
    }
  };

  // Which panels have components not matched to the tool (unknown or blank
  // reference), and what those components are — grouped by panel so you can see
  // exactly which panels to check.
  const problemPanels = useMemo<ProblemPanel[]>(() => {
    if (!preview) return [];
    return preview.panels
      .map(({ parsed, ev }, i) => ({
        label: `Panel ${parsed.itemNo || i + 1}${ev.name ? " · " + ev.name : ""}`,
        bad: parsed.components.filter((c) => !isKnown(c.reference)).map((c) => ({ ref: (c.reference || "").trim(), desc: c.description })),
      }))
      .filter((p) => p.bad.length > 0);
  }, [preview, known]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalBad = problemPanels.reduce((n, p) => n + p.bad.length, 0);

  const confirm = () => {
    if (!preview) return;
    onImportPanels(preview.panels.map(({ parsed }) => ({ ...parsed.fields, components: parsed.components } as ImportedPanel)));
    setPreview(null);
  };

  const modal = preview && createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={() => setPreview(null)} />
      <div className="relative my-8 w-full max-w-5xl overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop dark:bg-surface">
        <div className="h-1.5 bg-brand" />
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-lg font-extrabold text-ink">{preview.panels.length} panel{preview.panels.length === 1 ? "" : "s"} found</h2>
          <p className="mt-0.5 text-sm text-muted">
            from “{preview.fileName}” · sheet “{preview.sheet}” · they’ll be added to this quote when you confirm
          </p>
        </div>

        {problemPanels.length > 0 && (
          <div className="mx-6 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              ⚠ {totalBad} component{totalBad === 1 ? "" : "s"} in {problemPanels.length} panel{problemPanels.length === 1 ? "" : "s"} {totalBad === 1 ? "isn’t" : "aren’t"} matched to the tool:
            </p>
            <ul className="mt-1.5 space-y-1 text-xs">
              {problemPanels.map((p, i) => (
                <li key={i} className="break-words">
                  <span className="font-bold" style={{ color: TRED }}>{p.label}:</span>{" "}
                  <span className="font-mono">{p.bad.map((b) => b.ref || `(no ref) ${b.desc}`).join(",  ")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-muted">Import anyway — these come in as written and can be fixed on the panel — or Cancel and correct the file.</p>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto px-6 py-3">
          {preview.panels.map(({ parsed, ev }, i) => {
            const f = parsed.fields;
            const unknownInPanel = parsed.components.filter((c) => !isKnown(c.reference)).length;
            const sections = Array.from(new Set(parsed.components.map((c) => c.section || "(no section)")));
            // Spec grid in the tool's two-column order.
            const specOrder = ["panelType", "busbarRating", "mounting", "ambTemp", "ral", "neutral", "copper", "earth", "incomingCables", "form", "outgoingCables", "fedFrom", "shortCircuit", ""];
            const pairs: string[][] = [];
            for (let k = 0; k < specOrder.length; k += 2) pairs.push([specOrder[k], specOrder[k + 1] ?? ""]);
            const BORDER = "#E7E7EB", INK = "#2b2421";
            return (
              // Rendered as a light "offer sheet" — the tool's panels are always light,
              // so fixed colours here rather than theme tokens, regardless of dark mode.
              <div key={i} className="mb-5 overflow-hidden rounded-lg border bg-white" style={{ borderColor: "#d4d4da" }}>
                {/* item bar */}
                <div className="flex text-sm font-bold text-white" style={{ background: TRED }}>
                  <div className="border-r border-white/40 px-3 py-1.5">Item No. {parsed.itemNo || i + 1}</div>
                  <div className="flex-1 px-3 py-1.5 text-center">{ev.name}</div>
                  <div className="border-l border-white/40 px-3 py-1.5">Item Qty.</div>
                  <div className="w-16 border-l border-white/40 px-3 py-1.5 text-center">{f.quantity ?? ""}</div>
                </div>
                {/* sizing summary — panel type · box size · layout (the tool's top-left enclosure) */}
                {(f.panelType || f.enclosureSize || f.layout || f.cellType) && (
                  <div className="border-b px-3 py-1.5 text-[12px]" style={{ borderColor: BORDER, background: "#faf9f7" }}>
                    <span className="font-bold" style={{ color: TRED }}>Sizing: </span>
                    <span style={{ color: INK }}>{(f.cellType
                      ? [`${f.cellType} cells`, f.cellDepth ? `${f.cellDepth} cm` : "", f.layout]
                      : [f.panelType, f.enclosureSize, f.layout]).filter(Boolean).join("  ·  ") || "—"}</span>
                  </div>
                )}
                {/* spec grid */}
                <table className="w-full table-fixed border-collapse">
                  <tbody>
                    {pairs.map((pair, ri) => (
                      <tr key={ri}>
                        {pair.map((field, ci) => {
                          const r = field ? ev.rows.find((x) => x.field === field) : undefined;
                          const label = field ? (FIELD_MAP.find((fm) => fm.field === field)?.label ?? field) : "";
                          const amber = r && r.status === "check";
                          return (
                            <Fragment key={ci}>
                              <td className="w-[22%] border px-2 py-1 align-top text-[11px] font-bold" style={{ color: field ? TRED : "transparent", background: field ? "#fdf0e9" : "transparent", borderColor: BORDER }}>{label}</td>
                              <td className="w-[28%] border px-2 py-1 align-top text-[12px]" style={{ borderColor: BORDER, color: amber ? "#B7791F" : INK }}>{r ? r.value : ""}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* component table */}
                {parsed.components.length > 0 && (
                  <div className="overflow-x-auto">
                    {/* whitespace-nowrap: every component stays on one row; the columns
                        size to their content and the table scrolls sideways if needed. */}
                    <table className="w-full border-collapse whitespace-nowrap text-[12px]">
                      <thead>
                        <tr className="text-white" style={{ background: TRED }}>
                          <th className="w-12 border px-2 py-1.5 text-center font-bold" style={{ borderColor: "rgba(255,255,255,0.3)" }}>Qty</th>
                          <th className="border px-3 py-1.5 text-left font-bold" style={{ borderColor: "rgba(255,255,255,0.3)" }}>Description</th>
                          <th className="border px-3 py-1.5 text-left font-bold" style={{ borderColor: "rgba(255,255,255,0.3)" }}>Reference</th>
                          <th className="border px-3 py-1.5 text-left font-bold" style={{ borderColor: "rgba(255,255,255,0.3)" }}>Brand</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map((sec) => (
                          <Fragment key={sec}>
                            <tr>
                              <td colSpan={4} className="border px-2 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: TRED, background: "#fdf0e9", borderColor: BORDER }}>{sec}</td>
                            </tr>
                            {parsed.components.filter((c) => (c.section || "(no section)") === sec).map((c, j) => {
                              const bad = !isKnown(c.reference);
                              return (
                                <tr key={j}>
                                  <td className="border px-2 py-1.5 text-center" style={{ borderColor: BORDER, color: INK }}>{c.qty}</td>
                                  <td className="border px-3 py-1.5" style={{ borderColor: BORDER, color: INK }}>{c.description}</td>
                                  <td className="border px-3 py-1.5 font-mono text-[11px]" style={{ borderColor: BORDER, color: bad ? "#C0453F" : INK }}>{c.reference || "— no ref —"}{bad ? " ⚠" : ""}</td>
                                  <td className="border px-3 py-1.5" style={{ borderColor: BORDER, color: "#8A8A8B" }}>{c.brand}</td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* summary strip */}
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs" style={{ background: "#faf9f7", color: "#8A8A8B" }}>
                  <span><span className="font-bold" style={{ color: "#2E7D4F" }}>{ev.matchedCount} fields matched</span> · {parsed.components.length} component{parsed.components.length === 1 ? "" : "s"}{unknownInPanel > 0 && <span className="font-bold" style={{ color: "#C0453F" }}> · {unknownInPanel} unmatched</span>}</span>
                  {ev.problem && <span className="font-semibold" style={{ color: "#C0453F" }}>Check this block’s layout.</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button className="btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
          <button className="btn-primary" onClick={confirm}>
            Confirm — add {preview.panels.length} panel{preview.panels.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onFile} />
      <button className="btn-primary w-full" onClick={() => fileRef.current?.click()}>Import panels from Excel</button>
      <button className="btn-ghost w-full" onClick={downloadTemplate}>⬇ Download template</button>
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:bg-red-950/30">{error}</div>
      )}
      {modal}
    </div>
  );
}
