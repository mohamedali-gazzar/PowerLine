import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { Offer, RmuConfig } from "@prisma/client";
import { getRatings, PRODUCTS, type ProductType, type VoltageKv } from "../domain/standards";
import type { GeneratedOffer } from "../domain/assembly";

export type OfferRecord = Offer & { rmu: RmuConfig | null };

// Brand
const ORANGE = "#ff6600";
const ORANGE_DK = "#d95500";
const GREY = "#767070";
const INK = "#2b2421";
const LINE = "#9aa0a6";
const LIGHT = "#ffe2d1";

// A3 landscape
const PAGE_W = 1190.55;
const PAGE_H = 841.89;
const OUT = 14; // outer border inset
const IN = 26; // inner border inset
const TB_H = 72; // title block height
// content area (above the title block)
const CX = IN;
const CY = IN;
const CW = PAGE_W - IN * 2;
const CYB = PAGE_H - IN - TB_H; // bottom of content (top of title block)

let BODY = "Helvetica";
let BOLD = "Helvetica-Bold";

function asset(name: string): string {
  const c = [
    path.join(__dirname, "..", "assets", name),
    path.join(__dirname, "..", "..", "src", "assets", name),
    path.join(process.cwd(), "src", "assets", name),
    path.join(process.cwd(), "backend", "src", "assets", name), // Vercel bundle root
  ];
  return c.find((p) => fs.existsSync(p)) ?? c[0];
}
function setupFonts(doc: PDFKit.PDFDocument) {
  const a = "C:/Windows/Fonts/arial.ttf", b = "C:/Windows/Fonts/arialbd.ttf";
  if (fs.existsSync(a) && fs.existsSync(b)) {
    try { doc.registerFont("body", a); doc.registerFont("bold", b); BODY = "body"; BOLD = "bold"; } catch { /* keep */ }
  }
}
function safeImage(doc: PDFKit.PDFDocument, file: string, x: number, y: number, opts: PDFKit.Mixins.ImageOption) {
  try { if (fs.existsSync(file)) doc.image(file, x, y, opts); } catch { /* skip */ }
}

interface SheetMeta {
  sheetTitle: string;
  sheetNo: number;
  totalSheets: number;
  offer: OfferRecord;
  g: GeneratedOffer;
}

/** Names per project rules. */
const NAMES = { designed: "Gazzar", checked: "Gazzar", approved: "" };

export function generateSldPdf(offer: OfferRecord, g: GeneratedOffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      setupFonts(doc);
      // Phase 1: the three text pages. Drawing pages slot in here later.
      const rmu = offer.rmu;
      const nal = rmu?.nalCount ?? 0;
      const pages: { title: string; render: (doc: PDFKit.PDFDocument, m: SheetMeta) => void }[] = [
        { title: "Cover Page", render: coverPage },
        { title: "General Characteristics", render: generalCharacteristics },
        { title: "SLD Cubicles", render: sldCubiclesPage },
        { title: "Layout", render: layoutPage },
        { title: "Heaters' connection", render: heatersPage },
      ];
      // E.F.I connection — one sheet per ring feeder beyond the incoming (nal − 1)
      for (let i = 0; i < Math.max(0, nal - 1); i++) {
        pages.push({ title: "E.F.I's connection", render: (doc, mm) => efiPage(doc, mm, i) });
      }
      // Metering circuits — only when a metering cubicle is present
      if (rmu?.hasMetering) pages.push({ title: "Metering Circuits", render: meteringCircuitsPage });
      pages.push({ title: "Name Plate", render: namePlate });
      const total = pages.length;
      pages.forEach((p, i) => {
        if (i > 0) doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
        const meta: SheetMeta = { sheetTitle: p.title, sheetNo: i + 1, totalSheets: total, offer, g };
        frame(doc, meta);
        p.render(doc, meta);
      });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------- FRAME

function frame(doc: PDFKit.PDFDocument, m: SheetMeta) {
  // borders
  doc.lineWidth(1).strokeColor(INK).rect(OUT, OUT, PAGE_W - OUT * 2, PAGE_H - OUT * 2).stroke();
  doc.lineWidth(0.8).strokeColor(INK).rect(IN, IN, PAGE_W - IN * 2, PAGE_H - IN * 2).stroke();

  // zone numbers 1..8 (top & bottom), letters A..F (left & right)
  doc.font(BODY).fontSize(7).fillColor(INK);
  const cols = 8;
  for (let i = 0; i < cols; i++) {
    const x = IN + ((PAGE_W - IN * 2) / cols) * (i + 0.5);
    doc.text(String(i + 1), x - 3, OUT + 3, { width: 8 });
    doc.text(String(i + 1), x - 3, PAGE_H - OUT - 11, { width: 8 });
  }
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const y = IN + ((PAGE_H - IN * 2) / rows) * (i + 0.5);
    const L = String.fromCharCode(65 + i);
    doc.text(L, OUT + 4, y - 4);
    doc.text(L, PAGE_W - OUT - 9, y - 4);
  }
  titleBlock(doc, m);
}

function titleBlock(doc: PDFKit.PDFDocument, m: SheetMeta) {
  const x0 = IN, H = TB_H, y0 = PAGE_H - IN - H, totalW = PAGE_W - IN * 2;
  doc.lineWidth(0.8).strokeColor(INK).rect(x0, y0, totalW, H).stroke();
  const raw = [124.5, 56.8, 54.9, 55.8, 148.9, 21.6, 200.9, 233.2, 242.0];
  const s = totalW / raw.reduce((a, b) => a + b, 0);
  const bx: number[] = [x0];
  raw.forEach((v) => bx.push(bx[bx.length - 1] + v * s));
  const vline = (xx: number, ya = y0, yb = y0 + H) => doc.lineWidth(0.5).strokeColor(INK).moveTo(xx, ya).lineTo(xx, yb).stroke();
  const hline = (xa: number, xb: number, yy: number) => doc.lineWidth(0.5).strokeColor(INK).moveTo(xa, yy).lineTo(xb, yy).stroke();
  for (let i = 1; i < bx.length - 1; i++) vline(bx[i]);
  const hdr = (t: string, xa: number, xb: number, yy: number) => doc.font(BODY).fontSize(6).fillColor(INK).text(t, xa + 1, yy, { width: xb - xa - 2, align: "center" });
  const val = (t: string, xa: number, xb: number, yy: number) => doc.font(BOLD).fontSize(7).fillColor(INK).text(t, xa + 1, yy, { width: xb - xa - 2, align: "center" });
  const date = new Date(m.offer.createdAt).toISOString().slice(0, 10);

  // cell 0: Rev.No. | Name | Date
  { const a = bx[0], b = bx[1], s1 = a + (b - a) * 0.26, s2 = a + (b - a) * 0.62;
    vline(s1); vline(s2); hline(a, b, y0 + 16);
    hdr("Rev.No.", a, s1, y0 + 4); hdr("Name", s1, s2, y0 + 4); hdr("Date", s2, b, y0 + 4);
    val("R0", a, s1, y0 + 21); val("For Approval", s1, s2, y0 + 21); val(date, s2, b, y0 + 21); }
  // cells 1-3: Designed / Checked / Approved By
  ([["Designed By", NAMES.designed], ["Checked By", NAMES.checked], ["Approved By", NAMES.approved || ""]] as [string, string][])
    .forEach(([lab, v], i) => { hdr(lab, bx[1 + i], bx[2 + i], y0 + 6); val(v, bx[1 + i], bx[2 + i], y0 + H - 16); });
  // cell 4: Project Name / Customer
  { const a = bx[4], b = bx[5]; hline(a, b, y0 + H / 2);
    doc.font(BODY).fontSize(6.5).fillColor(INK).text("Project Name", a + 3, y0 + 3);
    val(m.offer.projectName, a, b, y0 + 16);
    doc.font(BODY).fontSize(6.5).fillColor(INK).text("Customer", a + 3, y0 + H / 2 + 3);
    val(m.offer.customer, a, b, y0 + H / 2 + 16); }
  // cell 5: vertical document code
  { const a = bx[5], b = bx[6], cy = y0 + H / 2;
    doc.save(); doc.rotate(-90, { origin: [(a + b) / 2, cy] });
    doc.font(BODY).fontSize(7).fillColor(INK).text(m.offer.salesNumber || "PL-P26-F01", (a + b) / 2 - 45, cy - 4, { width: 90, align: "center" });
    doc.restore(); }
  // cell 6: Sheet Title / Item Name / Order Number / QTY
  { const a = bx[6], b = bx[7], mid = a + (b - a) * 0.42; vline(mid);
    ([["Sheet Title", m.sheetTitle], ["Item Name", m.g.panelCode], ["Order Number", m.offer.orderNumber || "XXXX"], ["QTY", String(m.offer.quantity || "")]] as [string, string][])
      .forEach(([lab, v], i) => { const ry = y0 + (H / 4) * i; if (i > 0) hline(a, b, ry);
        doc.font(BODY).fontSize(6.5).fillColor(INK).text(lab, a + 3, ry + 4, { width: mid - a - 5 });
        doc.font(BOLD).fontSize(7).fillColor(INK).text(v, mid + 4, ry + 4, { width: b - mid - 6 }); }); }
  // cell 7: logo (wide lockup incl. www — fit + centered, no extra text to avoid duplication)
  { const a = bx[7], b = bx[8];
    safeImage(doc, asset("logo-footer.png"), a + 10, y0 + 8, { fit: [b - a - 20, H - 18], align: "center", valign: "center" }); }
  // cell 8: WWW / Sheet no. / Total Sheets
  { const a = bx[8], b = bx[9], mid = a + (b - a) * 0.55;
    hline(a, b, y0 + H / 3); hline(a, b, y0 + 2 * H / 3); vline(mid, y0 + H / 3);
    doc.font(BODY).fontSize(7.5).fillColor(INK).text("WWW.Powerline.com.eg", a + 2, y0 + 5, { width: b - a - 4, align: "center" });
    doc.font(BODY).fontSize(7).fillColor(INK).text("Sheet no.", a + 4, y0 + H / 3 + 5, { width: mid - a - 6 });
    doc.font(BOLD).fontSize(7.5).fillColor(INK).text(String(m.sheetNo), mid + 4, y0 + H / 3 + 5, { width: b - mid - 8, align: "right" });
    doc.font(BODY).fontSize(7).fillColor(INK).text("Total Sheets", a + 4, y0 + 2 * H / 3 + 5, { width: mid - a - 6 });
    doc.font(BOLD).fontSize(7.5).fillColor(INK).text(String(m.totalSheets), mid + 4, y0 + 2 * H / 3 + 5, { width: b - mid - 8, align: "right" }); }
}

