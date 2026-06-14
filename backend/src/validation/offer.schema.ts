import { z } from "zod";
import {
  PRODUCT_TYPES,
  VOLTAGES,
  RTU_TYPES,
  INSTALLATIONS,
} from "../domain/standards";

const OFFER_STATUS = ["DRAFT", "SENT", "WON", "LOST"] as const;

// The RMU "code": PRAL/PSEC, voltage, and how many NAL/NALF/metering/RTU.
export const rmuConfigSchema = z.object({
  productType: z.enum(PRODUCT_TYPES as [string, ...string[]]),
  lbsBrand: z.enum(["ABB", "MURGE", "SCHNEIDER", "JGGY", "GRL"]).default("ABB"),
  clientSpec: z.enum(["EECH", "KAHRABA"]).default("EECH"),
  voltageKv: z
    .number()
    .int()
    .refine((v) => (VOLTAGES as number[]).includes(v), {
      message: "Voltage must be 12 or 24 kV",
    }),
  nalCount: z.number().int().min(0).max(5), // Ring feeders R0–R5
  nalfCount: z.number().int().min(0).max(2), // Transformer feeders T0–T2
  hasMetering: z.boolean().default(false),
  rtuType: z.enum(RTU_TYPES as [string, ...string[]]).default("NONE"),
  installation: z.enum(INSTALLATIONS as [string, ...string[]]).default("INDOOR"),
  busbarCurrentA: z.number().int().positive().max(2500).default(630),
  fuseRatingA: z.number().int().positive().max(400).optional().nullable(),
  meteringCtPrimaryA: z.number().int().positive().max(5000).optional().nullable(),
  ctClass: z.string().trim().max(20).optional().nullable(),
  vtCores: z
    .number()
    .int()
    .refine((v) => v === 1 || v === 2, { message: "VT cores must be 1 or 2" })
    .default(1),
  vtBurdenVa: z.string().trim().max(40).optional().nullable(),
  vtClass: z.string().trim().max(20).optional().nullable(),
  meteringWithFuse: z.boolean().default(false),
})
  .refine((c) => c.nalCount + c.nalfCount > 0, {
    message: "At least one NAL or NALF cubicle is required",
    path: ["nalCount"],
  })
  .refine(
    (c) => {
      // Only brands we have real data for (technical BOM + price). Others are
      // locked until their data is added — we don't fabricate from ABB's data.
      const available = c.productType === "PSEC" ? ["ABB", "MURGE"] : ["ABB"];
      return available.includes(c.lbsBrand);
    },
    {
      message:
        "No technical/price data for this brand yet — it's locked. Available: PSEC → ABB or Murge; PRAL → ABB.",
      path: ["lbsBrand"],
    }
  )
  .refine((c) => c.clientSpec === "EECH", {
    // We only have EECH technical offers; KAHRABA is locked until its data exists.
    message: "No technical offer for KAHRABA yet — locked. Only EECH is available.",
    path: ["clientSpec"],
  });

export const PRODUCT_CATEGORIES = ["RMU", "KIOSK", "LV"] as const;

export const createOfferSchema = z.object({
  offerNumber: z.string().trim().min(1).max(60).optional(),
  category: z.enum(PRODUCT_CATEGORIES).default("RMU"),
  salesNumber: z.string().trim().max(60).optional().nullable(),
  orderNumber: z.string().trim().max(60).optional().nullable(),
  quotationNo: z.string().trim().max(120).optional().nullable(),
  opportunityNo: z.string().trim().max(120).optional().nullable(),
  salesName: z.string().trim().max(120).optional().nullable(),
  salesMobile: z.string().trim().max(60).optional().nullable(),
  salesEmail: z.string().trim().max(160).optional().nullable(),
  salesManagerName: z.string().trim().max(120).optional().nullable(),
  salesManagerMobile: z.string().trim().max(60).optional().nullable(),
  salesManagerEmail: z.string().trim().max(160).optional().nullable(),
  supportName: z.string().trim().max(120).optional().nullable(),
  supportMobile: z.string().trim().max(60).optional().nullable(),
  supportEmail: z.string().trim().max(160).optional().nullable(),
  projectName: z.string().trim().min(1).max(160),
  customer: z.string().trim().min(1).max(160),
  status: z.enum(OFFER_STATUS).default("DRAFT"),

  currency: z.enum(["USD", "EGP"]).default("USD"),
  usdToEgpRate: z.number().positive().max(1000).optional().nullable(),
  unitPrice: z.number().min(0).default(0),
  quantity: z.number().int().positive().default(1),
  discountPct: z.number().min(0).max(100).default(0),
  validityDays: z.number().int().positive().max(365).default(30),
  deliveryWeeks: z.number().int().positive().max(104).optional().nullable(),
  paymentTerms: z.string().trim().max(300).optional().nullable(),
  warrantyMonths: z.number().int().positive().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),

  rmu: rmuConfigSchema,
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;

// Just the RMU config — used by the live preview endpoint (no project/customer).
export const previewSchema = rmuConfigSchema;
