#!/usr/bin/env node
// Sync the edited pricing Excel masters back into the app.
//
//   node tools/pricing-import.cjs [rmu|lv|all]     (default: all)
//
// Reads:
//   pricing/RMU-Pricing.xlsx  → backend/src/data/rmu-pricing.json  (rebuilt)
//   pricing/LV-Pricing.xlsx   → frontend/src/lv/data/components.json,
//                               enclosures.json (PRICES ONLY, matched by ID),
//                               factors.json (rebuilt)
//
// Safety: LV technical fields (descriptions, references) are NEVER touched —
// they are lookup keys for the combination builders. Rows whose identity
// columns don't match the app data are skipped with a warning.
// After importing: rebuild + push to deploy (see pricing/README.md).

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const XLSX = require(path.join(ROOT, "frontend", "node_modules", "xlsx"));

const which = (process.argv[2] || "all").toLowerCase();
let warnings = 0;
const warn = (m) => { console.warn("  WARN: " + m); warnings++; };
const fail = (m) => { console.error("  ERROR: " + m); process.exit(1); };

function rows(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) fail(`sheet "${name}" not found`);
  // raw:true keeps numbers as exact doubles; header:1 gives arrays.
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
}
const num = (v) => (typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "")) || 0);

// ── RMU ──────────────────────────────────────────────────────────────────────
function importRmu() {
  const xlsxPath = path.join(ROOT, "pricing", "RMU-Pricing.xlsx");
  if (!fs.existsSync(xlsxPath)) fail(`${xlsxPath} not found — run pricing-export first`);
  const wb = XLSX.readFile(xlsxPath);
  const outPath = path.join(ROOT, "backend", "src", "data", "rmu-pricing.json");
  const old = JSON.parse(fs.readFileSync(outPath, "utf8"));

  const KEY_RE = /^(P-RAL|P-SEC\.M|P-SEC)\d{2}N\d+F\d+(M1)?(-With Fuse)?$/;
  const panels = {};
  for (const r of rows(wb, "RMU Panels").slice(1)) {
    const key = String(r[0]).trim();
    if (!key) continue;
    if (!KEY_RE.test(key)) { warn(`RMU Panels: bad price key "${key}" — skipped`); continue; }
    const price = num(r[7]);
    if (!(price > 0)) { warn(`RMU Panels: ${key} has no positive price — skipped`); continue; }
    if (key in panels) warn(`RMU Panels: duplicate key ${key} (last row wins)`);
    panels[key] = price;
  }

  const lucy = {};
  for (const r of rows(wb, "Lucy AEGIS PLUS").slice(1)) {
    const key = String(r[0]).trim();
    if (!key) continue;
    if (!/^\d+\+\d+(\+M)?$/.test(key)) { warn(`Lucy: bad config key "${key}" — skipped`); continue; }
    const price = num(r[4]);
    if (!(price > 0)) { warn(`Lucy: ${key} has no positive price — skipped`); continue; }
    lucy[key] = price;
  }

  const rtu = {};
  for (const r of rows(wb, "Smart RTU").slice(1)) {
    const product = String(r[0]).trim(), level = String(r[1]).trim();
    if (!product) continue;
    if (!["PSEC", "LUCY"].includes(product)) { warn(`Smart RTU: unknown product "${product}" — skipped`); continue; }
    if (!["READY1", "READY2", "SMART1", "SMART2"].includes(level)) { warn(`Smart RTU: unknown level "${level}" — skipped`); continue; }
    (rtu[product] = rtu[product] || {})[level] = num(r[3]);
  }

  const addOns = {};
  for (const r of rows(wb, "Add-ons").slice(1)) {
    const key = String(r[0]).trim();
    if (!key) continue;
    addOns[key] = { name: String(r[1]).trim(), price: num(r[2]) };
  }
  if (!addOns.outdoorEnclosure) warn("Add-ons: outdoorEnclosure missing — Outdoor installation will not be priced!");

  let vatPct = old.vatPct, currency = old.currency;
  for (const r of rows(wb, "Settings").slice(1)) {
    const k = String(r[0]).trim().toLowerCase();
    if (k === "vat %") vatPct = num(r[1]);
    if (k === "currency") currency = String(r[1]).trim() || currency;
  }
  if (!(vatPct >= 0 && vatPct <= 100)) fail(`VAT % out of range: ${vatPct}`);

  const next = {
    _note: "RMU pricing master. Edit pricing/RMU-Pricing.xlsx and run `node tools/pricing-import.cjs rmu` — do NOT hand-edit this file.",
    currency, vatPct, panels, lucy, rtu, addOns,
  };

  // Change report
  let changed = 0;
  for (const [k, v] of Object.entries(panels)) if (old.panels[k] !== v) { console.log(`  panel ${k}: ${old.panels[k] ?? "(new)"} -> ${v}`); changed++; }
  for (const k of Object.keys(old.panels)) if (!(k in panels)) { console.log(`  panel ${k}: REMOVED`); changed++; }
  for (const [k, v] of Object.entries(lucy)) if (old.lucy[k] !== v) { console.log(`  lucy ${k}: ${old.lucy[k] ?? "(new)"} -> ${v}`); changed++; }
  for (const [p, levels] of Object.entries(rtu)) for (const [l, v] of Object.entries(levels)) if (old.rtu?.[p]?.[l] !== v) { console.log(`  rtu ${p}.${l}: ${old.rtu?.[p]?.[l] ?? "(new)"} -> ${v}`); changed++; }
  for (const [k, a] of Object.entries(addOns)) if (old.addOns?.[k]?.price !== a.price) { console.log(`  addOn ${k}: ${old.addOns?.[k]?.price ?? "(new)"} -> ${a.price}`); changed++; }
  if (old.vatPct !== vatPct) { console.log(`  VAT: ${old.vatPct}% -> ${vatPct}%`); changed++; }

  fs.writeFileSync(outPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`RMU  -> ${outPath}  (panels=${Object.keys(panels).length}, lucy=${Object.keys(lucy).length}, ${changed} price change${changed === 1 ? "" : "s"})`);
}

