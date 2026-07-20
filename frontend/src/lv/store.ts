// LV configurator state + calculation engine + Material List builder (RPT-04).
// State is kept client-side and persisted to localStorage (Phase 1 — saving to
// the PowerLine backend as offers is a later phase).

import {
  COMPONENTS,
  ENCLOSURES,
  DEFAULT_FACTORS,
  DEFAULT_SALES_PEOPLE,
  DEFAULT_SUPPORT_ENGINEERS,
  SALES_MANAGER,
  componentPriceEgp,
  copperTypeFactor,
  cuPanelKg,
  cuCellKg,
  cellPriceEgp,
  type DbComponent,
  type DbEnclosure,
  type Factors,
  type SalesPerson,
} from "./catalog";
import { defaultCellConfig, type CellConfig } from "./cells";
import { type CopperTool } from "./copper";

let uidCtr = 0;
export const uid = () => `u${++uidCtr}_${Math.random().toString(36).slice(2, 7)}`;

// ── Types ────────────────────────────────────────────────────────────────────
export interface PanelComponent {
  id: string;
  section: string;
  name: string;     // display description
  desc: string;     // short description
  ref: string;
  type: string;
  brand: string;
  rating: string;
  eur: number;
  egp: number;
  poles: number;
  cuP: number;
  cuC: number;
  stock: string;
  qty: number;
  baseQty?: number; // per-combination base qty — combo qty = qty / baseQty (combination scaling)
  comboScalable?: boolean; // group shows a "Combination qty" (×N) control (MCC + custom combinations)
  adj: string;      // RPT-01: adjustable rating (free text)
  comment: string;  // RPT-01: free text
  note: string;     // RPT-01: free text
  group?: string;   // combination tag (e.g. "ATS 1 Out of 2")
  spacer?: boolean; // blank separator row — excluded from all cost/count/exports
}
/** True for a blank spacer row (separates component groups; never priced/counted). */
export const isSpacer = (c: PanelComponent): boolean => c.spacer === true;

export type SizingMode = "none" | "panels" | "cells";
export interface PanelsSizing {
  layout: "Single" | "Double";
  family: string;
  sizing1: string; // legacy (pre item-list) — kept for stored-data compat
  sizing2: string;
}

/** Panel Type selection — ONE enclosure per slot (Single = slot 1; Double = 1 + 2). */
export interface PanelTypeItem {
  id: string;
  slot?: 1 | 2;
  fam: string;
  name: string;
  ref: string;
  ip: string;
  eur: number;
  egp: number;
  qty: number; // always 1 (one item selected); kept for cost/material math
}

export interface LvPanel {
  id: string;
  name: string;
  code: string;
  fedFrom: string;   // RPT-01: next to panel name
  shortCircuit: string; // short-circuit withstand (e.g. "50 kA") — shown on the technical offer
  qty: number;
  ratingA: number;   // busbar rating / incoming breaker rating (drives the 800 A rule)
  ambTemp: string;
  neutral: string;
  earth: string;
  copperType: string;
  incomingCables: string;
  outgoingCables: string;
  form: string;
  encFam: string;        // legacy — superseded by panelItems
  encKey: string;        // legacy — superseded by panelItems
  mainBusbarKg: number;  // manual fallback (cells / families without an auto rule)
  mainBusbarOverride?: boolean; // true = ignore the auto rule and use mainBusbarKg manually
  busbarPoles: number;   // main-busbar bar count (3 = 3P, 4 = 4P) for the auto rule
  sellFactor: number;    // per-panel selling-factor override; 0 = follow the global (Pricing Settings)
  copperTool: CopperTool; // RPT-1: per-rating copper lengths (Cells → Copper Tool)
  draft: string;          // RPT-1: per-panel scratchpad — never included in outputs
  highlight?: boolean;    // yellow highlighter toggle in the panel list (UI marker only)
  spare?: boolean;        // this cell is the Spare-parts list (no sizing/specs; components + copper only)
  sections: string[];
  activeSection: string;
  components: PanelComponent[];
  sizingMode: SizingMode;
  panelsSizing: PanelsSizing;
  panelItems: PanelTypeItem[]; // chosen enclosure sizings (component-like rows)
  cellConfig: CellConfig;
}

export interface LvProject {
  // QTN number is entered once at QTN creation (rec.number) — not duplicated here.
  optyNo: string;       // RPT-1: Opportunity number
  revisionNo: string;   // RPT-1: Revision number
  name: string;
  customer: string;
  date: string;
  salesPerson: string;
  salesMobile: string;
  salesEmail: string;
  supportEngineer: string;
  salesManager: string;
  salesManagerMobile: string; // RPT-1: sales-manager phone (auto-filled from staff)
  salesManagerEmail: string;  // RPT-1: sales-manager email (auto-filled from staff)
}

export interface TermsSection { title: string; body: string }
/** A divider page inserted into the Technical Offer — a full themed sheet with one
 *  large centred title (e.g. "Building A"), shown right before the panel it references. */