// ---------------------------------------------------------------- COVER

function coverPage(doc: PDFKit.PDFDocument, m: SheetMeta) {
  const o = m.offer;
  // ---- header: logo (top-left) + Head Office / Factory addresses ----
  safeImage(doc, asset("logo-footer.png"), CX + 10, CY + 10, { fit: [190, 56], valign: "center" });
  doc.font(BOLD).fontSize(9).fillColor(INK).text("Head Office", CX + 408, CY + 10);
  doc.font(BODY).fontSize(8).fillColor(INK).text("20 Ammar Ibn Yasser, Heliopolis, Cairo", CX + 408, CY + 24);
  doc.fillColor(ORANGE).text("+2 022 621 5022", CX + 408, CY + 38);
  doc.font(BOLD).fontSize(9).fillColor(INK).text("Factory", CX + 640, CY + 10);
  doc.font(BODY).fontSize(8).fillColor(INK).text("| Block 112 10th Of Ramadan City, Industrial Area C3", CX + 640, CY + 24);
  doc.text("| Block 9 10th Of Ramadan City, Industrial Area A5", CX + 640, CY + 35);
  doc.fillColor(ORANGE).text("+2 050 436 3832", CX + 640, CY + 49);
  doc.lineWidth(1).strokeColor(INK).moveTo(CX, CY + 78).lineTo(CX + CW, CY + 78).stroke();

  // ---- title ----
  doc.font(BOLD).fontSize(27).fillColor(ORANGE).text("Medium Voltage Panels", CX + 18, CY + 92);

  // ---- left: order / item / qty ----
  const lx = CX + 22;
  let y = CY + 155;
  const kv = (k: string, v: string, kx: number, vx: number, ks = 16, vs = 14) => {
    doc.font(BOLD).fontSize(ks).fillColor(ORANGE).text(k, kx, y);
    doc.font(BOLD).fontSize(vs).fillColor(INK).text(v, vx, y + (ks - vs));
  };
  kv("Order Number:", o.orderNumber || "XXXX", lx, lx + 158); y += 48;
  kv("Item Number :", m.g.panelCode, lx, lx + 158); y += 48;
  kv("QTY :", String(o.quantity || 1), lx, lx + 158);

  // ---- right: contact person ----
  const rx = CX + 600;
  y = CY + 155;
  kv("Contact Person", "Yasser El-Sayed", rx, rx + 165); y += 48;
  kv("Mobile No.", "01095211655", rx, rx + 165); y += 48;
  kv("E-Mail", "yasser.el-sayed@powerline.com.eg", rx, rx + 165, 16, 12);

  // ---- left lower: project / customer ----
  y = CY + 345;
  kv("Project Name :", o.projectName, lx, lx + 180, 18, 15); y += 58;
  kv("Customer Name :", o.customer, lx, lx + 180, 18, 15);

  // ---- right lower: drawing status ----
  doc.font(BOLD).fontSize(18).fillColor(INK).text("Drawing Status :", rx, CY + 330);
  let sy = CY + 376;
  ["APPROVED", "APPROVED AS NOTED", "NOT APPROVED AND TO BE RE-SUBMITTED", "NOT APPROVED"].forEach((s) => {
    doc.lineWidth(1).strokeColor(INK).rect(rx + 14, sy - 1, 15, 15).stroke();
    doc.font(BODY).fontSize(12).fillColor(INK).text(s, rx + 40, sy + 1, { width: 330 });
    sy += 46;
  });
  sy += 26;
  doc.font(BODY).fontSize(12).fillColor(INK).text("DATE>>", rx, sy);
  doc.moveTo(rx + 58, sy + 13).lineTo(rx + 155, sy + 13).stroke();
  doc.text("SIGNATURE>>", rx + 175, sy);
  doc.moveTo(rx + 270, sy + 13).lineTo(rx + 365, sy + 13).stroke();

  // ---- left bottom: notes ----
  doc.font(BOLD).fontSize(16).fillColor(INK).text("Notes :", lx, CY + 470);
  let ny = CY + 508;
  for (let i = 0; i < 5; i++) {
    dashed(doc, () => doc.lineWidth(0.6).strokeColor(LINE).moveTo(lx, ny).lineTo(CX + CW * 0.48, ny).stroke());
    ny += 42;
  }
  if (o.notes) doc.font(BODY).fontSize(11).fillColor(INK).text(o.notes, lx, CY + 486, { width: CW * 0.46 });
}

// ------------------------------------------------- GENERAL CHARACTERISTICS

function specRows(pt: ProductType, kv: VoltageKv): [string, string][] {
  const r = getRatings(pt, kv);
  const p = PRODUCTS[pt];
  const peak = r.ratedShortCircuitKa * 2.5; // SLD convention (2.5 × rms)
  return [
    ["Product's Category - Air Insulated system - R.M.U", "AIS"],
    ["Product's Type", `${p.productName.replace("-", "-").toUpperCase()}${kv}`.replace("P-RAL", "P-RAL").replace("P-SEC", "P-SEC")],
    ["Type of load break switch (Insulation & Extinguishing)", p.gasInsulated ? "SF6" : "Air"],
    ["Rated continuous current for Load Break Switch", "630A"],
    ["IEC Standard", "IEC-62271-200"],
    ["Nominal Operating Voltage (Service Voltage)", `${r.serviceVoltageKv}KV`],
    ["Maximum Operating Voltage (Rated Voltage)", `${r.ratedVoltageKv}KV`],
    ["One Minute Power Frequency Withstand Voltage (Peak)", `${r.powerFreqWithstandKv}KV`],
    ["1.2/50 µs Impulse Withstand Voltage (Peak)", `${r.bilKv}KV`],
    ["Rated Frequency", `${r.ratedFrequencyHz}Hz`],
    ["Nominal Current for Busbar and connectors", "630A"],
    ["Thermal withstand current for one sec (R.M.S)", `${r.ratedShortCircuitKa}KA`],
    ["Dynamic withstand current (Peak)", `${peak}KA`],
  ];
}

function generalCharacteristics(doc: PDFKit.PDFDocument, m: SheetMeta) {
  const rmu = m.offer.rmu!;
  const pt = rmu.productType as ProductType;
  const kv = rmu.voltageKv as VoltageKv;
  const outdoor = rmu.installation === "OUTDOOR";

  doc.font(BOLD).fontSize(18).fillColor(ORANGE).text("General Characteristics", CX + 20, CY + 16);

  // Product's Specs (left)
  sectionTitle(doc, "Product's Specs.", CX + 20, CY + 56, CW / 2 - 40);
  table(doc, CX + 20, CY + 78, CW / 2 - 60, specRows(pt, kv));

  // Enclosure's Specs (right)
  const rx = CX + CW / 2 + 10;
  sectionTitle(doc, "Enclosure's Specs.", rx, CY + 56, CW / 2 - 40);
  table(doc, rx, CY + 78, CW / 2 - 60, [
    ["Enclosure Material", "Sheet Steel"],
    ["Material's Thickness", "2mm"],
    ["Painting Type", "Electrostatic"],
    ["Color", "Gray - RAL7035"],
    ["Mounting", "Free Standing"],
    ["Accessibility", "Front"],
    ["Degree of protection - IP", PRODUCTS[pt].protectionIndex.replace(" on front face", "")],
    ["Mechanical Impact Strength - IK", "IK10"],
    ["Incoming", "Bottom"],
    ["Outgoing", "Bottom"],
    ["Application (Area of usage)", outdoor ? "Outdoor Application" : "Indoor Application"],
  ]);

  // Climate conditions (left, below product specs)
  const cy2 = CY + 78 + 13 * 22 + 30;
  sectionTitle(doc, "Climate conditions", CX + 20, cy2, CW / 2 - 40);
  table(doc, CX + 20, cy2 + 22, CW / 2 - 60, [
    ["Ambient Temperature", "-5°C Till +40 C°"],
    ["Maximum Relative Humidity", "95%"],
    ["Maximum Altitude", "1000 Meter"],
  ]);
}

// ---------------------------------------------------------------- NAME PLATE

