import { prisma } from "../lib/prisma";
import type { CreateOfferInput } from "../validation/offer.schema";
import { computePricing } from "./pricing";
import { priceForConfig, type ConfigPricing } from "../domain/priceList";
import { vatPct } from "../domain/pricing-data";
import { buildCommercial } from "./commercial.service";
import {
  assembleOffer,
  buildCode,
  buildProductCode,
  type RmuConfigInput,
  type LbsBrand,
  type ClientSpec,
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
  clientSpec: string;
  voltageKv: number;
  nalCount: number;
  nalfCount: number;
  hasMetering: boolean;
  rtuType: string;
  installation: string;
  busbarCurrentA: number;
  fuseRatingA: number | null;
  meteringCtPrimaryA: number | null;
  ctClass: string | null;
  vtCores: number;
  vtBurdenVa: string | null;
  vtClass: string | null;
  meteringWithFuse: boolean;
};

/** Map a stored RMU row to the assembly engine's input type. */
export function toConfigInput(rmu: StoredRmu): RmuConfigInput {
  return {
    productType: rmu.productType as ProductType,
    lbsBrand: (rmu.lbsBrand as LbsBrand) ?? "ABB",
    clientSpec: (rmu.clientSpec as ClientSpec) ?? "EECH",
    voltageKv: rmu.voltageKv as VoltageKv,
    nalCount: rmu.nalCount,
    nalfCount: rmu.nalfCount,
    hasMetering: rmu.hasMetering,
    rtuType: rmu.rtuType as RtuType,
    installation: rmu.installation as Installation,
    busbarCurrentA: rmu.busbarCurrentA,
    fuseRatingA: rmu.fuseRatingA,
    meteringCtPrimaryA: rmu.meteringCtPrimaryA,
    ctClass: rmu.ctClass,
    vtCores: rmu.vtCores,
    vtBurdenVa: rmu.vtBurdenVa,
    vtClass: rmu.vtClass,
    meteringWithFuse: rmu.meteringWithFuse,
  };
}

/** The frozen price columns carried by a stored offer (all nullable — offers
 *  created before snapshots existed have them unset). */
export type PriceSnapshotFields = {
  pricedAt?: Date | null;
  snapPriceKey?: string | null;
  snapBasePriceUsd?: number | null;
  snapListPriceUsd?: number | null;
  snapAddOnsJson?: string | null;
  snapVatPct?: number | null;
  snapPriceFound?: boolean | null;
};

export interface ResolvedPricing {
  pricing: ConfigPricing | null;
  vatPct: number;
  /** true when the numbers came from the offer's own frozen snapshot. */
  fromSnapshot: boolean;
}

/** THE rule for what an offer costs.
 *
 *  Prefers the prices frozen onto the offer when it was created, so changing the
 *  price list never rewrites a quotation that has already gone to a customer.
 *  Falls back to a live lookup only for legacy offers created before snapshots
 *  existed (`pricedAt == null`) — which reproduces exactly today's behaviour for
 *  them, so this change is invisible on deploy day.
 *
 *  Both the JSON API (`decorate`) and the commercial PDF must go through here —
 *  if they diverge, the screen and the PDF can show different money. */
