import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { CommercialData } from "./commercial.service";
import { drawCover } from "./pdf.service";
import { LV_TERMS_EN, LV_TERMS_AR, LV_TERMS_TITLE_AR, type LvTermSection } from "../domain/lvTerms";
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
let AR_BOLD = "Helvetica-Bold"; // Arabic bold: Arial Bold locally, Amiri Bold on Vercel

function asset(name: string): string {
  const candidates = [
    path.join(__dirname, "..", "assets", name),
    path.join(__dirname, "..", "..", "src", "assets", name),
    path.join(process.cwd(), "src", "assets", name),
    path.join(process.cwd(), "backend", "src", "assets", name), // Vercel bundle root
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
      AR_BOLD = "bold";
      return;
    } catch {
      /* fall through to bundled fonts */
    }
  }
  // No Windows Arial (e.g. Vercel/Linux): use bundled Amiri (OFL) so Arabic
  // glyphs render. Latin stays on Helvetica (clean + always available).
  try {
    const arReg = asset("Amiri-Regular.ttf");
    const arBold = asset("Amiri-Bold.ttf");
    if (fs.existsSync(arReg)) {
      doc.registerFont("ar", arReg);
      doc.registerFont("ar-bold", fs.existsSync(arBold) ? arBold : arReg);
      AR = "ar";
      AR_BOLD = "ar-bold";
    }
  } catch {
    /* keep Helvetica — Arabic may be missing, but Latin still renders */
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

      // Same LV-style cover as the technical offer (shared drawCover), titled "Commercial".
      drawCover(doc, { body: BODY, bold: BOLD }, {
        kind: "Commercial",
        quotationNo: d.quotationNo, offerNumber: d.offerNumber,
        opportunityNo: d.opportunityNo, projectName: d.project, customer: d.customer,
        offerDate: d.date,
        salesName: d.salesName, salesMobile: d.salesMobile, salesEmail: d.salesEmail,
        salesManagerName: d.salesManagerName, salesManagerMobile: d.salesManagerMobile, salesManagerEmail: d.salesManagerEmail,
        supportName: d.supportName, supportMobile: d.supportMobile, supportEmail: d.supportEmail,
      });

      doc.addPage();
      onBreak();
      mainOffer(doc, d);
      termsSummary(doc, d);

      // Full Terms & Conditions — the LV commercial's standard terms (English, then Arabic)
      doc.addPage();
      onBreak();
      sectionTitle(doc, "General Terms & Conditions");
      termsList(doc, LV_TERMS_EN, false);

      doc.addPage();
      onBreak();
      doc.fillColor(ORANGE_DK);
      arText(doc, LV_TERMS_TITLE_AR, MARGIN, doc.y, CONTENT_W, AR_BOLD, 14);
      doc.moveTo(MARGIN + CONTENT_W - 56, doc.y + 3).lineTo(MARGIN + CONTENT_W, doc.y + 3).lineWidth(3).strokeColor(ORANGE).stroke();
      doc.fillColor(INK).moveDown(0.9);
      termsList(doc, LV_TERMS_AR, true);

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
  const boxH = 206;
  doc.roundedRect(MARGIN, boxY, CONTENT_W, boxH, 8).fillAndStroke(TINT, LIGHT);
  doc.rect(MARGIN, boxY, 5, boxH).fill(ORANGE);
  const contact = (n?: string | null, m?: string | null, e?: string | null) =>
    [n, m, e].map((s) => (s || "").trim()).filter(Boolean).join("  ·  ") || "—";
  const rows: [string, string][] = [
    ["Customer Name", d.customer],
    ["Project Name", d.project],
    ["Quotation No. (QTN)", d.quotationNo || d.plReference],
    ["Opportunity No. (OPTY)", d.opportunityNo || "—"],
    ["PL Reference No.", d.plReference],
    ["Revision Date", d.date],
    ["Sales", contact(d.salesName, d.salesMobile, d.salesEmail)],
    ["Sales Manager", contact(d.salesManagerName, d.salesManagerMobile, d.salesManagerEmail)],
    ["Sales Support", contact(d.supportName, d.supportMobile, d.supportEmail)],
  ];
  let ry = boxY + 14;
  for (const [k, v] of rows) {
    doc.font(BOLD).fontSize(9).fillColor(GREY).text(k.toUpperCase(), MARGIN + 18, ry, { width: 165 });
    if (hasArabic(v)) {
      arText(doc, v, MARGIN + 188, ry, CONTENT_W - 205, AR, 10);
    } else {
      doc.font(BODY).fontSize(9.5).fillColor(INK).text(v, MARGIN + 188, ry, { width: CONTENT_W - 205 });
    }
    ry += 20;
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
  const money = (n: number) => `${d.currency} ${fmt(n)}`;
  const numW = 30, qtyW = 40, unitW = 96, totalW = 96;
  const descX = MARGIN + numW;
  const descW = CONTENT_W - numW - qtyW - unitW - totalW;
  const qtyX = descX + descW, unitX = qtyX + qtyW, totalX = unitX + unitW;

  // Header — understated: grey uppercase labels over a thin orange underline (the LV commercial table header)
  let y = doc.y;
  doc.font(BOLD).fontSize(8).fillColor(GREY);
  doc.text("ITEM", MARGIN, y, { width: numW });
  doc.text("DESCRIPTION", descX + 2, y, { width: descW - 4 });
  doc.text("QTY", qtyX, y, { width: qtyW, align: "center" });
  doc.text(`UNIT PRICE (${d.currency})`, unitX, y, { width: unitW - 6, align: "right" });
  doc.text(`TOTAL (${d.currency})`, totalX, y, { width: totalW - 6, align: "right" });
  y += 13;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(1.6).strokeColor(ORANGE).stroke();
  y += 6;

  d.items.forEach((it, i) => {
    doc.font(BODY).fontSize(9.5);
    const h = Math.max(18, doc.heightOfString(it.description, { width: descW - 6 }) + 9);
    if (y + h > PAGE_H - 150) {
      doc.addPage();
      (doc as unknown as { __onBreak?: () => void }).__onBreak?.();
      y = doc.y;
    }
    doc.fillColor(GREY).font(BODY).fontSize(9.5).text(String(i + 1), MARGIN, y + 2, { width: numW });
    doc.fillColor(INK).font(BOLD).text(it.description, descX + 2, y + 2, { width: descW - 4 });
    doc.font(BODY).text(String(it.qty), qtyX, y + 2, { width: qtyW, align: "center" });
    if (it.unitPrice > 0) {
      doc.text(fmt(it.unitPrice), unitX, y + 2, { width: unitW - 6, align: "right" });
      doc.font(BOLD).text(fmt(it.total), totalX, y + 2, { width: totalW - 6, align: "right" });
    } else {
      doc.fillColor("#B45309").font(BOLD).text("POA", unitX, y + 2, { width: unitW - 6, align: "right" });
      doc.text("POA", totalX, y + 2, { width: totalW - 6, align: "right" });
    }
    y += h;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.5).strokeColor(LIGHT).stroke();
  });
  doc.y = y + 14;

  // Totals — right-aligned plain rows, closed by an orange top rule + "Total" (the LV commercial)
  const tW = 230, tX = MARGIN + CONTENT_W - tW, valW = 110;
  const totLine = (label: string, value: string) => {
    const yy = doc.y;
    doc.font(BODY).fontSize(9.5).fillColor(GREY).text(label, tX, yy, { width: tW - valW });
    doc.fillColor(INK).text(value, tX + tW - valW, yy, { width: valW, align: "right" });
    doc.y = yy + 15;
  };
  totLine("Subtotal (excl. VAT)", money(d.totalExclVat));
  if (d.discountPct > 0) totLine(`Discount (${d.discountPct}%)`, `− ${money(d.discountAmount)}`);
  totLine(`VAT (${d.vatPct}%)`, money(d.vatAmount));
  const gy = doc.y + 2;
  doc.moveTo(tX, gy).lineTo(tX + tW, gy).lineWidth(2).strokeColor(ORANGE).stroke();
  const ty = gy + 6;
  doc.font(BOLD).fontSize(11).fillColor(INK).text(`Total (${d.currency})`, tX, ty, { width: tW - valW });
  doc.fillColor(ORANGE_DK).text(money(d.totalInclVat), tX + tW - valW, ty, { width: valW, align: "right" });
  doc.fillColor(INK);
  doc.y = ty + 20;
}

