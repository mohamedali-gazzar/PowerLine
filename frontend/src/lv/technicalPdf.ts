// ─────────────────────────────────────────────────────────────────────────────
// Technical Offer → real multi-page PDF (jsPDF + autoTable).
//
// Why this exists: the on-screen Technical offer used to print via window.print(),
// which forced one panel per page and could not repeat a header/footer with a
// running page number across a table that overflows. This module builds the PDF
// programmatically so component tables flow naturally across A4 pages, the column
// header repeats on every page, and the logo header + "Page X of Y" footer are
// drawn on every page except the cover.
//
// The caller passes a fully-prepared `TechnicalDoc` (plain data — spec rows and
// grouped component rows already computed by the React layer) plus the live cover
// DOM node, which we snapshot with html2canvas so the richly-designed cover stays
// pixel-identical to the HTML and auto-syncs with any edits.
// ─────────────────────────────────────────────────────────────────────────────
import { jsPDF } from "jspdf";
import autoTable, { type CellDef, type RowInput, type Styles } from "jspdf-autotable";
import html2canvas from "html2canvas";

type RGB = [number, number, number];
const TRED: RGB = [241, 103, 34]; // #F16722 brand orange
const WHITE: RGB = [255, 255, 255];
const INK: RGB = [30, 30, 34]; // #1e1e22
const MUTED: RGB = [107, 107, 114]; // #6b6b72
const LABEL_BG: RGB = [253, 240, 233]; // #fdf0e9 spec-label tint
const LINE: RGB = [231, 231, 235]; // #E7E7EB hairlines
const ZEBRA: RGB = [244, 244, 246]; // #f4f4f6 alt row
const SEC_BG: RGB = [214, 214, 220]; // #d6d6dc section band

// A4 geometry (mm)
const PW = 210;
const PH = 297;
const ML = 12; // left margin
const MR = 12; // right margin
const CW = PW - ML - MR; // 186mm content width
const HEADER_TOP = 9; // logo top
const HEADER_RULE = 22; // header divider y
const CONTENT_TOP = 26; // first content baseline / autoTable top margin
const CONTENT_BOTTOM = 14; // autoTable bottom margin (room for footer)
const FOOTER_Y = PH - 8; // footer baseline

// Spec grid / item bar column split (matches the HTML: 18 / 51 / 18 / 13).
const SPEC_COLS = { 0: 0.18, 1: 0.51, 2: 0.18, 3: 0.13 };
// Components column split (matches the HTML: 10 / 63 / 7 / 10 / 10).
const COMP_COLS = { 0: 0.1, 1: 0.63, 2: 0.07, 3: 0.1, 4: 0.1 };
const w = (frac: number) => CW * frac;

export type PdfCompRow =
  | { kind: "section"; label: string }
  | { kind: "group"; label: string; suffix: string } // suffix e.g. ", QTY (4) each contain:" ("" if none)
  | { kind: "comp"; qty: string; desc: string; comment: string; adj: string; brand: string; note: string; zebra: boolean }
  | { kind: "spacer" };

export type PdfPanel = {
  itemNo: number;
  name: string;
  qty: string;
  spec: [string, string, string, string][]; // 7 rows: label, value, label, value
  rows: PdfCompRow[];
};

export type TechnicalDoc = {
  filename: string;
  projectName: string;
  qtnRef: string;
  customer: string;
  notes: { general: string[]; additional: string[] };
  panels: PdfPanel[];
};

// ── asset helpers ────────────────────────────────────────────────────────────
async function loadDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Snapshot the cover to an image. We clone the node into a clean off-screen holder
// first so the animate-fade-up ancestor transform (which offsets html2canvas) can't
// interfere, and neutralise any residual animation on the clone itself.
async function captureCover(coverEl: HTMLElement): Promise<string | null> {
  const clone = coverEl.cloneNode(true) as HTMLElement;
  clone.style.transform = "none";
  clone.style.animation = "none";
  clone.style.opacity = "1";
  clone.style.margin = "0";
  clone.style.boxShadow = "none";
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#ffffff;";
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    const canvas = await html2canvas(clone, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  } finally {
    document.body.removeChild(holder);
  }
}

