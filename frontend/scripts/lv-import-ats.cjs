/**
 * Re-import the ATS combinations (1oo2 / 2oo3) and the WD kits from
 * "Combinations Database - ATS.xlsx" into src/lv/data/combos.json, leaving the
 * photocell and mcc sections untouched.
 *
 *   node scripts/lv-import-ats.cjs "<path to Combinations Database - ATS.xlsx>"
 *
 * Sheet layout: header row has QTY + ATS<frame> columns in several blocks
 * (XT1..XT6 | XT7 | E-frames), each block with its own QTY column to the left of
 * its frames. Group rows (Source (1)/(2)/(3), Bus Coupler, [Mecanical] Interlock,
 * Control Circuit & Acc.) separate the item rows within each frame column.
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] ||
  "C:\\Users\\rana\\OneDrive - Faculty of Engineering Ain Shams University\\Desktop\\New Tool\\Phase-01\\Rev 00\\Combinations Database - ATS.xlsx";
const OUT = path.join(__dirname, "..", "src", "lv", "data", "combos.json");

const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : NaN; };
const GROUPS = ["Source (1)", "Source (2)", "Source (3)", "Bus Coupler", "Mecanical Interlock", "Mechanical Interlock", "Control Circuit & Acc."];
const normGroup = (g) => g.replace("Mecanical", "Mechanical");

function parseAtsSheet(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  let hr = -1;
  for (let i = 0; i < aoa.length; i++) if (aoa[i].some((v) => str(v) === "ATSXT1")) { hr = i; break; }
  if (hr < 0) throw new Error("ATS header (ATSXT1) not found");
  const hdr = aoa[hr].map(str);
  const qtyCols = [];
  const frameCols = {};
  hdr.forEach((v, i) => {
    if (v === "QTY") qtyCols.push(i);
    const m = /^ATS(.+)$/.exec(v);
    if (m) frameCols[m[1]] = i;
  });
  // Each frame uses the nearest QTY column to its left (its block's QTY).
  const qtyColFor = (col) => { let best = -1; for (const q of qtyCols) if (q < col && q > best) best = q; return best; };
  const result = {};
  for (const [frame, col] of Object.entries(frameCols)) {
    const qCol = qtyColFor(col);
    const groups = [];
    let cur = null;
    for (let r = hr + 1; r < aoa.length; r++) {
      const cell = str((aoa[r] || [])[col]);
      if (!cell) continue;
      if (GROUPS.includes(cell)) { cur = { group: normGroup(cell), items: [] }; groups.push(cur); continue; }
      const qty = num((aoa[r] || [])[qCol]);
      if (cur && qty > 0) cur.items.push({ qty, desc: cell });
    }
    result[frame] = groups.filter((g) => g.items.length);
  }
  return result;
}

function parseWd(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  const out = [];
  let block = null; // "3P" | "4P" | "Air"
  let frames = null; // colIdx -> frame key
  for (const row of aoa) {
    const c0 = str(row[0]);
    if (c0 === "MCCB-3P") { block = "3P"; frames = null; continue; }
    if (c0 === "MCCB-4P") { block = "4P"; frames = null; continue; }
    if (c0 === "Air-3P") { block = "Air"; frames = null; continue; }
    if (block && !frames && row.some((v) => /-WD$/.test(str(v)))) {
      frames = {};
      row.forEach((v, i) => { const m = /^(.+)-(3|4)P-WD$/.exec(str(v)); if (m) frames[i] = m[1]; });
      continue;
    }
    if (block && frames && (c0 === "FP" || c0 === "MP")) {
      row.forEach((v, i) => {
        const desc = str(v);
        if (!desc || i === 0) return;
        const frame = frames[i];
        if (!frame) return;
        let rec = out.find((x) => x.frame === frame && x.poles === block);
        if (!rec) { rec = { frame, poles: block, fp: "", mp: "" }; out.push(rec); }
        if (c0 === "FP") rec.fp = desc; else rec.mp = desc;
      });
    }
    if (block === "Air" && /Fixed Part/i.test(c0 + str(row[1]))) {
      const desc = str(row[1]) || c0;
      if (!out.find((x) => x.frame === "E1.2" && x.poles === "3P-Air"))
        out.push({ frame: "E1.2", poles: "3P-Air", fp: desc, mp: "" });
    }
  }
  return out;
}

const wb = XLSX.readFile(FILE);
const ats = { "1oo2": parseAtsSheet(wb.Sheets["ATS 1 out of 2"]), "2oo3": parseAtsSheet(wb.Sheets["ATS 2 out of 3"]) };
const wd = parseWd(wb.Sheets["WD"]);

const combos = JSON.parse(fs.readFileSync(OUT, "utf8"));
combos.ats = ats;
combos.wd = wd;
fs.writeFileSync(OUT, JSON.stringify(combos));

console.log("ATS 1oo2 frames:", Object.keys(ats["1oo2"]).join(", "));
console.log("ATS 2oo3 frames:", Object.keys(ats["2oo3"]).join(", "));
for (const t of ["1oo2", "2oo3"]) {
  const fr = Object.keys(ats[t])[0];
  console.log(` ${t} [${fr}]:`, ats[t][fr].map((g) => `${g.group}(${g.items.length})`).join(", "));
}
console.log("WD entries:", wd.length, "→", wd.map((w) => `${w.frame}-${w.poles}`).join(", "));