export function resolvePricing(
  offer: PriceSnapshotFields,
  config: RmuConfigInput | null
): ResolvedPricing {
  if (offer.pricedAt && offer.snapPriceKey != null) {
    let addOns: { name: string; price: number }[] = [];
    try {
      const parsed = offer.snapAddOnsJson ? JSON.parse(offer.snapAddOnsJson) : [];
      if (Array.isArray(parsed)) addOns = parsed;
    } catch {
      addOns = []; // corrupt snapshot → no add-on lines rather than a 500
    }
    return {
      pricing: {
        // panelCode is derived from the configuration, not from prices, so it is
        // always safe (and correct) to recompute it.
        panelCode: config ? buildProductCode(config) : "",
        priceKey: offer.snapPriceKey,
        basePrice: offer.snapBasePriceUsd ?? null,
        addOns,
        listPrice: offer.snapListPriceUsd ?? null,
        found: offer.snapPriceFound ?? false,
      },
      vatPct: offer.snapVatPct ?? vatPct(),
      fromSnapshot: true,
    };
  }
  return {
    pricing: config ? priceForConfig(config) : null,
    vatPct: vatPct(),
    fromSnapshot: false,
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
  const cfg = input.rmu as RmuConfigInput;
  const configCode = buildCode(cfg);

  // Freeze the list prices and VAT rate this offer is quoted at. From here on the
  // offer prints these numbers forever, whatever happens to the price list.
  const snap = priceForConfig(cfg);
  const snapVat = vatPct();

  const offer = await prisma.offer.create({
    data: {
      offerNumber,
      category: input.category,
      pricedAt: new Date(),
      snapPriceKey: snap.priceKey,
      snapBasePriceUsd: snap.basePrice,
      snapListPriceUsd: snap.listPrice,
      snapAddOnsJson: JSON.stringify(snap.addOns),
      snapVatPct: snapVat,
      snapPriceFound: snap.found,
      salesNumber: input.salesNumber ?? null,
      orderNumber: input.orderNumber ?? null,
      quotationNo: input.quotationNo ?? null,
      opportunityNo: input.opportunityNo ?? null,
      salesName: input.salesName ?? null,
      salesMobile: input.salesMobile ?? null,
      salesEmail: input.salesEmail ?? null,
      salesManagerName: input.salesManagerName ?? null,
      salesManagerMobile: input.salesManagerMobile ?? null,
      salesManagerEmail: input.salesManagerEmail ?? null,
      supportName: input.supportName ?? null,
      supportMobile: input.supportMobile ?? null,
      supportEmail: input.supportEmail ?? null,
      projectName: input.projectName,
      customer: input.customer,
      status: input.status,
      currency: input.currency,
      usdToEgpRate: input.usdToEgpRate ?? null,
      unitPrice: input.unitPrice,
      quantity: input.quantity,
      discountPct: input.discountPct,
      validityDays: input.validityDays,
      deliveryWeeks: input.deliveryWeeks ?? null,
      paymentTerms: input.paymentTerms ?? null,
      warrantyMonths: input.warrantyMonths ?? null,
      notes: input.notes ?? null,
      offerDate: input.offerDate ?? null,
      rmu: {
        create: {
          productType: input.rmu.productType,
          lbsBrand: input.rmu.lbsBrand ?? "ABB",
          clientSpec: input.rmu.clientSpec ?? "EECH",
          voltageKv: input.rmu.voltageKv,
          nalCount: input.rmu.nalCount,
          nalfCount: input.rmu.nalfCount,
          hasMetering: input.rmu.hasMetering,
          rtuType: input.rmu.rtuType,
          installation: input.rmu.installation,
          busbarCurrentA: input.rmu.busbarCurrentA,
          fuseRatingA: input.rmu.fuseRatingA ?? null,
          meteringCtPrimaryA: input.rmu.meteringCtPrimaryA ?? null,
          ctClass: input.rmu.ctClass ?? null,
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

export async function listOffers(ownerId: string | undefined) {
  // Per-user: only the signed-in owner's offers. Unauthenticated → none.
  if (!ownerId) return [];
  const offers = await prisma.offer.findMany({
    where: { ownerId },
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
  T extends PriceSnapshotFields & {
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
  // Frozen prices when the offer has them, live lookup only for legacy offers.
  const { pricing: listPricing, vatPct: offerVatPct } = resolvePricing(offer, config);
  const commercial =
    generated && offer && "offerNumber" in offer
      ? buildCommercial(offer as never, generated, listPricing, offerVatPct)
      : null;
  return { ...offer, pricing, generated, listPricing, commercial };
}