export interface OfferSeparator {
  id: string;
  beforePanelId: string;
  text: string;
}
export interface LvState {
  project: LvProject;
  factors: Factors;
  salesPeople: SalesPerson[];
  supportEngineers: string[];
  panels: LvPanel[];
  selectedId: string | null;
  notesGeneral: string[];          // editable "General Notes" page (after the cover)
  notesAdditional: string[];       // editable "Additional Notes" page
  commercialTerms: TermsSection[];   // editable "General Terms & Conditions" — English
  commercialTermsAr: TermsSection[]; // editable Arabic terms (shown after the English)
  // Per-item ABB discount % override (edited on the Material List), keyed by
  // reference||name. Absent → the item uses the global factors.abbDiscount.
  abbItemDiscounts: Record<string, number>;
  // Divider/separator pages for the Technical Offer, each rendered before its panel.
  offerSeparators?: OfferSeparator[];
  // QTN kind chosen at creation: a normal panel quotation, or a spare-parts
  // quotation whose single "Spare parts" cell drives all offers.
  kind?: "panels" | "spare";
}

/** Default General Terms & Conditions shown at the end of the commercial offer — editable.
 *  Stored as { title, body } sections so each header renders bold/larger. */
const DEFAULT_TERMS_TEXT = `Validity of the Offer
The offer is valid for a period of three days starting from the offer date. Powerline has the right to change prices, terms and conditions after offer expiry. The offer validity can be extended with a written request before offer expiry.

Shop Drawings Approvals
Shop drawings shall be provided within 10 days from the date of purchase order, letter of award and advance payment whichever comes the latest, and the customer shall approve shop drawings within 5 days from receiving them.

Taxes
The offer excludes any applicable taxes, stamps and insurance, and excludes sales taxes and value added taxes.

Warranty
Powerline's warranty policy will not cover normal wear of the equipment, neglecting maintenance, operation by unqualified persons or improper use of the equipment. The Company warrants its (Products/Works) against manufacturing defects for a period of (12) months starting from the provisional acceptance date of receiving the (Products/Works), or the deemed acceptance date (2 weeks from informing the customer that Products/Works are ready to be tested and delivered while the customer defaults doing the same during this period).

Variations
Customer has the right within one week from purchase order or contract date to change the value of the contract in the range of ±15% by a written variation contract approved by both sides. In the event of a change in the foreign currency rate from the Central Bank during the execution period, prices shall be calculated based on the exchange rate applicable on the actual delivery date for receipt payments.

Contract Termination
Should the purchaser cancel the order after signature during preparation of the supplier in executing the contract (studies, purchasing materials, etc.), the purchaser pays the supplier all expenses and compensations for these losses. In the event of the purchaser cancelling the order after the supplier starts manufacturing, the supplier has the right to hold the down payment and to ask the purchaser for compensation for his losses.

Applicable Laws
In case any conflict happens between both parties, they dedicate all their appropriate means to settle the issue amicably. In case attempts fail, Egyptian Laws shall be applied in front of Cairo concerned Courts.

Force Majeure
In case of devaluation of EGP conducted by CBE during the execution period of the offer, Powerline has the right to reprice the offer to imbed such currency effect in the pricing. Powerline will not be liable for any delay in delivery time mentioned in this offer which results attributable to COVID-19 ramifications.

Payment Terms
(50)% of the total price as an advance payment by a certified check or in cash according to the central bank exchange rate on the due date. (50)% of the total price after testing at factory and before delivery by a certified check or in cash according to the central bank exchange rate on the due date. In case of delaying the advance payment more than two weeks from purchase order / contract date, Powerline has the right to terminate the contract.

Delivery Period
Low Voltage Panels: (3-4) months. All delivery periods will be calculated from the date of purchase order, receiving the advance payment and receiving drawings approval whichever comes the latest. In the event that the required foreign currency is not available through Egyptian banks to procure imported components, Powerline shall be entitled to request payment in foreign currency.

Delivery Place
EX Works (EXW) factories at 10th of Ramadan city.

Receiving Authorization
The Customer must send an official authorization letter naming the representative authorized to receive the panels from our factories at 10th of Ramadan City. If delivery is made to the customer's location, an official authorization must also be provided for the person authorized by the customer to receive the panels at the location.

Storage Penalty
Powerline has the right to impose a penalty (storage costs) of 1% of the total contract value in the event that the customer is late in receiving the supplies from the factory for a period exceeding two weeks from the date of notification of the supplies' readiness or the test date, whichever is later.`;
export const DEFAULT_COMMERCIAL_TERMS: TermsSection[] = DEFAULT_TERMS_TEXT.split("\n\n").map((block) => {
  const [title, ...rest] = block.split("\n");
  return { title: title.trim(), body: rest.join("\n").trim() };
});

