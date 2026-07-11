#!/usr/bin/env node
// Generate the editable pricing Excel masters from the app's current data.
//
//   node tools/pricing-export.cjs [rmu|lv|all]     (default: all)
//
// Writes:
//   pricing/RMU-Pricing.xlsx  ← backend/src/data/rmu-pricing.json
//   pricing/LV-Pricing.xlsx   ← frontend/src/lv/data/{components,enclosures,factors}.json
//
// Edit the Excel files (price columns only!) then run tools/pricing-import.cjs
// to sync them back into the app. See pricing/README.md.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const XLSX = require(path.join(ROOT, "frontend", "node_modules", "xlsx"));

const OUT_DIR = path.join(ROOT, "pricing");
fs.mkdirSync(OUT_DIR, { recursive: true });

const which = (process.argv[2] || "all").toLowerCase();

// ── helpers ──────────────────────────────────────────────────────────────────
function sheet(aoa, colWidths) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths) ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  return ws;
}

// Parse a panel price key like "P-SEC.M24N2F1M1-With Fuse" into display columns.
function parsePanelKey(key) {
  const m = /^(P-RAL|P-SEC\.M|P-SEC)(\d{2})N(\d+)F(\d+)(M1)?(-With Fuse)?$/.exec(key);
  if (!m) return { family: "?", kv: "", ring: "", transformer: "", metering: "", vtFuse: "" };
  const famWord = { "P-RAL": "PRAL (Air, ABB)", "P-SEC": "PSEC (SF6, ABB)", "P-SEC.M": "PSEC (SF6, Murge)" }[m[1]];
  return {
    family: famWord,
    kv: Number(m[2]),
    ring: Number(m[3]),
    transformer: Number(m[4]),
    metering: m[5] ? "Yes" : "No",
    vtFuse: m[6] ? "With fuse" : m[5] ? "Without fuse" : "",
  };
}