// ── component-row → autoTable cells ──────────────────────────────────────────
function rowToCells(r: PdfCompRow): CellDef[] {
  if (r.kind === "section") {
    const band: Partial<Styles> = { fillColor: SEC_BG, lineWidth: 0, textColor: INK };
    return [
      { content: "", styles: band },
      { content: r.label, styles: { ...band, halign: "center", fontStyle: "bold", fontSize: 9 } },
      { content: "", colSpan: 3, styles: band },
    ];
  }
  if (r.kind === "group") {
    return [
      {
        content: r.label + r.suffix,
        colSpan: 5,
        styles: { textColor: TRED, fontStyle: r.suffix ? "bold" : "normal", fontSize: 9.5, halign: "left", cellPadding: { top: 1.2, bottom: 1, left: 2, right: 2 } },
      },
    ];
  }
  if (r.kind === "spacer") {
    return [{ content: "", colSpan: 5, styles: { fontSize: 4, cellPadding: 0.6 } }];
  }
  const fill = r.zebra ? ZEBRA : WHITE;
  const cell = (content: string, extra: Partial<Styles> = {}): CellDef => ({ content, styles: { fillColor: fill, ...extra } });
  return [
    cell(r.qty, { halign: "center", fontStyle: "bold" }),
    cell(r.comment ? `${r.desc}\n${r.comment}` : r.desc),
    cell(r.adj, { halign: "center" }),
    cell(r.brand),
    cell(r.note, { textColor: MUTED, fontSize: 8 }),
  ];
}