/** Arabic General Terms & Conditions (الشروط والأحكام العامة) — editable, shown after the English. */
const DEFAULT_TERMS_TEXT_AR = `صلاحية العرض
يسري هذا العرض لمدة ثلاثة أيام تبدأ من تاريخ إرسال العرض. يحق لشركة باورلاين تغيير الأسعار والشروط والأحكام بعد انتهاء صلاحية العرض. يمكن تمديد صلاحية العرض بطلب كتابي قبل انتهاء صلاحية العرض.

إعتماد الرسومات الفنية
سيتم إنهاء الرسومات الفنية خلال 10 أيام من تاريخ أمر التوريد أو خطاب الترسية أو الدفعة المقدمة أيهما لاحق، وعلى العميل اعتماد هذه الرسومات خلال 5 أيام من استلامها.

الضرائب
عرض السعر لا يشمل أي دمغات أو ضرائب أو تأمينات واجبة التطبيق، ولا يشمل ضريبة المبيعات أو ضريبة القيمة المضافة.

فترة الضمان
لن تغطي سياسة ضمان باورلاين التآكل العادي للمعدات أو إهمال الصيانة أو التشغيل من قبل أشخاص غير مؤهلين أو الاستخدام غير السليم للمعدات. تضمن الشركة (معداتها/أعمالها) ضد عيوب التصنيع لمدة (12) شهرًا بدءًا من تاريخ الاستلام الابتدائي لـ(المعدات/الأعمال) أو تاريخ القبول المعتبر وهو مرور أسبوعين بعد إخطار العميل بأن (المعدات/الأعمال) جاهزة للاختبار والتسليم في حين تقصير العميل القيام بالشيء نفسه في غضون تلك المدة.

تغيّر قيمة العقد
يحق للعميل في غضون أسبوع واحد فقط من أمر الشراء أو تاريخ العقد تغيير قيمة العقد في نطاق ±15% بموجب عقد تغيير مكتوب معتمد من كلا الجانبين. في حالة تغيير سعر العملة الأجنبية بالبنك المركزي خلال مدة التنفيذ يتم احتساب الأسعار طبقًا لسعر العملة في يوم التسليم الفعلي وذلك بالنسبة لدفعات الاستلام.

إنهاء العقد
يجب على العميل في حالة إلغاء الأمر بعد التوقيع أثناء تجهيز المورد لتنفيذ العقد (دراسات، شراء مواد، إلخ) أن يدفع للمورد جميع النفقات والتعويضات عن هذه الخسائر. إذا ألغى المشتري الطلب بعد بدء المورد في التصنيع، فيكون للمورد الحق في حجز الدفعة المقدمة وكذلك مطالبة العميل بتعويض عن خسائره.

النزاع والخلافات
في حالة حدوث أي نزاع بين الطرفين، يسعى الطرفان بكل الطرق المناسبة لتسوية النزاع وديًا. وفي حالة فشل المحاولات تُطبَّق القوانين المصرية أمام محاكم القاهرة المختصة.

القوى القهرية
في حالة قيام البنك المركزي المصري بتخفيض قيمة الجنيه المصري خلال مدة التنفيذ، يحق لشركة باورلاين إعادة تسعير العرض لتضمين قيمة تأثير العملة. باورلاين غير مسؤولة عن أي تأخير في مدة التسليم المذكورة في العرض والذي قد ينتج عن تداعيات COVID-19.

شروط الدفع
(50)% من السعر الإجمالي كدفعة مقدمة عند صدور أمر التوريد بشيك بنكي مقبول الدفع أو نقدًا وفقًا لسعر صرف البنك المركزي لتاريخ استحقاقه. (50)% من السعر الإجمالي بعد اختبار المهمات بالمصنع وقبل الاستلام بشيك بنكي مقبول الدفع أو نقدًا وفقًا لسعر صرف البنك المركزي لتاريخ استحقاقه. في حالة تأخر الدفعة المقدمة أكثر من أسبوعين من تاريخ أمر التوريد أو تاريخ العقد، يحق لشركة باورلاين إلغاء العقد.

مدة التوريد
لوحات الجهد المنخفض: (3-4) شهور. سيتم احتساب جميع فترات التسليم من تاريخ أمر الشراء واستلام الدفعة المقدمة واستلام اعتماد الرسومات الفنية أيهما لاحق. في حالة عدم توافر العملة الأجنبية اللازمة لتوفير المكونات المستوردة بالبنوك المصرية يحق لباورلاين المطالبة بالسداد بالعملة الأجنبية.

مكان التوريد
تسليم في موقع المصنع Ex Works (EXW) بمدينة العاشر من رمضان.

تفويض الاستلام
يجب على العميل إرسال تفويض رسمي باسم المندوب المفوض باستلام اللوحات من مصانعنا بمدينة العاشر من رمضان. وفي حال تم التسليم في موقع العميل يجب كذلك وجود تفويض رسمي للشخص المفوض من قبل العميل باستلام اللوحات في الموقع.

غرامة التخزين
يحق لشركة باورلاين فرض غرامة (تكاليف تخزين) بقيمة 1% من إجمالي قيمة العقد في حالة تأخر العميل عن استلام المهمات من المصنع لمدة تزيد عن أسبوعين من تاريخ الإخطار بجاهزية المهمات أو تاريخ الاختبار أيهما لاحق.`;
export const DEFAULT_COMMERCIAL_TERMS_AR: TermsSection[] = DEFAULT_TERMS_TEXT_AR.split("\n\n").map((block) => {
  const [title, ...rest] = block.split("\n");
  return { title: title.trim(), body: rest.join("\n").trim() };
});

/** Default General Notes shown on the notes page (after the cover) — editable. */
export const DEFAULT_GENERAL_NOTES = [
  "Commercial offer is based on the Technical offer and any deviation may impact price",
  "PLP panels are 2mm thick",
  "SR-Basic/Unikit are 1.5mm thick cold rolled sheet steel IK10 (Mechanical Impact)",
  "Minicenter/Primo are 1mm thick cold rolled sheet steel IK07",
  "Design is based on straight enclosures unless mentioned beforehand",
];

