// ERP export — turn a QTN's panels into an ERPNext "Bulk Edit Items" CSV the user
// uploads into their ERP. The format (3 header rows + a spacer + two instruction
// lines + a "------" separator, then one data row per item) mirrors the file their
// ERP exports, so re-import behaves identically. One row per panel; each panel is
// mapped to its enclosure family's item code / cost-center / group, priced at the
// panel's LV selling price (EGP, excl. VAT).
import { calcPanel, type LvState, type LvPanel } from "./store";

// Per-family mapping, extracted verbatim from the customer's sample. Local / Pillar /
// Coffree share the "Local" code stem and the PLP-CORE group. PLP is tax-blank.
interface ErpFam { item: string; cc: string; codeSuffix: string; group: string; noTax?: boolean }
const ERP_FAM: Record<string, ErpFam> = {
  "Primo":               { item: "Primo",       cc: "1205 - Flush Wall Mounted - PL",     codeSuffix: "Primo",      group: "Primo" },
  "Minicenter":          { item: "Minicenter",  cc: "1205 - Flush Wall Mounted - PL",     codeSuffix: "Minicenter", group: "Minicenter" },
  "Unikit":              { item: "Unikit",      cc: "1203 - Sub Free Standing - PL",      codeSuffix: "Unikit",     group: "Unikit" },
  "SR-Basic":            { item: "SR-Basic",    cc: "1204 - Surface Wall Mounted - PL",   codeSuffix: "SR-Basic",   group: "SR-Basic" },
  "IS2":                 { item: "IS2",         cc: "1202 - Main Free Standing - PL",     codeSuffix: "IS2",        group: "IS2" },
  "Pro-E":               { item: "Pro-E",       cc: "1202 - Main Free Standing - PL",     codeSuffix: "Pro-E",      group: "Pro-E" },
  "Local (Sheet Metal)": { item: "Local Panel", cc: "5101 - Automation Item Groups - PL", codeSuffix: "Local",      group: "PLP-CORE" },
  "Pillars":             { item: "Pillar",      cc: "5101 - Automation Item Groups - PL", codeSuffix: "Local",      group: "PLP-CORE" },
  "Coffree":             { item: "Coffree",     cc: "5101 - Automation Item Groups - PL", codeSuffix: "Local",      group: "PLP-CORE" },
  "PLP":                 { item: "PLP",         cc: "1202 - Main Free Standing - PL",     codeSuffix: "PLP",        group: "PLP", noTax: true },
};

const CODE_STEM = "EG-374674477"; // fixed item-code stem, per the customer's ERP
const TAX_TEMPLATE = "VAT14% - PL";
const WAREHOUSE = "Work In Progress - PL";
// item_tax_rate JSON exactly as the ERP writes it — the Arabic account label stays
// as literal \u escapes so the re-exported cell is byte-identical to the source.
const TAX_RATE_JSON = '{"2102 - VAT Taxes 14% \\u0627\\u0644\\u0642\\u064a\\u0645\\u0629 \\u0627\\u0644\\u0645\\u0636\\u0627\\u0641\\u0629 - PL": 14.0}';

// Row 2 (friendly labels) and row 3 (machine field names) — 56 columns, verbatim.
const FRIENDLY = [
  "Item Code","Business Unit","details","Code","Item Type","Customer's Item Code","Item Name","Description","Item Group","Brand","Image","Quantity","Stock UOM","UOM","UOM Conversion Factor","Qty as per Stock UOM","Qty (Warehouse)","Qty (Company)","Price List Rate","Price List Rate (Company Currency)","Margin Type","Margin Rate or Amount","Rate With Margin","Discount (%) on Price List Rate with Margin","Discount Amount","Distributed Discount Amount","Rate With Margin (Company Currency)","Rate (USD)","Net Rate","Amount","Net Amount","Item Tax Template","Rate (Company Currency)","Net Rate (Company Currency)","Amount (Company Currency)","Net Amount (Company Currency)","Pricing Rules","Rate of Stock UOM","Is Free Item","Is Alternative","Has Alternative Item","Valuation Rate","Gross Profit","Weight Per Unit","Total Weight","Weight UOM","Warehouse","Against Blanket Order","Blanket Order","Blanket Order Rate","Against Doctype","Against Docname","Projected Qty","Item Tax Rate","Additional Notes","Page Break",
];
const MACHINE = [
  "item_code","cost_center","details","code","item_type","customer_item_code","item_name","description","item_group","brand","image","qty","stock_uom","uom","conversion_factor","stock_qty","actual_qty","company_total_stock","price_list_rate","base_price_list_rate","margin_type","margin_rate_or_amount","rate_with_margin","discount_percentage","discount_amount","distributed_discount_amount","base_rate_with_margin","rate","net_rate","amount","net_amount","item_tax_template","base_rate","base_net_rate","base_amount","base_net_amount","pricing_rules","stock_uom_rate","is_free_item","is_alternative","has_alternative_item","valuation_rate","gross_profit","weight_per_unit","total_weight","weight_uom","warehouse","against_blanket_order","blanket_order","blanket_order_rate","prevdoc_doctype","prevdoc_docname","projected_qty","item_tax_rate","additional_notes","page_break",
];
const N = MACHINE.length; // 56
const IX = Object.fromEntries(MACHINE.map((k, i) => [k, i])) as Record<string, number>;

