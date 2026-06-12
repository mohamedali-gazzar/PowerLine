/**
 * LV data importer — converts the LV master workbooks into the JSON files
 * bundled by the frontend. Re-run whenever a new QTN / Combinations version
 * arrives:
 *
 *   node scripts/lv-import.cjs "<path to QTN-26-xxxx.xlsx>" "<path to Combinations Database.xlsx>"
 *
 * Outputs (frontend/src/lv/data/):
 *   components.json  — full Components Data Base (type/family/rating/desc/ref/€/EGP/poles/Cu/brand/stock)
 *   enclosures.json  — Panels Data enclosure catalog (family/name/ref/€/ip/dims/mount/ral)
 *   factors.json     — pricing factors defaults (factor, EUR, USD, copper, sheet metal, ops, ABB disc, VAT, forms)
 *   combos.json      — ATS (1oo2/2oo3 per frame), Photocell, MCC, WD templates
 *
 * Requires `unzip` on PATH (Git Bash provides it). No npm deps.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const QTN = process.argv[2];
const COMBOS = process.argv[3];
if (!QTN || !COMBOS) {
  console.error('usage: node lv-import.cjs "<QTN.xlsx>" "<Combinations Database.xlsx>"');
  process.exit(1);
}
const OUT = path.join(__dirname, "..", "src", "lv", "data");
fs.mkdirSync(OUT, { recursive: true });

// ---------- minimal xlsx reader ----------
function unz(file, entry) {
  try {
    return execSync(`unzip -p "${file}" "${entry}"`, { maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
  } catch {
    return "";
  }
}
function decode(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&")
    .replace(/ /g, " "); // the workbook mixes NBSP and space — normalize
}
function sheetNames(file) {
  const wb = unz(file, "xl/workbook.xml");
  const rels = unz(file, "xl/_rels/workbook.xml.rels");
  const rid = {};
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) rid[m[1]] = m[2];
  const out = [];
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
    let t = rid[m[2]] || "";
    t = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
    out.push({ name: decode(m[1]), target: t });
  }
  return out;
}
function sharedStrings(file) {
  const xml = unz(file, "xl/sharedStrings.xml");
  const sst = [];
  if (!xml) return sst;
  for (const si of xml.split(/<si[ >]/).slice(1)) {
    let txt = "";
    const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(si))) txt += decode(m[1]);
    sst.push(txt);
  }
  return sst;
}
function colToIdx(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
/** Returns rows as sparse arrays indexed [rowNum][colIdx] (1-based rows). */
function readSheet(file, name) {
  const sheet = sheetNames(file).find((s) => s.name === name);
  if (!sheet) throw new Error(`sheet not found: ${name} in ${file}`);
  const sst = sharedStrings(file);
  const xml = unz(file, sheet.target);
  const rows = {};
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const attrs = cm[1];
      const inner = cm[2] || "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs);
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      let val = "";
      if (type === "s" && v) val = sst[+v[1]] ?? "";
      else if (type === "inlineStr") {
        const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let m2, txt = "";
        while ((m2 = re.exec(inner))) txt += decode(m2[1]);
        val = txt;
      } else if (v) val = decode(v[1]);
      cells[colToIdx(ref[1])] = typeof val === "string" ? val.trim() : val;
    }
    rows[+rm[1]] = cells;
  }
  return rows;
}
const num = (v) => {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
};
const str = (v) => (v == null ? "" : String(v).trim());