export const DEFAULT_SECTIONS = ["Main Incoming", "Metering", "Outgoings"];
/** Migration: move Metering to just before Outgoings on existing panels (the
 *  default order changed). No-op if either is missing or already in order. */
export function meteringBeforeOutgoings(sections: string[]): string[] {
  const oi = sections.indexOf("Outgoings");
  const mi = sections.indexOf("Metering");
  if (oi === -1 || mi === -1 || mi < oi) return sections;
  const next = sections.filter((s) => s !== "Metering");
  next.splice(next.indexOf("Outgoings"), 0, "Metering");
  return next;
}
// Structural sections that can't be renamed or removed ("Other" and any
// user-added sections remain editable/removable).
export const FIXED_SECTIONS = ["Main Incoming", "Outgoings", "Metering"];

export function newPanel(_n?: number): LvPanel {
  return {
    id: uid(),
    name: "", // RPT-1: blank by default; mandatory before any output
    code: "",
    fedFrom: "",
    shortCircuit: "",
    qty: 1,
    ratingA: 0,
    ambTemp: "35°C",
    neutral: "50% Phase",
    earth: "25% Phase",
    copperType: "Bare",
    incomingCables: "Bottom",
    outgoingCables: "Bottom",
    form: "1",
    encFam: "SR-Basic",
    encKey: "",
    mainBusbarKg: 0,
    busbarPoles: 3,
    sellFactor: 0,
    copperTool: {},
    draft: "",
    sections: [...DEFAULT_SECTIONS],
    activeSection: DEFAULT_SECTIONS[0],
    components: [],
    sizingMode: "none",
    panelsSizing: { layout: "Single", family: "SR-Basic", sizing1: "", sizing2: "" },
    panelItems: [],
    cellConfig: defaultCellConfig(),
  };
}

/** The single "Spare parts" cell of a spare-parts QTN — a stripped panel that holds
 *  only components/enclosures (as rows) + a manual copper weight (mainBusbarKg). */
export function newSparePanel(): LvPanel {
  return { ...newPanel(), name: "Spare parts", spare: true, sections: ["Spare parts"], activeSection: "Spare parts" };
}

export function initialState(): LvState {
  return {
    project: {
      optyNo: "OPTY-00000", revisionNo: "", name: "", customer: "",
      date: new Date().toISOString().slice(0, 10),
      salesPerson: "", salesMobile: "", salesEmail: "",
      supportEngineer: "", salesManager: SALES_MANAGER,
      salesManagerMobile: "", salesManagerEmail: "",
    },
    factors: { ...DEFAULT_FACTORS },
    salesPeople: [...DEFAULT_SALES_PEOPLE],
    supportEngineers: [...DEFAULT_SUPPORT_ENGINEERS],
    panels: [],
    selectedId: null,
    notesGeneral: [...DEFAULT_GENERAL_NOTES],
    notesAdditional: [],
    commercialTerms: DEFAULT_COMMERCIAL_TERMS.map((s) => ({ ...s })),
    commercialTermsAr: DEFAULT_COMMERCIAL_TERMS_AR.map((s) => ({ ...s })),
    abbItemDiscounts: {},
    kind: "panels",
  };
}
/** Effective ABB-discount key for a component / material row (reference, else name). */
export const abbKey = (refOrName: { ref?: string; name?: string; reference?: string; description?: string }): string =>
  refOrName.ref || refOrName.reference || refOrName.name || refOrName.description || "";

/** Per-item EGP price of a component, honoring its Material-List ABB discount
 *  override (which takes priority over the global Pricing-Settings discount). */
export function itemPriceEgp(c: PanelComponent, s: LvState): number {
  const o = s.abbItemDiscounts[abbKey(c)];
  return componentPriceEgp(c, s.factors, o != null ? o / 100 : undefined);
}

// ── Persistence ──────────────────────────────────────────────────────────────
const LS_KEY = "powerline-lv-v1";
export function loadState(): LvState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return initialState();
    const s = JSON.parse(raw) as LvState;
    // forward-compat defaults (deep-merge project so new RPT-1 fields get defaults)
    return {
      ...initialState(),
      ...s,
      project: { ...initialState().project, ...s.project },
      factors: { ...DEFAULT_FACTORS, ...s.factors },
    };
  } catch {
    return initialState();
  }
}
export function saveState(s: LvState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* storage full/blocked — non-fatal */
  }
}