function namePlate(doc: PDFKit.PDFDocument, m: SheetMeta) {
  const rmu = m.offer.rmu!;
  const pt = rmu.productType as ProductType;
  const kv = rmu.voltageKv as VoltageKv;
  const r = getRatings(pt, kv);
  const p = PRODUCTS[pt];
  const bw = 470, bh = 520, bx = CX + (CW - bw) / 2, by = CY + 40;
  doc.lineWidth(1).strokeColor(INK).rect(bx, by, bw, bh).stroke();

  safeImage(doc, asset("logo.png"), bx + 20, by + 16, { width: 110 });
  doc.font(BODY).fontSize(8).fillColor(GREY)
    .text("Website : www.powerline.com.eg\nEmail : info@powerline.com.eg", bx + 200, by + 24);

  let y = by + 100;
  const row = (k: string, v: string, big = false) => {
    doc.lineWidth(0.5).strokeColor(LINE).rect(bx + 20, y, bw - 40, 22).stroke();
    doc.font(BOLD).fontSize(big ? 10 : 9).fillColor(INK).text(k, bx + 28, y + 6, { width: 220 });
    doc.font(BOLD).fontSize(big ? 10 : 9).fillColor(INK).text(v, bx + 250, y + 6, { width: bw - 280 });
    y += 22;
  };
  row("Item Designation:", m.g.panelCode);
  row("Sales Order:", m.offer.salesNumber || "—");
  row("Project Name :", m.offer.projectName);
  row("Year Of Manufacturer", String(new Date(m.offer.createdAt).getFullYear()));
  row("Enclosure Type :", `${p.productName.toUpperCase()}${kv}`);
  y += 6;
  doc.font(BOLD).fontSize(11).fillColor(INK).text(`${p.gasInsulated ? "SF6" : "Air"} Type Ring Main Unit`, bx + 28, y); y += 20;
  row("Applicable Standard", "IEC 62271-200");
  row("Rated Voltage", `${r.ratedVoltageKv}KV`);
  row("Service Voltage", `${r.serviceVoltageKv}KV`);
  row("Rated Frequency", `${r.ratedFrequencyHz}Hz`);
  row("Rated Lightning Impulse", `${r.bilKv}KV`);
  row("Rated Power Frequency", `${r.powerFreqWithstandKv}KV`);
  row("Rated Normal Current", "630A");
  row("Rated Short Time Withstand Current", `${r.ratedShortCircuitKa}KA`);
  row("Degree of protection", p.protectionIndex.replace(" on front face", ""));
  row("Mechanical Impact Strength", "IK10");
  y += 10;
  doc.font(BOLD).fontSize(11).fillColor(INK).text("Made in Egypt by ", bx + 120, y, { continued: true })
    .fillColor(ORANGE).text("Powerline");

  // Height / Width / QTY
  const ty = by + bh + 18;
  const tw = 360, tx = CX + (CW - tw) / 2;
  const c3 = tw / 3;
  ["Height", "Width", "QTY"].forEach((h, i) => {
    doc.lineWidth(0.5).strokeColor(LINE).rect(tx + i * c3, ty, c3, 24).stroke();
    doc.font(BOLD).fontSize(10).fillColor(INK).text(h, tx + i * c3, ty + 7, { width: c3, align: "center" });
  });
  ["15cm", "8cm", String(m.offer.quantity)].forEach((v, i) => {
    doc.lineWidth(0.5).strokeColor(LINE).rect(tx + i * c3, ty + 24, c3, 24).stroke();
    doc.font(BODY).fontSize(10).fillColor(INK).text(v, tx + i * c3, ty + 31, { width: c3, align: "center" });
  });
}

// ============================================================ SLD CUBICLES

const SBLK = "#222222"; // conductors
const SBLU = "#1f3fa8"; // labels

type CubType = "NAL" | "NALF" | "MET";
interface Cub {
  type: CubType;
  name: string;
  accessories: string[];
}

function buildCubicleList(rmu: RmuConfig): Cub[] {
  const list: Cub[] = [];
  const ringName = (i: number) =>
    i === 0 ? "Ring Feeder - Incoming" : i === 1 ? "Ring Feeder - Tie In" : "Ring Feeder - Spare";
  for (let i = 0; i < rmu.nalCount; i++)
    list.push({
      type: "NAL",
      name: ringName(i),
      accessories: ["Toroid", "Earth Fault Indicator", "Hygrostat & Heater - 200Watt", "MCB for control - 10A/3KA"],
    });
  if (rmu.hasMetering)
    list.push({
      type: "MET",
      name: "Measuring",
      accessories: [
        "Three Analogue Ammeters",
        "One Voltmeter",
        "Voltmeter Selector Switch (Seven Positions)",
        "Hygrostat & Heater - 200Watt",
        "MCB for control - 10A/3KA",
      ],
    });
  for (let i = 0; i < rmu.nalfCount; i++)
    list.push({
      type: "NALF",
      name: "Transformer Feeder - Outgoing",
      accessories: ["Hygrostat & Heater - 200Watt", "MCB for control - 10A/3KA"],
    });
  return list;
}

function sldCubiclesPage(doc: PDFKit.PDFDocument, m: SheetMeta) {
  const rmu = m.offer.rmu!;
  const kv = rmu.voltageKv as VoltageKv;
  const r = getRatings(rmu.productType as ProductType, kv);
  const cubicles = buildCubicleList(rmu);
  const n = cubicles.length;
  const colW = CW / n;
  const busbarY = CY + 128;
  const peY = busbarY + 290; // PE bus / cable-termination lineup shared by every cubicle

  // headers + dashed boundaries
  cubicles.forEach((c, i) => {
    const x = CX + i * colW;
    dashed(doc, () => doc.lineWidth(0.9).strokeColor(ORANGE).rect(x + 3, CY + 8, colW - 6, CYB - CY - 14).stroke());
    doc.font(BOLD).fontSize(12).fillColor(ORANGE).text(`Cubicle No.${i + 1}`, x, CY + 16, { width: colW, align: "center" });
    doc.font(BODY).fontSize(9.5).fillColor(ORANGE).text(c.name, x, CY + 34, { width: colW, align: "center" });
  });

  // busbar across the top — dips into a U at the metering cubicle (CT sits in series on it)
  const mi = cubicles.findIndex((c) => c.type === "MET");
  doc.lineWidth(3.4).strokeColor(SBLK);
  if (mi >= 0) {
    const mcolX = CX + mi * colW;
    const uL = mcolX + colW * 0.3;
    const uR = mcolX + colW * 0.72;
    doc.moveTo(CX + 16, busbarY).lineTo(uL, busbarY).stroke(); // left of the U
    doc.moveTo(uR, busbarY).lineTo(CX + CW - 16, busbarY).stroke(); // right of the U
    // the U legs + bottom are drawn by meteringSymbols()
  } else {
    doc.moveTo(CX + 16, busbarY).lineTo(CX + CW - 16, busbarY).stroke();
  }
  doc.font(BOLD).fontSize(12).fillColor(SBLK).text("3PH", CX + 4, busbarY - 24);
  doc.lineWidth(1.3).strokeColor(SBLK);
  for (let k = 0; k < 3; k++) doc.moveTo(CX + 78 + k * 5, busbarY - 7).lineTo(CX + 87 + k * 5, busbarY - 19).stroke();
  doc.font(BODY).fontSize(9).fillColor(SBLK).text(`3Ph-630A-50HZ-${r.ratedVoltageKv}KV-${r.ratedShortCircuitKa}KA @ 1Sec.`, CX + 108, busbarY - 19);
  // CU1 copper link on the busbar
  cuSymbol(doc, CX + CW - 96, busbarY);
  doc.font(BODY).fontSize(8).fillColor(SBLU).text("-CU1\nCU. 10x40", CX + CW - 84, busbarY - 26);

  // unique copper tags: CU1 busbar, CU2 PE bar, CU3 metering link, feeders CU4+
  let feeder = 4;
  cubicles.forEach((c, i) => {
    const cuNo = c.type === "MET" ? 3 : feeder++;
    cubicleBody(doc, CX + i * colW, colW, busbarY, peY, c, rmu, r, i, cuNo);
    accessories(doc, CX + i * colW + 10, CYB - 168, colW - 20, c.accessories);
  });

  // PE earth bus — dashed line tying every cubicle's cable-termination triangle into one lineup
  dashed(doc, () => doc.lineWidth(0.9).strokeColor(SBLK).moveTo(CX + 14, peY).lineTo(CX + CW - 14, peY).stroke());
  doc.font(BOLD).fontSize(11).fillColor(SBLK).text("PE", CX + 4, peY - 14);
  // CU2 copper link on the PE bus
  cuSymbol(doc, CX + colW * 0.72, peY);
  doc.font(BODY).fontSize(8).fillColor(SBLU).text("-CU2\nCU. 5x25", CX + colW * 0.72 + 13, peY - 6);
}

function cubicleBody(doc: PDFKit.PDFDocument, colX: number, colW: number, busbarY: number, peY: number, c: Cub, rmu: RmuConfig, r: ReturnType<typeof getRatings>, idx: number, cuNo: number) {
  const condX = colX + colW * 0.32; // main conductor at the left third
  const labX = condX + 34; // spec labels clear of the housing box + earth switch
  const labW = colX + colW - labX - 8;
  const devX = colX + colW * 0.44; // hygrostat/heater column
  // common vertical lineup (same across every cubicle so VPIS / earth align)
  const vpisY = busbarY + 135; // below the NALF fuse so it never clashes
  const toroidY = busbarY + 205;
  const cuY = busbarY + 240;
  if (c.type === "MET") {
    meteringSymbols(doc, colX, colW, busbarY, rmu, r); // U-busbar: CT in series, VT in parallel
    hygHeater(doc, devX, busbarY + 330, idx);
    return;
  }
  const fused = c.type === "NALF";
  // main conductor (symbols overlay it) — runs down to the PE bus / cable termination
  vline(doc, condX, busbarY, peY);
  switchDisc(doc, condX, labX, labW, busbarY + 16, fused, rmu, r);
  vpis(doc, condX, vpisY, idx);
  if (c.type === "NAL") toroidEFI(doc, condX, toroidY, idx);
  cuSymbol(doc, condX, cuY); // copper bar/cable connection
  doc.font(BODY).fontSize(8).fillColor(SBLU).text(`-CU${cuNo}\nCU. 10x30`, condX + 13, cuY - 6);
  earthSym(doc, condX, peY, c.type === "NAL"); // NAL termination points up, NALF down
  hygHeater(doc, devX, busbarY + 330, idx);
}

// vertical conductor
function vline(doc: PDFKit.PDFDocument, x: number, y1: number, y2: number) {
  doc.lineWidth(1.1).strokeColor(SBLK).moveTo(x, y1).lineTo(x, y2).stroke();
}

