/**
 * LV data importer (flat single-sheet edition) — regenerates components.json and
 * enclosures.json from the unified price database:
 *
 *   node scripts/lv-import-flat.cjs "<path to Database DD.M.YYYY.xlsx>"
 *
 * The source is one sheet with columns:
 *   Type | Description | Item Code | ABB Price list in EURO | Market Price in EGP |
 *   IP | Mounting | RAL | Cross Section | Weight/Panel/Pole | Weight/Cell/Pole
 *
 * Notes on this database (Phase-01 30.6.2026):
 *   - Every row carries EITHER an EUR (ABB list) price OR a Market EGP price.
 *   - Copper connection weight per pole now populated: Weight/Panel/Pole → cuP
 *     (panels), Weight/Cell/Pole → cuC (cells). Drives the "Cu Connections" copper.
 *   - Enclosure rows carry no H/W/D dimensions in this file (H=W=D=0).
 *
 * factors.json and combos.json are NOT touched — this file contains neither the
 * pricing factors nor the ATS/MCC/WD combination templates.
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] ||
  "C:\\Users\\rana\\OneDrive - Faculty of Engineering Ain Shams University\\Desktop\\New Tool\\Phase-01\\Database 30.6.2026.xlsx";
const OUT = path.join(__dirname, "..", "src", "lv", "data");

// Families that are enclosures / cell systems (everything else is a component).
// "Local" is stored as "Local (Sheet Metal)" to match PANEL_SYSTEMS in catalog.ts.
// "Space" rows are spare/reservation lines (no price/ref) — treated as components, not enclosures.
const ENCLOSURE_TYPES = new Set(["SR-Basic", "Pro-E", "Local", "Minicenter", "Primo", "PLP", "IS2", "Unikit"]);

const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => {
  const n = parseFloat(String(v == null ? "" : v).replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};

// Column headers in the file have stray leading/trailing spaces — resolve by trim.
function pick(row, want) {
  for (const k of Object.keys(row)) if (k.trim() === want) return row[k];
  return "";
}

// poles: first standalone "1P".."4P" token in the description
function parsePoles(desc) {
  const m = desc.match(/\b([1-4])P\b/);
  return m ? parseInt(m[1], 10) : 0;
}
// rating: first ampere value (avoid "10kA" / "125 AF" — require a real A word-boundary,
// not preceded by k/M and not followed by a letter)
function parseRating(desc) {
  // number must start on its own (not part of a code like "A1A") and the unit
  // must be a real "A" word — not "kA" / "AF" / "AC".
  const m = desc.match(/(?<![A-Za-z0-9.])(\d+(?:\.\d+)?)\s*A\b(?![A-Za-z])/);
  return m ? `${m[1]}A` : "";
}
// light family token (leading code) — used only to enrich the search haystack
function parseFamily(desc) {
  const m = desc.match(/^([A-Za-z0-9][A-Za-z0-9.\/]*)/);
  return m ? m[1] : "";
}

const wb = XLSX.readFile(FILE);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

const components = [];
const enclosures = [];
const skipped = [];
const unclassifiedFams = {};

for (const row of rows) {
  const type = str(pick(row, "Type"));
  const desc = str(pick(row, "Description"));
  const ref = str(pick(row, "Item Code"));
  const eur = num(pick(row, "ABB Price list in EURO"));
  const egp = num(pick(row, "Market Price in EGP"));
  if (!desc && !ref) continue;
  if (!type) { skipped.push(row); continue; }

  if (ENCLOSURE_TYPES.has(type)) {
    const fam = type === "Local" ? "Local (Sheet Metal)" : type;
    if (!["SR-Basic", "Unikit", "Local (Sheet Metal)", "Minicenter", "Primo", "Pro-E", "IS2", "PLP"].includes(fam))
      unclassifiedFams[fam] = (unclassifiedFams[fam] || 0) + 1;
    enclosures.push({
      fam,
      name: desc,
      ref,
      abb: "",
      eur,
      egp,
      ip: str(pick(row, "IP")),
      H: 0,
      W: 0,
      D: 0,
      mount: str(pick(row, "Mounting")),
      ral: str(pick(row, "RAL")),
    });
  } else {
    const brand = /himel/i.test(type) ? "Himel" : "ABB";
    components.push({
      t: type,
      f: parseFamily(desc),
      r: parseRating(desc),
      d: desc,
      n: desc,
      ref,
      eur,
      egp,
      poles: parsePoles(desc),
      cuP: num(pick(row, "Weight/Panel/Pole")), // copper kg/pole — panels
      cuC: num(pick(row, "Weight/Cell/Pole")),  // copper kg/pole — cells
      brand,
      stock: "",
    });
  }
}

fs.writeFileSync(path.join(OUT, "components.json"), JSON.stringify(components));
fs.writeFileSync(path.join(OUT, "enclosures.json"), JSON.stringify(enclosures));

const encFams = {};
enclosures.forEach((e) => (encFams[e.fam] = (encFams[e.fam] || 0) + 1));
const compTypes = {};
components.forEach((c) => (compTypes[c.t] = (compTypes[c.t] || 0) + 1));
console.log(`components.json: ${components.length}`);
console.log(`enclosures.json: ${enclosures.length}`, encFams);
console.log("component types:", Object.keys(compTypes).length);
console.log("EUR-priced components:", components.filter((c) => c.eur > 0).length,
  "| EGP-priced:", components.filter((c) => c.eur === 0 && c.egp > 0).length,
  "| no price:", components.filter((c) => c.eur === 0 && c.egp === 0).length);
console.log("poles parsed:", components.filter((c) => c.poles > 0).length,
  "| ratings parsed:", components.filter((c) => c.r).length,
  "| Himel:", components.filter((c) => c.brand === "Himel").length);
if (skipped.length) console.log("SKIPPED (no Type):", skipped.length);
if (Object.keys(unclassifiedFams).length) console.log("Enclosure families NOT in PANEL/CELL system lists:", unclassifiedFams);
