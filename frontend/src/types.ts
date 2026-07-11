// Shape of the data exchanged with the backend API.

export type ProductType = "PRAL" | "PSEC" | "LUCY";
export type VoltageKv = 12 | 24;
export type RtuType = "NONE" | "READY1" | "READY2" | "SMART1" | "SMART2";
export type Installation = "INDOOR" | "OUTDOOR";
export type OfferStatus = "DRAFT" | "SENT" | "WON" | "LOST";
export type ProductCategory = "RMU" | "KIOSK" | "LV";

// The RMU "code", e.g. PSEC10AB12R3T1M (see RMU Coding System).
export type LbsBrand = "ABB" | "MURGE" | "SCHNEIDER" | "JGGY" | "GRL" | "CHINT";
export type ClientSpec = "EECH" | "KAHRABA";

export interface RmuConfigInput {
  productType: ProductType;
  lbsBrand?: LbsBrand;
  clientSpec?: ClientSpec;
  voltageKv: VoltageKv;
  nalCount: number;
  nalfCount: number;
  hasMetering: boolean;
  rtuType: RtuType;
  installation: Installation;
  busbarCurrentA: number;
  fuseRatingA?: number | null;
  meteringCtPrimaryA?: number | null;
  ctClass?: string | null;
  vtCores?: number;
  vtBurdenVa?: string | null;
  vtClass?: string | null;
  meteringWithFuse?: boolean | null;
}

export interface OfferInput {
  offerNumber?: string;
  category: ProductCategory;
  salesNumber?: string | null;
  orderNumber?: string | null;
  quotationNo?: string | null;
  opportunityNo?: string | null;
  salesName?: string | null;
  salesMobile?: string | null;
  salesEmail?: string | null;
  salesManagerName?: string | null;
  salesManagerMobile?: string | null;
  salesManagerEmail?: string | null;
  supportName?: string | null;
  supportMobile?: string | null;
  supportEmail?: string | null;
  projectName: string;
  customer: string;
  status: OfferStatus;
  currency: string;
  usdToEgpRate?: number | null;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  validityDays: number;
  deliveryWeeks?: number | null;
  paymentTerms?: string | null;
  warrantyMonths?: number | null;
  notes?: string | null;
  offerDate?: string | null;
  rmu: RmuConfigInput;
}

// ---- Assembled technical offer (computed by the backend) ----
export interface Row {
  label: string;
  value: string;
}
export interface CubicleItem {
  qty: number;
  description: string;
}
export interface Cubicle {
  code: string;
  name: string;
  qty: number;
  dims: string;
  items: CubicleItem[];
}
export interface ConfigPricing {
  panelCode: string;
  priceKey: string;
  basePrice: number | null;
  addOns: { name: string; price: number }[];
  listPrice: number | null;
  found: boolean;
}

export interface CommercialItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface CommercialData {
  offerNumber: string;
  plReference: string;
  date: string;
  customer: string;
  project: string;
  currency: string;
  items: CommercialItem[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  totalExclVat: number;
  vatPct: number;
  vatAmount: number;
  totalInclVat: number;
  validityDays: number;
  deliveryWeeks: number | null;
  paymentTerms: string | null;
  warrantyMonths: number | null;
  listPrice: number | null;
  priceFound: boolean;
}

export interface GeneratedOffer {
  configCode: string;
  panelCode: string;
  priceKey: string;
  commercialDescription: string;
  titleProduct: string;
  titleFamily: string;
  listPricing?: ConfigPricing;
  vatPct?: number; // from the pricing master (preview endpoint)
  generalData: Row[];
  electricalData: Row[];
  additionalData: Row[];
  installationNote?: string;
  generalNotes: string[];
  cubicles: Cubicle[];
  communication?: CubicleItem[];
  summary: {
    productType: ProductType;
    lbsBrand: LbsBrand;
    clientSpec: ClientSpec;
    smart: boolean;
    insulation: string;
    voltageKv: number;
    nalCount: number;
    nalfCount: number;
    hasMetering: boolean;
    rtuType: RtuType;
    installation: Installation;
    fuseRatingA: number;
    fuseOverride: boolean;
    busbarCurrentA: number;
    meteringCtPrimaryA: number | null;
    vtCores: number;
    meteringWithFuse: boolean;
    totalCubicles: number;
  };
}

export interface Pricing {
  subtotal: number;
  discountAmount: number;
  total: number;
}

export interface StoredRmu extends RmuConfigInput {
  id: string;
  configCode: string;
}

export interface Offer {
  id: string;
  offerNumber: string;
  category: ProductCategory;
  salesNumber?: string | null;
  orderNumber?: string | null;
  quotationNo?: string | null;
  opportunityNo?: string | null;
  salesName?: string | null;
  salesMobile?: string | null;
  salesEmail?: string | null;
  salesManagerName?: string | null;
  salesManagerMobile?: string | null;
  salesManagerEmail?: string | null;
  supportName?: string | null;
  supportMobile?: string | null;
  supportEmail?: string | null;
  projectName: string;
  customer: string;
  status: OfferStatus;
  currency: string;
  usdToEgpRate?: number | null;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  validityDays: number;
  deliveryWeeks?: number | null;
  paymentTerms?: string | null;
  warrantyMonths?: number | null;
  notes?: string | null;
  offerDate?: string | null;
  createdAt: string;
  updatedAt: string;
  rmu: StoredRmu;
  pricing: Pricing;
  generated: GeneratedOffer;
  listPricing: ConfigPricing | null;
  commercial: CommercialData | null;
}