// ── LV ───────────────────────────────────────────────────────────────────────
function importLv() {
  const xlsxPath = path.join(ROOT, "pricing", "LV-Pricing.xlsx");
  if (!fs.existsSync(xlsxPath)) fail(`${xlsxPath} not found — run pricing-export first`);
  const wb = XLSX.readFile(xlsxPath);
  const dataDir = path.join(ROOT, "frontend", "src", "lv", "data");

  // Components — update eur/egp ONLY, matched by the ID column (array index),
  // identity-checked against ref + description so a reordered/corrupted sheet
  // can't write prices onto the wrong item.
  const components = JSON.parse(fs.readFileSync(path.join(dataDir, "components.json"), "utf8"));
  let cChanged = 0, cSkipped = 0, cBoth = 0;
  for (const r of rows(wb, "Components").slice(1)) {
    if (r[0] === "" || r[0] == null) continue;
    const id = Number(r[0]);
    const rec = components[id];
    if (!rec) { warn(`Components: ID ${id} out of range — skipped`); cSkipped++; continue; }
    if (String(r[5]).trim() !== rec.ref || String(r[4]).trim() !== rec.d.trim()) {
      warn(`Components: ID ${id} identity mismatch (ref/description edited?) — skipped`);
      cSkipped++;
      continue;
    }
    const eur = num(r[8]), egp = num(r[9]);
    if (eur > 0 && egp > 0) { warn(`Components: ID ${id} "${rec.d.slice(0, 40)}" has BOTH EUR and EGP — EUR wins in the app; set one to 0`); cBoth++; }
    if (rec.eur !== eur || rec.egp !== egp) { rec.eur = eur; rec.egp = egp; cChanged++; }
  }

  // Enclosures — same pattern, identity = fam + name + ref.
  const enclosures = JSON.parse(fs.readFileSync(path.join(dataDir, "enclosures.json"), "utf8"));
  let eChanged = 0, eSkipped = 0;
  for (const r of rows(wb, "Enclosures").slice(1)) {
    if (r[0] === "" || r[0] == null) continue;
    const id = Number(r[0]);
    const rec = enclosures[id];
    if (!rec) { warn(`Enclosures: ID ${id} out of range — skipped`); eSkipped++; continue; }
    if (String(r[1]).trim() !== rec.fam || String(r[2]).trim() !== rec.name.trim() || String(r[3]).trim() !== rec.ref) {
      warn(`Enclosures: ID ${id} identity mismatch — skipped`);
      eSkipped++;
      continue;
    }
    const eur = num(r[7]), egp = num(r[8]);
    if (eur > 0 && egp > 0) warn(`Enclosures: ID ${id} "${rec.name.slice(0, 40)}" has BOTH EUR and EGP — EUR wins`);
    if (rec.eur !== eur || rec.egp !== egp) { rec.eur = eur; rec.egp = egp; eChanged++; }
  }

  // Factors — rebuild known keys only (forms.* nested).
  const factors = JSON.parse(fs.readFileSync(path.join(dataDir, "factors.json"), "utf8"));
  const KNOWN = ["factor", "euro", "usd", "copper", "sheetMetal", "operations", "abbDiscount", "vat"];
  let fChanged = 0;
  for (const r of rows(wb, "Factors").slice(1)) {
    const key = String(r[0]).trim();
    if (!key) continue;
    const v = num(r[1]);
    if (key.startsWith("forms.")) {
      const fk = key.slice(6);
      if (factors.forms && fk in factors.forms) { if (factors.forms[fk] !== v) { factors.forms[fk] = v; fChanged++; } }
      else warn(`Factors: unknown form key "${key}" — skipped`);
    } else if (KNOWN.includes(key)) {
      if (factors[key] !== v) { console.log(`  factor ${key}: ${factors[key]} -> ${v}`); factors[key] = v; fChanged++; }
    } else warn(`Factors: unknown key "${key}" — skipped`);
  }
  if (!(factors.factor > 0)) fail("factors.factor must be > 0 (sell = cost / factor)");
  if (!(factors.euro > 0)) fail("factors.euro (EGP per EUR) must be > 0");

  // Write in the same formats the lv-import scripts use (compact; factors indent 1).
  fs.writeFileSync(path.join(dataDir, "components.json"), JSON.stringify(components));
  fs.writeFileSync(path.join(dataDir, "enclosures.json"), JSON.stringify(enclosures));
  fs.writeFileSync(path.join(dataDir, "factors.json"), JSON.stringify(factors, null, 1));
  console.log(`LV   -> components: ${cChanged} price change(s), ${cSkipped} skipped, ${cBoth} both-currency warning(s)`);
  console.log(`     -> enclosures: ${eChanged} price change(s), ${eSkipped} skipped`);
  console.log(`     -> factors: ${fChanged} change(s)`);
  console.log("     NOTE: LV data is baked into the frontend build — rebuild & deploy for prices to take effect.");
}

if (which === "rmu" || which === "all") importRmu();
if (which === "lv" || which === "all") importLv();
if (!["rmu", "lv", "all"].includes(which)) {
  console.error("usage: node tools/pricing-import.cjs [rmu|lv|all]");
  process.exit(1);
}
console.log(warnings ? `done with ${warnings} warning(s)` : "done — no warnings");