// ============ 1) COMPONENTS ============
// Sheet "Components Data Base": Type Family Rating DESCRIPTION PL-Description REFERENCE
//   €List Disc After€ EuroPrice USD EGP ABBMarket Final Poles(MCB) Poles CuPanels CuCells Brand Frame Stock
{
  const rows = readSheet(QTN, "Components Data Base");
  const out = [];
  for (const rn of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
    if (rn === 1) continue; // header
    const c = rows[rn];
    if (!c) continue;
    const type = str(c[0]);
    const name = str(c[4]) || str(c[3]);
    const ref = str(c[5]);
    if (!name && !ref) continue;
    if (!type && !ref) continue;
    let brand = str(c[18]).replace(/\.$/, "");
    if (!brand) brand = "ABB";
    let eur = num(c[6]); // ABB price list (EUR)
    let egp = num(c[13]); // Final Price (EGP at workbook rates — fallback)
    // "Control" rows are hand-priced EGP lumps typed into the euro column
    // (Photocell 200, Timer 400, Control Circuit 1oo2 13 000, …).
    if (type === "Control" && eur > 0 && egp === 0) {
      egp = eur;
      eur = 0;
    }
    // poles column carries stray codes on non-breaker rows — only 1..4 are real
    const polesRaw = num(c[15]) || num(c[14]) || 0;
    const poles = Number.isInteger(polesRaw) && polesRaw >= 1 && polesRaw <= 4 ? polesRaw : 0;
    out.push({
      t: type,
      f: str(c[1]),
      r: str(c[2]),
      d: str(c[3]),          // short description
      n: name,               // PL description (display name)
      ref,
      eur,
      egp,
      poles,
      cuP: num(c[16]),       // copper kg/pole — panels
      cuC: num(c[17]),       // copper kg/pole — cells
      brand,
      stock: str(c[20]),
    });
  }
  fs.writeFileSync(path.join(OUT, "components.json"), JSON.stringify(out));
  console.log(`components.json: ${out.length} items`);
}

// ============ 2) ENCLOSURES ============
// Sheet "Panels Data" rows ~21+: [Reference, Name, ABB Desc, €,EGP,USD, IP, H, W, D, Mounting, RAL, ..., Family @ col21]
const FAMILIES = ["Minicenter", "Primo", "Unikit", "SR-Basic", "Local", "Local (Sheet Metal)", "Pillars", "Coffree", "Pro-E", "IS2", "PLP"];
{
  const rows = readSheet(QTN, "Panels Data");
  const out = [];
  for (const rn of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
    if (rn < 21) continue;
    const c = rows[rn];
    if (!c) continue;
    const ref = str(c[0]);
    const name = str(c[1]);
    if (!ref || !name) continue;
    let fam = "";
    for (let i = 12; i < c.length; i++) {
      if (FAMILIES.includes(str(c[i]))) { fam = str(c[i]); break; }
    }
    if (!fam) continue;
    out.push({
      fam: fam === "Local" ? "Local (Sheet Metal)" : fam,
      name,
      ref,
      abb: str(c[2]),
      eur: num(c[3]),
      egp: num(c[4]),
      ip: str(c[6]),
      H: num(c[7]),
      W: num(c[8]),
      D: num(c[9]),
      mount: str(c[10]),
      ral: str(c[11]),
    });
  }
  // Cell-system + pillar/coffree catalogs live outside "Panels Data" — merge the
  // seed file (extracted once from the validated configurator sample).
  const extraPath = path.join(OUT, "enclosures-extra.json");
  if (fs.existsSync(extraPath)) {
    const extra = JSON.parse(fs.readFileSync(extraPath, "utf8"));
    const have = new Set(out.map((e) => e.fam + "|" + e.name + "|" + e.ref));
    for (const e of extra) if (!have.has(e.fam + "|" + e.name + "|" + e.ref)) out.push(e);
  }
  fs.writeFileSync(path.join(OUT, "enclosures.json"), JSON.stringify(out));
  const fams = {};
  out.forEach((e) => (fams[e.fam] = (fams[e.fam] || 0) + 1));
  console.log(`enclosures.json: ${out.length}`, fams);
}

