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

function fmtCoverDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(m[3], 10)} ${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

// The RMU cover mirrors the LV "Technical Offer" cover so both product lines hand
// the customer the same front page: brand spine, big two-line title, an orange
// rule, the offer identifiers and contacts, the Powerline product range, and an
// ISO/ABB footer. Drawn with PDFKit (server-side) to match the React cover the LV
// configurator renders client-side.
function coverPage(doc: PDFKit.PDFDocument, offer: OfferRecord, _g: GeneratedOffer) {
  // Palette tuned to the LV cover (TRED #F16722) rather than the RMU body orange.
  const CO = "#F16722"; // cover orange
  const CINK = "#2b2421"; // heading / dark text
  const CMUT = "#7a736f"; // muted text
  const CCHR = "#585859"; // charcoal — range titles + items
  const CLINE = "#E7E7EB"; // hairline divider
  const CPILL = "#F4F4F5"; // pill background

  const LX = 54; // left content edge (clears the brand spine)
  const RX = PAGE_W - 40; // right content edge
  const CW = RX - LX;

  // Left brand spine (full height)
  doc.rect(0, 0, 10, PAGE_H).fill(CO);

  // ---- Top row: logo (left) + date pill (right)
  safeImage(doc, asset("logo.png"), LX, 40, { width: 150 });
  const dateStr = fmtCoverDate(offer.offerDate || new Date(offer.createdAt).toISOString().slice(0, 10));
  if (dateStr) {
    doc.font(BOLD).fontSize(9.5);
    const dw = doc.widthOfString(dateStr);
    const pillW = dw + 26;
    const pillX = RX - pillW;
    const pillY = 44;
    doc.roundedRect(pillX, pillY, pillW, 22, 11).fill(CPILL);
    doc.fillColor(CINK).text(dateStr, pillX, pillY + 6.5, { width: pillW, align: "center" });
  }

  // ---- Heading: "Technical" / "Offer"
  let y = 150;
  doc.font(BOLD).fontSize(46).fillColor(CINK).text("Technical", LX, y, { lineBreak: false });
  y += 50;
  doc.fillColor(CO).text("Offer", LX, y, { lineBreak: false });
  y += 62;

  // Orange rule under the title
  doc.roundedRect(LX, y, 84, 5, 2.5).fill(CO);
  y += 20;

  // Subtitle
  doc.font(BODY).fontSize(13).fillColor(CMUT)
    .text("Egyptian electrification solutions · ABB-certified assembler", LX, y, { width: CW });
  y += 32;

  // Offer identifiers
  if (offer.offerNumber) {
    doc.font(BOLD).fontSize(13.5).fillColor(CO).text(offer.offerNumber, LX, y, { lineBreak: false });
    y += 20;
  }
  if (offer.opportunityNo) {
    doc.font(BOLD).fontSize(10).fillColor(CMUT).text(offer.opportunityNo, LX, y, { lineBreak: false });
    y += 16;
  }
  if (offer.projectName) {
    doc.font(BODY).fontSize(11.5).fillColor(CINK)
      .text(offer.projectName, LX, y, { width: CW, lineBreak: false, ellipsis: true });
    y += 16;
  }
  if (offer.customer) {
    doc.font(BODY).fontSize(11.5).fillColor(CMUT)
      .text(offer.customer, LX, y, { width: CW, lineBreak: false, ellipsis: true });
    y += 16;
  }

  // ---- Contacts (only rows that have a name)
  const contacts = [
    { role: "Sales", name: offer.salesName, phone: offer.salesMobile, email: offer.salesEmail },
    { role: "Manager", name: offer.salesManagerName, phone: offer.salesManagerMobile, email: offer.salesManagerEmail },
    { role: "Support", name: offer.supportName, phone: offer.supportMobile, email: offer.supportEmail },
  ].filter((c) => c.name);
  let cy = y + 22;
  for (const c of contacts) {
    doc.font(BOLD).fontSize(9.5).fillColor(CINK).text(`${c.role}:`, LX, cy, { width: 56, lineBreak: false });
    doc.font(BODY).fontSize(9.5).fillColor(CMUT)
      .text(c.name || "", LX + 58, cy, { width: 132, lineBreak: false, ellipsis: true });
    if (c.phone) doc.fillColor(CMUT).text(c.phone, LX + 196, cy, { width: 118, lineBreak: false, ellipsis: true });
    if (c.email) doc.fillColor(CMUT).text(c.email, LX + 318, cy, { width: RX - (LX + 318), lineBreak: false, ellipsis: true });
    cy += 16;
  }

  // ---- Powerline product range (5 hairline-ruled columns, matching the LV cover)
  const RANGE: [string, string[]][] = [
    ["LV Enclosures", ["PLP MAX", "PLP CORE", "PLP MINI"]],
    ["Transformers", ["PDTR"]],
    ["Secondary Switchgear", ["PRAL", "PSEC", "AEGIS PLUS"]],
    ["Primary Switchgear", ["PLGEAR"]],
    ["Kiosk", ["PCSS"]],
  ];
  const stripTop = Math.max(cy + 42, 486);
  const colW = CW / 5;
  // Simple monoline glyphs standing in for the React cover's per-category SVGs —
  // charcoal outlines with an orange accent, so the five columns read as distinct
  // product families rather than five identical tiles.
  const drawIcon = (kind: number, x: number, y: number) => {
    doc.lineWidth(1.1).strokeColor(CCHR);
    if (kind === 0) {
      // LV Enclosures — control panel: two meters, a rotary selector
      doc.roundedRect(x + 1, y, 16, 18, 2).stroke();
      doc.rect(x + 3.5, y + 3.5, 4, 3).fill(CCHR);
      doc.rect(x + 10, y + 3.5, 4, 3).fill(CCHR);
      doc.circle(x + 9, y + 13, 2).fill(CO);
    } else if (kind === 1) {
      // Transformers — clamping beam, three cast-resin coil limbs, base
      doc.rect(x + 1, y + 1, 16, 2.4).fill(CCHR);
      [3, 8, 13].forEach((dx) => doc.roundedRect(x + dx - 1.4, y + 5, 2.8, 9.5, 1.2).fill(CO));
      doc.rect(x + 1, y + 15.6, 16, 2.4).fill(CCHR);
    } else if (kind === 2) {
      // Secondary Switchgear — cell with an open switch blade
      doc.roundedRect(x + 1, y, 16, 18, 2).stroke();
      doc.moveTo(x + 5, y + 13).lineTo(x + 12, y + 6).stroke();
      doc.circle(x + 5, y + 13, 1.4).fill(CO);
      doc.circle(x + 12, y + 6, 1.4).fill(CCHR);
    } else if (kind === 3) {
      // Primary Switchgear — tall cabinet with a breaker
      doc.roundedRect(x + 2, y, 14, 18, 2).stroke();
      doc.moveTo(x + 2, y + 9).lineTo(x + 16, y + 9).stroke();
      doc.rect(x + 5, y + 11.5, 8, 4).fill(CO);
    } else {
      // Kiosk — housed substation with a roof and a door
      doc.moveTo(x + 1, y + 6).lineTo(x + 9, y).lineTo(x + 17, y + 6).stroke();
      doc.roundedRect(x + 2.5, y + 6, 13, 12, 1.5).stroke();
      doc.rect(x + 7, y + 11, 4, 7).fill(CO);
    }
    doc.lineWidth(1);
  };
  RANGE.forEach(([title, items], i) => {
    const x = LX + i * colW;
    if (i > 0) {
      doc.moveTo(x, stripTop).lineTo(x, stripTop + 112).lineWidth(0.7).strokeColor(CLINE).stroke();
    }
    const cx = x + (i === 0 ? 0 : 12);
    const cwt = colW - (i === 0 ? 12 : 24);
    drawIcon(i, cx, stripTop);
    // Title box, bottom-aligned so every column's rule + items sit at one height.
    const twoLine = title.length > 14;
    doc.font(BOLD).fontSize(7.5).fillColor(CCHR)
      .text(title.toUpperCase(), cx, twoLine ? stripTop + 28 : stripTop + 39, {
        width: cwt, characterSpacing: 0.6, lineGap: 1,
      });
    doc.roundedRect(cx, stripTop + 56, 21, 2, 1).fill(CO);
    let iy = stripTop + 64;
    for (const it of items) {
      doc.font(BODY).fontSize(9).fillColor(CCHR).text(it, cx, iy, { width: cwt, lineBreak: false });
      iy += 13;
    }
  });

  // ---- Footer: orange rule, ISO + ABB pills, address + social marks
  const footRuleY = PAGE_H - 118;
  doc.rect(LX, footRuleY, PAGE_W - LX, 3).fill(CO); // bleeds to the right edge

  const pills: [string, string, string][] = [
    ["ISO 9001", CPILL, CINK],
    ["ISO 14001", CPILL, CINK],
    ["ISO 45001", CPILL, CINK],
    ["ABB CERTIFIED", "#FEF3ED", CO],
  ];
  const pillY = footRuleY + 16;
  let px = LX;
  for (const [label, bg, fg] of pills) {
    doc.font(BOLD).fontSize(9);
    const w = doc.widthOfString(label) + 24;
    doc.roundedRect(px, pillY, w, 22, 11).fill(bg);
    doc.fillColor(fg).text(label, px, pillY + 6.5, { width: w, align: "center" });
    px += w + 10;
  }

  const addrY = pillY + 40;
  doc.font(BODY).fontSize(9.5).fillColor(CMUT)
    .text("20 Ammar Ibn Yasser, Heliopolis, Cairo  ·  +2 02262215022  ·  info@powerline.com.eg",
      LX, addrY, { width: CW - 110, lineBreak: false });
  const marks = ["W", "f", "in"];
  let sx = RX - marks.length * 26;
  for (const m of marks) {
    doc.circle(sx + 9, addrY + 4, 9).fill(CO);
    doc.font(BOLD).fontSize(m.length > 1 ? 6.5 : 8).fillColor("white")
      .text(m, sx, addrY + (m.length > 1 ? 1.5 : 0.5), { width: 18, align: "center" });
    sx += 26;
  }

  doc.fillColor(INK);
}

function runningHeader(doc: PDFKit.PDFDocument, g: GeneratedOffer) {
  safeImage(doc, asset("logo.png"), MARGIN, 22, { width: 74 });
  // Right-aligned product identity: the system code (bold) over its config code —
  // the panel's own reference, rather than the readable product name.
  doc.font(BOLD).fontSize(11).fillColor(ORANGE_DK)
    .text(g.panelCode, MARGIN, 30, { width: CONTENT_W, align: "right", lineBreak: false });
  if (g.configCode) {
    doc.font(BODY).fontSize(8.5).fillColor(GREY)
      .text(g.configCode, MARGIN, 46, { width: CONTENT_W, align: "right", lineBreak: false });
  }
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
