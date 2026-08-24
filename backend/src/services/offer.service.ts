import { prisma } from "../lib/prisma";
import type { CreateOfferInput } from "../validation/offer.schema";
import { computePricing } from "./pricing";
import { priceForConfig, type ConfigPricing } from "../domain/priceList";
import { vatPct } from "../domain/pricing-data";
import { buildCommercial, buildCommercialMulti, type CommercialUnit } from "./commercial.service";
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
import { QTN_STATUSES, QTN_STATUS_LABEL, isLocked, type QtnStatus } from "../domain/qtnStatus";

// Pull the RMU config, and just enough of the owner to show/notify — never the
// password hash (a full `owner: true` would leak it through the decorated JSON).
const includeRmu = { rmu: true, owner: { select: { email: true, name: true } } } as const;

/** An offer's effective approval status. Offers created before the workflow — and
 *  new ones before their first transition — have `statusAt == null`, so we fall
 *  back to the submitted mirror, exactly as qtnStatus() does for LV rows. */
export function offerStatus(offer: {
  status?: string | null;
  statusAt?: Date | null;
  submittedAt?: Date | null;
}): QtnStatus {
  if (offer.statusAt && offer.status && (QTN_STATUSES as readonly string[]).includes(offer.status)) {
    return offer.status as QtnStatus;
  }
  return offer.submittedAt ? "SUBMITTED" : "DRAFT";
}

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

/** One RMU as frozen onto a multi-RMU offer (Offer.rmusJson). Its config drives
 *  the technical content; `snap` freezes the list prices (USD) exactly like the
 *  offer-level snap* columns do for a single-RMU offer; unitPrice/quantity are its
 *  own commercial line. */
export type StoredRmuLine = {
  config: RmuConfigInput;
  unitPrice: number;
  quantity: number;
  snap: {
    priceKey: string;
    basePriceUsd: number | null;
    listPriceUsd: number | null;
    addOns: { name: string; price: number }[];
    priceFound: boolean;
  };
};

/** Parse Offer.rmusJson → the stored RMU lines, or null for a single-RMU offer
 *  (column unset, empty, or corrupt → caller falls back to the `rmu` relation). */
export function parseRmuLines(rmusJson: string | null | undefined): StoredRmuLine[] | null {
  if (!rmusJson) return null;
  try {
    const arr = JSON.parse(rmusJson);
    if (Array.isArray(arr) && arr.length) return arr as StoredRmuLine[];
  } catch {
    /* corrupt snapshot → treat as single-RMU rather than 500 */
  }
  return null;
}

/** Rebuild a ConfigPricing from a line's frozen snapshot (never a live lookup),
 *  so a re-generated multi-RMU offer keeps the exact numbers it was quoted at. */