// ── Component helpers ────────────────────────────────────────────────────────
export function toPanelComponent(c: DbComponent, section: string, qty = 1, group?: string): PanelComponent {
  return {
    id: uid(), section, name: c.n, desc: c.d, ref: c.ref, type: c.t, brand: c.brand,
    rating: c.r, eur: c.eur, egp: c.egp, poles: c.poles, cuP: c.cuP, cuC: c.cuC,
    stock: c.stock, qty, adj: "", comment: "", note: "", group,
  };
}
/** For combo lines whose description didn't resolve to a DB component. */
export function freeComponent(desc: string, section: string, qty: number, group?: string): PanelComponent {
  return {
    id: uid(), section, name: desc, desc, ref: "", type: "Other", brand: "Other Supplier",
    rating: "", eur: 0, egp: 0, poles: 0, cuP: 0, cuC: 0, stock: "", qty,
    adj: "", comment: "", note: "", group,
  };
}
/** A blank spacer row used to separate component groups within a section. */
export function spacerComponent(section: string): PanelComponent {
  return {
    id: uid(), section, name: "", desc: "", ref: "", type: "", brand: "",
    rating: "", eur: 0, egp: 0, poles: 0, cuP: 0, cuC: 0, stock: "", qty: 0,
    adj: "", comment: "", note: "", spacer: true,
  };
}

/** RPT: incremental duplicate name — "PANEL 4" → "PANEL 4-1" → "PANEL 4-2" …
 *  Strips an existing "-N" (or legacy "(copy)") suffix so the series continues
 *  from the highest number already used for that base name. */
export function nextDuplicateName(srcName: string, panels: LvPanel[]): string {
  const base = srcName
    .replace(/\s*\(copy[^)]*\)\s*$/i, "") // legacy "(copy)" / "(copy 2)"
    .replace(/\s*-\s*\d+\s*$/, "")          // existing "-N"
    .trim();
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}\\s*-\\s*(\\d+)$`);
  let max = 0;
  for (const p of panels) {
    const m = p.name.trim().match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${base}-${max + 1}`;
}

export function duplicatePanel(p: LvPanel, name: string): LvPanel {
  return {
    ...structuredClone(p),
    id: uid(),
    name,
    components: p.components.map((c) => ({ ...c, id: uid() })),
  };
}

