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
  cuPanelKg,
  cuCellKg,
  cellPriceEgp,
  enclosurePriceEgp,
  copperTypeFactor,
  findByName,
  findCellEnclosure,
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
  comboId?: string; // instance id shared by every row of one committed combination (ATS/Sync/…) → whole-combo select
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
  /** Co-Work: which user owns/edits this panel (the QTN owner or its co-owner). Absent
   *  on non-co-work QTNs and legacy panels — treated as the primary owner. */
  ownerId?: string;
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
  // "Standard Panels" view (Components card) — the choices that define a standard panel.
  stdTrKva?: string;      // transformer rating, kVA
  stdPfc?: string;        // "Yes" | "No" — power-factor correction included
  stdOutgoings?: string;  // "C.B" | "SWF" — outgoing device type
  // Set once a STANDARD (EDMS) panel has been changed away from its standard (a
  // component/sizing/copper edit — not "Build this panel"). Drives the extra recheck
  // confirmation shown when the quotation is sent for approval; cleared by rebuilding
  // from the standard or reverting the change.
  edmsEdited?: boolean;
  spare?: boolean;        // this cell is the Spare-parts list (no sizing/specs; components + copper only)
  spareKind?: string;     // which spare-list variant the cell is: "spare" | "lcp" | "kwhm"
  noGroups?: number;      // LCP: control groups / KWHM: number of meters — drives auto-fill + auto-sizing
  content?: string;       // KWHM: what each meter unit contains (KWHM / KWHM+MDRC / KWHM+MOULDED_CASE)
  cablesEgp?: number;     // LCP/KWHM: cables cost, EGP — manual
  lcpBox?: { H: number; W: number; D: number }; // LCP/KWHM: chosen SR-Basic box (auto-sized, editable)
  lcpBox2?: { H: number; W: number; D: number }; // LCP/KWHM: 2nd enclosure box (Double layout only)
  // LCP/KWHM: enclosure chosen by catalogue reference instead of by size. Primo, Minicenter,
  // Pro-E and IS2 name their boxes by capacity ("3PH-E-KWHM", "24 line") and carry no
  // dimensions at all, so H×W×D cannot address them. When set, the reference wins over
  // lcpBox and prices the panel directly from that catalogue row.
  lcpEnclRef?: string;
  lcpEnclRef2?: string; // second enclosure (Double layout)
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
/** One line of the Sizing Review worksheet: a label and an arithmetic expression. */
export interface SizingReviewRow {
  id: string;
  label: string;
  expr: string;
}
/**
 * One hand-written line on a Custom Commercial Offer.
 *
 * `unitPrice` is EGP, like every other price held in the state. The Commercial tab
 * converts for display, so the USD/EGP toggle behaves exactly as it does on a panel
 * quotation instead of silently re-reading the same number as a different currency.
 */
export interface CustomOfferItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
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
  // Manual page breaks in the Technical Offer: component ids before which the offer
  // starts a new A4 page (with any section/group header that leads the component). Lets
  // the estimator balance pages instead of accepting a near-empty auto-break tail.
  offerPageBreaks?: string[];
  // Sizing Review worksheet — a saved calculation pad (see the "Sizing Review" tab) where
  // a reviewer records the sizing check (outgoings / incoming / …) as labelled calculation
  // lines plus a conclusion. Written through its own endpoint so it can be edited while the
  // quotation is locked for approval.
  sizingReview?: { rows: SizingReviewRow[]; notes: string };
  // QTN kind chosen at creation: a normal panel quotation, a Standard EDMS
  // quotation (same workspace as "panels" — the kind only records which option
  // it was started from), or a spare-parts quotation whose single "Spare parts"
  // cell drives all offers.
  kind?: "panels" | "edms" | "spare" | "custom";
  /** Commercial Offer lines typed by hand. Only a "custom" quotation uses these — it
   *  has no panels, so the offer table is written rather than generated from them. */
  customItems?: CustomOfferItem[];
  // Free-form sticky notes on the "Summary" tab (draggable/editable annotations).
  summaryNotes?: SummaryNote[];
  // Free-text "Record Results" box on the Pricing Settings tab.
  recordResults?: string;
  /** The published price-list version this quotation's prices were last brought up
   *  to via "Apply changes" (the changelog re-price). Drives the "Prices updated"
   *  mark in the QTN history; absent until the estimator applies a price list. */
  pricesAppliedVersion?: number;
  /** Currency the Commercial Offer is quoted in. Lives on the quotation rather than
   *  in the tab's own state so the ERP export can quote in the same currency the
   *  customer was — otherwise the offer said USD and the CSV said EGP. */
  offerCurrency?: "USD" | "EGP";
  // ── Specs tab ──────────────────────────────────────────────────────────────
  // Project-wide values for the panel fields that are normally the same across a
  // job. Setting one here writes it onto every panel at once; a panel can still
  // be changed individually afterwards (this only records what was last chosen
  // project-wide, and seeds panels added later).
  projectSpecs?: ProjectSpecs;
  // Does the job call for a selectivity (coordination) study? Project-wide, so
  // unlike the fields above it is not copied onto the panels.
  selectivityRequired?: string; // "Yes" | "No"
  specs?: SpecNote[];          // project specification entries
  clientComments?: SpecNote[]; // the client's comments/requirements
}
export const YES_NO = ["No", "Yes"] as const;
// ── "Standard Panels" option lists (Components card → Standard Panels) ───────
export const STD_TR_KVA = ["500", "800", "1000", "1500/1600", "2000", "2500"] as const;
/** The transformer sizes Standard EDMS has a standard panel for. Listed explicitly
 *  rather than derived from STD_TR_KVA: that list carries "1500/1600", which is not
 *  a key any standard is filed under, so it could be picked and never match. */
export const STD_TR_KVA_EDMS: readonly string[] = [
  "300", "500", "800", "1000", "1600", "2000", "2500",
];
/** The size a panel starts on — the same on every QTN kind, so adding a smaller
 *  option to one of the lists doesn't quietly move the default. */
export const STD_TR_KVA_DEFAULT = "500";
export const STD_OUTGOINGS = ["C.B", "SWF", "None"] as const;
/** One entry on the Specs tab — a header (e.g. "MCB") with sub-titles under it.
 *  Used for both the project spec and the client's comments. */