// switch-disconnector (LBS), optionally fused
function switchDisc(doc: PDFKit.PDFDocument, condX: number, labX: number, labW: number, yTop: number, fused: boolean, rmu: RmuConfig, r: ReturnType<typeof getRatings>) {
  const ya = yTop;
  // housing box (mechanism)
  doc.lineWidth(0.7).strokeColor(SBLU).rect(condX - 24, ya - 6, 50, 60).stroke();
  // top fixed contact
  doc.lineWidth(1.4).strokeColor(SBLK).circle(condX, ya, 3).stroke();
  // moving blade (open load-break switch) — hinged at the bottom pivot, opens up-left.
  // Same for NAL & NALF; NALF only adds the fuse below (LBS symbol is identical).
  doc.lineWidth(1.6).strokeColor(SBLK).moveTo(condX, ya + 44).lineTo(condX - 20, ya + 11).stroke();
  doc.lineWidth(1).moveTo(condX - 20, ya + 11).lineTo(condX - 13, ya + 13).stroke();
  doc.moveTo(condX - 20, ya + 11).lineTo(condX - 16, ya + 18).stroke();
  // bottom pivot (hinge)
  doc.circle(condX, ya + 44, 3).fillColor(SBLK).fill();
  // earthing switch branch to ground — kept compact inside the housing, clear of the label
  doc.lineWidth(1.2).strokeColor(SBLK).moveTo(condX, ya + 26).lineTo(condX + 14, ya + 36).stroke();
  groundMark(doc, condX + 14, ya + 36);
  let yb = ya + 54;
  if (fused) {
    vline(doc, condX, yb, yb + 8);
    doc.lineWidth(1.3).strokeColor(SBLK).rect(condX - 8, yb + 8, 16, 34).stroke(); // fuse body
    doc.lineWidth(1.1).moveTo(condX, yb + 8).lineTo(condX, yb + 42).stroke();
    const fuseTxt = rmu.fuseRatingA != null ? `${rmu.fuseRatingA} Amp` : "X Amp";
    doc.font(BOLD).fontSize(8).fillColor(SBLU).text(`-F1`, condX - 64, yb + 10, { width: 50, align: "right" });
    doc.font(BODY).fontSize(8).fillColor(SBLU).text(`Fuse\n${fuseTxt}`, condX - 64, yb + 20, { width: 50, align: "right" });
    if (rmu.fuseRatingA == null)
      doc.fillColor("#c0392b").fontSize(7.5).text("Waiting for\ncustomer", condX - 64, yb + 40, { width: 50, align: "right" });
    yb += 42;
  }
  // brand follows the offer's LBS selection (ABB / Murge) — kept in sync with the tech offer
  const brand = rmu.lbsBrand === "MURGE" ? "Murge" : "ABB";
  const typeCode = brand === "ABB"
    ? (fused ? `GSEC/T2F-${r.ratedVoltageKv}` : `GSEC/T1-${r.ratedVoltageKv}`)
    : (fused ? `T2F-${r.ratedVoltageKv}` : `T1-${r.ratedVoltageKv}`);
  const t = fused
    ? `-Q1\nLoad Break Switch Fused\nL.B.S, ${brand}\nSF6 Type\n630A / ${r.ratedVoltageKv}KV\nType:- ${typeCode}`
    : `-Q1\nLoad Break Switch\nL.B.S, ${brand}\nSF6 Type\n630A / ${r.ratedVoltageKv}KV\nType:- ${typeCode}`;
  doc.font(BODY).fontSize(8).fillColor(SBLU).text(t, labX, ya - 4, { width: labW, lineGap: 1 });
}

// voltage presence indicator (3 lamps) fed via capacitive divider (CVD)
function vpis(doc: PDFKit.PDFDocument, condX: number, vy: number, idx: number) {
  doc.lineWidth(1).strokeColor(SBLK);
  for (let k = 0; k < 3; k++) {
    const ly = vy + k * 16;
    // tap from conductor
    doc.moveTo(condX, ly).lineTo(condX + 10, ly).stroke();
    // capacitor (two plates)
    doc.moveTo(condX + 10, ly - 5).lineTo(condX + 10, ly + 5).stroke();
    doc.moveTo(condX + 14, ly - 5).lineTo(condX + 14, ly + 5).stroke();
    // to lamp
    doc.moveTo(condX + 14, ly).lineTo(condX + 28, ly).stroke();
    // lamp (circle with X)
    doc.circle(condX + 33, ly, 5).stroke();
    doc.moveTo(condX + 29.5, ly - 3.5).lineTo(condX + 36.5, ly + 3.5).stroke();
    doc.moveTo(condX + 29.5, ly + 3.5).lineTo(condX + 36.5, ly - 3.5).stroke();
    doc.font(BODY).fontSize(7.5).fillColor(SBLK).text(`L${k + 1}`, condX + 42, ly - 4);
  }
  // common return + test arrow
  doc.lineWidth(1).moveTo(condX + 38, vy).lineTo(condX + 38, vy + 32).stroke();
  doc.moveTo(condX + 38, vy + 38).lineTo(condX + 54, vy + 38).stroke();
  doc.moveTo(condX + 54, vy + 38).lineTo(condX + 49, vy + 35).stroke();
  doc.moveTo(condX + 54, vy + 38).lineTo(condX + 49, vy + 41).stroke();
  doc.moveTo(condX + 38, vy + 32).lineTo(condX + 38, vy + 38).stroke();
  // labels
  doc.font(BOLD).fontSize(8).fillColor(SBLU).text(`-VPI${idx + 1}`, condX - 52, vy - 4, { width: 46, align: "right" });
  doc.font(BODY).fontSize(8).fillColor(SBLU).text(`-CVD${idx + 1}`, condX - 52, vy + 34, { width: 46, align: "right" });
}

// toroid (CT ring around the cable) + EFI box
function toroidEFI(doc: PDFKit.PDFDocument, condX: number, y: number, idx: number) {
  doc.lineWidth(1.2).strokeColor(SBLK).ellipse(condX, y, 18, 9).stroke();
  doc.font(BODY).fontSize(8).fillColor(SBLK).text("Toroid", condX - 70, y - 5, { width: 48, align: "right" });
  // dashed connector to EFI box
  dashed(doc, () => doc.lineWidth(0.8).strokeColor(SBLU).moveTo(condX + 18, y).lineTo(condX + 30, y).stroke());
  doc.lineWidth(1).strokeColor(SBLU).rect(condX + 30, y - 9, 18, 18).stroke();
  doc.font(BOLD).fontSize(7).fillColor(SBLU).text("FP", condX + 34, y - 4);
  doc.font(BODY).fontSize(8).fillColor(SBLU).text(`-EFI${idx + 1}`, condX + 52, y - 4);
}

// cable-termination triangle on the PE bus — direction shows feed:
// NAL (incoming) points UP, NALF (outgoing) points DOWN.
function earthSym(doc: PDFKit.PDFDocument, condX: number, peY: number, up: boolean) {
  doc.lineWidth(1.4).strokeColor(SBLK);
  if (up) {
    // apex at the PE line, base below
    doc.moveTo(condX, peY).lineTo(condX - 11, peY + 15).lineTo(condX + 11, peY + 15).closePath().stroke();
  } else {
    // base on the PE line, apex below
    doc.moveTo(condX - 11, peY).lineTo(condX + 11, peY).lineTo(condX, peY + 15).closePath().stroke();
  }
}

// copper bar / cable connection — small lug loop sitting on the conductor
function cuSymbol(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.lineWidth(1.2).strokeColor(SBLK).circle(x, y, 3.2).stroke();
  doc.moveTo(x + 3, y).lineTo(x + 9, y).stroke(); // short tail toward the label
}
function groundMark(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.lineWidth(1.2).strokeColor(SBLK).moveTo(x, y).lineTo(x, y + 8).stroke();
  doc.moveTo(x - 9, y + 8).lineTo(x + 9, y + 8).stroke();
  doc.moveTo(x - 6, y + 12).lineTo(x + 6, y + 12).stroke();
  doc.moveTo(x - 3, y + 16).lineTo(x + 3, y + 16).stroke();
}

// hygrostat + heater (control devices)
function hygHeater(doc: PDFKit.PDFDocument, x: number, y: number, idx: number) {
  // hygrostat: NO contact + humidity actuator
  doc.font(BOLD).fontSize(8).fillColor(SBLU).text(`-HYG${idx + 1}`, x - 52, y - 4, { width: 44, align: "right" });
  doc.lineWidth(1.2).strokeColor(SBLK).moveTo(x - 8, y).lineTo(x, y).stroke(); // in
  doc.circle(x, y, 1.8).fillColor(SBLK).fill(); // fixed contact
  doc.lineWidth(1.2).strokeColor(SBLK).moveTo(x, y).lineTo(x + 13, y - 11).stroke(); // blade (open)
  doc.moveTo(x + 13, y - 11).lineTo(x + 22, y - 11).stroke(); // out
  // actuator (humidity) — small arc under the blade
  doc.lineWidth(0.8).circle(x + 7, y + 7, 3.5).stroke();
  dashed(doc, () => doc.lineWidth(0.6).moveTo(x + 6, y - 5).lineTo(x + 7, y + 3).stroke());
  doc.font(BODY).fontSize(8).fillColor(SBLK).text("Hygrostat", x + 28, y - 4);
  // heater: rectangle with element lines
  const hy = y + 30;
  doc.font(BOLD).fontSize(8).fillColor(SBLU).text(`-EH${idx + 1}`, x - 52, hy + 8, { width: 44, align: "right" });
  doc.lineWidth(1.2).strokeColor(SBLK).rect(x - 8, hy, 16, 32).stroke();
  for (let k = 1; k <= 3; k++) doc.moveTo(x - 8, hy + k * 8).lineTo(x + 8, hy + k * 8).stroke();
  doc.font(BODY).fontSize(8).fillColor(SBLK).text("Heater\n200W", x + 16, hy + 6);
}