// ============ 3) FACTORS ============
{
  const rows = readSheet(QTN, "Factors");
  const v = rows[2] || [];
  const factors = {
    factor: num(v[0]) || 0.7,        // selling factor (cost / factor = sell)
    euro: num(v[1]) || 61.48,        // EGP per EUR
    usd: num(v[2]) || 53,            // EGP per USD
    copper: num(v[3]) || 770,        // EGP per kg copper
    sheetMetal: num(v[4]) || 115,    // EGP per kg sheet metal
    operations: num(v[5]) || 0.05,   // operations overhead
    abbDiscount: num(v[6]) || 0,     // ABB-only discount (RPT-01)
    vat: 0.14,
    forms: { "1": 0, "2a": 0.05, "2b": 0.05, "3a": 0.1, "3b": 0.1, "4a": 0.15, "4b": 0.15 },
  };
  fs.writeFileSync(path.join(OUT, "factors.json"), JSON.stringify(factors, null, 1));
  console.log("factors.json:", factors);
}

// ============ 4) COMBINATIONS (ATS / Photocell / MCC / WD) ============
/** Parse an ATS matrix sheet: header row has ATSXT1..ATSE6.2 columns; rows below
 *  alternate group-title rows (Source (1)/.../Control Circuit & Acc.) and item rows
 *  with qty in the QTY col. */
function parseAts(sheet) {
  const rows = readSheet(COMBOS, sheet);
  const rns = Object.keys(rows).map(Number).sort((a, b) => a - b);
  // find header row: contains ATSXT1
  let hdrRow = null;
  for (const rn of rns) {
    if ((rows[rn] || []).some((v) => str(v) === "ATSXT1")) { hdrRow = rn; break; }
  }
  if (!hdrRow) throw new Error("ATS header not found in " + sheet);
  const hdr = rows[hdrRow];
  const qtyCol = hdr.findIndex((v) => str(v) === "QTY");
  const frameCols = {};
  hdr.forEach((v, i) => {
    const m = /^ATS(.+)$/.exec(str(v));
    if (m) frameCols[m[1]] = i;
  });
  const GROUPS = ["Source (1)", "Source (2)", "Source (3)", "Bus Coupler", "Mecanical Interlock", "Mechanical Interlock", "Control Circuit & Acc."];
  const result = {}; // frame -> [{group, items:[{qty,desc}]}]
  for (const [frame, col] of Object.entries(frameCols)) {
    const groups = [];
    let cur = null;
    for (const rn of rns) {
      if (rn <= hdrRow) continue;
      const row = rows[rn] || [];
      // group marker? check across ALL columns (titles live in each frame col or nearby)
      const cellsInRow = [str(row[col]), str(row[col - 1]), str(row[col + 1])];
      const titleHere = GROUPS.find((g) => cellsInRow.includes(g));
      const titleAny = GROUPS.find((g) => row.some((v) => str(v) === g));
      if (titleAny) {
        cur = { group: titleAny.replace("Mecanical", "Mechanical"), items: [] };
        groups.push(cur);
        continue;
      }
      const desc = str(row[col]);
      const qty = num(row[qtyCol]);
      if (cur && desc && qty > 0) cur.items.push({ qty, desc });
    }
    result[frame] = groups.filter((g) => g.items.length);
  }
  return result;
}

/** Photocell sheet: rating rows (col E=rating, F=contactor short, G=PL desc, H=aux),
 *  then fixed-items block. */
function parsePhotocell() {
  const rows = readSheet(COMBOS, "Photocell");
  const rns = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const ratings = [];
  const fixed = [];
  for (const rn of rns) {
    const c = rows[rn] || [];
    const rating = num(c[4]);
    // rating rows carry "Contactor# ..." in the DESCRIPTION column
    if (rating >= 6 && /^Contactor#/.test(str(c[5])) && str(c[6])) {
      ratings.push({ a: rating, contactor: str(c[6]), aux: str(c[7]) });
    }
    // fixed block: qty in col E, desc col F, marker col G == "fixed"
    if (str(c[6]).toLowerCase() === "fixed" && str(c[5])) {
      fixed.push({ qty: num(c[4]) || 1, desc: str(c[5]) });
    }
  }
  return { ratings, fixed };
}