// ── Main-busbar copper (kg) — auto rule for sheet-metal panel systems ─────────
// Ref "Main busbar Cu (kg).xlsx": bar cross-section sized by the incomer rating,
// run the full panel height, one bar per pole. Copper density ≈ 9e-6 kg/mm³.
//   KG = Area(mm²) × PanelHeight(mm) × Poles × 0.000009   (× 2 for a Double panel)
const BUSBAR_AUTO_FAMILIES = new Set(["SR-Basic", "Unikit", "Local (Sheet Metal)"]);
/** Bar cross-section area (mm²) for an incomer rating, per the reference table. */
export function busbarBarAreaMm2(ratingA: number): number {
  if (ratingA <= 0) return 0;
  if (ratingA <= 160) return 20 * 5;   // 100 — up to 160 A
  if (ratingA <= 250) return 20 * 10;  // 200 — 200 / 250 A
  if (ratingA <= 300) return 25 * 10;  // 250 — 300 A
  if (ratingA <= 400) return 30 * 10;  // 300 — 400 A
  if (ratingA <= 630) return 40 * 10;  // 400 — 500 / 630 A
  if (ratingA <= 800) return 50 * 10;  // 500 — 800 A
  return 0; // > 800 A → panels not allowed (cells only)
}
/** Panel height (mm) = first dimension of the slot-1 enclosure name (H×W×D, opt. "L" prefix). */
function panelHeightMm(p: LvPanel): number {
  const slot1 = (p.panelItems ?? []).find((it) => (it.slot ?? 1) === 1);
  const m = slot1?.name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
/** Auto main-busbar copper weight (kg), or null when the rule doesn't apply / inputs missing. */
/** The family-based auto main-busbar weight (SR-Basic / Unikit / Local), ignoring any
 *  manual override — null when the panel/family/rating doesn't support the auto rule. */
export function mainBusbarAutoRaw(p: LvPanel): number | null {
  if (p.sizingMode !== "panels") return null;
  if (!BUSBAR_AUTO_FAMILIES.has(p.panelsSizing?.family ?? "")) return null;
  const area = busbarBarAreaMm2(p.ratingA);
  const height = panelHeightMm(p);
  if (!area || !height) return null;
  const poles = p.busbarPoles || 3;
  const dbl = p.panelsSizing.layout === "Double" ? 2 : 1;
  return area * height * poles * 0.000009 * dbl;
}
/** The EFFECTIVE auto weight — null when the panel isn't auto OR the user has overridden
 *  it (a confirmed manual entry), in which case the calc falls back to mainBusbarKg. */
export function mainBusbarAuto(p: LvPanel): number | null {
  return p.mainBusbarOverride ? null : mainBusbarAutoRaw(p);
}

// ── Calculation engine (mirrors the validated sample tool) ───────────────────
export interface PanelCalc {
  compCost: number;
  enclCost: number;
  cuConnCost: number;
  busbarCost: number;
  busbarKg: number;
  kits: number;
  cuWeight: number;
  unitCost: number;
  unitCostOps: number;
  sellUnit: number;
  totalSell: number;
}
export function findEnclosure(p: LvPanel): DbEnclosure | undefined {
  return ENCLOSURES.find((e) => e.fam === p.encFam && `${e.name}|${e.ref}` === p.encKey);
}
/** Assembly-kit rate as a fraction of the enclosure cost, per the enclosure / cell
 *  system (owner's rule):
 *    Minicenter · Primo · Pillars · Coffree → 0
 *    SR-Basic · Unikit · Local · PLP · IS2   → 10 %
 *    Pro-E                                   → 3 %
 *  Resolved from the panel family (Panels mode) or the cell type (Cells mode). */
export function kitRate(p: LvPanel): number {
  const fam =
    p.sizingMode === "cells" ? p.cellConfig.type :
    p.sizingMode === "panels" ? (p.panelsSizing?.family ?? "") : "";
  switch (fam) {
    case "SR-Basic":
    case "Unikit":
    case "Local (Sheet Metal)":
    case "PLP":
    case "IS2":
      return 0.10;
    case "Pro-E":
      return 0.03;
    default: // Minicenter, Primo, Pillars, Coffree, none
      return 0;
  }
}
// A component wired via BUSWAY (its NOTE contains "busway", any case, anywhere) carries
// extra connection copper: its copper weight is multiplied by this factor. Editable here
// without touching the formula.
export const BUSWAY_COPPER_FACTOR = 2;
export const buswayCopperMult = (note?: string): number =>
  /busway/i.test(note ?? "") ? BUSWAY_COPPER_FACTOR : 1;

export function calcPanel(p: LvPanel, f: Factors, abbDiscounts?: Record<string, number>): PanelCalc {
  // Spare-parts cell: components/enclosures (as rows) + manual copper weight only —
  // no enclosure sizing, kits, connection copper or operations markup.
  if (p.spare) {
    let compCost = 0;
    for (const c of p.components) {
      if (isSpacer(c)) continue;
      const ov = abbDiscounts?.[abbKey(c)];
      compCost += componentPriceEgp(c, f, ov != null ? ov / 100 : undefined) * c.qty;
    }
    const busbarKg = p.mainBusbarKg || 0;
    const busbarCost = busbarKg * f.copper;
    const unitCost = compCost + busbarCost;
    const factor = p.sellFactor > 0 ? p.sellFactor : f.factor;
    const sellUnit = factor > 0 ? unitCost / factor : unitCost;
    return { compCost, enclCost: 0, cuConnCost: 0, busbarCost, busbarKg, kits: 0, cuWeight: 0, unitCost, unitCostOps: unitCost, sellUnit, totalSell: sellUnit * p.qty };
  }
  let compCost = 0;
  let cuWeight = 0;
  // Cu connections use the cell copper column (cuC) in Cells mode, else the panel column (cuP).
  const cuKg = p.sizingMode === "cells" ? cuCellKg : cuPanelKg;
  for (const c of p.components) {
    if (isSpacer(c)) continue; // blank separator — no cost/copper
    // Per-item ABB discount override (Material List) wins over the global factor.
    const ov = abbDiscounts?.[abbKey(c)];
    compCost += componentPriceEgp(c, f, ov != null ? ov / 100 : undefined) * c.qty;
    // Busway-fed rows (NOTE contains "busway") carry extra connection copper.
    cuWeight += cuKg(c) * c.qty * buswayCopperMult(c.note);
  }
  // Enclosure cost: Panels mode → the chosen sizing items; Cells mode → the
  // priced cell rows (Pro-E/IS2/PLP). Either way it feeds the kit % below.
  let enclCost = 0;
  for (const it of p.panelItems ?? []) {
    // A per-item Material-List discount applies to any enclosure; without one, only ABB
    // enclosures follow the global discount (Pro-E / IS2 / PLP keep their list price).
    const base = it.eur > 0 ? it.eur * f.euro : it.egp;
    const isAbbEnc = !["Pro-E", "IS2", "PLP"].includes(it.fam);
    const ov = abbDiscounts?.[abbKey(it)];
    const frac = ov != null ? ov / 100 : isAbbEnc ? f.abbDiscount : 0;
    enclCost += base * (1 - frac) * it.qty;
  }
  if (p.sizingMode === "cells") {
    for (const r of p.cellConfig.rows) {
      if (r.qty <= 0) continue;
      // Cells honour a per-item Material-List discount too (keyed by description, like the list row).
      const ov = abbDiscounts?.[abbKey({ description: r.desc })];
      enclCost += cellPriceEgp(p.cellConfig.type, r.desc, f) * (1 - (ov != null ? ov / 100 : 0)) * r.qty;
    }
  }
  const cuConnCost = cuWeight * f.copper;
  // Main busbar: auto rule for sheet-metal panels, else the manual entry.
  // Copper TYPE (Bare / Tin-plated / Silver-Plated Connections / Raychem) adds a
  // plating premium on the busbar weight — the Cu-connection copper is unaffected.
  const busbarKg = mainBusbarAuto(p) ?? (p.mainBusbarKg || 0);
  const busbarCost = busbarKg * f.copper * copperTypeFactor(p.copperType);
  // Kit = a % of the enclosure cost, per system (see kitRate).
  const kits = enclCost * kitRate(p);
  const unitCost = compCost + enclCost + cuConnCost + busbarCost + kits;
  const unitCostOps = unitCost * (1 + f.operations);
  // Per-panel selling factor overrides the global (Pricing Settings) when set (> 0).
  const factor = p.sellFactor > 0 ? p.sellFactor : f.factor;
  const sellUnit = factor > 0 ? unitCostOps / factor : unitCostOps;
  return { compCost, enclCost, cuConnCost, busbarCost, busbarKg, kits, cuWeight, unitCost, unitCostOps, sellUnit, totalSell: sellUnit * p.qty };
}
export function grandTotals(s: LvState) {
  let sell = 0;
  s.panels.forEach((p) => (sell += calcPanel(p, s.factors, s.abbItemDiscounts).totalSell));
  const vat = sell * s.factors.vat;
  return { sell, vat, incl: sell + vat };
}


// ── Material List (RPT-04) ───────────────────────────────────────────────────
// Aggregate across all panels (× panel qty), group identical references, and
// split into the 7 mandated tables.
export interface MatRow {
  supplier: string;
  description: string;
  reference: string;
  name?: string; // ABB-discount key fallback (enclosures whose reference is blank)
  stock: string;
  qty: number;
  eur?: number; // ABB EUR list price (>0 ⇒ supplied from ABB ⇒ eligible for the ABB discount)
}
export interface MaterialList {
  abb: MatRow[];
  other: MatRow[];
  plpCells: MatRow[];
  abbEnclosures: MatRow[];
  is2: MatRow[];
  proE: MatRow[];
  copperKg: number;
}

export function buildMaterialList(s: LvState): MaterialList {
  const agg = new Map<string, MatRow>();
  const add = (key: string, row: MatRow) => {
    const ex = agg.get(key);
    if (ex) ex.qty += row.qty;
    else agg.set(key, { ...row });
  };
  let copperKg = 0;

  for (const p of s.panels) {
    const mult = p.qty || 1;
    const cuKg = p.sizingMode === "cells" ? cuCellKg : cuPanelKg; // cell vs panel copper column
    for (const c of p.components) {
      if (isSpacer(c)) continue; // blank separator — never a material line
      add(`c|${c.ref || c.name}`, {
        supplier: c.brand || "ABB",
        description: c.name,
        reference: c.ref,
        stock: c.stock,
        qty: c.qty * mult,
        eur: c.eur,
      });
      copperKg += cuKg(c) * c.qty * mult * buswayCopperMult(c.note); // busway rows carry extra copper
    }
    for (const it of p.panelItems ?? []) {
      add(`e|${it.ref || it.name}`, {
        supplier: ["Pro-E", "IS2", "PLP"].includes(it.fam) ? it.fam : "ABB Enclosure",
        description: `${it.fam} — ${it.name}`,
        reference: it.ref,
        name: it.name, // keeps the ABB-discount key aligned with calcPanel's abbKey(it)
        stock: "",
        qty: it.qty * mult,
        eur: it.eur,
      });
    }
    copperKg += (mainBusbarAuto(p) ?? (p.mainBusbarKg || 0)) * mult;
    // Sizing & Copper cell tables → their own supplier buckets
    if (p.sizingMode === "cells") {
      for (const r of p.cellConfig.rows) {
        if (r.qty > 0)
          add(`cell|${p.cellConfig.type}|${r.desc}`, {
            supplier: p.cellConfig.type,
            description: r.desc,
            reference: "",
            stock: "",
            qty: r.qty * mult,
          });
      }
    }
  }

  const rows = [...agg.values()];
  const isEnc = (r: MatRow) => r.supplier === "ABB Enclosure";
  // "Supplied from ABB" = an ABB-branded item priced off ABB's EUR import list (eur > 0).
  // ABB-branded items priced directly in EGP are locally sourced → they join every other
  // non-ABB brand in the "Other Suppliers" table.
  const isAbbSupplied = (r: MatRow) => r.supplier === "ABB" && (r.eur ?? 0) > 0;
  return {
    abb: rows.filter((r) => isAbbSupplied(r) && !isEnc(r)),
    other: rows.filter((r) => !["Pro-E", "IS2", "PLP"].includes(r.supplier) && !isEnc(r) && !isAbbSupplied(r)),
    plpCells: rows.filter((r) => r.supplier === "PLP"),
    abbEnclosures: rows.filter(isEnc),
    is2: rows.filter((r) => r.supplier === "IS2"),
    proE: rows.filter((r) => r.supplier === "Pro-E"),
    copperKg,
  };
}

// ── Pre-export validation (Technical / Commercial offers) ────────────────────
export interface ExportCheck { title: string; items: string[] }
/** Runs the pre-export checks across all panels. Returns the FAILING checks
 *  (empty array = clear to export):
 *   0. Highlighted — panels flagged with the sidebar highlighter, surfaced so they're
 *                    reviewed before exporting (shown even with no other issue).
 *   1. Zero price   — a real component priced at 0 (spare "Space" items excluded).
 *   2. No cells     — a Cells-mode panel with no editable cell qty (fixed Sides ignored).
 *   3. Missing copper — recommended Phase/Neutral/Earth (per the incomer) not entered
 *                       in the Copper Tool, or the panel's busbar weight is 0. */
export function exportBlockers(s: LvState): ExportCheck[] {
  const zeroPrice: string[] = [];
  const noCells: string[] = [];
  const missingCopper: string[] = [];
  const highlighted: string[] = []; // panels flagged with the sidebar highlighter
  s.panels.forEach((p, i) => {
    const label = `Panel ${i + 1}${p.name.trim() ? ` (${p.name.trim()})` : ""}`;
    if (p.highlight) highlighted.push(label);
    // A highlighted panel carries a 🖍️ marker on any other warning it raises.
    const tag = p.highlight ? `🖍️ ${label}` : label;
    // 1) Zero price
    for (const c of p.components) {
      if (isSpacer(c) || c.type === "Space") continue;
      if (itemPriceEgp(c, s) <= 0) zeroPrice.push(`${tag}: ${c.name || c.ref || "item"} — 0 EGP`);
    }
    // Spare-parts cell: no sizing / cells / busbar rules to check.
    if (p.spare) return;
    // 2) No cells (Cells mode, ignoring the fixed Sides row)
    if (p.sizingMode === "cells" && !p.cellConfig.rows.some((r) => r.qty > 0 && !r.locked)) {
      noCells.push(`${tag}: no cell quantity selected`);
    }
    // 3) Missing copper — recommend a Phase / Neutral / Earth length. The Copper Tool
    // highlights the recommended rating row, but that highlight is only a suggestion:
    // the check passes as long as SOME length is entered in that column (at any rating
    // row), not necessarily in the highlighted cell.
    const reasons: string[] = [];
    if (p.sizingMode === "cells" && (p.ratingA || 0) > 0) {
      const rows = Object.values(p.copperTool ?? {});
      const anyLen = (k: "p" | "n" | "e") => rows.some((r) => (r?.[k] || 0) > 0);
      const unfilled = ([["Phase", "p"], ["Neutral", "n"], ["Earth", "e"]] as [string, "p" | "n" | "e"][])
        .filter(([, k]) => !anyLen(k)).map(([lbl]) => lbl);
      if (unfilled.length) reasons.push(`${unfilled.join(" / ")} length not entered`);
    }
    if ((mainBusbarAuto(p) ?? (p.mainBusbarKg || 0)) <= 0) reasons.push("busbar weight is 0");
    if (reasons.length) missingCopper.push(`${tag}: ${reasons.join("; ")}`);
  });
  const out: ExportCheck[] = [];
  if (highlighted.length) out.push({ title: "🖍️ Highlighted panels", items: highlighted });
  if (zeroPrice.length) out.push({ title: "Zero price", items: zeroPrice });
  if (noCells.length) out.push({ title: "No cells selected", items: noCells });
  if (missingCopper.length) out.push({ title: "Missing copper", items: missingCopper });
  return out;
}

// ── Search ───────────────────────────────────────────────────────────────────
// Strict, progressive AND-filter + relevance ranking for the component search box.
// The query is split into space-separated tokens; a component matches only when its
// full text (name + desc + reference + type + family + rating + brand) contains EVERY
// token (case-insensitive) — so typing more tokens narrows the list, and once "250"
// is typed a 125A-only item drops unless it also contains "250".
// Ranking (best first) is scored against the DESCRIPTION (c.n):
//   0 starts with the whole query · 1 contains the query as one phrase ·
//   2 starts with the first token · 3 first token at a word start · 4 contains it ·
//   5 first token only matched via reference/type/rating.
// Ties: earlier match position, then shorter description, then alphabetical.
export function searchComponents(q: string, limit = 50): DbComponent[] {
  const raw = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return [];
  const terms = raw.split(" ");
  const first = terms[0];
  const atWordStart = new RegExp(`(^|[^a-z0-9])${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  // A bare number ("16", "20", "25") reads as an ampere rating → float S200-series MCBs
  // (miniature circuit breakers) of exactly that rating to the very top (16 → S201-C16).
  const ratingQuery = /^\d+(?:\.\d+)?$/.test(raw) ? parseFloat(raw) : NaN;
  const scored: { c: DbComponent; score: number; pos: number }[] = [];
  for (const c of COMPONENTS) {
    const hay = `${c.n} ${c.d} ${c.ref} ${c.t} ${c.f} ${c.r} ${c.brand}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue; // strict AND across all tokens
    const desc = (c.n || "").toLowerCase();
    if (!Number.isNaN(ratingQuery) && parseFloat(c.r) === ratingQuery && /miniature circuit breaker/i.test(c.n)) {
      // Among same-rating MCBs, surface the canonical S200-series base first (S201-C16 →
      // S202/S203/S204 → the M / other series), preferring the C curve.
      const m = (c.f || "").toUpperCase().match(/^S20(\d)(M?)/);
      let pref = m ? (m[2] ? 20 : 0) + parseInt(m[1], 10) : 60;
      if (!/-C\d/i.test(c.n)) pref += 5; // prefer the C tripping curve
      scored.push({ c, score: -1, pos: pref });
      continue;
    }
    const phrase = desc.indexOf(raw);
    let score: number;
    if (desc.startsWith(raw)) score = 0;
    else if (phrase >= 0) score = 1;
    else if (desc.startsWith(first)) score = 2;
    else if (atWordStart.test(desc)) score = 3;
    else if (desc.includes(first)) score = 4;
    else score = 5;
    const pos = phrase >= 0 ? phrase : desc.indexOf(first) >= 0 ? desc.indexOf(first) : 1e9;
    scored.push({ c, score, pos });
  }
  scored.sort((a, b) =>
    a.score - b.score || a.pos - b.pos || a.c.n.length - b.c.n.length || a.c.n.localeCompare(b.c.n)
  );
  return scored.slice(0, limit).map((x) => x.c);
}