// Terms summary (Validity / Delivery / Payment / Warranty) — like the LV commercial.
function termsSummary(doc: PDFKit.PDFDocument, d: CommercialData) {
  ensure(doc, 84);
  doc.moveDown(1.2);
  sectionTitle(doc, "Terms");
  const sy = doc.y;
  const half = CONTENT_W / 2;
  const pairs: [string, string][] = [
    ["Validity", `${d.validityDays} days`],
    ["Delivery", d.deliveryWeeks ? `${d.deliveryWeeks} weeks` : "To be confirmed"],
    ["Payment", d.paymentTerms || "To be agreed"],
    ["Warranty", d.warrantyMonths ? `${d.warrantyMonths} months` : "Standard"],
  ];
  pairs.forEach(([k, v], i) => {
    const px = MARGIN + (i % 2) * half;
    const py = sy + Math.floor(i / 2) * 20;
    doc.font(BOLD).fontSize(9).fillColor(GREY).text(`${k}:`, px, py, { width: 68, lineBreak: false });
    doc.font(BODY).fontSize(9).fillColor(INK).text(v, px + 70, py, { width: half - 80, lineBreak: false, ellipsis: true });
  });
  doc.y = sy + 2 * 20 + 6;
  doc.fillColor(INK);
}

// Full Terms & Conditions list — bold title + justified body per section, flowing
// across pages. `ar` renders right-aligned shaped Arabic.
function termsList(doc: PDFKit.PDFDocument, sections: LvTermSection[], ar: boolean) {
  for (const s of sections) {
    doc.font(ar ? AR_BOLD : BOLD).fontSize(10);
    const th = doc.heightOfString(ar ? shapeAr(s.title) : s.title, { width: CONTENT_W });
    doc.font(ar ? AR : BODY).fontSize(9);
    const bh = doc.heightOfString(ar ? shapeAr(s.body) : s.body, { width: CONTENT_W });
    ensure(doc, th + bh + 12);
    doc.font(ar ? AR_BOLD : BOLD).fontSize(10).fillColor(INK)
      .text(ar ? shapeAr(s.title) : s.title, MARGIN, doc.y, { width: CONTENT_W, align: ar ? "right" : "left", features: ar ? [] : undefined });
    doc.font(ar ? AR : BODY).fontSize(9).fillColor(INK)
      .text(ar ? shapeAr(s.body) : s.body, MARGIN, doc.y + 1, { width: CONTENT_W, align: ar ? "right" : "justify", features: ar ? [] : undefined });
    doc.moveDown(0.55);
  }
  doc.fillColor(INK);
}

// --------------------------------------------------------- BILINGUAL TERMS

function bilingualTerms(doc: PDFKit.PDFDocument, titleEn: string, titleAr: string, terms: BiTerm[]) {
  // Bilingual section title
  ensure(doc, 40);
  doc.font(BOLD).fontSize(14).fillColor(ORANGE_DK).text(titleEn, MARGIN, doc.y, { width: CONTENT_W / 2 });
  arText(doc, titleAr, MARGIN + CONTENT_W / 2, doc.y - 18, CONTENT_W / 2, AR_BOLD, 14);
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
  let h = doc.font(ar ? AR_BOLD : BOLD).fontSize(10.5).heightOfString(ar ? shapeAr(heading) : heading, { width: w }) + 6;
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
    arText(doc, heading, x, top, w, AR_BOLD, 10.5);
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
