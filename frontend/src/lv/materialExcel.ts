// Builds the styled Material List Excel workbook (ExcelJS) — a visual mirror of
// the on-screen tables. For each section, top to bottom:
//   1. Section title band  — merged across the 4 columns, peach fill, bold
//      orange text; an optional right-side note sits right-aligned in the last
//      column of the same band (charcoal).
//   2. Column header row   — DESCRIPTION | REFERENCE | STOCK | QTY (uppercase).
//   3. One row per item     — Description, Reference, Stock, Qty.
//   4. One empty spacer row before the next section.
// The Copper block renders as a title band with the total weight as its note.
import ExcelJS from "exceljs";
import type { MatRow } from "./store";

export type MatBlock =
  | { kind: "table"; title: string; rows: MatRow[]; withSupplier?: boolean; note?: string }
  | { kind: "copper"; title: string; kg: number };

// Palette (ARGB — opaque) matching the screen.
const PEACH = "FFFBEADF";       // section title band fill
const ORANGE = "FFF16722";      // section title text
const CHARCOAL = "FF585859";    // notes + header text
const HEADER_FILL = "FFF7F6F4"; // column header fill
const HEADER_BORDER = "FFE4E3E0";
const DATA_TEXT = "FF2C2C2D";
const ROW_BORDER = "FFEDECEA";

const COLS = 4;
const solid = (cell: ExcelJS.Cell, argb: string) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
};

export function buildMaterialWorkbook(blocks: MatBlock[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Material List");
  ws.getColumn(1).width = 55; // Description
  ws.getColumn(2).width = 22; // Reference
  ws.getColumn(3).width = 16; // Stock
  ws.getColumn(4).width = 8;  // Qty

  blocks.forEach((b, i) => {
    const title = `${i + 1} · ${b.title}`;
    const note = b.kind === "copper" ? `${b.kg.toFixed(1)} kg` : b.note;

    // 1. Section title band ----------------------------------------------------
    const tr = ws.addRow([]);
    const r = tr.number;
    if (note) {
      ws.mergeCells(r, 1, r, COLS - 1); // title spans the first 3 columns…
      const nc = ws.getCell(r, COLS);   // …the note sits in the last column
      nc.value = note;
      nc.font = { color: { argb: CHARCOAL } };
      nc.alignment = { horizontal: "right", vertical: "middle" };
    } else {
      ws.mergeCells(r, 1, r, COLS);
    }
    const tc = ws.getCell(r, 1);
    tc.value = title;
    tc.font = { bold: true, color: { argb: ORANGE } };
    tc.alignment = { horizontal: "left", vertical: "middle" };
    for (let c = 1; c <= COLS; c++) solid(ws.getCell(r, c), PEACH); // whole band peach

    if (b.kind === "table") {
      // 2. Column header row ---------------------------------------------------
      const hr = ws.addRow(["DESCRIPTION", "REFERENCE", "STOCK", "QTY"]);
      for (let c = 1; c <= COLS; c++) {
        const cell = hr.getCell(c);
        cell.font = { bold: true, color: { argb: CHARCOAL } };
        solid(cell, HEADER_FILL);
        cell.border = { bottom: { style: "thin", color: { argb: HEADER_BORDER } } };
        cell.alignment = { horizontal: c === COLS ? "right" : "left" };
      }
      // 3. Data rows -----------------------------------------------------------
      b.rows.forEach((row) => {
        const dr = ws.addRow([row.description, row.reference || "—", row.stock || "—", row.qty]);
        for (let c = 1; c <= COLS; c++) {
          const cell = dr.getCell(c);
          cell.font = { bold: c === COLS, color: { argb: DATA_TEXT } };
          cell.border = { bottom: { style: "thin", color: { argb: ROW_BORDER } } };
          cell.alignment = { horizontal: c === COLS ? "right" : "left" };
        }
      });
    }

    // 4. Spacer row ------------------------------------------------------------
    ws.addRow([]);
  });

  return wb;
}