/** A panel's enclosure family: cells use the cell type, panels the sizing family. */
function panelFamily(p: LvPanel): string {
  return p.sizingMode === "cells" ? (p.cellConfig?.type ?? "") : (p.panelsSizing?.family ?? "");
}

const csvCell = (v: string | number): string => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells: (string | number)[]): string => cells.map(csvCell).join(",");
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Build the full ERP "Bulk Edit Items" CSV text for a QTN (one row per panel). */
export function buildErpItemsCsv(s: LvState): string {
  const blank = () => new Array(N).fill("");

  const rows: (string | number)[][] = [
    (() => { const r = blank(); r[0] = "Bulk Edit Items"; return r; })(),
    FRIENDLY.slice(),
    MACHINE.slice(),
    new Array(N).fill(" "),                                   // spacer row (matches source)
    (() => { const r = blank(); r[0] = "The CSV format is case sensitive"; return r; })(),
    (() => { const r = blank(); r[0] = "Do not edit headers which are preset in the template"; return r; })(),
    (() => { const r = blank(); r[0] = "------"; return r; })(),
  ];

  for (const p of s.panels) {
    if (p.spare && p.spareKind === "spare") continue;         // the loose spare-parts cell has no enclosure item
    const fam = ERP_FAM[panelFamily(p)];
    if (!fam) continue;                                       // family with no ERP mapping → skip

    // Two currencies, as the ERP expects: the transaction columns follow whatever the
    // Commercial Offer was quoted in, while the "(Company Currency)" columns are
    // always EGP. Both used to carry the EGP figure, so a USD offer exported as EGP.
    const egpUnit = round2(calcPanel(p, s.factors, s.abbItemDiscounts).sellUnit);
    const usdRate = s.factors.usd || 0;
    // Fall back to EGP if there is no rate to convert with — a silent divide by zero
    // would put Infinity in the price column.
    const inUsd = (s.offerCurrency ?? "USD") === "USD" && usdRate > 0;
    const unit = inUsd ? round2(egpUnit / usdRate) : egpUnit;
    const qty = p.qty || 1;
    const amount = round2(unit * qty);
    const baseAmount = round2(egpUnit * qty);

    const r = blank();
    r[IX.item_code] = fam.item;
    r[IX.cost_center] = fam.cc;
    r[IX.code] = `${CODE_STEM}-${fam.codeSuffix}`;
    r[IX.item_type] = "EGS";
    r[IX.item_name] = fam.item;
    r[IX.description] = p.name?.trim() || fam.item;
    r[IX.item_group] = fam.group;
    r[IX.qty] = qty;
    r[IX.stock_uom] = "Nos";
    r[IX.uom] = "Nos";
    r[IX.conversion_factor] = 1;
    r[IX.stock_qty] = qty;
    r[IX.price_list_rate] = unit;
    r[IX.base_price_list_rate] = egpUnit;
    r[IX.rate] = unit;
    r[IX.base_rate] = egpUnit;
    r[IX.amount] = amount;
    r[IX.base_amount] = baseAmount;
    r[IX.item_tax_template] = fam.noTax ? "" : TAX_TEMPLATE;
    r[IX.item_tax_rate] = fam.noTax ? "{}" : TAX_RATE_JSON;
    r[IX.warehouse] = WAREHOUSE;
    rows.push(r);
  }

  return rows.map(csvRow).join("\r\n") + "\r\n";
}

/** How many panels will become rows (for enabling/labelling the download button). */
export function erpItemCount(s: LvState): number {
  return s.panels.filter((p) => !(p.spare && p.spareKind === "spare") && ERP_FAM[panelFamily(p)]).length;
}
