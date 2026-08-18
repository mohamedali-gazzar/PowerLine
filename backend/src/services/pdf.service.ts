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
      // Ring Main Unit Structure starts on its own page (page 1 = data + notes,
      // page 2 = the cubicle structure).
      doc.addPage();
      onBreak();
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
  // DD/MM/YYYY, matching the LV cover's date pill.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
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

  // ---- Top row: horizontal logo (left) + date pill (right), like the LV cover
  const logoTop = 34;
  const logoW = 160; // logo-horizontal.png is 2:1 → ~80pt tall, matching the LV h-32
  safeImage(doc, asset("logo-horizontal.png"), LX, logoTop, { width: logoW });
  const dateStr = fmtCoverDate(offer.offerDate || new Date(offer.createdAt).toISOString().slice(0, 10));
  if (dateStr) {
    doc.font(BOLD).fontSize(10);
    const pillH = 26;
    const pillW = doc.widthOfString(dateStr) + 32;
    const pillX = RX - pillW;
    const pillY = logoTop + logoW / 4 - pillH / 2; // centre the pill on the logo (logo height ≈ logoW/2)
    doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2).fill(CPILL);
    doc.fillColor(CINK).text(dateStr, pillX, pillY + 8, { width: pillW, align: "center" });
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
    if (c.phone) {
      doc.fillColor(CMUT).text(c.phone, LX + 196, cy, { width: 118, lineBreak: false, ellipsis: true });
      doc.link(LX + 196, cy - 1, 118, 12, `tel:${c.phone.replace(/[^\d+]/g, "")}`); // call, like the LV cover
    }
    if (c.email) {
      doc.fillColor(CMUT).text(c.email, LX + 318, cy, { width: RX - (LX + 318), lineBreak: false, ellipsis: true });
      doc.link(LX + 318, cy - 1, RX - (LX + 318), 12, `mailto:${c.email}`); // opens the mail app
    }
    cy += 16;
  }

  // ---- Powerline product range (5 hairline-ruled columns, matching the LV cover)
  const RANGE: [string, string[], string][] = [
    ["LV Enclosures", ["PLP MAX", "PLP CORE", "PLP MINI"], "https://www.powerlinei.com/low-voltage"],
    ["Transformers", ["PDTR"], "https://www.powerlinei.com/products/dry-type-transformers"],
    ["Secondary Switchgear", ["PRAL", "PSEC", "AEGIS PLUS"], "https://www.powerlinei.com/secondary-switchgear"],
    ["Primary Switchgear", ["PLGEAR"], "https://www.powerlinei.com/primary-switchgear"],
    ["Kiosk", ["PCSS"], "https://www.powerlinei.com/products/pcss"],
  ];
  const stripTop = Math.max(cy + 42, 486);
  const colW = CW / 5;
  // Faithful vector reproductions of the LV cover's per-category SVG icons (PDFKit
  // can't render SVG). Each is authored in the source 32×32 viewBox and scaled into
  // an S-px box, so it matches the LV cover 1:1 — charcoal line-art (rgba(88,88,89,·))
  // with the orange accents and, on the enclosure, the real green/red/yellow lamps.
  const drawIcon = (kind: number, x: number, y: number) => {
    const S = 28;
    const CH = "#585859"; // charcoal
    const OR = "#F16722"; // brand orange
    const fill = (color: string, a: number, build: () => void) => {
      doc.save(); doc.fillOpacity(a); build(); doc.fill(color); doc.restore();
    };
    const line = (color: string, w: number, build: () => void) => {
      doc.save(); doc.lineWidth(w).lineCap("round").lineJoin("round"); build(); doc.stroke(color); doc.restore();
    };
    const rr = (X: number, Y: number, W: number, H: number, R: number) =>
      R > 0 ? doc.roundedRect(X, Y, W, H, R) : doc.rect(X, Y, W, H);

    doc.save();
    doc.translate(x, y).scale(S / 32);

    if (kind === 0) {
      // LV Enclosures — control-panel door: three meters, three pilot lights, rotary
      fill(CH, 0.06, () => rr(5.5, 2.5, 21, 27, 1.2));
      line(CH, 1.25, () => rr(5.5, 2.5, 21, 27, 1.2));
      for (const [mx, tip] of [[8, -1.15], [13.5, 0], [19, 1.15]] as [number, number][]) {
        fill(CH, 0.5, () => rr(mx, 6.9, 5, 4.2, 0.5));
        line("#ffffff", 0.9, () => doc.moveTo(mx + 2.5, 10.2).lineTo(mx + 2.5 + tip, 8.3));
      }
      ["#2FA84F", "#D64545", "#E8B93A"].forEach((c, i) => fill(c, 1, () => doc.circle(11 + i * 5, 15.4, 1.5)));
      fill(OR, 1, () => doc.circle(16, 21.9, 2.5));
      line("#ffffff", 1.1, () => doc.moveTo(16, 21.9).lineTo(16, 20.2));
    } else if (kind === 1) {
      // Transformers — clamping beam, three cast-resin coils, HV delta, base
      doc.save(); doc.translate(-2.865, -2.57).scale(1.179);
      fill(CH, 0.55, () => rr(3.6, 4.3, 24.8, 2.9, 0.5));
      fill("#ffffff", 0.9, () => rr(12.4, 5.1, 7.2, 1.3, 0.25));
      for (const cx of [5.4, 13.2, 21]) {
        fill(OR, 1, () => rr(cx, 8.1, 5.6, 14.8, 2.4));
        fill(CH, 0.7, () => rr(cx + 1.7, 7.2, 2.2, 1.5, 0.3));
      }
      line(CH, 1.19, () => { doc.moveTo(8.2, 11).lineTo(16, 20); doc.moveTo(16, 11).lineTo(23.8, 20); doc.moveTo(23.8, 11).lineTo(8.2, 20); });
      for (const cx of [8.2, 16, 23.8]) for (const cy of [11, 20]) fill(CH, 0.9, () => doc.circle(cx, cy, 1));
      fill(CH, 0.55, () => rr(3.6, 23, 24.8, 2.7, 0.5));
      fill(CH, 0.35, () => rr(6.6, 25.7, 4.4, 1.5, 0.3));
      fill(CH, 0.35, () => rr(21, 25.7, 4.4, 1.5, 0.3));
      doc.restore();
    } else if (kind === 2) {
      // Secondary Switchgear — three cubicles with the signature orange mimic band
      doc.save(); doc.translate(-1.28, -1.172).scale(1.08);
      fill(CH, 0.06, () => rr(4.2, 3.4, 23.6, 25, 1));
      line(CH, 1.157, () => rr(4.2, 3.4, 23.6, 25, 1));
      for (const cx of [8.13, 16, 23.87]) fill(CH, 0.5, () => rr(cx - 1.7, 5.6, 3.4, 2.7, 0.4));
      fill(OR, 1, () => rr(4.2, 10.6, 23.6, 5.6, 0));
      for (const cx of [8.13, 16, 23.87]) {
        line("#ffffff", 0.787, () => doc.circle(cx, 12.6, 0.85));
        line("#ffffff", 0.787, () => doc.moveTo(cx, 13.45).lineTo(cx, 14.9));
      }
      line(CH, 1.157, () => doc.moveTo(12.07, 16.2).lineTo(12.07, 26.6));
      line(CH, 1.157, () => doc.moveTo(19.93, 16.2).lineTo(19.93, 26.6));
      for (const cx of [8.13, 16, 23.87]) fill(CH, 0.55, () => rr(cx - 1.5, 17.6, 3, 1.7, 0.3));
      fill(CH, 0.5, () => rr(4.2, 26.6, 23.6, 1.8, 0.3));
      doc.restore();
    } else if (kind === 3) {
      // Primary Switchgear — relay row, dark control plate + breaker, cable box
      fill(CH, 0.06, () => rr(5.5, 2.5, 21, 27, 1.2));
      line(CH, 1.25, () => rr(5.5, 2.5, 21, 27, 1.2));
      fill(CH, 0.12, () => rr(7.6, 4.6, 16.8, 5, 0.7));
      line(CH, 1.25, () => rr(7.6, 4.6, 16.8, 5, 0.7));
      for (const rx of [9, 13.8, 18.6]) fill(OR, 1, () => rr(rx, 6.1, 3.4, 2, 0.4));
      fill(CH, 0.82, () => rr(8.6, 12, 14.8, 9, 0.8));
      line("#ffffff", 1, () => doc.circle(16, 15.4, 1.5));
      line("#ffffff", 1, () => doc.moveTo(16, 16.9).lineTo(16, 18.9));
      fill(CH, 0.12, () => rr(7.6, 23.4, 16.8, 4.6, 0.7));
      line(CH, 1.25, () => rr(7.6, 23.4, 16.8, 4.6, 0.7));
      fill(CH, 0.45, () => rr(13.6, 24.9, 4.8, 1.8, 0.3));
    } else {
      // Kiosk (PCSS) — gabled roof + orange nameplate, double doors, plinth
      doc.save(); doc.translate(-2.383, -2.785).scale(1.149);
      doc.save(); doc.fillOpacity(0.12); doc.lineWidth(1.088).lineCap("round").lineJoin("round");
      doc.moveTo(3.8, 10.6).lineTo(16, 4.6).lineTo(28.2, 10.6).closePath();
      doc.fillAndStroke(CH, CH); doc.restore();
      fill(OR, 1, () => rr(12.6, 7.6, 6.8, 2.1, 0.35));
      fill(CH, 0.06, () => rr(5.4, 10.6, 21.2, 15.2, 0.6));
      line(CH, 1.088, () => rr(5.4, 10.6, 21.2, 15.2, 0.6));
      line(CH, 1.088, () => doc.moveTo(16, 10.6).lineTo(16, 25.8));
      fill(CH, 0.6, () => rr(15.2, 16.6, 1.6, 3, 0.4));
      line(CH, 0.87, () => doc.moveTo(14.6, 13.4).lineTo(17.4, 13.4));
      line(CH, 0.87, () => doc.moveTo(14.6, 22.6).lineTo(17.4, 22.6));
      fill(CH, 0.5, () => rr(4.6, 25.8, 22.8, 2.3, 0.4));
      doc.restore();
    }
    doc.restore();
  };
  RANGE.forEach(([title, items, href], i) => {
    const x = LX + i * colW;
    if (i > 0) {
      doc.moveTo(x, stripTop).lineTo(x, stripTop + 122).lineWidth(0.7).strokeColor(CLINE).stroke();
    }
    const cx = x + (i === 0 ? 0 : 12);
    const cwt = colW - (i === 0 ? 12 : 24);
    drawIcon(i, cx, stripTop);
    doc.link(cx, stripTop, cwt, 60, href); // icon + title → product page, like the LV cover
    // Title box, bottom-aligned so every column's rule + items sit at one height.
    const twoLine = title.length > 14;
    doc.font(BOLD).fontSize(7.5).fillColor(CCHR)
      .text(title.toUpperCase(), cx, twoLine ? stripTop + 34 : stripTop + 45, {
        width: cwt, characterSpacing: 0.6, lineGap: 1,
      });
    doc.roundedRect(cx, stripTop + 63, 21, 2, 1).fill(CO);
    let iy = stripTop + 71;
    for (const it of items) {
      doc.font(BODY).fontSize(9).fillColor(CCHR).text(it, cx, iy, { width: cwt, lineBreak: false });
      iy += 13;
    }
  });

  // ---- Footer: orange rule, ISO + ABB pills, address + social marks
  const footRuleY = PAGE_H - 118;
  doc.rect(LX, footRuleY, PAGE_W - LX, 3).fill(CO); // bleeds to the right edge

  // ISO / ABB pills, each linking to its certificate (same URLs as the LV cover)
  const pills: [string, string, string, string][] = [
    ["ISO 9001", CPILL, CINK, "https://drive.google.com/file/d/1D2GThbsl9FDr7rnhdFl7jsnWKXyOc8KY/view"],
    ["ISO 14001", CPILL, CINK, "https://drive.google.com/file/d/1yqz35dDFJDZ18X2fURFwufHtzg7c50rZ/view"],
    ["ISO 45001", CPILL, CINK, "https://drive.google.com/file/d/1nzbbwg3CLKqUkYY6RBXhcFTI0PJpToMG/view"],
    ["ABB CERTIFIED", "#FEF3ED", CO, "https://drive.google.com/file/d/16I86eVMca56UUUiMsLusKEb1G4R6iYD6/view"],
  ];
  const pillY = footRuleY + 16;
  let px = LX;
  for (const [label, bg, fg, url] of pills) {
    doc.font(BOLD).fontSize(9);
    const w = doc.widthOfString(label) + 24;
    doc.roundedRect(px, pillY, w, 22, 11).fill(bg);
    doc.fillColor(fg).text(label, px, pillY + 6.5, { width: w, align: "center" });
    doc.link(px, pillY, w, 22, url);
    px += w + 10;
  }

  // Address · phone · email — three separate links (map / call / mail), like the LV cover
  const addrY = pillY + 40;
  doc.font(BODY).fontSize(9.5).fillColor(CMUT);
  let fx = LX;
  const seg = (txt: string, url: string) => {
    const w = doc.widthOfString(txt);
    doc.fillColor(CMUT).text(txt, fx, addrY, { lineBreak: false });
    doc.link(fx, addrY - 1, w, 12, url);
    fx += w;
  };
  const sepSeg = () => { const s = "  ·  "; doc.fillColor(CMUT).text(s, fx, addrY, { lineBreak: false }); fx += doc.widthOfString(s); };
  seg("20 Ammar Ibn Yasser, Heliopolis, Cairo", "https://maps.app.goo.gl/kqZBxFo286ps7qBP8");
  sepSeg();
  seg("+2 02262215022", "tel:+202262215022");
  sepSeg();
  seg("info@powerline.com.eg", "mailto:info@powerline.com.eg");

  // Website / Facebook / LinkedIn — the real glyphs (same SVG paths as the LV cover),
  // drawn white inside the orange circle instead of plain letters.
  const FB = "M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-49.84 52.24-49.84h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z";
  const LI = "M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z";
  const GLOBE_MERIDIAN = "M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z";
  const socials: [string, "globe" | "fb" | "li"][] = [
    ["https://powerlinei.com/", "globe"],
    ["https://www.facebook.com/Powerline.ABB", "fb"],
    ["https://www.linkedin.com/login/?session_redirect=%2Fcompany%2F9288669", "li"],
  ];
  let sx = RX - socials.length * 26;
  for (const [url, kind] of socials) {
    const ccx = sx + 9, ccy = addrY + 4;
    doc.circle(ccx, ccy, 9).fill(CO);
    doc.save();
    if (kind === "globe") {
      doc.translate(ccx, ccy).scale(13 / 24).translate(-12, -12);
      doc.lineWidth(2).lineCap("round").lineJoin("round");
      doc.circle(12, 12, 9).stroke("white");
      doc.moveTo(3, 12).lineTo(21, 12).stroke("white");
      doc.path(GLOBE_MERIDIAN).stroke("white");
    } else if (kind === "fb") {
      doc.translate(ccx, ccy).scale(10 / 512).translate(-160, -256);
      doc.path(FB).fill("white");
    } else {
      doc.translate(ccx, ccy).scale(9 / 512).translate(-224, -256);
      doc.path(LI).fill("white");
    }
    doc.restore();
    doc.link(sx, addrY - 5, 18, 18, url);
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
  // Measure at the SAME font the text is drawn in (heading = bold 9.5, item = body 9),
  // or the bar is sized for a bigger/wrapped font than it renders and leaves a tall
  // empty orange band above/below the one line of text.
  doc.font(BOLD).fontSize(9.5);
  const hH = Math.max(16, doc.heightOfString(heading, { width: CONTENT_W - 16 }) + 7);
  // Keep the cubicle header bar + the table header (15) + the first item row
  // together, so a cubicle never begins with only its title at the page bottom.
  doc.font(BODY).fontSize(9);
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

  // table header (compact, so a full cubicle list fits on one page rather than
  // spilling a single row onto a near-empty extra page)
  const qtyW = 42;
  let y = doc.y;
  doc.rect(MARGIN, y, CONTENT_W, 13).fill(LIGHT);
  doc.fillColor(ORANGE_DK).font(BOLD).fontSize(8.5);
  doc.text("QTY", MARGIN + 6, y + 3, { width: qtyW - 8 });
  doc.text("DESCRIPTION", MARGIN + qtyW + 4, y + 3);
  y += 13;
  doc.font(BODY).fontSize(9).fillColor(INK);

  c.items.forEach((it, i) => {
    const descW = CONTENT_W - qtyW - 8;
    const h = Math.max(15, doc.heightOfString(it.description, { width: descW }) + 5);
    if (y + h > PAGE_H - 60) {
      doc.addPage();
      (doc as unknown as { __onBreak?: () => void }).__onBreak?.();
      y = doc.y;
    }
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, h).fill(TINT).fillColor(INK);
    doc.fillColor(ORANGE).font(BOLD).text(String(it.qty), MARGIN + 6, y + 2.5, { width: qtyW - 8 });
    doc.fillColor(INK).font(BODY).text(it.description, MARGIN + qtyW + 4, y + 2.5, { width: descW });
    y += h;
  });
  doc.y = y + 5;
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