// ── main entry ───────────────────────────────────────────────────────────────
export async function exportTechnicalPdf(doc: TechnicalDoc, coverEl: HTMLElement | null): Promise<void> {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });

  const logo = await loadDataUrl("/brand/logo-horizontal.png");
  let logoW = 0;
  const logoH = 11;
  if (logo) {
    const props = pdf.getImageProperties(logo);
    logoW = (props.width / props.height) * logoH;
  }

  // ── page 1: cover snapshot ──
  let firstContentPage = 1;
  if (coverEl) {
    const cover = await captureCover(coverEl);
    if (cover) {
      pdf.addImage(cover, "JPEG", 0, 0, PW, PH);
      pdf.addPage();
      firstContentPage = 2;
    }
  }

  // ── notes page ──
  let y = CONTENT_TOP;
  const ensureSpace = (needed: number) => {
    if (y + needed > PH - CONTENT_BOTTOM) {
      pdf.addPage();
      y = CONTENT_TOP;
    }
  };
  const drawNotes = (title: string, lines: string[]) => {
    ensureSpace(10);
    pdf.setFont("helvetica", "bolditalic");
    pdf.setFontSize(13);
    pdf.setTextColor(...TRED);
    pdf.text(title, ML, y);
    // underline the heading
    const tw = pdf.getTextWidth(title);
    pdf.setDrawColor(...TRED);
    pdf.setLineWidth(0.3);
    pdf.line(ML, y + 1.2, ML + tw, y + 1.2);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    lines.forEach((ln, i) => {
      const wrapped = pdf.splitTextToSize(ln || " ", CW - 8) as string[];
      ensureSpace(wrapped.length * 4.6 + 1);
      pdf.setTextColor(...TRED);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${i + 1}-`, ML, y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...INK);
      pdf.text(wrapped, ML + 7, y);
      y += wrapped.length * 4.6 + 1.4;
    });
    y += 5;
  };
  drawNotes("General Notes :-", doc.notes.general);
  drawNotes("Additional Notes :-", doc.notes.additional);

  // ── panel pages ──
  const specColStyles = {
    0: { cellWidth: w(SPEC_COLS[0]), fillColor: LABEL_BG, textColor: TRED, fontStyle: "bold" as const },
    1: { cellWidth: w(SPEC_COLS[1]) },
    2: { cellWidth: w(SPEC_COLS[2]), fillColor: LABEL_BG, textColor: TRED, fontStyle: "bold" as const },
    3: { cellWidth: w(SPEC_COLS[3]) },
  };
  for (const panel of doc.panels) {
    pdf.addPage();

    // item bar (orange)
    autoTable(pdf, {
      startY: CONTENT_TOP,
      margin: { left: ML, right: MR },
      theme: "plain",
      body: [[
        { content: `Item No. ${panel.itemNo}`, styles: { halign: "left" } },
        { content: panel.name, styles: { halign: "center" } },
        { content: "Item Qty.", styles: { halign: "left" } },
        { content: panel.qty, styles: { halign: "center" } },
      ]] as RowInput[],
      styles: { fillColor: TRED, textColor: WHITE, fontStyle: "bold", fontSize: 10, cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 }, lineWidth: 0 },
      columnStyles: { 0: { cellWidth: w(SPEC_COLS[0]) }, 1: { cellWidth: w(SPEC_COLS[1]) }, 2: { cellWidth: w(SPEC_COLS[2]) }, 3: { cellWidth: w(SPEC_COLS[3]) } },
    });

    // spec grid (bordered)
    autoTable(pdf, {
      startY: (pdf as any).lastAutoTable.finalY,
      margin: { left: ML, right: MR },
      theme: "grid",
      body: panel.spec.map(([l1, v1, l2, v2]) => [l1, v1 || "", l2, v2 || ""]) as RowInput[],
      styles: { fontSize: 8.5, cellPadding: { top: 0.9, bottom: 0.9, left: 2, right: 2 }, lineColor: LINE, lineWidth: 0.1, textColor: INK, valign: "middle" },
      columnStyles: specColStyles,
    });

    // components table (flows across pages; column header repeats)
    autoTable(pdf, {
      startY: (pdf as any).lastAutoTable.finalY + 3,
      margin: { left: ML, right: MR, top: CONTENT_TOP, bottom: CONTENT_BOTTOM },
      theme: "plain",
      head: [[
        { content: "Qty", styles: { halign: "center" } },
        { content: "Description", styles: { halign: "center" } },
        { content: "ADJ", styles: { halign: "center" } },
        { content: "Brand", styles: { halign: "left" } },
        { content: "NOTE", styles: { halign: "left" } },
      ]] as RowInput[],
      body: panel.rows.map(rowToCells) as RowInput[],
      headStyles: { fillColor: TRED, textColor: WHITE, fontStyle: "bold", fontSize: 9, halign: "center", cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 }, lineWidth: 0 },
      bodyStyles: { fontSize: 8.5, cellPadding: { top: 0.9, bottom: 0.9, left: 2, right: 2 }, textColor: INK, valign: "top", lineWidth: 0, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: w(COMP_COLS[0]), halign: "center" },
        1: { cellWidth: w(COMP_COLS[1]) },
        2: { cellWidth: w(COMP_COLS[2]), halign: "center" },
        3: { cellWidth: w(COMP_COLS[3]) },
        4: { cellWidth: w(COMP_COLS[4]) },
      },
    });
  }

  // ── running header + footer on every page except the cover ──
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    if (i < firstContentPage) continue; // cover: no header/footer
    pdf.setPage(i);
    // header — logo left, project + qtn·customer right, hairline rule
    if (logo && logoW > 0) pdf.addImage(logo, "PNG", ML, HEADER_TOP, logoW, logoH);
    if (doc.projectName) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10.5);
      pdf.setTextColor(...INK);
      pdf.text(doc.projectName, PW - MR, HEADER_TOP + 5, { align: "right", maxWidth: CW - logoW - 6 });
    }
    const sub = [doc.qtnRef, doc.customer].filter(Boolean).join("   ·   ");
    if (sub) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...MUTED);
      pdf.text(sub, PW - MR, HEADER_TOP + 10, { align: "right" });
    }
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.25);
    pdf.line(ML, HEADER_RULE, PW - MR, HEADER_RULE);
    // footer — centered "Page X of Y"
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...MUTED);
    pdf.text(`Page ${i} of ${total}`, PW / 2, FOOTER_Y, { align: "center" });
  }

  pdf.save(doc.filename.toLowerCase().endsWith(".pdf") ? doc.filename : `${doc.filename}.pdf`);
}
