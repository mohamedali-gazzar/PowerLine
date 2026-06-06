import { prisma } from "../lib/prisma";
import type { CreateOfferInput } from "../validation/offer.schema";
import { computePricing } from "./pricing";
import { priceForConfig } from "../domain/priceList";
import { buildCommercial } from "./commercial.service";
import {
  assembleOffer,
  buildCode,
  type RmuConfigInput,
} from "../domain/assembly";
import type {
  ProductType,
  VoltageKv,
  RtuType,
  Installation,
} from "../domain/standards";

const includeRmu = { rmu: true } as const;

type StoredRmu = {
  productType: string;
  lbsBrand: string;
  voltageKv: number;
  nalCount: number;
  nalfCount: number;
  hasMetering: boolean;
  rtuType: string;
  installation: string;
  busbarCurrentA: number;
  fuseRatingA: number | null;
  meteringCtPrimaryA: number | null;
  vtCores: number;
  vtBurdenVa: string | null;
  vtClass: string | null;
  meteringWithFuse: boolean;
};

/** Map a stored RMU row to the assembly engine's input type. */
export function toConfigInput(rmu: StoredRmu): RmuConfigInput {
  return {
    productType: rmu.productType as ProductType,
    lbsBrand: (rmu.lbsBrand as "ABB" | "MURGE") ?? "ABB",
    voltageKv: rmu.voltageKv as VoltageKv,
    nalCount: rmu.nalCount,
    nalfCount: rmu.nalfCount,
    hasMetering: rmu.hasMetering,
    rtuType: rmu.rtuType as RtuType,
    installation: rmu.installation as Installation,
    busbarCurrentA: rmu.busbarCurrentA,
    fuseRatingA: rmu.fuseRatingA,
    meteringCtPrimaryA: rmu.meteringCtPrimaryA,
    vtCores: rmu.vtCores,
    vtBurdenVa: rmu.vtBurdenVa,
    vtClass: rmu.vtClass,
    meteringWithFuse: rmu.meteringWithFuse,
  };
}

/** Generate a sequential offer number like PL-2026-0007. */
/** Next offer number = highest existing PL-{year}-#### + 1 (survives deletions). */
async function nextOfferNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PL-${year}-`;
  const existing = await prisma.offer.findMany({
    where: { offerNumber: { startsWith: prefix } },
    select: { offerNumber: true },
  });
  let max = 0;
  for (const o of existing) {
    const n = parseInt(o.offerNumber.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function createOffer(input: CreateOfferInput) {
  const offerNumber = input.offerNumber?.trim() || (await nextOfferNumber());
  const configCode = buildCode(input.rmu as RmuConfigInput);

  const offer = await prisma.offer.create({
    data: {
      offerNumber,
      category: input.category,
      salesNumber: input.salesNumber ?? null,
      orderNumber: input.orderNumber ?? null,
      projectName: input.projectName,
      customer: input.customer,
      location: input.location ?? null,
      status: input.status,
      currency: input.currency,
      unitPrice: input.unitPrice,
      quantity: input.quantity,
      discountPct: input.discountPct,
      validityDays: input.validityDays,
      deliveryWeeks: input.deliveryWeeks ?? null,
      paymentTerms: input.paymentTerms ?? null,
      warrantyMonths: input.warrantyMonths ?? null,
      notes: input.notes ?? null,
      rmu: {
        create: {
          productType: input.rmu.productType,
          lbsBrand: input.rmu.lbsBrand ?? "ABB",
          voltageKv: input.rmu.voltageKv,
          nalCount: input.rmu.nalCount,
          nalfCount: input.rmu.nalfCount,
          hasMetering: input.rmu.hasMetering,
          rtuType: input.rmu.rtuType,
          installation: input.rmu.installation,
          busbarCurrentA: input.rmu.busbarCurrentA,
          fuseRatingA: input.rmu.fuseRatingA ?? null,
          meteringCtPrimaryA: input.rmu.meteringCtPrimaryA ?? null,
          vtCores: input.rmu.vtCores ?? 1,
          vtBurdenVa: input.rmu.vtBurdenVa ?? null,
          vtClass: input.rmu.vtClass ?? null,
          meteringWithFuse: input.rmu.meteringWithFuse ?? false,
          configCode,
        },
      },
    },
    include: includeRmu,
  });
  return decorate(offer);
}

export async function listOffers() {
  const offers = await prisma.offer.findMany({
    orderBy: { createdAt: "desc" },
    include: includeRmu,
  });
  return offers.map(decorate);
}

export async function getOffer(id: string) {
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: includeRmu,
  });
  return offer ? decorate(offer) : null;
}

export async function getOfferRaw(id: string) {
  return prisma.offer.findUnique({ where: { id }, include: includeRmu });
}

export async function deleteOffer(id: string) {
  return prisma.offer.delete({ where: { id } });
}

// Attach the assembled technical offer + computed commercial totals.
function decorate<
  T extends {
    currency: string;
    discountPct: number;
    unitPrice: number;
    quantity: number;
    rmu: StoredRmu | null;
  }
>(offer: T) {
  const pricing = computePricing({
    quantity: offer.quantity,
    unitPrice: offer.unitPrice,
    discountPct: offer.discountPct,
  });
  const config = offer.rmu ? toConfigInput(offer.rmu) : null;
  const generated = config ? assembleOffer(config) : null;
  const listPricing = config ? priceForConfig(config) : null;
  const commercial =
    generated && offer && "offerNumber" in offer
      ? buildCommercial(offer as never, generated, listPricing)
      : null;
  return { ...offer, pricing, generated, listPricing, commercial };
}
