import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { CommercialData } from "./commercial.service";
import {
  INTRO_EN,
  PRODUCT_LABELS,
  PRICE_NOTE_EN,
  PRICE_NOTE_AR,
  GENERAL_TITLE_EN,
  GENERAL_TITLE_AR,
  GENERAL_TERMS,
  SPECIAL_TITLE_EN,
  SPECIAL_TITLE_AR,
  SPECIAL_TERMS,
  OFFICES,
  CONTACT_EMAIL,
  type BiTerm,
} from "../domain/commercialContent";

// --- Brand design ---
const ORANGE = "#ff6600";
const ORANGE_DK = "#d95500";
const LIGHT = "#ffe2d1";
const TINT = "#fff4ec";
const GREY = "#767070";
const INK = "#2b2421";
const GREYBAR = "#bdb7b3";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

let BODY = "Helvetica";
let BOLD = "Helvetica-Bold";
let ITALIC = "Helvetica-Oblique";
let AR = "Helvetica"; // replaced with Arial when available (has Arabic glyphs)

function asset(name: string): string {
  const candidates = [
    path.join(__dirname, "..", "assets", name),
    path.join(__dirname, "..", "..", "src", "assets", name),
    path.join(process.cwd(), "src", "assets", name),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

function setupFonts(doc: PDFKit.PDFDocument) {
  const a = "C:/Windows/Fonts/arial.ttf";
  const b = "C:/Windows/Fonts/arialbd.ttf";
  const it = "C:/Windows/Fonts/ariali.ttf";
  if (fs.existsSync(a) && fs.existsSync(b)) {
    try {
      doc.registerFont("body", a);
      doc.registerFont("bold", b);
      doc.registerFont("italic", fs.existsSync(it) ? it : a);
      BODY = "body";
      BOLD = "bold";
      ITALIC = "italic";
      AR = "body";
    } catch {
      /* keep Helvetica */
    }
  }
}

// PDFKit reverses LTR runs (digits / Latin) inside an RTL line; pre-reverse
// those runs so they come out correct. The font shapes the Arabic itself.
const shapeAr = (s: string) =>
  s.replace(/[0-9A-Za-z%][0-9A-Za-z%.\-/]*/g, (m) => [...m].reverse().join(""));

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Render Arabic text right-aligned in a box [x, x+w]. */
function arText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  w: number,
  font = AR,
  size = 9.5
) {
  doc.font(font).fontSize(size);
  doc.text(shapeAr(text), x, y, { width: w, align: "right", features: [] });
}

export function generateCommercialPdf(d: CommercialData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      setupFonts(doc);
      const onBreak = () => runningHeader(doc);
      (doc as unknown as { __onBreak: () => void }).__onBreak = onBreak;

      coverPage(doc, d);

      doc.addPage();
      onBreak();
      mainOffer(doc, d);

      doc.addPage();
      onBreak();
      bilingualTerms(doc, GENERAL_TITLE_EN, GENERAL_TITLE_AR, GENERAL_TERMS);

      doc.addPage();
      onBreak();
      bilingualTerms(doc, SPECIAL_TITLE_EN, SPECIAL_TITLE_AR, SPECIAL_TERMS);

      doc.addPage();
      onBreak();
      contactPage(doc);

      pageFooters(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ------------------------------------------------------------------ COVER

function coverPage(doc: PDFKit.PDFDocument, d: CommercialData) {
  doc.rect(0, 0, PAGE_W, 6).fill(ORANGE);
  safeImage(doc, asset("logo.png"), MARGIN, 24, { width: 130 });
  doc.font(BODY).fontSize(9).fillColor(GREY)
    .text("www.powerline.com.eg", PAGE_W - MARGIN - 200, 40, { width: 200, align: "right" });

  // COMMERCIAL OFFER title
  let y = 96;
  doc.rect(MARGIN, y + 4, 12, 38).fill(GREYBAR);
  doc.font(BOLD).fontSize(28).fillColor(ORANGE).text("COMMERCIAL", MARGIN + 22, y);
  doc.fillColor(GREYBAR).text("OFFER", MARGIN + 22, y + 30);
  doc.fillColor(INK);

  // Intro
  y += 92;
  doc.font(ITALIC).fontSize(10).fillColor(GREY)
    .text(INTRO_EN, MARGIN, y, { width: CONTENT_W, align: "left", lineGap: 2 });

  // Product range labels (row of 4)
  y = doc.y + 16;
  const n = PRODUCT_LABELS.length;
  const gap = 10;
  const cw = (CONTENT_W - gap * (n - 1)) / n;
  PRODUCT_LABELS.forEach((label, i) => {
    const x = MARGIN + i * (cw + gap);
    doc.roundedRect(x, y, cw, 54, 6).fillAndStroke(TINT, LIGHT);
    doc.fillColor(ORANGE_DK).font(BOLD).fontSize(8)
      .text(label, x + 6, y + 10, { width: cw - 12, align: "center" });
  });

  // Customer / reference block
  const boxY = y + 78;
  const boxH = 168;
  doc.roundedRect(MARGIN, boxY, CONTENT_W, boxH, 8).fillAndStroke(TINT, LIGHT);
  doc.rect(MARGIN, boxY, 5, boxH).fill(ORANGE);
  const rows: [string, string][] = [
    ["Customer Name", d.customer],
    ["Project Name", d.project],
    ["Location", d.location || "—"],
    ["Customer Reference No.", "—"],
    ["PL Reference No.", d.plReference],
    ["Revision Date", d.date],
    ["Sales Manager", "Ali Kamal  ·  0100 000 2147  ·  ali.kamal@powerline.com.eg"],
  ];
  let ry = boxY + 14;
  for (const [k, v] of rows) {
    doc.font(BOLD).fontSize(9).fillColor(GREY).text(k.toUpperCase(), MARGIN + 18, ry, { width: 165 });
    if (hasArabic(v)) {
      arText(doc, v, MARGIN + 188, ry, CONTENT_W - 205, BODY, 10);
    } else {
      doc.font(BODY).fontSize(9.5).fillColor(INK).text(v, MARGIN + 188, ry, { width: CONTENT_W - 205 });
    }
    ry += 21.5;
  }

  // Footer
  doc.rect(0, PAGE_H - 30, PAGE_W, 30).fill(ORANGE);
  doc.fillColor("white").font(BODY).fontSize(9);
  bottomText(doc, "powerline.com.eg   ·   Facebook   ·   LinkedIn", MARGIN, PAGE_H - 20, {
    width: CONTENT_W,
    align: "center",
  });
  doc.fillColor(INK);
}

function runningHeader(doc: PDFKit.PDFDocument) {
  safeImage(doc, asset("logo.png"), MARGIN, 22, { width: 74 });
  doc.font(BOLD).fontSize(10).fillColor(ORANGE_DK)
    .text("Commercial Offer", MARGIN, 34, { width: CONTENT_W, align: "right" });
  doc.moveTo(MARGIN, 74).lineTo(PAGE_W - MARGIN, 74).lineWidth(1).strokeColor(LIGHT).stroke();
  doc.fillColor(INK);
  doc.x = MARGIN;
  doc.y = 84;
}

// --------------------------------------------------------------- MAIN OFFER

function mainOffer(doc: PDFKit.PDFDocument, d: CommercialData) {
  sectionTitle(doc, "Main Offer");
  const cols = { item: 32, qty: 44, unit: 80, total: 84 };
  const descW = CONTENT_W - cols.item - cols.qty - cols.unit - cols.total;
  const x = { item: MARGIN, desc: MARGIN + cols.item, qty: 0, unit: 0, total: 0 };
  x.qty = x.desc + descW;
  x.unit = x.qty + cols.qty;
  x.total = x.unit + cols.unit;

  let y = doc.y;
  doc.rect(MARGIN, y, CONTENT_W, 22).fill(ORANGE);
  doc.fillColor("white").font(BOLD).fontSize(9);
  doc.text("Item", x.item + 4, y + 7, { width: cols.item - 6 });
  doc.text("Description", x.desc + 4, y + 7, { width: descW - 8 });
  doc.text("QTY", x.qty, y + 7, { width: cols.qty, align: "center" });
  doc.text(`Unit (${d.currency})`, x.unit, y + 7, { width: cols.unit, align: "center" });
  doc.text(`Total (${d.currency})`, x.total, y + 7, { width: cols.total, align: "center" });
  y += 22;

  doc.font(BODY).fontSize(9.5).fillColor(INK);
  d.items.forEach((it, i) => {
    const h = Math.max(40, doc.heightOfString(it.description, { width: descW - 8 }) + 14);
    if (y + h > PAGE_H - 120) {
      doc.addPage();
      (doc as unknown as { __onBreak?: () => void }).__onBreak?.();
      y = doc.y;
    }
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, h).fill(TINT).fillColor(INK);
    doc.fillColor(INK).font(BODY).fontSize(9.5);
    doc.text(String(i + 1), x.item + 4, y + 6, { width: cols.item - 6 });
    doc.text(it.description, x.desc + 4, y + 6, { width: descW - 8 });
    doc.text(String(it.qty), x.qty, y + 6, { width: cols.qty, align: "center" });
    doc.text(it.unitPrice > 0 ? fmt(it.unitPrice) : "POA", x.unit, y + 6, { width: cols.unit, align: "center" });
    doc.text(it.unitPrice > 0 ? fmt(it.total) : "POA", x.total, y + 6, { width: cols.total, align: "center" });
    doc.strokeColor(LIGHT).lineWidth(0.5);
    [x.desc, x.qty, x.unit, x.total].forEach((cx) => doc.moveTo(cx, y).lineTo(cx, y + h).stroke());
    y += h;
  });
  doc.y = y + 10;

  totalRow(doc, "Total Value (Excluding VAT)", `${d.currency} ${fmt(d.totalExclVat)}`, false);
  if (d.discountPct > 0)
    totalRow(doc, `Discount (${d.discountPct}%)`, `- ${d.currency} ${fmt(d.discountAmount)}`, false);
  totalRow(doc, `VAT (${d.vatPct}%)`, `${d.currency} ${fmt(d.vatAmount)}`, false);
  totalRow(doc, "Total Value (Including VAT)", `${d.currency} ${fmt(d.totalInclVat)}`, true);

  // Bilingual price note
  doc.moveDown(1);
  doc.font(BOLD).fontSize(10).fillColor(ORANGE_DK).text("Note:", MARGIN, doc.y);
  const ny = doc.y + 2;
  doc.font(BODY).fontSize(9).fillColor(INK).text(`• ${PRICE_NOTE_EN}`, MARGIN + 6, ny, { width: CONTENT_W - 12 });
  arText(doc, PRICE_NOTE_AR, MARGIN, doc.y + 4, CONTENT_W, BODY, 9.5);
}

function totalRow(doc: PDFKit.PDFDocument, label: string, value: string, strong: boolean) {
  const w = CONTENT_W;
  const labelW = w - 170;
  const y = doc.y;
  const h = 22;
  if (strong) {
    doc.rect(MARGIN, y, w, h).fill(ORANGE);
    doc.fillColor("white");
  } else {
    doc.rect(MARGIN, y, w, h).fillAndStroke(TINT, LIGHT);
    doc.fillColor(INK);
  }
  doc.font(BOLD).fontSize(strong ? 11 : 10);
  doc.text(label, MARGIN + 10, y + 6, { width: labelW });
  doc.text(value, MARGIN + labelW, y + 6, { width: 160, align: "right" });
  doc.fillColor(INK);
  doc.y = y + h + 2;
}

// --------------------------------------------------------- BILINGUAL TERMS

function bilingualTerms(doc: PDFKit.PDFDocument, titleEn: string, titleAr: string, terms: BiTerm[]) {
  // Bilingual section title
  ensure(doc, 40);
  doc.font(BOLD).fontSize(14).fillColor(ORANGE_DK).text(titleEn, MARGIN, doc.y, { width: CONTENT_W / 2 });
  arText(doc, titleAr, MARGIN + CONTENT_W / 2, doc.y - 18, CONTENT_W / 2, BOLD, 14);
  doc.moveTo(MARGIN, doc.y + 2).lineTo(PAGE_W - MARGIN, doc.y + 2).lineWidth(2).strokeColor(ORANGE).stroke();
  doc.fillColor(INK).moveDown(0.6);

  const gap = 22;
  const colW = (CONTENT_W - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;
  const midX = MARGIN + colW + gap / 2;

  terms.forEach((t, i) => {
    const enH = colHeight(doc, `${i + 1}. ${t.enHeading}`, t.enBullets, colW, false);
    const arH = colHeight(doc, `${t.arHeading} .${i + 1}`, t.arBullets, colW, true);
    const blockH = Math.max(enH, arH) + 10;
    if (doc.y + blockH > PAGE_H - 60) {
      doc.addPage();
      (doc as unknown as { __onBreak?: () => void }).__onBreak?.();
    }
    const top = doc.y;
    renderCol(doc, leftX, top, colW, `${i + 1}. ${t.enHeading}`, t.enBullets, false);
    renderCol(doc, rightX, top, colW, `${t.arHeading} .${i + 1}`, t.arBullets, true);
    doc.moveTo(midX, top).lineTo(midX, top + blockH - 6).strokeColor(LIGHT).lineWidth(0.5).stroke();
    doc.y = top + blockH;
  });
}

function colHeight(
  doc: PDFKit.PDFDocument,
  heading: string,
  bullets: string[],
  w: number,
  ar: boolean
): number {
  let h = doc.font(BOLD).fontSize(10.5).heightOfString(ar ? shapeAr(heading) : heading, { width: w }) + 6;
  for (const b of bullets) {
    h += doc.font(ar ? AR : BODY).fontSize(9.5)
      .heightOfString(ar ? shapeAr(b) : b, { width: w - 14, lineGap: 1 }) + 6;
  }
  return h;
}

function renderCol(
  doc: PDFKit.PDFDocument,
  x: number,
  top: number,
  w: number,
  heading: string,
  bullets: string[],
  ar: boolean
) {
  // heading
  if (ar) {
    arText(doc, heading, x, top, w, BOLD, 10.5);
  } else {
    doc.font(BOLD).fontSize(10.5).fillColor(ORANGE_DK).text(heading, x, top, { width: w });
  }
  doc.fillColor(INK).moveDown(0.25);
  // bullets — bullet glyph + wrapped text, both anchored to the same baseline y
  for (const b of bullets) {
    const by = doc.y;
    if (ar) {
      doc.font(AR).fontSize(9.5).fillColor(ORANGE).text("•", x + w - 8, by, { width: 8 });
      doc.fillColor(INK);
      arText(doc, b, x, by, w - 14, AR, 9.5);
    } else {
      doc.font(BODY).fontSize(9.5).fillColor(ORANGE).text("•", x, by, { width: 8 });
      doc.fillColor(INK).font(BODY).fontSize(9.5).text(b, x + 12, by, { width: w - 12, lineGap: 1 });
    }
    doc.moveDown(0.3);
  }
}

// ---------------------------------------------------------------- CONTACT

function contactPage(doc: PDFKit.PDFDocument) {
  sectionTitle(doc, "Contact Us");
  doc.font(BOLD).fontSize(10).fillColor(ORANGE_DK).text("E-mail", MARGIN, doc.y);
  doc.font(BODY).fontSize(10).fillColor(INK).text(CONTACT_EMAIL, MARGIN, doc.y + 2);
  doc.moveDown(1);
  OFFICES.forEach((o) => {
    ensure(doc, 56);
    doc.font(BOLD).fontSize(11).fillColor(ORANGE_DK).text(o.name, MARGIN, doc.y);
    doc.font(BODY).fontSize(10).fillColor(INK).text(`Address:  ${o.address}`, MARGIN + 8, doc.y + 2);
    doc.text(`Tel:  ${o.tel}`, MARGIN + 8, doc.y + 1);
    doc.moveDown(0.7);
  });
  doc.moveDown(0.5);
  doc.font(BODY).fontSize(10).fillColor(GREY).text("LinkedIn / Facebook:  Powerline", MARGIN, doc.y);
}

// ---------------------------------------------------------------- helpers

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensure(doc, 40);
  doc.font(BOLD).fontSize(14).fillColor(ORANGE_DK).text(title, MARGIN, doc.y);
  doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + 56, doc.y + 2).lineWidth(3).strokeColor(ORANGE).stroke();
  doc.fillColor(INK).moveDown(0.6);
}

function pageFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(MARGIN, PAGE_H - 38).lineTo(PAGE_W - MARGIN, PAGE_H - 38).lineWidth(1).strokeColor(LIGHT).stroke();
    doc.font(BODY).fontSize(8).fillColor(GREY);
    bottomText(
      doc,
      `PowerLine  ·  powerline.com.eg  ·  Page ${i} of ${range.count - 1}  ·  Commercial offer`,
      MARGIN,
      PAGE_H - 30,
      { width: CONTENT_W, align: "center" }
    );
  }
}

function bottomText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: PDFKit.Mixins.TextOptions
) {
  const saved = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.text(text, x, y, opts);
  doc.page.margins.bottom = saved;
}

function safeImage(
  doc: PDFKit.PDFDocument,
  file: string,
  x: number,
  y: number,
  opts: PDFKit.Mixins.ImageOption
) {
  try {
    if (fs.existsSync(file)) doc.image(file, x, y, opts);
  } catch {
    /* skip */
  }
}

function ensure(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > PAGE_H - 55) {
    doc.addPage();
    (doc as unknown as { __onBreak?: () => void }).__onBreak?.();
  }
}