// short "///" link hatch (CT secondary / VT connection links), centred on (x,y)
function linkHatch(doc: PDFKit.PDFDocument, x: number, y: number, vertical = false) {
  doc.lineWidth(1).strokeColor(SBLU);
  for (let k = 0; k < 3; k++) {
    if (vertical) doc.moveTo(x - 5, y + 4 + k * 4).lineTo(x + 5, y - 2 + k * 4).stroke();
    else doc.moveTo(x + 12 + k * 4, y + 5).lineTo(x + 18 + k * 4, y - 5).stroke();
  }
}
// wye (star) winding mark inside a VT coil circle
function wyeSymbol(doc: PDFKit.PDFDocument, cx: number, cy: number) {
  doc.lineWidth(0.8).strokeColor(SBLU);
  doc.moveTo(cx, cy).lineTo(cx, cy - 5).stroke();
  doc.moveTo(cx, cy).lineTo(cx - 4.5, cy + 4).stroke();
  doc.moveTo(cx, cy).lineTo(cx + 4.5, cy + 4).stroke();
}

// metering cubicle (matches reference): busbar U-detour with CT in SERIES on the left leg,
// VT connected in PARALLEL hanging from the bottom of the U.
function meteringSymbols(doc: PDFKit.PDFDocument, colX: number, colW: number, busbarY: number, rmu: RmuConfig, r: ReturnType<typeof getRatings>) {
  const uL = colX + colW * 0.3; // left leg (CT in series)
  const uR = colX + colW * 0.72; // right leg
  const yBot = busbarY + 135; // bottom of the U
  const vtTapX = colX + colW * 0.5; // VT parallel tap point

  // --- busbar U detour (thick black): left leg down, bottom across, right leg up ---
  doc.lineWidth(3.4).strokeColor(SBLK);
  doc.moveTo(uL, busbarY).lineTo(uL, yBot).stroke();
  doc.moveTo(uL, yBot).lineTo(uR, yBot).stroke();
  doc.moveTo(uR, busbarY).lineTo(uR, yBot).stroke();

  // --- CT in series on the left leg ---
  const ctY = busbarY + 44;
  doc.lineWidth(1.4).strokeColor(SBLU).circle(uL, ctY, 12).stroke();
  doc.font(BODY).fontSize(8).fillColor(SBLK).text("P1", uL - 30, ctY - 18);
  doc.text("P2", uL - 30, ctY + 8);
  linkHatch(doc, uL, ctY); // CT secondary winding ///
  const ctRatio = rmu.meteringCtPrimaryA != null ? `${rmu.meteringCtPrimaryA}/5` : "X/5";
  doc.font(BODY).fontSize(8).fillColor(SBLU).text(`-CT1\nCT-TPU40.13\nCL 0.5FS5\n${ctRatio}\n10VA , ${r.ratedVoltageKv}KV\nABB`, uL + 28, ctY - 20, { width: colX + colW - (uL + 28) - 6, lineGap: 1 });
  if (rmu.meteringCtPrimaryA == null) doc.fillColor("#c0392b").fontSize(7.5).text("Waiting for\ncustomer", uL + 28, busbarY + 88, { width: 54 });

  // --- CU3 copper connection at the bottom-left corner of the U ---
  doc.lineWidth(1.2).strokeColor(SBLU).ellipse(uL, yBot, 7, 4).stroke();
  doc.font(BODY).fontSize(8).fillColor(SBLU).text(`-CU3\nCU. 5x40`, uL + 12, yBot - 24);

  // --- VT in PARALLEL: tap dot on the bottom bar, thin line hanging down to the VT ---
  doc.circle(vtTapX, yBot, 1.8).fillColor(SBLK).fill();
  doc.lineWidth(1.1).strokeColor(SBLU).moveTo(vtTapX, yBot).lineTo(vtTapX, yBot + 20).stroke();
  linkHatch(doc, vtTapX, yBot + 14, true); // HV link ///
  const vtY = yBot + 38;
  doc.lineWidth(1.3).strokeColor(SBLU).circle(vtTapX, vtY, 11).stroke();
  doc.circle(vtTapX, vtY + 16, 11).stroke();
  wyeSymbol(doc, vtTapX, vtY);
  wyeSymbol(doc, vtTapX, vtY + 16);
  linkHatch(doc, vtTapX, vtY + 30, true); // earthed-end link ///
  // leader lines to coil labels (right side)
  doc.lineWidth(0.6).strokeColor(SBLK).moveTo(vtTapX + 11, vtY).lineTo(vtTapX + 30, vtY + 3).stroke();
  doc.font(BODY).fontSize(7.5).fillColor(SBLK).text("Primary Coil", vtTapX + 32, vtY - 1);
  doc.moveTo(vtTapX + 11, vtY + 16).lineTo(vtTapX + 30, vtY + 20).stroke();
  doc.text("Measuring Coil", vtTapX + 32, vtY + 16);
  // VT spec block (left, below the U)
  const us = r.serviceVoltageKv * 1000;
  const fuseLine = rmu.meteringWithFuse ? "WITH FUSE" : "WITHOUT FUSE";
  doc.font(BODY).fontSize(8).fillColor(SBLU).text(`-VT1\nVT-TJCH4-CL0.5\n${r.ratedVoltageKv}KV, 100VA\n${fuseLine}\n(${us}/V3 = 110/V3)\nABB`, colX + 6, vtY - 12, { width: vtTapX - colX - 18, lineGap: 1 });
}

function accessories(doc: PDFKit.PDFDocument, x: number, y: number, w: number, items: string[]) {
  doc.lineWidth(0.8).strokeColor(ORANGE).moveTo(x - 4, y - 8).lineTo(x + w, y - 8).stroke();
  doc.font(BOLD).fontSize(8.5).fillColor(INK).text("Cubicle's Accessories:-", x, y);
  doc.font(BODY).fontSize(8).fillColor(INK);
  items.forEach((it, i) => doc.text(`·  ${it}`, x, y + 16 + i * 12, { width: w }));
}

function dashed(doc: PDFKit.PDFDocument, fn: () => void) {
  doc.dash(3, { space: 2 });
  fn();
  doc.undash();
}

// ================================================================ LAYOUT PAGE
const LAYOUT_W: Record<CubType, number> = { NAL: 500, NALF: 500, MET: 750 }; // mm
const LAYOUT_CODE: Record<CubType, string> = { NAL: "SC", NALF: "SF", MET: "MU" };
const LAYOUT_NAME: Record<CubType, string> = { NAL: "RING FEEDER", NALF: "OUTGOING", MET: "MEASURING" };

function layoutPage(doc: PDFKit.PDFDocument, m: SheetMeta) {
  const rmu = m.offer.rmu!;
  const cubicles = buildCubicleList(rmu);
  const END = 27, HEIGHT = 1700, DEPTH = 1070; // mm
  const bodyMM = cubicles.reduce((s, c) => s + LAYOUT_W[c.type], 0);
  const totalMM = END * 2 + bodyMM;
  // one scale shared by front + side so both share the 1700 mm height
  const s = Math.min((CW - 150) / (totalMM + DEPTH), 0.3);
  const topY = CY + 58;
  const H = HEIGHT * s;

  // ---- FRONT VIEW ----
  const fX0 = CX + 46;
  const frontW = totalMM * s;
  doc.lineWidth(1).strokeColor(INK).rect(fX0, topY, frontW, H).stroke();
  let x = fX0 + END * s; // after left end plate
  doc.lineWidth(0.6).strokeColor(INK).moveTo(x, topY).lineTo(x, topY + H).stroke();
  const segs: { x: number; w: number; mm: number; c?: Cub }[] = [{ x: fX0, w: END * s, mm: END }];
  const kvMax = (rmu.voltageKv * 1.1).toFixed(1); // voltmeter full-scale ≈ Um
  cubicles.forEach((c) => {
    const w = LAYOUT_W[c.type] * s;
    cubicleFront(doc, x, topY, w, H, c, kvMax);
    segs.push({ x, w, mm: LAYOUT_W[c.type], c });
    x += w;
    doc.lineWidth(0.6).strokeColor(INK).moveTo(x, topY).lineTo(x, topY + H).stroke();
  });
  segs.push({ x, w: END * s, mm: END });

  // height dim + width dims
  dimV(doc, fX0 - 16, topY, topY + H, `${HEIGHT} mm`);
  const dimY = topY + H + 12;
  segs.forEach((sg) => dimH(doc, sg.x, sg.x + sg.w, dimY, `${sg.mm} mm`));

  // label table (code row + name row) under the cubicles
  const tY = dimY + 22, tH = 46;
  segs.forEach((sg) => {
    if (!sg.c) return;
    doc.lineWidth(0.6).strokeColor(INK).rect(sg.x, tY, sg.w, tH).stroke();
    doc.moveTo(sg.x, tY + tH / 2).lineTo(sg.x + sg.w, tY + tH / 2).stroke();
    doc.font(BOLD).fontSize(11).fillColor(INK).text(LAYOUT_CODE[sg.c.type], sg.x, tY + 5, { width: sg.w, align: "center" });
    doc.font(BODY).fontSize(8).fillColor(INK).text(LAYOUT_NAME[sg.c.type], sg.x + 2, tY + tH / 2 + 6, { width: sg.w - 4, align: "center" });
  });

  // ---- SIDE VIEW ----
  const sX0 = fX0 + frontW + 64;
  const sideW = DEPTH * s;
  doc.lineWidth(1).strokeColor(INK).rect(sX0, topY, sideW, H).stroke();
  doc.lineWidth(0.5).strokeColor(LINE).rect(sX0 + 6, topY + 6, sideW - 12, H - 12).stroke(); // door
  doc.moveTo(sX0 + sideW - 12, topY + H * 0.45).lineTo(sX0 + sideW - 18, topY + H * 0.45 + 6).stroke(); // handle
  dimV(doc, sX0 + sideW + 16, topY, topY + H, `${HEIGHT} mm`);
  dimH(doc, sX0, sX0 + sideW, dimY, `${DEPTH} mm`);
  doc.lineWidth(0.6).strokeColor(INK).rect(sX0, tY, sideW, tH).stroke();
  doc.moveTo(sX0, tY + tH / 2).lineTo(sX0 + sideW, tY + tH / 2).stroke();
  doc.font(BOLD).fontSize(11).fillColor(INK).text("—", sX0, tY + 5, { width: sideW, align: "center" });
  doc.font(BODY).fontSize(8).fillColor(INK).text("SIDE VIEW", sX0, tY + tH / 2 + 6, { width: sideW, align: "center" });
}