export interface SpecNote {
  id: string;
  title: string;         // the header, e.g. "MCB"
  text: string;          // free note under the header — only shown when it holds text
  items?: SpecSubNote[]; // the sub-titles beneath the header
}
/** A sub-title under a Specs header. */
export interface SpecSubNote {
  id: string;
  title: string; // the sub-title, e.g. "Breaking capacity"
  text: string;  // its body — multi-line
}
/** The spec headers a new quotation starts with. */
export const DEFAULT_SPEC_HEADERS = [
  "MCB", "MCCB up to 250A", "MCCB 400A and higher", "ACB",
] as const;
export const defaultSpecs = (): SpecNote[] =>
  DEFAULT_SPEC_HEADERS.map((title) => ({ id: uid(), title, text: "", items: [] }));
/** The panel fields the Specs tab drives project-wide. Same keys as LvPanel. */
export const PROJECT_SPEC_FIELDS = [
  "ambTemp", "form", "neutral", "earth", "copperType", "incomingCables", "outgoingCables",
] as const;
export type ProjectSpecKey = (typeof PROJECT_SPEC_FIELDS)[number];
export type ProjectSpecs = Partial<Record<ProjectSpecKey, string>>;
/** Overlay the project-wide Specs defaults onto a panel — only the keys actually
 *  set there, so an untouched field keeps the panel's own value. Used when a panel
 *  is added after the specs were chosen. */
