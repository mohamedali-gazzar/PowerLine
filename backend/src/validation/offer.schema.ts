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
  lbsBrand: z.enum(["ABB", "MURGE"]).default("ABB"),
  voltageKv: z
    .number()
    .int()
    .refine((v) => (VOLTAGES as number[]).includes(v), {
      message: "Voltage must be 12 or 24 kV",
    }),
  nalCount: z.number().int().min(0).max(12),
  nalfCount: z.number().int().min(0).max(12),
  hasMetering: z.boolean().default(false),
  rtuType: z.enum(RTU_TYPES as [string, ...string[]]).default("NONE"),
  installation: z.enum(INSTALLATIONS as [string, ...string[]]).default("INDOOR"),
  busbarCurrentA: z.number().int().positive().max(2500).default(630),
  fuseRatingA: z.number().int().positive().max(400).optional().nullable(),
  meteringCtPrimaryA: z.number().int().positive().max(5000).optional().nullable(),
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
  });

export const PRODUCT_CATEGORIES = ["RMU", "KIOSK", "LV"] as const;

export const createOfferSchema = z.object({
  offerNumber: z.string().trim().min(1).max(60).optional(),
  category: z.enum(PRODUCT_CATEGORIES).default("RMU"),
  salesNumber: z.string().trim().max(60).optional().nullable(),
  orderNumber: z.string().trim().max(60).optional().nullable(),
  projectName: z.string().trim().min(1).max(160),
  customer: z.string().trim().min(1).max(160),
  location: z.string().trim().max(160).optional().nullable(),
  status: z.enum(OFFER_STATUS).default("DRAFT"),

  currency: z.string().trim().min(1).max(8).default("USD"),
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