// ── RMU ──────────────────────────────────────────────────────────────────────
function exportRmu() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "backend", "src", "data", "rmu-pricing.json"), "utf8"));
  const wb = XLSX.utils.book_new();

  // Panels
  const pRows = [["Price Key", "Family", "kV", "Ring (R)", "Transformer (T)", "Metering", "VT Fuse", "Price USD"]];
  for (const [key, price] of Object.entries(data.panels)) {
    const p = parsePanelKey(key);
    pRows.push([key, p.family, p.kv, p.ring, p.transformer, p.metering, p.vtFuse, price]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(pRows, [28, 20, 6, 9, 14, 10, 13, 11]), "RMU Panels");

  // Lucy
  const lRows = [["Config", "Feeders (L)", "Transformers (V)", "Metering", "Price USD (12 & 24 kV)"]];
  for (const [key, price] of Object.entries(data.lucy)) {
    const m = /^(\d+)\+(\d+)(\+M)?$/.exec(key);
    lRows.push([key, Number(m[1]), Number(m[2]), m[3] ? "Yes" : "No", price]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(lRows, [10, 12, 16, 10, 22]), "Lucy AEGIS PLUS");

  // Smart / RTU
  const LEVEL_LABEL = {
    READY1: "Ready to be Smart — Type 1",
    READY2: "Ready to be Smart — Type 2",
    SMART1: "Smart — Type 1 (monitor only)",
    SMART2: "Smart — Type 2 (monitor & control)",
  };
  const rRows = [["Product", "Level", "Description", "Price USD"]];
  for (const [product, levels] of Object.entries(data.rtu))
    for (const [level, price] of Object.entries(levels))
      rRows.push([product, level, LEVEL_LABEL[level] || level, price]);
  XLSX.utils.book_append_sheet(wb, sheet(rRows, [9, 9, 36, 11]), "Smart RTU");

  // Add-ons
  const aRows = [["Key", "Name", "Price USD"]];
  for (const [key, a] of Object.entries(data.addOns)) aRows.push([key, a.name, a.price]);
  XLSX.utils.book_append_sheet(wb, sheet(aRows, [18, 22, 11]), "Add-ons");

  // Settings
  XLSX.utils.book_append_sheet(
    wb,
    sheet([["Setting", "Value", "Notes"], ["VAT %", data.vatPct, "Egypt VAT applied on commercial offers"], ["Currency", data.currency, "All prices in this file"]], [12, 10, 44]),
    "Settings"
  );

  const out = path.join(OUT_DIR, "RMU-Pricing.xlsx");
  XLSX.writeFile(wb, out);
  console.log(`RMU  -> ${out}  (panels=${Object.keys(data.panels).length}, lucy=${Object.keys(data.lucy).length})`);
}

// ── LV ───────────────────────────────────────────────────────────────────────
function exportLv() {
  const dataDir = path.join(ROOT, "frontend", "src", "lv", "data");
  const components = JSON.parse(fs.readFileSync(path.join(dataDir, "components.json"), "utf8"));
  const enclosures = JSON.parse(fs.readFileSync(path.join(dataDir, "enclosures.json"), "utf8"));
  const factors = JSON.parse(fs.readFileSync(path.join(dataDir, "factors.json"), "utf8"));
  const wb = XLSX.utils.book_new();

  // Components — ID column is the join key for import; only the price columns
  // are meant to be edited (descriptions are lookup keys for the combos!).
  const cRows = [["ID (do not edit)", "Type", "Family", "Rating", "Description (do not edit)", "Reference", "Brand", "Poles", "Price EUR", "Price EGP"]];
  components.forEach((c, i) => cRows.push([i, c.t, c.f, c.r, c.d, c.ref, c.brand, c.poles, c.eur, c.egp]));
  XLSX.utils.book_append_sheet(wb, sheet(cRows, [13, 12, 12, 9, 64, 20, 8, 6, 11, 11]), "Components");

  // Enclosures
  const eRows = [["ID (do not edit)", "Family", "Name (do not edit)", "Reference", "IP", "Mount", "RAL", "Price EUR", "Price EGP"]];
  enclosures.forEach((e, i) => eRows.push([i, e.fam, e.name, e.ref, e.ip, e.mount, e.ral, e.eur, e.egp]));
  XLSX.utils.book_append_sheet(wb, sheet(eRows, [13, 18, 52, 18, 5, 14, 6, 11, 11]), "Enclosures");

  // Factors
  const DESC = {
    euro: "EGP per 1 EUR (converts every EUR price)",
    usd: "EGP per 1 USD",
    copper: "Copper price EGP/kg",
    sheetMetal: "Sheet metal EGP/kg",
    operations: "Operations overhead (fraction, 0.05 = 5%)",
    factor: "Selling factor: sell = cost / factor",
    abbDiscount: "Default ABB discount (fraction, 0.1 = 10%)",
    vat: "VAT (fraction, 0.14 = 14%)",
  };
  const fRows = [["Key", "Value", "Description"]];
  for (const [k, v] of Object.entries(factors)) {
    if (k === "forms") {
      for (const [fk, fv] of Object.entries(v)) fRows.push([`forms.${fk}`, fv, `Form ${fk} separation uplift (fraction)`]);
    } else {
      fRows.push([k, v, DESC[k] || ""]);
    }
  }
  XLSX.utils.book_append_sheet(wb, sheet(fRows, [14, 10, 46]), "Factors");

  const out = path.join(OUT_DIR, "LV-Pricing.xlsx");
  XLSX.writeFile(wb, out);
  console.log(`LV   -> ${out}  (components=${components.length}, enclosures=${enclosures.length}, factors=${fRows.length - 1})`);
}

if (which === "rmu" || which === "all") exportRmu();
if (which === "lv" || which === "all") exportLv();
if (!["rmu", "lv", "all"].includes(which)) {
  console.error("usage: node tools/pricing-export.cjs [rmu|lv|all]");
  process.exit(1);
}