export function withProjectSpecs(panel: LvPanel, specs?: ProjectSpecs): LvPanel {
  if (!specs) return panel;
  const out = { ...panel };
  for (const k of PROJECT_SPEC_FIELDS) {
    const v = specs[k];
    if (v) out[k] = v;
  }
  return out;
}
/** A draggable, resizable sticky note on the Summary tab. */
export interface SummaryNote {
  id: string;
  text: string;
  color: string; // palette key — amber | green | blue | pink | slate
  x: number;     // px position within the board
  y: number;
  w?: number;    // px size (drag the corner to resize); defaults applied in the UI
  h?: number;
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
export const SPARE_KIND_LABELS: Record<string, string> = { spare: "Spare parts", lcp: "LCP", kwhm: "KWHM" };
export const SPARE_KIND_ICONS: Record<string, string> = { spare: "🧰", lcp: "🎛️", kwhm: "🔢" };
export function newSparePanel(kind = "spare"): LvPanel {
  const label = SPARE_KIND_LABELS[kind] ?? "Spare parts";
  const base = newPanel();
  const panel: LvPanel = { ...base, name: label, spare: true, spareKind: kind, sections: [label], activeSection: label };
  // KWHM defaults to the Local (Sheet Metal) enclosure family.
  if (kind === "kwhm") panel.panelsSizing = { ...base.panelsSizing, family: "Local (Sheet Metal)" };
  return panel;
}

// ── LCP (Lighting Control Panel) ────────────────────────────────────────────────
// Each control GROUP is a fixed set of pilot lights, pushbuttons and terminals.
// Entering "No. Groups" (G) auto-fills the component list with this set × G.
export const LCP_GROUP_PARTS: { qty: number; name: string }[] = [
  { qty: 1, name: "Pilot Light Green LED 230V AC" },
  { qty: 1, name: "Pilot Light Red LED 230V AC" },
  { qty: 1, name: "CP1-10G-10 Pushbutton" },
  { qty: 1, name: "CP1-10R-01 Pushbutton" },
  { qty: 2, name: "Terminal Block" }, // ELECON00087 — renamed from "Screw Terminal 4mm"
];
/** The per-group control set × n groups, resolved to priced component rows. */
export function lcpGroupComponents(n: number): PanelComponent[] {
  const out: PanelComponent[] = [];
  if (!(n > 0)) return out;
  for (const part of LCP_GROUP_PARTS) {
    const db = findByName(part.name);
    if (db) out.push(toPanelComponent(db, "LCP", part.qty * n));
  }
  return out;
}

// ── KWHM (kWh-meter panel) ───────────────────────────────────────────────────
// A KWHM panel is sized/priced like an LCP but counts meters ("No. KWHM") and each
// meter's "Content" says what it carries.
export const KWHM_CONTENTS: string[] = ["KWHM", "KWHM+MDRC", "KWHM+MOULDED_CASE"];

// KWHM auto-sizing: meters per row depends on the box width; the box height grows 40 cm per
// row, then per-Content extras (a breaker allowance + 30 cm clearance) round it UP to a
// stocked height, and the depth is the smallest stocked depth ≥ the Content minimum.
export interface KwhmBuild { W: number; perRow: number; N: number; H: number; D: number; fam: string; }
const KWHM_WIDTHS = [400, 600, 800, 1000];   // 40 / 60 / 80 / 100 cm
const KWHM_PER_ROW = [1, 2, 3, 4];           // KWHM-3P meters per row at each width
// Per-Content sizing extras: cbHeight = extra mm of height for the breaker, minDepth = the
// minimum box depth (mm). KWHM+MOULDED_CASE has no rule yet.
// Per-Content sizing extras (mm): cbFixed = one-off breaker height; cbPerRow = breaker height
// added per KWHM row; minDepth = minimum box depth.
interface KwhmCfg { cbFixed: number; cbPerRow: number; minDepth: number; }
const KWHM_CONTENT_CFG: Record<string, KwhmCfg> = {
  "KWHM": { cbFixed: 0, cbPerRow: 0, minDepth: 200 },
  "KWHM+MDRC": { cbFixed: 200, cbPerRow: 0, minDepth: 250 },        // MDRC: one 20 cm breaker section
  "KWHM+MOULDED_CASE": { cbFixed: 0, cbPerRow: 400, minDepth: 300 }, // MCCB ≤125A: 40 cm per KWHM row
};
export function kwhmContentCfg(content: string): KwhmCfg | null {
  return KWHM_CONTENT_CFG[content] ?? null;
}
/** One candidate box per width for `meters` KWHM-3P: rows N = ⌈meters ÷ per-row⌉, zone = N × 40
 *  cm; height = zone + the breaker allowance + 30 cm clearance, rounded UP to the smallest
 *  stocked height; depth = the smallest stocked depth ≥ the Content minimum. */
export function kwhmBuilds(meters: number, content: string, fam: string): KwhmBuild[] {
  const cfg = KWHM_CONTENT_CFG[content];
  const out: KwhmBuild[] = [];
  if (!cfg || !(meters > 0)) return out;
  const own = lcpSizes(fam);
  const srb = fam === "SR-Basic" ? own : lcpSizes("SR-Basic"); // SR-Basic stocks every width — fill gaps
  // Smallest stocked box in a pool with the given width and enough height + depth.
  const pick = (sizes: LcpBox[], W: number, target: number): { H: number; D: number } | null => {
    const atW = sizes.filter((s) => s.W === W && s.H >= target).sort((a, b) => a.H - b.H);
    if (!atW.length) return null;
    const H = atW[0].H;
    const depths = sizes.filter((s) => s.H === H && s.W === W && s.D >= cfg.minDepth).map((s) => s.D).sort((a, b) => a - b);
    return depths.length ? { H, D: depths[0] } : null;
  };
  for (let i = 0; i < KWHM_WIDTHS.length; i++) {
    const W = KWHM_WIDTHS[i];
    const perRow = KWHM_PER_ROW[i];
    const N = Math.ceil(meters / perRow);
    const zone = N * 400;                                         // module rows × 40 cm
    const target = zone + cfg.cbFixed + cfg.cbPerRow * N + 300;   // + breaker section + 30 cm clearance
    // Prefer the panel's family; if it doesn't stock this width tall enough (e.g. Local has
    // no 600-wide box ≥ ~1100 mm → 4 KWHM at 2/row), fall back to SR-Basic for that width.
    let hit = pick(own, W, target);
    let usedFam = fam;
    if (!hit && fam !== "SR-Basic") { hit = pick(srb, W, target); usedFam = "SR-Basic"; }
    if (!hit) continue;
    out.push({ W, perRow, N, H: hit.H, D: hit.D, fam: usedFam });
  }
  return out;
}
/** KWHM auto-sizing: Content = KWHM & 1 meter → 400×300×150; otherwise the lowest-priced
 *  candidate box for the Content. Returns null for Content types without a rule yet. */
export function kwhmAutoSize(meters: number, content: string, fam: string): { box: LcpBox | null; family: string } {
  if (!KWHM_CONTENT_CFG[content]) return { box: null, family: fam };
  const sizes = lcpSizes(fam);
  if (content === "KWHM" && meters <= 1) {
    const one = sizes.filter((s) => s.H === 400 && s.W === 300).sort((a, b) => a.D - b.D)[0];
    return { box: one ?? { H: 400, W: 300, D: 150 }, family: fam };
  }
  // Cheapest candidate across widths — each priced in the family its box came from
  // (a width the panel family lacks is filled from SR-Basic, and wins the family too).
  let best: LcpBox | null = null, bestFam = fam, bestEur = Infinity;
  for (const b of kwhmBuilds(meters, content, fam)) {
    const box = { H: b.H, W: b.W, D: b.D };
    const eur = lcpBoxEur(box, b.fam);
    if (eur < bestEur) { bestEur = eur; best = box; bestFam = b.fam; }
  }
  return { box: best, family: bestFam };
}

// LCP auto-sizing (SR-Basic). Groups G → rows N → standard height H → the four
// candidate widths (40/60/80/100 cm ⇒ 2/3/4/5 groups per row), each snapped to a
// valid SR-Basic box via the height↔width coupling, then the cheapest is picked.
// Validated against the owner's table (G = 6/8/10/20/30/40/44/55/70).
export interface LcpBox { H: number; W: number; D: number; }
// N (rows) → standard box height (mm): H = (2N−1)×6+20 cm, rounded up to a stock height.
const LCP_HEIGHT_BY_ROWS: Record<number, number> = {
  1: 300, 2: 400, 3: 500, 4: 700, 5: 800, 6: 1000, 7: 1000, 8: 1200,
  9: 1400, 10: 1400, 11: 1600, 12: 1600, 13: 1800, 14: 2000, 15: 2000,
};
const LCP_WIDTHS = [400, 600, 800, 1000]; // 40/60/80/100 cm → 2/3/4/5 groups per row
const lcpMinWidth = (H: number) => (H <= 500 ? 400 : H <= 700 ? 500 : H <= 1200 ? 600 : 800);
// Box minimum depth (mm) from the depth table (before any component override).
const lcpDepth = (H: number, W: number) =>
  W <= 500 ? 200 : W === 600 ? (H <= 800 ? 200 : 250) : W === 800 ? (H <= 1200 ? 250 : 300) : 300;
export const LCP_MAX_ROWS = 15;   // single-panel ceiling (H 2000 mm)
export interface LcpBuild extends LcpBox { N: number; base: number; }
/** All geometrically-valid SR-Basic boxes for G groups, one per candidate width. */
export function lcpBuilds(G: number): LcpBuild[] {
  const out: LcpBuild[] = [];
  if (!(G > 0)) return out;
  for (let i = 0; i < LCP_WIDTHS.length; i++) {
    const N = Math.ceil(G / (LCP_WIDTHS[i] / 200));
    if (N > LCP_MAX_ROWS) continue;                 // needs a multi-panel split
    const H = LCP_HEIGHT_BY_ROWS[N];
    if (!H || H > 2000) continue;
    const W = Math.max(LCP_WIDTHS[i], lcpMinWidth(H)); // snap: too narrow for its height → widen
    out.push({ base: i, N, H, W, D: lcpDepth(H, W) });
  }
  return out;
}
/** The recommended SR-Basic box for G groups — the LOWEST-PRICED candidate (one real box
 *  per width, each already holding all G groups). SR-Basic price = list EUR × the euro rate
 *  (same rate for every box), so the cheapest is found by comparing list EUR — no factors
 *  needed. Returns null if G needs a multi-panel split. */
export function lcpAutoSize(G: number, fam = "SR-Basic"): LcpBox | null {
  const builds = lcpBuilds(G);
  if (!builds.length) return null;
  let best: LcpBox | null = null;
  let bestEur = Infinity;
  for (const b of builds) {
    const real = lcpRealBox({ H: b.H, W: b.W, D: b.D }, fam);   // snap to a stocked size in this family
    const eur = lcpBoxEur(real, fam);
    if (eur < bestEur) { bestEur = eur; best = real; }
  }
  return best;
}
/** List EUR of the standard SKU for a size in a family — the basis for cheapest-price sizing
 *  (catalogue price = eur × the euro rate, so ranking by eur == ranking by price). */
function lcpBoxEur(box: LcpBox, fam = "SR-Basic"): number {
  let std = 0;
  let any = 0;
  for (const e of ENCLOSURES) {
    if (e.fam !== fam) continue;
    const nm = (e.name || "").trim();
    const d = parseEnclDims(nm);
    if (!d || d.H !== box.H || d.W !== box.W || d.D !== box.D) continue;
    const price = e.eur > 0 ? e.eur : e.egp;
    if (price <= 0) continue;
    if (/^\d/.test(nm) && std === 0) std = price;
    if (any === 0 || price < any) any = price;
  }
  return std > 0 ? std : any > 0 ? any : Infinity;
}
/** The SR-Basic box for a panel — stored, else recomputed from No. Groups. */
export function lcpBoxOf(p: LvPanel): LcpBox | null {
  if (p.lcpBox) return p.lcpBox;
  if (!p.noGroups) return null;
  const fam = p.panelsSizing?.family ?? "SR-Basic";
  if (p.spareKind === "kwhm") {
    const content = p.content ?? KWHM_CONTENTS[0];
    // kwhmAutoSize already falls back to SR-Basic per width for boxes the family lacks.
    return kwhmAutoSize(p.noGroups, content, fam).box;
  }
  return lcpAutoSize(p.noGroups, fam);
}
// The SR-Basic box has no catalogue price, so it is costed by weight: outer sheet
// area × gauge × steel density × the sheet-metal rate (EGP/kg, Pricing Settings).
const STEEL_KG_PER_M2_PER_MM = 7.85;
export const LCP_SHEET_THICKNESS_MM = 2;
export function lcpEnclosureKg(box: LcpBox): number {
  const areaM2 = (2 * (box.H * box.W + box.H * box.D + box.W * box.D)) / 1e6;
  return areaM2 * LCP_SHEET_THICKNESS_MM * STEEL_KG_PER_M2_PER_MM;
}
/** Auto enclosure cost (EGP) for the box, from the sheet-metal rate. */
export function lcpEnclosureAuto(box: LcpBox | null | undefined, f: Factors): number {
  return box ? lcpEnclosureKg(box) * (f.sheetMetal || 0) : 0;
}
/** LCP enclosure cost from the catalogue price list — the SAME price the box carries in
 *  Panels mode. SR-Basic ships two SKUs per size: the standard one (name "HxWxD") and a
 *  "new HxWxD" variant; Panels prices the standard SKU, so LCP uses it too. Dims are parsed
 *  from the name (SR-Basic prices live in EUR). Falls back to any priced match, then to the
 *  sheet-metal price only if the size isn't priced at all. */
export function lcpEnclosureDbPrice(box: LcpBox | null | undefined, f: Factors, fam = "SR-Basic"): number {
  if (!box) return 0;
  let std = 0;   // standard SKU (name starts with the dimensions, no "new" prefix)
  let any = 0;   // any priced box of that size — fallback
  for (const e of ENCLOSURES) {
    if (e.fam !== fam) continue;
    const nm = (e.name || "").trim();
    const d = parseEnclDims(nm);
    if (!d || d.H !== box.H || d.W !== box.W || d.D !== box.D) continue;
    const price = enclosurePriceEgp(e, f);
    if (price <= 0) continue;
    if (/^\d/.test(nm) && std === 0) std = price;
    if (any === 0 || price < any) any = price;
  }
  return std > 0 ? std : any > 0 ? any : lcpEnclosureAuto(box, f);
}
/** LCP: the 2nd enclosure box (Double layout only). No default — the double-panel split
 *  rule is undefined, so the second size is never auto-recommended (stays manual). */
export function lcpBox2Of(p: LvPanel): LcpBox | null {
  return p.panelsSizing?.layout === "Double" ? (p.lcpBox2 ?? null) : null;
}
/** Every box in a family that is named rather than dimensioned — Primo "3PH-E-KWHM",
 *  Minicenter, Pro-E, IS2. These can only be addressed by catalogue reference, which is
 *  why lcpSizes() (which parses H×W×D out of the name) returns nothing for them. */
export function lcpNamedBoxes(fam: string): DbEnclosure[] {
  return ENCLOSURES.filter((e) => e.fam === fam && !parseEnclDims(e.name) && (e.eur > 0 || e.egp > 0));
}
/** A catalogue enclosure by reference (the LCP/KWHM reference-picked box). */
export const lcpEnclByRef = (ref?: string): DbEnclosure | undefined =>
  ref ? ENCLOSURES.find((e) => e.ref === ref) : undefined;
/** EGP price of a reference-picked enclosure; 0 when the reference no longer resolves. */
export function lcpRefPriceEgp(ref: string | undefined, f: Factors): number {
  const e = lcpEnclByRef(ref);
  return e ? enclosurePriceEgp(e, f) : 0;
}
/** LCP enclosure cost — the catalogue (price-list) cost of the chosen box(es) in the panel's
 *  enclosure family; Double sums both. A reference-picked box wins over the sized one. */
export function lcpEnclosureEgp(p: LvPanel, f: Factors): number {
  const fam = p.panelsSizing?.family ?? "SR-Basic";
  const one = p.lcpEnclRef ? lcpRefPriceEgp(p.lcpEnclRef, f) : lcpEnclosureDbPrice(lcpBoxOf(p), f, fam);
  const two =
    p.panelsSizing?.layout === "Double"
      ? p.lcpEnclRef2
        ? lcpRefPriceEgp(p.lcpEnclRef2, f)
        : lcpEnclosureDbPrice(lcpBox2Of(p), f, fam)
      : 0;
  return one + two;
}
/** Parse H×W×D (mm) from an enclosure name — dims aren't in the DB H/W/D fields. Handles
 *  the SR-Basic "new" prefix, the Local "L" prefix, PLP "… 2000 x 400 x 700mm", etc. Returns
 *  null for families whose names carry no dimensions (Minicenter / Primo / Pro-E / IS2). */
export function parseEnclDims(name: string): LcpBox | null {
  const m = (name || "").replace(/^new/i, "").match(/(\d+)\s*[xX×]\s*(\d+)\s*[xX×]\s*(\d+)/);
  return m ? { H: +m[1], W: +m[2], D: +m[3] } : null;
}
/** Distinct box sizes (H×W×D, mm) for an enclosure family, parsed from the names. Sorted
 *  small → large. Default family is SR-Basic (the LCP/KWHM auto-sizing baseline). */
export function lcpSizes(fam = "SR-Basic"): LcpBox[] {
  const seen = new Set<string>();
  const out: LcpBox[] = [];
  for (const e of ENCLOSURES) {
    if (e.fam !== fam) continue;
    const d = parseEnclDims(e.name);
    if (!d) continue;
    const key = `${d.H}x${d.W}x${d.D}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out.sort((a, b) => a.H - b.H || a.W - b.W || a.D - b.D);
}
/** The nearest real SR-Basic box to a recommended size: same H & W, smallest depth ≥ the
 *  recommended depth; else the closest box overall (by |ΔH|+|ΔW|+|ΔD|). */
export function lcpClosestSize(rec: LcpBox, fam = "SR-Basic"): LcpBox {
  const sizes = lcpSizes(fam);
  if (!sizes.length) return rec;
  const hw = sizes.filter((s) => s.H === rec.H && s.W === rec.W);
  if (hw.length) {
    const ge = hw.filter((s) => s.D >= rec.D).sort((a, b) => a.D - b.D);
    return ge[0] ?? hw.sort((a, b) => Math.abs(a.D - rec.D) - Math.abs(b.D - rec.D))[0];
  }
  const dist = (s: LcpBox) => Math.abs(s.H - rec.H) + Math.abs(s.W - rec.W) + Math.abs(s.D - rec.D);
  return sizes.slice().sort((a, b) => dist(a) - dist(b))[0];
}
/** Snap a raw geometric size to a REAL stocked SR-Basic box, keeping the width and bumping
 *  the height up to the smallest stocked one (and the depth to the smallest that fits). This
 *  guarantees a size that actually exists in the catalogue. */
export function lcpRealBox(box: LcpBox, fam = "SR-Basic"): LcpBox {
  const sizes = lcpSizes(fam);
  const sameW = sizes.filter((s) => s.W === box.W && s.H >= box.H);
  if (sameW.length) {
    const minH = Math.min(...sameW.map((s) => s.H));
    const atH = sameW.filter((s) => s.H === minH);
    const geD = atH.filter((s) => s.D >= box.D).sort((a, b) => a.D - b.D);
    return geD[0] ?? atH.sort((a, b) => a.D - b.D)[0];
  }
  return lcpClosestSize(box, fam);
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
    summaryNotes: [],
    recordResults: "",
    offerCurrency: "USD",
    projectSpecs: {},
    selectivityRequired: "No",
    specs: defaultSpecs(),
    clientComments: [],
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
/** Bring an open quotation's FROZEN prices up to the current published catalogue.
 *  Component prices and cell-row prices are stamped onto the quotation when added
 *  (so a submitted quote never drifts) — this re-resolves every component by its
 *  reference and every cell row by its description, overwriting the catalogue-owned
 *  fields (price, brand, copper, poles, spec text) with today's values. The
 *  estimator's own data is preserved: quantity, per-line adjustment, notes, and the
 *  arrangement into sections/groups. Lines with no catalogue match (free-text combo
 *  lines, spacers, references dropped from the list) are left exactly as they were.
 *  Panel enclosures are already priced live from the catalogue, so they need no
 *  stamping here. A line whose component was RETIRED from the price list
 *  (active === false) is dropped — it can no longer be quoted. Returns the new
 *  state, how many priced lines moved, and how many discontinued lines were removed. */
export function repriceToCatalog(state: LvState): { next: LvState; changed: number; removed: number } {
  const byRef = new Map<string, DbComponent>();
  for (const c of COMPONENTS) if (c.ref) byRef.set(c.ref, c);
  let changed = 0;
  let removed = 0;
  let anyPanel = false;

  const panels = state.panels.map((p) => {
    let touched = false;

    const components: PanelComponent[] = [];
    for (const c of p.components ?? []) {
      if (c.spacer || !c.ref) { components.push(c); continue; }
      const src = byRef.get(c.ref);
      if (!src) { components.push(c); continue; }
      // Retired from the price list → drop the line entirely (undoable via Undo).
      if (src.active === false) { removed += 1; touched = true; continue; }
      const priceMoved = src.eur !== c.eur || src.egp !== c.egp;
      const specMoved =
        src.n !== c.name || src.d !== c.desc || src.t !== c.type || src.r !== c.rating ||
        src.brand !== c.brand || src.poles !== c.poles || src.cuP !== c.cuP ||
        src.cuC !== c.cuC || src.stock !== c.stock;
      if (!priceMoved && !specMoved) { components.push(c); continue; }
      if (priceMoved) changed += 1;
      touched = true;
      components.push({
        ...c,
        name: src.n, desc: src.d, type: src.t, rating: src.r, brand: src.brand,
        eur: src.eur, egp: src.egp, poles: src.poles, cuP: src.cuP, cuC: src.cuC, stock: src.stock,
      });
    }

    let cellConfig = p.cellConfig;
    if (cellConfig && Array.isArray(cellConfig.rows)) {
      const cfgType = cellConfig.type;
      let cellTouched = false;
      const rows = cellConfig.rows.map((r) => {
        const e = findCellEnclosure(cfgType, r.desc);
        if (!e || (e.eur === r.eur && e.egp === r.egp)) return r;
        changed += 1;
        cellTouched = true;
        return { ...r, eur: e.eur, egp: e.egp };
      });
      if (cellTouched) { cellConfig = { ...cellConfig, rows }; touched = true; }
    }

    if (!touched) return p;
    anyPanel = true;
    return { ...p, components, cellConfig };
  });

  return { next: anyPanel ? { ...state, panels } : state, changed, removed };
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

// ── Panel names must be unique within one quotation ──────────────────────────
// The name is how a reader tells one switchboard from another: it is printed on the
// Technical Offer and the Commercial Offer, the Material List groups by it, and a
// "Return for revision" comment is tagged to a panel by name. Two panels sharing a
// name produce paper the customer cannot read, so no path may create one.

/** Zero-width and other invisible characters a paste can leave inside a name. `\s`
 *  matches none of them, so without this two names that print identically are two
 *  different names to the rule. Kept the same as INVISIBLE in lv/catalog.ts and
 *  normLvName() in the backend, so the app has ONE idea of "the same name". */
const INVISIBLE = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;

/** How a READER compares two panel names — case, spacing and invisible characters
 *  distinguish nothing on a printed page, so "MDB" and "mdb " are the same
 *  switchboard. Every uniqueness rule below compares through this key, never the
 *  raw string. */
export const panelNameKey = (name: string): string =>
  name.replace(INVISIBLE, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The OTHER panel already carrying this name, or undefined when the name is free.
 *  A BLANK name is never a clash: a new panel deliberately starts blank while work is
 *  in progress, and the separate "Panel name is required" rule is what stops a
 *  nameless panel reaching an offer. */
export function panelNameOwner(name: string, panels: LvPanel[], exceptId?: string): LvPanel | undefined {
  const key = panelNameKey(name);
  if (!key) return undefined;
  return panels.find((p) => p.id !== exceptId && panelNameKey(p.name) === key);
}

/** Auxiliary cells (Spare parts / LCP / KWHM) left with no name, when there is more
 *  than one of them.
 *
 *  Blank is legal while work is in progress, and an unnamed ORDINARY panel is already
 *  stopped by "Panel name is required" — but that rule skips spare cells, and these
 *  are exactly the cells the app auto-names. Two of them left blank print as two
 *  identical empty rows on the offer, which is the same defect as two panels sharing
 *  a name and is reported the same way. One blank is fine: nothing to confuse it with. */
export function blankSpareNames(panels: LvPanel[]): LvPanel[] {
  const blanks = panels.filter((p) => p.spare && !panelNameKey(p.name));
  return blanks.length > 1 ? blanks : [];
}

/** The clash sentence for those, naming them so nobody has to open each cell. */
export function blankSpareMessage(blanks: LvPanel[], panels: LvPanel[]): string {
  const which = blanks.map((p) => `Panel ${panels.indexOf(p) + 1}`).join(" and ");
  return `${which}: more than one auxiliary panel has no name — unnamed panels print as identical rows on the offer. Give each one a name.`;
}

/** Plain English for the person who typed it, naming the panel it clashes with —
 *  without that name they have to hunt for the twin themselves. One wording, used
 *  by the field, the offer-tab block and the pre-export check alike. */
export function panelNameClashMessage(twin: LvPanel, panels: LvPanel[]): string {
  const i = panels.indexOf(twin) + 1;
  const which = i > 0 ? `Panel ${i}` : "another panel";
  // The twin's own spelling is quoted because the clash can be a difference of
  // capitals or spaces only ("MDB-01" vs "mdb 01"), which is invisible otherwise.
  return `This name is already used by ${which} (“${twin.name.trim()}”). Two panels with the same name cannot be told apart on the offer — please give one of them a different name.`;
}

/** "PANEL 4-2" → "PANEL 4": the name without its duplicate suffix, so a copy of a
 *  copy continues one series instead of growing "-1-1-1". */
function panelNameBase(name: string): string {
  const base = name
    .replace(/\s*\(copy[^)]*\)\s*$/i, "") // legacy "(copy)" / "(copy 2)"
    .replace(/\s*-\s*\d+\s*$/, "")          // existing "-N"
    .trim();
  return base || name.trim(); // a name that is nothing BUT a suffix keeps itself
}

/** "<base>-N" continuing from the highest N already in use, then stepped on until it
 *  is genuinely free. The second pass matters: the highest-N scan only sees the
 *  "<base>-N" series, while the freedom check compares against every panel. */
function nextFreeSeriesName(srcName: string, panels: LvPanel[], exceptId?: string): string {
  const base = panelNameBase(srcName);
  const esc = panelNameKey(base).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}\\s*-\\s*(\\d+)$`);
  let max = 0;
  for (const p of panels) {
    // The panel being renamed must not count towards the series, or re-building a
    // Standard EDMS panel from its OWN standard walks its name upward every press
    // ("MDB X-1" → "-3" → "-4") on an action the engineer expects to change nothing.
    if (p.id === exceptId) continue;
    const m = panelNameKey(p.name).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  for (let n = max + 1; n <= max + 500; n++) {
    const candidate = `${base}-${n}`;
    if (!panelNameOwner(candidate, panels, exceptId)) return candidate;
  }
  return `${base}-${uid()}`; // unreachable in practice — but never hand back a duplicate
}

/** RPT: incremental duplicate name — "PANEL 4" → "PANEL 4-1" → "PANEL 4-2" …
 *  Compared through `panelNameKey`, so an existing "mdb-1" also blocks "MDB-1". */
export function nextDuplicateName(srcName: string, panels: LvPanel[]): string {
  return nextFreeSeriesName(srcName, panels);
}

/** The name to actually give a panel THE APP is naming — a new auxiliary cell, a
 *  duplicate, a panel built from a Standard EDMS standard.
 *
 *  WHY auto-resolve here but block a typed name: the app must never hand someone a
 *  duplicate they did not ask for (adding a second LCP cell used to produce an exact
 *  twin with nothing typed at all), yet it must not overrule a person mid-word. So
 *  every name the app picks is made unique silently, using the house "<base>-N"
 *  scheme already used for duplicated panels and sections — and a name a PERSON types
 *  is left exactly as typed and flagged instead.
 *
 *  A blank name comes back blank: blank is allowed while work is in progress. */
export function uniquePanelName(wanted: string, panels: LvPanel[], exceptId?: string): string {
  const name = wanted.trim();
  if (!panelNameOwner(name, panels, exceptId)) return name;
  // Already carrying a name from this same series, and it is still free? Keep it.
  // Without this, re-building a Standard EDMS panel from its own standard renames it
  // on every press — "MDB X-1" → "MDB X-3" → "MDB X-4" — on an action that is meant
  // to rebuild the contents, not rename the panel.
  const self = exceptId ? panels.find((p) => p.id === exceptId) : undefined;
  if (
    self &&
    panelNameKey(panelNameBase(self.name)) === panelNameKey(panelNameBase(name)) &&
    panelNameKey(self.name) &&
    !panelNameOwner(self.name, panels, exceptId)
  ) {
    return self.name.trim();
  }
  return nextFreeSeriesName(name, panels, exceptId);
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
const BUSBAR_AUTO_FAMILIES = new Set(["SR-Basic", "Unikit", "Local (Sheet Metal)", "Pillars"]);
/** Families built without a main busbar. A weight of 0 is CORRECT for these, so the
 *  pre-export check must not report it as something the engineer forgot to enter. */
export const NO_BUSBAR_FAMILIES = new Set(["Minicenter", "Primo", "Coffree"]);
// Pillar-type enclosures ("7 Lines" …) carry no H×W×D in the name, so the busbar
// rule uses this fixed pillar height instead of parsing one out of the name.
const PILLAR_HEIGHT_MM = 1000;
// Pillars use a fixed 500 mm² main-busbar bar section (a standard), not one sized
// from the incomer rating the way the sheet-metal families are.
const PILLAR_BUSBAR_CSA_MM2 = 500;
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
/** Effective main-busbar bar section (mm²) for a panel: pillars use their fixed
 *  standard 500 mm²; every other family sizes it from the incomer rating. */
export function busbarAreaMm2(p: LvPanel): number {
  if (p.panelsSizing?.family === "Pillars") return PILLAR_BUSBAR_CSA_MM2;
  return busbarBarAreaMm2(p.ratingA);
}
/** Panel height (mm) = first dimension of the slot-1 enclosure name (H×W×D, opt. "L" prefix). */
export function panelHeightMm(p: LvPanel): number {
  // Pillars have no dimensions in the enclosure name ("7 Lines") — use the fixed pillar height.
  if (p.panelsSizing?.family === "Pillars") return PILLAR_HEIGHT_MM;
  const slot1 = (p.panelItems ?? []).find((it) => (it.slot ?? 1) === 1);
  // Saved state is read back from JSON with no schema, so an older or imported item can
  // arrive with no name. Coerce instead of trusting the type: throwing here blanks the
  // entire configurator, and a missing height already means "no auto busbar".
  const m = String(slot1?.name ?? "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
/** Auto main-busbar copper weight (kg), or null when the rule doesn't apply / inputs missing. */
/** The family-based auto main-busbar weight (SR-Basic / Unikit / Local), ignoring any
 *  manual override — null when the panel/family/rating doesn't support the auto rule. */
export function mainBusbarAutoRaw(p: LvPanel): number | null {
  if (p.sizingMode !== "panels") return null;
  if (!BUSBAR_AUTO_FAMILIES.has(p.panelsSizing?.family ?? "")) return null;
  const area = busbarAreaMm2(p);
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
  cablesCost?: number; // LCP only — cables line (else undefined)
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
    // LCP / KWHM: Components + Enclosure (auto-sized SR-Basic box) + Kits (10 % of the
    // enclosure) + Cu connections (manual weight × copper) + Cables (manual).
    if (p.spareKind === "lcp" || p.spareKind === "kwhm") {
      let compCost = 0;
      let enclComp = 0;
      let cuWeight = 0;
      for (const c of p.components) {
        if (isSpacer(c)) continue;
        const ov = abbDiscounts?.[abbKey(c)];
        const line = componentPriceEgp(c, f, ov != null ? ov / 100 : undefined) * c.qty;
        if (c.type === "Enclosure") enclComp += line; else compCost += line;
        cuWeight += cuPanelKg(c) * c.qty * buswayCopperMult(c.note);   // Cu connections, like a panel
      }
      const enclCost = enclComp + lcpEnclosureEgp(p, f);
      const kits = enclCost * 0.10;                // SR-Basic assembly kit = 10 % of enclosure
      const cuConnCost = cuWeight * f.copper;
      const cablesCost = p.cablesEgp || 0;
      const unitCost = compCost + enclCost + kits + cuConnCost + cablesCost;
      const unitCostOps = unitCost * (1 + f.operations);   // operations overhead, like a panel
      const factor = p.sellFactor > 0 ? p.sellFactor : f.factor;
      const sellUnit = (factor > 0 ? unitCostOps / factor : unitCostOps) * (1 + (f.safetyFactor || 0));
      return { compCost, enclCost, cuConnCost, busbarCost: 0, busbarKg: 0, kits, cablesCost, cuWeight, unitCost, unitCostOps, sellUnit, totalSell: sellUnit * p.qty };
    }
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
    const sellUnit = (factor > 0 ? unitCost / factor : unitCost) * (1 + (f.safetyFactor || 0));
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
  // Cell "Sides" rows are part of the enclosure cost but excluded from the kit base
  // (kit = % of the enclosure price *except* the sides).
  let sideCost = 0;
  for (const it of p.panelItems ?? []) {
    // Enclosures are quoted at list price — the global ABB discount covers ABB *products*
    // only and never an enclosure, whatever the family. A per-item Material-List discount
    // is still honoured, since that is an explicit, deliberate entry.
    const base = it.eur > 0 ? it.eur * f.euro : it.egp;
    const ov = abbDiscounts?.[abbKey(it)];
    const frac = ov != null ? ov / 100 : 0;
    enclCost += base * (1 - frac) * it.qty;
  }
  if (p.sizingMode === "cells") {
    for (const r of p.cellConfig.rows) {
      if (r.qty <= 0) continue;
      // Cells honour a per-item Material-List discount too (keyed by description, like the list row).
      const ov = abbDiscounts?.[abbKey({ description: r.desc })];
      // Use the price frozen onto the row; fall back to the live catalogue lookup
      // only for rows saved before prices were stamped. KEEP THIS FALLBACK — it is
      // what stops older quotations from silently costing 0.
      const cellBase =
        (r.eur ?? 0) > 0 || (r.egp ?? 0) > 0
          ? enclosurePriceEgp({ eur: r.eur ?? 0, egp: r.egp ?? 0 }, f)
          : cellPriceEgp(p.cellConfig.type, r.desc, f);
      const rowCost = cellBase * (1 - (ov != null ? ov / 100 : 0)) * r.qty;
      enclCost += rowCost;
      if (r.locked) sideCost += rowCost; // the "Sides" row — kept out of the kit base
    }
  }
  const cuConnCost = cuWeight * f.copper;
  // Main busbar: auto rule for sheet-metal panels, else the manual entry. Priced by weight ×
  // copper rate × the plating factor (Bare 1 · Raychem 1.02 · Tin-plated 1.05 · Silver 1.15).
  // Plating premium (Bare 1 · Raychem 1.02 · Tin-plated 1.05 · Silver-plated 1.15)
  // multiplies the busbar copper WEIGHT — so both the KG shown and the cost carry it.
  const busbarKg = (mainBusbarAuto(p) ?? (p.mainBusbarKg || 0)) * copperTypeFactor(p.copperType);
  const busbarCost = busbarKg * f.copper;
  // Kit = a % of the enclosure cost minus the cell Sides, per system (see kitRate).
  const kits = Math.max(0, enclCost - sideCost) * kitRate(p);
  const unitCost = compCost + enclCost + cuConnCost + busbarCost + kits;
  const unitCostOps = unitCost * (1 + f.operations);
  // Per-panel selling factor overrides the global (Pricing Settings) when set (> 0).
  const factor = p.sellFactor > 0 ? p.sellFactor : f.factor;
  const sellUnit = (factor > 0 ? unitCostOps / factor : unitCostOps) * (1 + (f.safetyFactor || 0));
  return { compCost, enclCost, cuConnCost, busbarCost, busbarKg, kits, cuWeight, unitCost, unitCostOps, sellUnit, totalSell: sellUnit * p.qty };
}
/**
 * The hand-written Commercial Offer lines, in EGP.
 *
 * A blank row (the one a user just added) contributes 0 rather than NaN — one NaN here
 * reaches summaryOf(), which the server rejects, and a fire-and-forget autosave then
 * fails silently and loses work. See the note on summaryOf in qtns.ts.
 */
export function customItemsTotal(s: LvState): number {
  let t = 0;
  for (const r of s.customItems ?? []) {
    const v = (Number(r.qty) || 0) * (Number(r.unitPrice) || 0);
    if (Number.isFinite(v)) t += v;
  }
  return t;
}

export function grandTotals(s: LvState) {
  let sell = 0;
  s.panels.forEach((p) => (sell += calcPanel(p, s.factors, s.abbItemDiscounts).totalSell));
  // A custom quotation has no panels and prices its offer from these instead. Adding it
  // here rather than at each call site means the history list, the dashboard figures and
  // the saved summary all pick it up without knowing the kind exists.
  sell += customItemsTotal(s);
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
    copperKg += (mainBusbarAuto(p) ?? (p.mainBusbarKg || 0)) * copperTypeFactor(p.copperType) * mult;
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
 *                       in the Copper Tool, or the panel's busbar weight is 0.
 *   4. Same name    — two panels a reader of the offer cannot tell apart. */
export function exportBlockers(s: LvState): ExportCheck[] {
  const zeroPrice: string[] = [];
  const noCells: string[] = [];
  const missingCopper: string[] = [];
  const lcpCables: string[] = []; // LCP cells with no cables cost (mandatory)
  const highlighted: string[] = []; // panels flagged with the sidebar highlighter
  const emptyPanels: string[] = []; // costed, but nothing to show the customer
  const dupNames: string[] = []; // two panels a reader cannot tell apart
  s.panels.forEach((p, i) => {
    const label = `Panel ${i + 1}${p.name.trim() ? ` (${p.name.trim()})` : ""}`;
    if (p.highlight) highlighted.push(label);
    // A highlighted panel carries a 🖍️ marker on any other warning it raises.
    const tag = p.highlight ? `🖍️ ${label}` : label;
    // 0) A panel with no components prints as "No components." while its enclosure,
    //    kits and cables are still charged — the customer pays for a box that shows
    //    nothing. Empty KWHM spare panels are how this reached submitted offers.
    //    Blocked rather than hidden: silently dropping a panel that is being charged
    //    for would leave the price unexplained on the offer.
    if (p.components.length === 0) {
      const costed = !!p.lcpBox || !!p.lcpBox2 || (p.cablesEgp ?? 0) > 0;
      emptyPanels.push(`${tag}: no components${costed ? " — but it is still being charged for" : ""}`);
    }
    // 1) Zero price
    for (const c of p.components) {
      if (isSpacer(c) || c.type === "Space") continue;
      if (itemPriceEgp(c, s) <= 0) zeroPrice.push(`${tag}: ${c.name || c.ref || "item"} — 0 EGP`);
    }
    // LCP: the cables cost is mandatory — it has no auto value.
    if (p.spareKind === "lcp" && !(p.cablesEgp && p.cablesEgp > 0)) {
      lcpCables.push(`${tag}: cables cost not entered`);
    }
    // Two panels under one name. Reported here as well as on the offer tabs because a
    // quotation SAVED before this rule existed (or one a co-worker's merge brought a
    // clash into) must still be exportable — it is not the app's place to rewrite a
    // saved quotation, so it says so and leaves the correction to a person.
    // Reported from the LATER panel of the pair only. Asking both sides produces the
    // same clash twice ("Panel 1 same as Panel 4", "Panel 4 same as Panel 1"), which
    // reads as two separate problems.
    const twin = panelNameOwner(p.name, s.panels, p.id);
    if (twin && s.panels.indexOf(twin) < s.panels.indexOf(p)) {
      dupNames.push(`${tag}: same name as Panel ${s.panels.indexOf(twin) + 1}`);
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
    // Minicenter and Primo have no main busbar, so 0 kg is the right answer for
    // them — flagging it sent engineers looking for a number that does not exist.
    const family = p.sizingMode === "panels" ? p.panelsSizing?.family ?? "" : "";
    if (!NO_BUSBAR_FAMILIES.has(family) && (mainBusbarAuto(p) ?? (p.mainBusbarKg || 0)) <= 0) {
      reasons.push("busbar weight is 0");
    }
    if (reasons.length) missingCopper.push(`${tag}: ${reasons.join("; ")}`);
  });
  // Two unnamed auxiliary cells are two indistinguishable rows on the offer for the
  // same reason a shared name is, so they belong under the same heading.
  const blankSpares = blankSpareNames(s.panels);
  if (blankSpares.length) dupNames.push(blankSpareMessage(blankSpares, s.panels));
  const out: ExportCheck[] = [];
  if (highlighted.length) out.push({ title: "🖍️ Highlighted panels", items: highlighted });
  if (dupNames.length) out.push({ title: "Two panels with the same name", items: dupNames });
  if (emptyPanels.length) out.push({ title: "Empty panels — nothing would print", items: emptyPanels });
  if (zeroPrice.length) out.push({ title: "Zero price", items: zeroPrice });
  if (noCells.length) out.push({ title: "No cells selected", items: noCells });
  if (missingCopper.length) out.push({ title: "Missing copper", items: missingCopper });
  if (lcpCables.length) out.push({ title: "LCP cables missing", items: lcpCables });
  return out;
}

// ── Search ───────────────────────────────────────────────────────────────────
/**
 * Retired = removed from the price list, so it must not be offered for new work.
 *
 * The published payload deliberately KEEPS retired rows (buildLvPayload) because the
 * combination builders resolve their parts by description and would break if a row
 * vanished — so findByName must still see them. Only the pickers hide them. The flag
 * is absent on the bundled catalogue, so undefined means active.
 */
export const isRetired = (c: { active?: boolean }): boolean => c.active === false;

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
    if (isRetired(c)) continue; // "Remove" in the price list means: stop offering it here
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
  // ATS transfer switches (TruOne) are niche next to lamps / buttons / etc., so on an
  // otherwise-equal match (e.g. "compact" hits both) they sink last — Compact Pilot
  // lights show before Compact ATS. Specific "ats"/"truone" searches are unaffected
  // (only ATS rows match those terms).
  const atsLast = (c: DbComponent) => (/truone/i.test(c.t || "") ? 1 : 0);
  // Cheapest first among results that match EQUALLY well — the usual case is one
  // family of breakers differing only by trip unit and poles, and price order is what
  // you want to compare them. It is a tie-break, not the primary sort: ranking by
  // price outright would let a vaguely-matching cheap part outrank an exact hit.
  // EUR items are converted at the current rate so the two currencies compare;
  // discounts and the selling factor are left out, as they shift everything alike.
  const priceEgp = (c: DbComponent) =>
    (c.eur ?? 0) > 0 ? (c.eur ?? 0) * (DEFAULT_FACTORS.euro || 1) : (c.egp ?? 0);
  scored.sort((a, b) =>
    a.score - b.score || a.pos - b.pos || priceEgp(a.c) - priceEgp(b.c) ||
    atsLast(a.c) - atsLast(b.c) || a.c.n.length - b.c.n.length || a.c.n.localeCompare(b.c.n)
  );
  return scored.slice(0, limit).map((x) => x.c);
}
