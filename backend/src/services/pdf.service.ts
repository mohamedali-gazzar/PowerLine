import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { Offer, RmuConfig } from "@prisma/client";
import type { GeneratedOffer, Row, Cubicle } from "../domain/assembly";

export type OfferRecord = Offer & { rmu: RmuConfig | null };

// Powerline brand palette (from the technical-offer documents)
const ORANGE = "#ff6600";
const ORANGE_DK = "#d95500";
const ACCENT = "#ff8a3d";
const LIGHT = "#ffe2d1";
const TINT = "#fff4ec";
const GREY = "#767070";
const INK = "#2b2421";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

function asset(name: string): string {
  const candidates = [
    path.join(__dirname, "..", "assets", name),
    path.join(__dirname, "..", "..", "src", "assets", name),
    path.join(process.cwd(), "src", "assets", name),
    path.join(process.cwd(), "backend", "src", "assets", name), // Vercel bundle root
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

// Font names used throughout. Default to built-in Helvetica; if a Unicode TTF
// (Arial) is available we register it so glyphs like √ render and the type
// matches the Word documents. Falls back gracefully on non-Windows hosts.
let BODY = "Helvetica";
let BOLD = "Helvetica-Bold";
let ITALIC = "Helvetica-Oblique";

function setupFonts(doc: PDFKit.PDFDocument) {
  const sets: [string, string, string, string][] = [
    // [bodyPath, boldPath, italicPath, label]
    ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/ariali.ttf", "arial"],
    [asset("font-regular.ttf"), asset("font-bold.ttf"), asset("font-italic.ttf"), "bundled"],
  ];
  for (const [r, b, it] of sets) {
    if (fs.existsSync(r) && fs.existsSync(b)) {
      try {
        doc.registerFont("body", r);
        doc.registerFont("bold", b);
        doc.registerFont("italic", fs.existsSync(it) ? it : r);
        BODY = "body";
        BOLD = "bold";
        ITALIC = "italic";
        return;
      } catch {
        /* keep Helvetica */
      }
    }
  }
}

/** Render the assembled RMU technical offer as a PDF buffer. */
export function generateOfferPdf(
  offer: OfferRecord,
  g: GeneratedOffer
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      setupFonts(doc);
      coverPage(doc, offer, g);

      // Deterministic page breaks: each new content page redraws the header.
      const onBreak = () => runningHeader(doc, g);
      (doc as unknown as { __onBreak: () => void }).__onBreak = onBreak;
      doc.addPage();
      onBreak();

      dataTable(doc, "General Data / Type of apparatus", g.generalData);
      dataTable(doc, "Electrical Data", g.electricalData);
      if (g.additionalData.length) dataTable(doc, "Additional Data", g.additionalData);
      if (g.installationNote) {
        doc.moveDown(0.2);
        doc.roundedRect(MARGIN, doc.y, CONTENT_W, 22, 4).fill(LIGHT);
        doc.fillColor(ORANGE_DK).font(BOLD).fontSize(9.5)
          .text(g.installationNote, MARGIN + 8, doc.y - 16, { width: CONTENT_W - 16 });
        doc.fillColor(INK);
        doc.moveDown(0.6);
      }
      generalNotes(doc, g.generalNotes);
      lineup(doc, g);
      pageFooters(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ------------------------------------------------------------------ COVER

function coverPage(doc: PDFKit.PDFDocument, offer: OfferRecord, g: GeneratedOffer) {
  // Top brand bar
  doc.rect(0, 0, PAGE_W, 6).fill(ORANGE);

  // Logo (top-left) + website (top-right)
  safeImage(doc, asset("logo.png"), MARGIN, 28, { width: 140 });
  doc.font(BODY).fontSize(9).fillColor(GREY)
    .text("www.powerline.com.eg", PAGE_W - MARGIN - 200, 44, { width: 200, align: "right" });

  // Title block
  let y = 140;
  doc.font(BOLD).fontSize(30).fillColor(ORANGE)
    .text("Ring Main Unit", MARGIN, y);
  y += 38;
  doc.font(BODY).fontSize(13).fillColor(GREY)
    .text("The best solution for Power Distribution", MARGIN, y);
  y += 24;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + 90, y).lineWidth(3).strokeColor(ORANGE).stroke();

  // Product photo (centered)
  const imgW = 300;
  const imgH = Math.round((imgW * 679) / 656);
  safeImage(doc, asset("product-rmu.png"), (PAGE_W - imgW) / 2, y + 22, {
    width: imgW,
    height: imgH,
  });

  // Product identity card (orange) below the photo
  let cardY = y + 22 + imgH + 18;
  doc.roundedRect(MARGIN, cardY, CONTENT_W, 70, 8).fill(ORANGE);
  // Title (left) auto-shrinks to fit its column so a long "… (Outdoor)" title
  // never collides with the right-aligned product code.
  const codeW = 150;
  const titleW = CONTENT_W - 36 - codeW;
  let tSize = 20;
  doc.font(BOLD);
  while (tSize > 12 && doc.fontSize(tSize).widthOfString(g.titleProduct) > titleW) tSize -= 1;
  doc.fillColor("white").font(BOLD).fontSize(tSize)
    .text(g.titleProduct, MARGIN + 18, cardY + 12 + (20 - tSize) / 2, {
      width: titleW,
      lineBreak: false,
      ellipsis: true,
    });
  doc.font(BODY).fontSize(12).fillColor("white")
    .text(g.titleFamily, MARGIN + 18, cardY + 38, { width: titleW, lineBreak: false, ellipsis: true });
  doc.font(BOLD).fontSize(15).fillColor("white")
    .text(g.panelCode, MARGIN, cardY + 16, { width: CONTENT_W - 18, align: "right" });
  doc.font(BODY).fontSize(10).fillColor("white")
    .text(g.configCode, MARGIN, cardY + 40, { width: CONTENT_W - 18, align: "right" });

  // Subtitle line
  cardY += 84;
  doc.font(ITALIC).fontSize(10.5).fillColor(GREY)
    .text("A Compact Switchgear Solution for Secondary Power Distribution Networks",
      MARGIN, cardY, { width: CONTENT_W });

  // Offer meta box (bottom)
  const boxY = PAGE_H - 180;
  doc.roundedRect(MARGIN, boxY, CONTENT_W, 110, 8).fillAndStroke(TINT, LIGHT);
  doc.rect(MARGIN, boxY, 5, 110).fill(ORANGE); // accent stripe
  const metaRows: [string, string][] = [
    ["Offer No", offer.offerNumber],
    ["Date", offer.offerDate || new Date(offer.createdAt).toISOString().slice(0, 10)],
    ["Project", offer.projectName],
    ["Customer", offer.customer],
  ];
  let my = boxY + 14;
  for (const [k, v] of metaRows) {
    doc.font(BOLD).fontSize(9).fillColor(GREY)
      .text(k.toUpperCase(), MARGIN + 18, my, { width: 90 });
    doc.font(BODY).fontSize(10).fillColor(INK)
      .text(v, MARGIN + 115, my, { width: CONTENT_W - 130 });
    my += 18;
  }

  // Cover footer
  doc.rect(0, PAGE_H - 30, PAGE_W, 30).fill(ORANGE);
  doc.fillColor("white").font(BODY).fontSize(9);
  bottomText(doc, "powerline.com.eg   ·   Facebook   ·   LinkedIn", MARGIN, PAGE_H - 20, {
    width: CONTENT_W,
    align: "center",
  });
  doc.fillColor(INK);
}

function runningHeader(doc: PDFKit.PDFDocument, g: GeneratedOffer) {
  safeImage(doc, asset("logo.png"), MARGIN, 22, { width: 74 });
  doc.font(BOLD).fontSize(10).fillColor(ORANGE_DK)
    .text(`${g.titleProduct} — Technical Offer`, MARGIN, 34, {
      width: CONTENT_W,
      align: "right",
    });
  doc.moveTo(MARGIN, 74).lineTo(PAGE_W - MARGIN, 74).lineWidth(1).strokeColor(LIGHT).stroke();
  doc.fillColor(INK);
  doc.x = MARGIN;
  doc.y = 84;
}

// --------------------------------------------------------------- CONTENT

function sectionTitle(doc: PDFKit.PDFDocument, title: string, keepWith = 24) {
  // Reserve the heading (~26) PLUS the first chunk of its content, so a heading
  // never lands alone at the bottom of a page (orphaned from its rows).
  ensure(doc, 26 + keepWith);
  doc.font(BOLD).fontSize(13).fillColor(ORANGE_DK).text(title, MARGIN, doc.y);
  doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + 50, doc.y + 2).lineWidth(3).strokeColor(ORANGE).stroke();
  doc.fillColor(INK).moveDown(0.5);
}

function dataTable(doc: PDFKit.PDFDocument, title: string, rows: Row[]) {
  const labelW = 210;
  const valueW = CONTENT_W - labelW - 12;
  // Variable row height so wrapped labels/values don't overlap.
  const rowHeight = (r: Row) => {
    const lh = doc.font(BOLD).fontSize(9.5).heightOfString(r.label, { width: labelW });
    const vh = doc.font(BODY).fontSize(9.5).heightOfString(r.value, { width: valueW });
    return Math.max(18, Math.max(lh, vh) + 8);
  };
  // Keep the heading glued to its first row across a page break.
  sectionTitle(doc, title, rows.length ? rowHeight(rows[0]) : 24);
  for (const [i, r] of rows.entries()) {
    const rowH = rowHeight(r);
    ensure(doc, rowH);
    const y = doc.y;
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(TINT).fillColor(INK);
    doc.font(BOLD).fontSize(9.5).fillColor(GREY).text(r.label, MARGIN + 6, y + 4, { width: labelW });
    doc.font(BODY).fontSize(9.5).fillColor(INK)
      .text(r.value, MARGIN + 6 + labelW, y + 4, { width: valueW });
    doc.y = y + rowH;
  }
  doc.moveDown(0.6);
}

function generalNotes(doc: PDFKit.PDFDocument, notes: string[]) {
  if (!notes.length) return;
  sectionTitle(doc, "General Notes", 18);
  doc.font(BODY).fontSize(9.5).fillColor(INK);
  for (const n of notes) {
    ensure(doc, 16);
    doc.fillColor(ORANGE).text("•", MARGIN + 4, doc.y, { continued: true })
      .fillColor(INK).text(`  ${n}`, { width: CONTENT_W - 16 });
    doc.moveDown(0.15);
  }
  doc.moveDown(0.5);
}

function lineup(doc: PDFKit.PDFDocument, g: GeneratedOffer) {
  // keepWith=60 → the section title stays with the first cubicle's header bar.
  sectionTitle(doc, "Ring Main Unit Structure", 60);
  for (const c of g.cubicles) cubicleBlock(doc, c);
  if (g.communication && g.communication.length) {
    cubicleBlock(doc, { code: "RTU", name: "Communication", qty: 1, dims: "", items: g.communication });
  }
}

function cubicleBlock(doc: PDFKit.PDFDocument, c: Cubicle) {
  const heading =
    c.code === "RTU"
      ? "Communication:"
      : c.code === "EXTRA"
      ? `${c.name}:` // e.g. "Supplied Complete With:" — not a cubicle, so no "QTY … Cubical"
      : `QTY ${c.qty} Cubical: ${c.name}, each consisting of:`;
  const hH = Math.max(18, doc.heightOfString(heading, { width: CONTENT_W - 16 }) + 8);
  // Keep the cubicle header bar + the table header (15) + the first item row
  // together, so a cubicle never begins with only its title at the page bottom.
  const firstItemH = c.items.length
    ? Math.max(16, doc.heightOfString(c.items[0].description, { width: CONTENT_W - 42 - 8 }) + 6)
    : 0;
  ensure(doc, hH + 15 + firstItemH + 10);
  doc.moveDown(0.2);
  // gradient-like header (solid orange bar)
  const hY = doc.y;
  doc.roundedRect(MARGIN, hY, CONTENT_W, hH, 3).fill(ORANGE_DK);
  doc.fillColor("white").font(BOLD).fontSize(9.5)
    .text(heading, MARGIN + 8, hY + 4, { width: CONTENT_W - 16 });
  doc.y = hY + hH;

  // table header
  const qtyW = 42;
  let y = doc.y;
  doc.rect(MARGIN, y, CONTENT_W, 15).fill(LIGHT);
  doc.fillColor(ORANGE_DK).font(BOLD).fontSize(8.5);
  doc.text("QTY", MARGIN + 6, y + 4, { width: qtyW - 8 });
  doc.text("DESCRIPTION", MARGIN + qtyW + 4, y + 4);
  y += 15;
  doc.font(BODY).fontSize(9).fillColor(INK);

  c.items.forEach((it, i) => {
    const descW = CONTENT_W - qtyW - 8;
    const h = Math.max(16, doc.heightOfString(it.description, { width: descW }) + 6);
    if (y + h > PAGE_H - 60) {
      doc.addPage();
      (doc as unknown as { __onBreak?: () => void }).__onBreak?.();
      y = doc.y;
    }
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, h).fill(TINT).fillColor(INK);
    doc.fillColor(ORANGE).font(BOLD).text(String(it.qty), MARGIN + 6, y + 3, { width: qtyW - 8 });
    doc.fillColor(INK).font(BODY).text(it.description, MARGIN + qtyW + 4, y + 3, { width: descW });
    y += h;
  });
  doc.y = y + 8;
}

// ---------------------------------------------------------------- FOOTERS

function pageFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  // Skip the cover (index 0) — it has its own footer.
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(MARGIN, PAGE_H - 38).lineTo(PAGE_W - MARGIN, PAGE_H - 38).lineWidth(1).strokeColor(LIGHT).stroke();
    doc.font(BODY).fontSize(8).fillColor(GREY);
    bottomText(
      doc,
      `PowerLine  ·  powerline.com.eg  ·  Page ${i} of ${range.count - 1}  ·  Specifications subject to confirmation`,
      MARGIN,
      PAGE_H - 30,
      { width: CONTENT_W, align: "center" }
    );
  }
}

// Draw text at an absolute position near the page bottom WITHOUT triggering
// PDFKit's auto-pagination (which fires when y is past the bottom margin).
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
    /* skip missing/broken image */
  }
}

function ensure(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > PAGE_H - 55) {
    doc.addPage();
    (doc as unknown as { __onBreak?: () => void }).__onBreak?.();
  }
}