// front elevation of one cubicle: 3 compartments + detailed fittings
function cubicleFront(doc: PDFKit.PDFDocument, x: number, y: number, w: number, H: number, c: Cub, kvMax: string) {
  const c1 = y + H * 0.26, c2 = y + H * 0.56; // compartment dividers
  const baseY = y + H - 13; // plinth top
  const cxm = x + w / 2;
  // compartment dividers (double line) + corner mounting screws
  const divider = (yy: number) => {
    doc.lineWidth(0.6).strokeColor(INK).moveTo(x, yy).lineTo(x + w, yy).stroke();
    doc.lineWidth(0.4).strokeColor(LINE).moveTo(x + 3, yy + 2.5).lineTo(x + w - 3, yy + 2.5).stroke();
  };
  divider(c1); divider(c2);
  const screws = (yA: number, yB: number) => {
    [[x + 6, yA + 6], [x + w - 6, yA + 6], [x + 6, yB - 6], [x + w - 6, yB - 6]].forEach(
      ([sx, sy]) => doc.lineWidth(0.4).strokeColor(GREY).circle(sx, sy, 1.5).stroke());
  };
  screws(y, c1); screws(c1, c2); screws(c2, baseY);

  if (c.type === "MET") {
    // instrument panel: 3 ammeters (row 1) + voltmeter + selector (row 2) — compact meters
    const sz = Math.min((w - 20) / 3 - 6, 36); // a little smaller than before
    const gap = 8;
    for (let k = 0; k < 3; k++) analogMeter(doc, x + 8 + k * (sz + gap), y + 10, sz, "A", "100");
    analogMeter(doc, x + 8, y + 18 + sz, sz, "KV", kvMax);
    selectorSwitch(doc, x + 8 + sz + gap, y + 18 + sz, sz);
  } else {
    // top: mimic / VPIS indicator window + lamp hole
    const tH = c1 - y;
    doc.lineWidth(0.6).strokeColor(INK).rect(x + w * 0.16, y + tH * 0.32, w * 0.42, tH * 0.42).stroke();
    doc.lineWidth(0.4).strokeColor(GREY).circle(x + w * 0.2, y + tH * 0.62, 2).stroke();
    doc.circle(x + w - 11, y + tH * 0.42, 3).stroke();
    // middle: operating mechanism — shaft, operator ring, slot, label window
    const my = (c1 + c2) / 2;
    doc.lineWidth(0.7).strokeColor(INK).circle(x + w * 0.28, c1 + (c2 - c1) * 0.3, 9).stroke(); // shaft
    for (let a = 0; a < 8; a++) { // shaft ticks
      const r = (a * Math.PI) / 4, sxh = x + w * 0.28, syh = c1 + (c2 - c1) * 0.3;
      doc.lineWidth(0.3).moveTo(sxh + Math.cos(r) * 9, syh - Math.sin(r) * 9).lineTo(sxh + Math.cos(r) * 11, syh - Math.sin(r) * 11).stroke();
    }
    doc.lineWidth(0.6).strokeColor(INK).circle(cxm + w * 0.08, my, 6).stroke(); // operator ring
    doc.circle(cxm + w * 0.08, my, 3).stroke();
    doc.roundedRect(x + w * 0.46, c1 + (c2 - c1) * 0.28, 4, 16, 2).stroke(); // operating slot
    doc.lineWidth(0.5).roundedRect(x + w * 0.16, c2 - 16, w * 0.4, 10, 2).stroke(); // label window
  }

  // bottom: cable / LBS position box with 3-phase dividers + cable gland dots
  const by = (c2 + baseY) / 2;
  const bw = w * 0.34, bh = 20;
  doc.lineWidth(0.7).strokeColor(INK).rect(cxm - bw / 2, by - bh / 2, bw, bh).stroke();
  doc.lineWidth(0.4).moveTo(cxm, by - bh / 2).lineTo(cxm, by + bh / 2).stroke();
  doc.lineWidth(0.4).strokeColor(GREY).circle(cxm - bw / 2 - 7, by, 2).stroke();
  doc.circle(cxm + bw / 2 + 7, by, 2).stroke();

  // base / plinth with feet
  doc.lineWidth(0.6).strokeColor(INK).moveTo(x, baseY).lineTo(x + w, baseY).stroke();
  doc.rect(x + 7, baseY + 4, 12, 5).stroke();
  doc.rect(x + w - 19, baseY + 4, 12, 5).stroke();
}

// green analog panel meter (ammeter / voltmeter): 90° scale, zero at lower-left (red needle
// horizontal), sweeping over the top to max at upper-right; movement block + screw bottom-right.
function analogMeter(doc: PDFKit.PDFDocument, x: number, y: number, sz: number, label: string, value: string) {
  const GREEN = "#1f9d4d";
  doc.lineWidth(1.5).strokeColor(GREEN).rect(x, y, sz, sz).stroke();
  doc.lineWidth(0.5).strokeColor(INK).rect(x + 2.5, y + 2.5, sz - 5, sz - 5).stroke();
  doc.font(BOLD).fontSize(Math.max(8, sz * 0.22)).fillColor(INK).text(label, x + 5, y + 4);
  // pivot near the movement block (lower-right of centre); scale is a circular arc about it
  const cx = x + sz * 0.55, cy = y + sz * 0.62, R = sz * 0.42;
  const a0 = 182, a1 = 50; // degrees: 0 (lower-left) → max (upper-right)
  doc.lineWidth(0.4).strokeColor(INK);
  for (let k = 0; k <= 12; k++) {
    const rad = ((a0 - (a0 - a1) * (k / 12)) * Math.PI) / 180;
    const len = k % 3 === 0 ? 5 : 3;
    doc.moveTo(cx + Math.cos(rad) * R, cy - Math.sin(rad) * R)
      .lineTo(cx + Math.cos(rad) * (R - len), cy - Math.sin(rad) * (R - len)).stroke();
  }
  // max value just inside the upper-right end
  doc.font(BODY).fontSize(Math.max(5, sz * 0.12)).fillColor(INK)
    .text(value, x + sz * 0.5, y + sz * 0.27, { width: sz * 0.42, align: "right" });
  // movement block + adjustment screw (bottom-right)
  doc.lineWidth(0.6).strokeColor(INK).rect(cx - 3, cy - sz * 0.05, sz * 0.3, sz * 0.24).stroke();
  doc.lineWidth(0.5).circle(cx + sz * 0.15, cy + sz * 0.08, sz * 0.06).stroke();
  doc.moveTo(cx + sz * 0.11, cy + sz * 0.04).lineTo(cx + sz * 0.19, cy + sz * 0.12).stroke();
  // red needle resting at zero (lower-left, near-horizontal) + red "0"
  const r0 = (a0 * Math.PI) / 180;
  doc.lineWidth(1).strokeColor("#e00").moveTo(cx, cy).lineTo(cx + Math.cos(r0) * R * 0.92, cy - Math.sin(r0) * R * 0.92).stroke();
  doc.font(BODY).fontSize(Math.max(4.5, sz * 0.1)).fillColor("#e00").text("0", cx + Math.cos(r0) * R + 1, cy - Math.sin(r0) * R - 4);
}

// voltmeter selector switch (7-position) with rotary knob + position labels
function selectorSwitch(doc: PDFKit.PDFDocument, x: number, y: number, sz: number) {
  doc.lineWidth(0.8).strokeColor(INK).rect(x, y, sz, sz).stroke();
  doc.font(BODY).fontSize(Math.max(3.6, sz * 0.085)).fillColor(INK).text("VOLT-SWITCH-7", x + 1, y + 3, { width: sz - 2, align: "center" });
  const ccx = x + sz / 2, ccy = y + sz * 0.58, kr = sz * 0.15;
  doc.lineWidth(0.8).circle(ccx, ccy, kr).stroke();
  doc.moveTo(ccx, ccy).lineTo(ccx, ccy - kr).stroke(); // pointer
  doc.fontSize(Math.max(3.4, sz * 0.08)).fillColor(INK);
  doc.text("RS", x + 3, y + sz * 0.34); doc.text("RN", x + sz - 11, y + sz * 0.34);
  doc.text("ST", x + 3, y + sz * 0.55); doc.text("SN", x + sz - 11, y + sz * 0.55);
  doc.text("TR", x + 3, y + sz * 0.76); doc.text("TN", x + sz - 11, y + sz * 0.76);
}