/** MCC sheet: rows with key col F like "DOL-3Ph-0.06 kW-Type 1", parts in cols G.. */
function parseMcc() {
  const rows = readSheet(COMBOS, "MCC");
  const rns = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const combos = [];
  const control = [];
  let inControl = false;
  for (const rn of rns) {
    const c = rows[rn] || [];
    const key = str(c[5]).replace(/\s+/g, " ");
    const m = /^(DOL-3Ph|DOL-1Ph|Star Delta)-(.+ kW)-Type (\d)$/.exec(key);
    if (m) {
      const parts = [];
      for (let i = 6; i < c.length; i++) if (str(c[i])) parts.push(str(c[i]));
      combos.push({ kind: m[1], kw: m[2], type: +m[3], parts });
    }
    if (str(c[0]) === "CONTROL ACC.") inControl = true;
    if (inControl && str(c[1]) === "DOL") {
      const qty = num(c[2]);
      const desc = str(c[3]);
      if (qty && desc) control.push({ qty, desc });
      else inControl = false; // block ended
    }
  }
  return { combos, control };
}

/** WD sheet: blocks MCCB-3P / MCCB-4P / Air-3P; frames in row under block title; FP/MP rows. */
function parseWd() {
  const rows = readSheet(COMBOS, "WD");
  const rns = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const out = []; // {key, poles, fp, mp}
  let block = null; // "3P" | "4P" | "Air"
  let frames = null; // colIdx -> frame key
  for (const rn of rns) {
    const c = rows[rn] || [];
    const c1 = str(c[1]);
    if (c1 === "MCCB-3P") { block = "3P"; frames = null; continue; }
    if (c1 === "MCCB-4P") { block = "4P"; frames = null; continue; }
    if (c1 === "Air-3P") { block = "Air"; frames = null; continue; }
    // frame header row: cells like XT4-3P-WD / E1.2-3P-WD
    if (block && !frames && c.some((v) => /-WD$/.test(str(v)))) {
      frames = {};
      c.forEach((v, i) => {
        const m = /^(.+)-(3|4)P-WD$/.exec(str(v));
        if (m) frames[i] = m[1];
      });
      // XT2 column: the WD sheet's first data col often has no header (XT2 implied)
      continue;
    }
    if (block && frames && (c1 === "FP" || c1 === "MP")) {
      c.forEach((v, i) => {
        const desc = str(v);
        if (!desc || i === 1) return;
        // column i belongs to nearest frame header at i or the implicit XT2 col (i=2)
        const frame = frames[i] || (i === 2 ? "XT2" : null);
        if (!frame) return;
        let rec = out.find((r) => r.frame === frame && r.poles === block);
        if (!rec) { rec = { frame, poles: block, fp: "", mp: "" }; out.push(rec); }
        if (c1 === "FP") rec.fp = desc;
        else rec.mp = desc;
      });
    }
    // Air block fixed-part single line
    if (block === "Air" && /Fixed Part/i.test(c1 + str(c[2]))) {
      const desc = str(c[2]) || c1;
      let rec = out.find((r) => r.frame === "E1.2" && r.poles === "3P-Air");
      if (!rec) out.push({ frame: "E1.2", poles: "3P-Air", fp: desc, mp: "" });
    }
  }
  return out;
}

{
  const combos = {
    ats: {
      "1oo2": parseAts("ATS 1 out of 2"),
      "2oo3": parseAts("ATS 2 out of 3"),
    },
    photocell: parsePhotocell(),
    mcc: parseMcc(),
    wd: parseWd(),
  };
  fs.writeFileSync(path.join(OUT, "combos.json"), JSON.stringify(combos));
  console.log(
    `combos.json: ats1oo2 frames=${Object.keys(combos.ats["1oo2"]).length}, ats2oo3 frames=${Object.keys(combos.ats["2oo3"]).length}, photocell ratings=${combos.photocell.ratings.length} fixed=${combos.photocell.fixed.length}, mcc=${combos.mcc.combos.length} ctrl=${combos.mcc.control.length}, wd=${combos.wd.length}`
  );
}
console.log("done.");