export function pricingFromSnap(line: StoredRmuLine, config: RmuConfigInput): ConfigPricing {
  return {
    panelCode: buildProductCode(config),
    priceKey: line.snap.priceKey,
    basePrice: line.snap.basePriceUsd ?? null,
    addOns: Array.isArray(line.snap.addOns) ? line.snap.addOns : [],
    listPrice: line.snap.listPriceUsd ?? null,
    found: line.snap.priceFound ?? false,
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

  // One offer can carry many RMUs. Normalise to a list: an explicit `rmus` array
  // when the client sends one, otherwise the single `rmu` (classic offer). Each
  // line freezes its own list-price snapshot — the same freeze the single-RMU
  // path has always done, now once per RMU.
  const inputLines: { config: RmuConfigInput; unitPrice: number; quantity: number }[] =
    input.rmus?.length
      ? input.rmus.map((u) => ({ config: u.config as RmuConfigInput, unitPrice: u.unitPrice, quantity: u.quantity }))
      : [{ config: input.rmu as RmuConfigInput, unitPrice: input.unitPrice, quantity: input.quantity }];
  const isMulti = inputLines.length > 1;

  const storedLines: StoredRmuLine[] = inputLines.map((u) => {
    const s = priceForConfig(u.config);
    return {
      config: u.config,
      unitPrice: u.unitPrice ?? 0,
      quantity: u.quantity ?? 1,
      snap: {
        priceKey: s.priceKey,
        basePriceUsd: s.basePrice,
        listPriceUsd: s.listPrice,
        addOns: s.addOns,
        priceFound: s.found,
      },
    };
  });

  // The FIRST RMU mirrors into the legacy `rmu` relation + snap* columns + the
  // offer-level unit price / quantity, so single-RMU readers keep working.
  const primary = storedLines[0];
  const cfg = primary.config;
  const configCode = buildCode(cfg);
  const snap = primary.snap;
  const snapVat = vatPct();

  const offer = await prisma.offer.create({
    data: {
      offerNumber,
      category: input.category,
      pricedAt: new Date(),
      // Only genuine multi-RMU offers store the list; a single RMU stays null so
      // its code path is byte-for-byte what it was before this feature existed.
      rmusJson: isMulti ? JSON.stringify(storedLines) : null,
      snapPriceKey: snap.priceKey,
      snapBasePriceUsd: snap.basePriceUsd,
      snapListPriceUsd: snap.listPriceUsd,
      snapAddOnsJson: JSON.stringify(snap.addOns),
      snapVatPct: snapVat,
      snapPriceFound: snap.priceFound,
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
      unitPrice: primary.unitPrice,
      quantity: primary.quantity,
      discountPct: input.discountPct,
      validityDays: input.validityDays,
      deliveryWeeks: input.deliveryWeeks ?? null,
      paymentTerms: input.paymentTerms ?? null,
      warrantyMonths: input.warrantyMonths ?? null,
      notes: input.notes ?? null,
      offerDate: input.offerDate ?? null,
      rmu: {
        create: {
          productType: cfg.productType,
          lbsBrand: cfg.lbsBrand ?? "ABB",
          clientSpec: cfg.clientSpec ?? "EECH",
          voltageKv: cfg.voltageKv,
          nalCount: cfg.nalCount,
          nalfCount: cfg.nalfCount,
          hasMetering: cfg.hasMetering,
          rtuType: cfg.rtuType,
          installation: cfg.installation,
          busbarCurrentA: cfg.busbarCurrentA,
          fuseRatingA: cfg.fuseRatingA ?? null,
          meteringCtPrimaryA: cfg.meteringCtPrimaryA ?? null,
          ctClass: cfg.ctClass ?? null,
          vtCores: cfg.vtCores ?? 1,
          vtBurdenVa: cfg.vtBurdenVa ?? null,
          vtClass: cfg.vtClass ?? null,
          meteringWithFuse: cfg.meteringWithFuse ?? false,
          configCode,
        },
      },
    },
    include: includeRmu,
  });
  return decorate(offer);
}

export async function listOffers(
  ownerId: string | undefined,
  opts: { all?: boolean; includeRemoved?: boolean } = {},
) {
  // Per-user by default: only the signed-in owner's offers. An approver (qtn.viewAll)
  // passes { all: true } so they can see and act on offers awaiting their approval —
  // the same widening the LV list does. Unauthenticated → none.
  if (!ownerId) return [];
  const offers = await prisma.offer.findMany({
    where: {
      ...(opts.all ? {} : { ownerId }),
      // Removed offers are kept but hidden, so a number is never reused. Only an
      // access.manage holder may ask to see them (the controller gates that).
      ...(opts.includeRemoved ? {} : { removedAt: null }),
    },
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

/**
 * Hide an offer from the lists WITHOUT erasing it.
 *
 * A hard delete freed its PL-YYYY-#### number, and nextOfferNumber() derives the next
 * number from the highest one in use — so deleting the latest offer made the following
 * one reuse that number, and two different documents could reach a customer under the
 * same reference. Same reasoning as LvQtn.removedAt.
 */
export async function removeOffer(id: string, byEmail: string) {
  await prisma.offer.update({
    where: { id },
    data: { removedAt: new Date(), removedBy: byEmail },
  });
}

export async function deleteOffer(id: string) {
  return prisma.offer.delete({ where: { id } });
}

/** Clone an offer into a fresh DRAFT (used by Duplicate / Amend). The price
 *  snapshot (snap* columns) is copied VERBATIM — never re-priced — so a copy of a
 *  quotation already sent to a customer keeps the exact numbers it was quoted at,
 *  the same rule createOffer freezes on. A new offer number is assigned; the RMU
 *  sub-config is copied too. `ownerId` attributes the copy to the signed-in user. */
export async function duplicateOffer(
  id: string,
  opts: { offerNumber?: string; ownerId?: string | null } = {}
) {
  const src = await prisma.offer.findUnique({ where: { id }, include: includeRmu });
  if (!src) return null;
  const offerNumber = opts.offerNumber?.trim() || (await nextOfferNumber());
  const r = src.rmu;
  const created = await prisma.offer.create({
    data: {
      offerNumber,
      category: src.category,
      projectName: src.projectName,
      customer: src.customer,
      status: "DRAFT", // a copy always starts as a draft
      salesNumber: src.salesNumber,
      orderNumber: src.orderNumber,
      quotationNo: src.quotationNo,
      opportunityNo: src.opportunityNo,
      salesName: src.salesName,
      salesMobile: src.salesMobile,
      salesEmail: src.salesEmail,
      salesManagerName: src.salesManagerName,
      salesManagerMobile: src.salesManagerMobile,
      salesManagerEmail: src.salesManagerEmail,
      supportName: src.supportName,
      supportMobile: src.supportMobile,
      supportEmail: src.supportEmail,
      currency: src.currency,
      usdToEgpRate: src.usdToEgpRate,
      unitPrice: src.unitPrice,
      quantity: src.quantity,
      discountPct: src.discountPct,
      validityDays: src.validityDays,
      deliveryWeeks: src.deliveryWeeks,
      paymentTerms: src.paymentTerms,
      warrantyMonths: src.warrantyMonths,
      notes: src.notes,
      offerDate: src.offerDate,
      ownerId: opts.ownerId ?? null,
      submittedAt: opts.ownerId ? new Date() : null,
      // Frozen price snapshot — copied as-is, deliberately NOT recomputed. The
      // multi-RMU list carries its own per-line snapshots, so it copies verbatim too.
      rmusJson: src.rmusJson,
      priceBookVersion: src.priceBookVersion,
      pricedAt: src.pricedAt,
      pricedFromStale: src.pricedFromStale,
      snapPriceKey: src.snapPriceKey,
      snapBasePriceUsd: src.snapBasePriceUsd,
      snapListPriceUsd: src.snapListPriceUsd,
      snapAddOnsJson: src.snapAddOnsJson,
      snapVatPct: src.snapVatPct,
      snapPriceFound: src.snapPriceFound,
      rmu: r
        ? {
            create: {
              productType: r.productType,
              lbsBrand: r.lbsBrand,
              clientSpec: r.clientSpec,
              voltageKv: r.voltageKv,
              nalCount: r.nalCount,
              nalfCount: r.nalfCount,
              hasMetering: r.hasMetering,
              rtuType: r.rtuType,
              installation: r.installation,
              busbarCurrentA: r.busbarCurrentA,
              fuseRatingA: r.fuseRatingA,
              meteringCtPrimaryA: r.meteringCtPrimaryA,
              ctClass: r.ctClass,
              vtCores: r.vtCores,
              vtBurdenVa: r.vtBurdenVa,
              vtClass: r.vtClass,
              meteringWithFuse: r.meteringWithFuse,
              configCode: r.configCode,
            },
          }
        : undefined,
    },
    include: includeRmu,
  });
  return decorate(created);
}

// Attach the assembled technical offer + computed commercial totals.
function decorate<
  T extends PriceSnapshotFields & {
    currency: string;
    discountPct: number;
    unitPrice: number;
    quantity: number;
    rmu: StoredRmu | null;
    rmusJson?: string | null;
    status?: string | null;
    statusAt?: Date | null;
    submittedAt?: Date | null;
    owner?: { email: string; name: string } | null;
  }
>(offer: T) {
  const config = offer.rmu ? toConfigInput(offer.rmu) : null;
  const generated = config ? assembleOffer(config) : null;
  // Frozen prices when the offer has them, live lookup only for legacy offers.
  const { pricing: listPricing, vatPct: offerVatPct } = resolvePricing(offer, config);
  const lines = parseRmuLines(offer.rmusJson);

  // Approval-workflow view fields, mirroring the LV list (status → label + lock,
  // plus the owner's name/email for the history and notifications).
  const st = offerStatus(offer);
  const wf = {
    status: st,
    statusLabel: QTN_STATUS_LABEL[st],
    locked: isLocked(st),
    ownerEmail: offer.owner?.email ?? "",
    ownerName: offer.owner?.name ?? "",
  };

  // Multi-RMU: the commercial is one line per RMU, each priced from its own frozen
  // snapshot, summed. The offer-level `pricing` mirrors those combined totals so
  // the history's money column (which reads commercial.totalInclVat) is correct.
  if (lines && lines.length > 1 && "offerNumber" in offer) {
    const units: CommercialUnit[] = lines.map((l) => {
      const g = assembleOffer(l.config);
      return {
        description: g.commercialDescription,
        pricing: pricingFromSnap(l, l.config),
        unitPrice: l.unitPrice,
        quantity: l.quantity,
      };
    });
    const commercial = buildCommercialMulti(offer as never, units, offerVatPct);
    const pricing = {
      subtotal: commercial.subtotal,
      discountAmount: commercial.discountAmount,
      total: commercial.totalExclVat,
    };
    return { ...offer, pricing, generated, listPricing, commercial, rmuCount: lines.length, ...wf };
  }

  const pricing = computePricing({
    quantity: offer.quantity,
    unitPrice: offer.unitPrice,
    discountPct: offer.discountPct,
  });
  const commercial =
    generated && offer && "offerNumber" in offer
      ? buildCommercial(offer as never, generated, listPricing, offerVatPct)
      : null;
  return { ...offer, pricing, generated, listPricing, commercial, rmuCount: 1, ...wf };
}