// ================================================================ HEATERS' CONNECTION (control)
function heatersPage(doc: PDFKit.PDFDocument, m: SheetMeta) {
  const rmu = m.offer.rmu!;
  const cubicles = buildCubicleList(rmu);
  const n = cubicles.length;
  const RED = "#c0392b";
  const topY = CY + 92, botY = CY + 566; // L rail / N rail
  doc.font(BOLD).fontSize(12).fillColor(INK).text("220Vac-50HZ", CX, CY + 34, { width: CW, align: "center" });

  // supply terminal block (customer scope)
  const sx = CX + 48;
  const bxTop = topY + 36, bxBot = botY - 36;
  doc.lineWidth(1).strokeColor(SBLU).rect(sx, bxTop, 30, bxBot - bxTop).stroke();
  const x1y = bxTop + 44, x2y = bxBot - 44;
  doc.lineWidth(1).strokeColor(SBLK).circle(sx + 30, x1y, 3).stroke();
  doc.circle(sx + 30, x2y, 3).stroke();
  doc.font(BOLD).fontSize(8).fillColor(SBLU).text("-X1", sx + 6, x1y - 5);
  doc.text("-X2", sx + 6, x2y - 5);
  doc.font(BODY).fontSize(7.5).fillColor(INK).text("T.Bs-4mm²", sx - 4, bxBot + 6, { width: 70 });
  doc.save();
  doc.rotate(-90, { origin: [sx - 12, (topY + botY) / 2] });
  doc.font(BODY).fontSize(8).fillColor(INK).text("Supply - 220Vac  Customer's Scope", sx - 12 - 100, (topY + botY) / 2 - 5, { width: 200, align: "center" });
  doc.restore();

  // rails
  const railL = sx + 116, railR = CX + CW - 36;
  doc.lineWidth(1).strokeColor(SBLK).moveTo(railL, topY).lineTo(railR, topY).stroke(); // L
  doc.moveTo(railL, botY).lineTo(railR, botY).stroke(); // N
  doc.moveTo(sx + 30, x1y).lineTo(railL, x1y).lineTo(railL, topY).stroke();
  doc.moveTo(sx + 30, x2y).lineTo(railL, x2y).lineTo(railL, botY).stroke();

  const span = railR - railL;
  const mcbT = topY + 96, mcbB = topY + 120;
  const t1 = topY + 152;
  const hygT = (topY + botY) / 2 - 12, hygB = (topY + botY) / 2 + 12;
  const t2 = hygB + 40;
  const ehT = botY - 96, ehB = botY - 64;
  cubicles.forEach((c, i) => {
    const bx = railL + span * (i + 0.5) / n;
    // L / N markers
    doc.font(BOLD).fontSize(9).fillColor(RED).text("L", bx - 3, topY - 15);
    doc.text("N", bx - 3, botY + 5);
    const line = (y1: number, y2: number) => doc.lineWidth(1).strokeColor(SBLK).moveTo(bx, y1).lineTo(bx, y2).stroke();
    line(topY, mcbT);
    ctrlMCB(doc, bx, mcbT, mcbB, i);
    line(mcbB, t1);
    termMark(doc, bx, t1, 11 + i * 2);
    line(t1, hygT);
    ctrlHyg(doc, bx, hygT, hygB, i);
    line(hygB, t2);
    termMark(doc, bx, t2, 12 + i * 2);
    line(t2, ehT);
    ctrlHeater(doc, bx, ehT, ehB, i);
    line(ehB, botY);
  });
}

function termMark(doc: PDFKit.PDFDocument, x: number, y: number, num: number) {
  doc.lineWidth(0.8).strokeColor(SBLK).circle(x, y, 2.5).stroke();
  doc.font(BODY).fontSize(7).fillColor(INK).text(String(num), x + 5, y - 4);
}
function ctrlMCB(doc: PDFKit.PDFDocument, x: number, yTop: number, yBot: number, i: number) {
  doc.lineWidth(1.2).strokeColor(SBLK);
  doc.circle(x, yTop, 1.6).fillColor(SBLK).fill();
  doc.circle(x, yBot, 1.6).fillColor(SBLK).fill();
  doc.lineWidth(1.3).strokeColor(SBLK).moveTo(x, yBot).lineTo(x - 11, yTop + 3).stroke(); // open blade
  doc.lineWidth(0.8).moveTo(x - 11, yTop + 3).lineTo(x - 14, yTop - 2).stroke(); // operator hook
  doc.font(BOLD).fontSize(8).fillColor(SBLU).text(`-F${i + 1}`, x + 9, yTop - 6);
  doc.font(BODY).fontSize(7).fillColor(SBLU).text("1P,MCB\n10A/3KA\nBMS311C10", x + 9, yTop + 5, { lineGap: 0.5 });
}
function ctrlHyg(doc: PDFKit.PDFDocument, x: number, yTop: number, yBot: number, i: number) {
  doc.lineWidth(1.2).strokeColor(SBLK);
  doc.circle(x, yTop, 1.6).fillColor(SBLK).fill();
  doc.circle(x, yBot, 1.6).fillColor(SBLK).fill();
  doc.lineWidth(1.3).strokeColor(SBLK).moveTo(x, yBot).lineTo(x - 11, yTop + 3).stroke(); // NO contact
  doc.lineWidth(0.8).circle(x - 13, yBot - 5, 3.2).stroke(); // humidity sensor
  dashed(doc, () => doc.lineWidth(0.6).strokeColor(SBLK).moveTo(x - 11, yTop + 8).lineTo(x - 13, yBot - 8).stroke());
  doc.font(BOLD).fontSize(8).fillColor(SBLU).text(`-HYG${i + 1}`, x + 9, (yTop + yBot) / 2 - 4);
}
function ctrlHeater(doc: PDFKit.PDFDocument, x: number, yTop: number, yBot: number, i: number) {
  doc.lineWidth(1).strokeColor(SBLK).rect(x - 7, yTop, 14, yBot - yTop).stroke();
  const h = yBot - yTop;
  for (let k = 1; k <= 3; k++) doc.moveTo(x - 7, yTop + (h * k) / 4).lineTo(x + 7, yTop + (h * k) / 4).stroke();
  doc.font(BOLD).fontSize(8).fillColor(SBLU).text(`-EH${i + 1}`, x + 11, (yTop + yBot) / 2 - 4);
}

// dimension helpers
function dimH(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number, text: string) {
  doc.lineWidth(0.4).strokeColor(GREY);
  doc.moveTo(x1, y - 4).lineTo(x1, y + 4).stroke();
  doc.moveTo(x2, y - 4).lineTo(x2, y + 4).stroke();
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
  doc.moveTo(x1, y).lineTo(x1 + 4, y - 2).moveTo(x1, y).lineTo(x1 + 4, y + 2).stroke();
  doc.moveTo(x2, y).lineTo(x2 - 4, y - 2).moveTo(x2, y).lineTo(x2 - 4, y + 2).stroke();
  const tw = Math.max(x2 - x1, 42); // narrow segments (end plates) overflow instead of wrapping
  doc.font(BODY).fontSize(7).fillColor(INK).text(text, (x1 + x2) / 2 - tw / 2, y + 3, { width: tw, align: "center" });
}
function dimV(doc: PDFKit.PDFDocument, x: number, y1: number, y2: number, text: string) {
  doc.lineWidth(0.4).strokeColor(GREY);
  doc.moveTo(x - 4, y1).lineTo(x + 4, y1).stroke();
  doc.moveTo(x - 4, y2).lineTo(x + 4, y2).stroke();
  doc.moveTo(x, y1).lineTo(x, y2).stroke();
  doc.moveTo(x, y1).lineTo(x - 2, y1 + 4).moveTo(x, y1).lineTo(x + 2, y1 + 4).stroke();
  doc.moveTo(x, y2).lineTo(x - 2, y2 - 4).moveTo(x, y2).lineTo(x + 2, y2 - 4).stroke();
  const cy = (y1 + y2) / 2;
  doc.save();
  doc.rotate(-90, { origin: [x, cy] });
  doc.font(BODY).fontSize(8).fillColor(INK).text(text, x - 40, cy - 12, { width: 80, align: "center" });
  doc.restore();
}

// ================================================================ E.F.I CONNECTION
// terminal-with-red-tick / earth-fault flag icon helpers
function redTick(doc: PDFKit.PDFDocument, x: number, y: number, label: string) {
  doc.lineWidth(0.8).strokeColor(SBLK).circle(x, y, 2.5).stroke();
  doc.lineWidth(1).strokeColor("#c0392b").moveTo(x - 4, y + 5).lineTo(x + 4, y - 5).stroke();
  doc.font(BODY).fontSize(8).fillColor(INK).text(label, x + 6, y - 5);
}
// earth-fault flag indicator (diamond with vertical bars) for the EFI box
function flagDiamond(doc: PDFKit.PDFDocument, cx: number, cy: number) {
  doc.lineWidth(1).strokeColor("#222222");
  doc.moveTo(cx, cy - 10).lineTo(cx + 10, cy).lineTo(cx, cy + 10).lineTo(cx - 10, cy).closePath().stroke();
  for (let i = -1; i <= 1; i++) doc.lineWidth(1.3).moveTo(cx + i * 3.5, cy - 5).lineTo(cx + i * 3.5, cy + 5).stroke();
}
// legend flag (circle with vertical bars), black=normal / red=fault
function flagCircle(doc: PDFKit.PDFDocument, cx: number, cy: number, red: boolean) {
  const col = red ? "#c0392b" : "#222222";
  doc.lineWidth(1).strokeColor(col).circle(cx, cy, 8).stroke();
  doc.lineWidth(2).strokeColor(col);
  [-3, 0, 3].forEach((dx) => doc.moveTo(cx + dx, cy - 6).lineTo(cx + dx, cy + 6).stroke());
}
// single 1-pole MCB contact (used by the 2-pole F-MCB) between yTop and yTop+32
function mcbContact(doc: PDFKit.PDFDocument, x: number, yTop: number, t1: string, t2: string) {
  const yBot = yTop + 32;
  doc.lineWidth(1).strokeColor(SBLK).moveTo(x, yTop).lineTo(x, yTop + 7).stroke();
  doc.moveTo(x, yBot).lineTo(x, yBot - 7).stroke();
  doc.circle(x, yTop + 7, 1.4).fillColor(SBLK).fill();
  doc.circle(x, yBot - 7, 1.4).fillColor(SBLK).fill();
  // open blade (up-left) + MCB trip arrow + hook
  doc.lineWidth(1.4).strokeColor(SBLU).moveTo(x, yBot - 7).lineTo(x - 12, yTop + 11).stroke();
  doc.moveTo(x - 4, yBot - 11).lineTo(x - 11, yBot - 14).lineTo(x - 8, yBot - 5).closePath().fillColor(SBLU).fill();
  doc.lineWidth(0.8).strokeColor(SBLU).moveTo(x - 12, yTop + 11).lineTo(x - 16, yTop + 7).lineTo(x - 12, yTop + 3).stroke();
  doc.font(BODY).fontSize(8).fillColor(INK).text(t1, x + 5, yTop + 2);
  doc.font(BODY).fontSize(8).fillColor(INK).text(t2, x + 5, yBot - 12);
}

function efiPage(doc: PDFKit.PDFDocument, m: SheetMeta, idx: number) {
  const CYAN = "#33aaee";
  // ---- titles ----
  doc.font(BOLD).fontSize(13).fillColor(INK).text("Power Circuit", 300, 82, { width: 280, align: "center" });
  doc.font(BOLD).fontSize(13).fillColor(INK).text('"Ring Feeder"', 300, 100, { width: 280, align: "center" });

  // ---- power circuit: 3 phases through LBS + toroid ----
  const ph = [392, 438, 485], topY = 150, botY = 660;
  ph.forEach((x, k) => {
    doc.lineWidth(1.3).strokeColor(SBLK).moveTo(x, topY).lineTo(x, botY).stroke();
    doc.moveTo(x, topY).lineTo(x - 4.5, topY + 10).lineTo(x + 4.5, topY + 10).closePath().fillColor(SBLK).fill();
    doc.moveTo(x, botY).lineTo(x - 4.5, botY - 10).lineTo(x + 4.5, botY - 10).closePath().fillColor(SBLK).fill();
    doc.font(BOLD).fontSize(11).fillColor(INK).text(`L${k + 1}`, x - 8, topY - 18);
    doc.font(BOLD).fontSize(11).fillColor(INK).text(`L${k + 1}`, x - 8, botY + 6);
    // LBS contact: hollow top contact + open blade + cyan open-position bar
    doc.lineWidth(1.2).strokeColor(SBLK).circle(x, 305, 3).stroke();
    doc.moveTo(x, 326).lineTo(x - 10, 309).stroke();
    doc.circle(x, 326, 1.6).fillColor(SBLK).fill();
    doc.lineWidth(1).strokeColor(CYAN).moveTo(x - 9, 333).lineTo(x + 9, 333).stroke();
  });
  doc.font(BODY).fontSize(8).fillColor(INK).text("Medium Voltage\nLoad Break Switch-LBS\n@MV Compartment", 262, 222, { width: 132 });
  doc.lineWidth(1.5).strokeColor(SBLK).ellipse(438, 540, 80, 37).stroke();
  doc.font(BODY).fontSize(10).fillColor(INK).text("TOROID", 272, 545);
  doc.font(BODY).fontSize(10).fillColor(INK).text("Incoming Cables\nto feed LBS From Utility", 338, 700, { width: 200, align: "center" });

  // ---- VT feed → F-MCB → EFI ----
  const c04 = 588, c05 = 643, ex = 710, ey = 453, ew = 170, eh = 140;
  doc.font(BODY).fontSize(10).fillColor(INK).text("Feed from voltage transformers", 500, 262, { width: 230, align: "center" });
  doc.font(BODY).fontSize(7).fillColor("#3a7d44").text("9.4:C", c04 - 14, 286); doc.text("9.5:C", c05 - 14, 286);
  doc.font(BOLD).fontSize(11).fillColor(SBLU).text("04", c04 - 9, 296); doc.text("05", c05 - 9, 296);
  [c04, c05].forEach((x) => {
    doc.lineWidth(1.2).strokeColor(SBLK).moveTo(x, 313).lineTo(x, 365).stroke();
    doc.moveTo(x, 325).lineTo(x - 4, 317).lineTo(x + 4, 317).closePath().fillColor(SBLK).fill();
  });
  mcbContact(doc, c04, 365, "1", "2");
  mcbContact(doc, c05, 365, "3", "4");
  dashed(doc, () => doc.lineWidth(0.8).strokeColor(SBLU).moveTo(c04 - 12, 381).lineTo(c05 - 12, 381).stroke());
  doc.font(BOLD).fontSize(9).fillColor(SBLU).text(`-F${6 + idx}`, 512, 372);
  doc.font(BODY).fontSize(7).fillColor(SBLU).text("2P,MCB\n10A/3KA\nBMS312C10", 500, 384, { width: 62, align: "right" });
  // wiring: contact 2 → term 2 (lower) ; contact 4 → term 1 (upper)
  doc.lineWidth(1).strokeColor(SBLK).moveTo(c04, 397).lineTo(c04, 503).lineTo(ex, 503).stroke();
  doc.moveTo(c05, 397).lineTo(c05, 460).lineTo(ex, 460).stroke();
  redTick(doc, c04, 450, String(20 + idx * 2));
  redTick(doc, c05, 438, String(21 + idx * 2));

  // ---- EFI box (dashed blue) ----
  dashed(doc, () => doc.lineWidth(1).strokeColor(SBLU).rect(ex, ey, ew, eh).stroke());
  doc.font(BOLD).fontSize(12).fillColor(SBLU).text(idx === 0 ? "EFI" : `EFI.${idx + 1}`, ex + 30, ey + 8, { width: ew - 40, align: "center" });
  doc.font(BODY).fontSize(7).fillColor(SBLU).text("Earth fault indicator\nType:- BRO. # 110 Vac", ex + 20, ey + 26, { width: ew - 30, align: "center" });
  doc.font(BODY).fontSize(8).fillColor(SBLU).text(`-EFI${idx + 1}`, ex - 32, ey + 2);
  doc.font(BODY).fontSize(6.5).fillColor(INK).text("SUPPLY/110VAC", ex - 64, 512);
  const lt: [string, number][] = [["1", 460], ["2", 503], ["3", 533], ["4", 570]];
  lt.forEach(([t, y]) => {
    doc.lineWidth(0.8).strokeColor(SBLU).circle(ex, y, 2.5).stroke();
    doc.font(BODY).fontSize(7).fillColor(SBLU).text(t, ex + 5, y - 4);
  });
  const rt: [string, number][] = [["8", 467], ["7", 493], ["6", 543], ["5", 570]];
  rt.forEach(([t, y]) => {
    doc.lineWidth(0.8).strokeColor(SBLU).circle(ex + ew, y, 2.5).stroke();
    doc.font(BODY).fontSize(7).fillColor(SBLU).text(t, ex + ew + 5, y - 4);
  });
  // output relay contacts (8-7) and (6-5)
  [[467, 493], [543, 570]].forEach(([ya, yb]) => {
    doc.lineWidth(1).strokeColor(SBLK).moveTo(ex + ew, ya).lineTo(ex + ew - 8, ya).stroke();
    doc.moveTo(ex + ew - 8, ya).lineTo(ex + ew - 24, yb - 4).stroke(); // blade
    doc.moveTo(ex + ew, yb).lineTo(ex + ew - 24, yb).stroke();
  });
  // flag indicator + test
  flagDiamond(doc, ex + 78, 540);
  doc.font(BODY).fontSize(6.5).fillColor(INK).text("Flag Indicator", ex + 48, 556, { width: 64, align: "center" });
  doc.lineWidth(0.8).strokeColor(SBLK).circle(ex + 108, 575, 5).stroke();
  doc.font(BODY).fontSize(6).fillColor(INK).text("Test", ex + 95, 583);
  // toroid S2/S1 → EFI terminals 3,4 (two parallel horizontal leads at the terminal levels)
  doc.lineWidth(0.9).strokeColor(SBLK).moveTo(517, 533).lineTo(ex, 533).stroke(); // S2 → term 3
  doc.moveTo(485, 570).lineTo(ex, 570).stroke();                                   // S1 → term 4
  doc.font(BODY).fontSize(8).fillColor(INK).text("S2", 521, 524); doc.text("S1", 489, 561);

  // ---- flag legend ----
  const lgX = 620, lgY = 668, lgW = 300;
  doc.lineWidth(0.8).strokeColor(INK).rect(lgX, lgY, lgW, 66).stroke();
  doc.font(BODY).fontSize(8).fillColor(INK).text("Flag Indicator cases for Earth Fault Indicator", lgX + 6, lgY + 5, { width: lgW - 12, align: "center" });
  doc.moveTo(lgX, lgY + 20).lineTo(lgX + lgW, lgY + 20).stroke();
  doc.moveTo(lgX, lgY + 43).lineTo(lgX + lgW, lgY + 43).stroke();
  doc.moveTo(lgX + 70, lgY + 20).lineTo(lgX + 70, lgY + 66).stroke();
  flagCircle(doc, lgX + 35, lgY + 31, false);
  doc.font(BODY).fontSize(8).fillColor(INK).text("Black - Normal Operation", lgX + 80, lgY + 27);
  flagCircle(doc, lgX + 35, lgY + 54, true);
  doc.font(BODY).fontSize(8).fillColor(INK).text("Red - Fault Occurrence", lgX + 80, lgY + 50);
}

// ================================================================ METERING CIRCUITS
function meteringCircuitsPage(doc: PDFKit.PDFDocument, _m: SheetMeta) {
  // The metering circuit is identical for every configuration (a 3-phase VT/CT bank
  // — no kV-specific text), so the reference schematic is embedded verbatim inside
  // our plot frame + title block (drawn by frame()).
  safeImage(doc, asset("metering-ref.png"), 28, 28, { width: 1134, height: 712 });
}

// ---------------------------------------------------------------- helpers

function sectionTitle(doc: PDFKit.PDFDocument, t: string, x: number, y: number, w: number) {
  doc.font(BOLD).fontSize(12).fillColor(ORANGE).text(t, x, y, { width: w, align: "center" });
}
function table(doc: PDFKit.PDFDocument, x: number, y: number, w: number, rows: [string, string][]) {
  const labelW = w * 0.62;
  rows.forEach((r, i) => {
    const ry = y + i * 22;
    if (i % 2 === 0) doc.rect(x, ry, w, 22).fill(i % 2 === 0 ? "#fbf7f4" : "#ffffff").fillColor(INK);
    doc.lineWidth(0.4).strokeColor(LINE).rect(x, ry, labelW, 22).stroke();
    doc.lineWidth(0.4).strokeColor(LINE).rect(x + labelW, ry, w - labelW, 22).stroke();
    doc.font(BODY).fontSize(8).fillColor(INK).text(r[0], x + 5, ry + 6, { width: labelW - 10 });
    doc.font(BOLD).fontSize(8).fillColor(INK).text(r[1], x + labelW + 6, ry + 6, { width: w - labelW - 10 });
  });
}
