// Builds the commercial-offer data (line items, totals, VAT, terms) from a
// stored offer + its assembled technical content + price-list lookup.

import { round2 } from "./pricing";
import type { GeneratedOffer } from "../domain/assembly";
import type { ConfigPricing } from "../domain/priceList";

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
  listPrice: number | null; // reference floor price (min)
  priceFound: boolean;
}

interface OfferLike {
  offerNumber: string;
  projectName: string;
  customer: string;
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
  currency: string;
  usdToEgpRate?: number | null;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  validityDays: number;
  deliveryWeeks: number | null;
  paymentTerms: string | null;
  warrantyMonths: number | null;
  createdAt: Date | string;
  offerDate?: string | null;
}

/** One RMU on a (possibly multi-RMU) commercial offer: its printed description,
 *  its price-list lookup (frozen or live), and its own unit price + quantity.
 *  Prices in `pricing` are USD; the offer's currency/rate convert them. */
export interface CommercialUnit {
  description: string;
  pricing: ConfigPricing | null;
  unitPrice: number; // offer currency; 0 → fall back to the base (floor) price
  quantity: number;
}

/** @param vatPctValue VAT rate to apply, passed in (never read from the pricing
 *  master here) so an offer issued at 14 % still prints 14 % after the rate is
 *  changed. Callers pass the offer's frozen rate, or the current one for new work. */
export function buildCommercial(
  offer: OfferLike,
  g: GeneratedOffer,
  pricing: ConfigPricing | null,
  vatPctValue: number
): CommercialData {
  // A single-RMU offer is just the one-unit case of the multi builder — priced off
  // the offer-level unitPrice/quantity, exactly as before.
  return buildCommercialMulti(
    offer,
    [{ description: g.commercialDescription, pricing, unitPrice: offer.unitPrice, quantity: offer.quantity }],
    vatPctValue
  );
}

/** Build the commercial offer from one OR MANY RMUs. Each RMU becomes its own
 *  line item (plus a line for each of its add-ons), and the totals are summed
 *  across all of them; the discount / VAT / terms stay offer-level. */
export function buildCommercialMulti(
  offer: OfferLike,
  units: CommercialUnit[],
  vatPctValue: number
): CommercialData {
  // The price list is in USD; when the offer currency is EGP, convert USD-sourced
  // values (base/list price + add-ons) using the offer's stored exchange rate.
  const rate = offer.currency === "EGP" && offer.usdToEgpRate && offer.usdToEgpRate > 0 ? offer.usdToEgpRate : 1;

  const items: CommercialItem[] = [];
  let listPriceSum: number | null = null;
  for (const u of units) {
    const basePrice = u.pricing?.basePrice != null ? round2(u.pricing.basePrice * rate) : null;
    // This RMU's unit price: the entered price if set, else its base (floor) price.
    const panelUnit = u.unitPrice && u.unitPrice > 0 ? u.unitPrice : basePrice ?? 0;
    const qty = u.quantity || 1;
    items.push({
      description: u.description,
      qty,
      unitPrice: round2(panelUnit),
      total: round2(panelUnit * qty),
    });
    // Additional items (outdoor enclosure, etc.) priced per unit from the sheet.
    for (const a of u.pricing?.addOns ?? []) {
      const p = round2(a.price * rate);
      items.push({ description: a.name, qty, unitPrice: p, total: round2(p * qty) });
    }
    if (u.pricing?.listPrice != null) {
      listPriceSum = round2((listPriceSum ?? 0) + u.pricing.listPrice * rate);
    }
  }

  const listPrice = listPriceSum;
  // Priced when every RMU has either a catalogue price or a manual unit price.
  const priceFound =
    units.length > 0 && units.every((u) => (u.pricing?.found ?? false) || u.unitPrice > 0);

  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const discountAmount = round2(subtotal * (offer.discountPct / 100));
  const totalExclVat = round2(subtotal - discountAmount);
  const vatAmount = round2(totalExclVat * (vatPctValue / 100));
  const totalInclVat = round2(totalExclVat + vatAmount);

  return {
    offerNumber: offer.offerNumber,
    plReference: offer.offerNumber,
    date: offer.offerDate || new Date(offer.createdAt).toISOString().slice(0, 10),
    customer: offer.customer,
    project: offer.projectName,
    quotationNo: offer.quotationNo ?? null,
    opportunityNo: offer.opportunityNo ?? null,
    salesName: offer.salesName ?? null,
    salesMobile: offer.salesMobile ?? null,
    salesEmail: offer.salesEmail ?? null,
    salesManagerName: offer.salesManagerName ?? null,
    salesManagerMobile: offer.salesManagerMobile ?? null,
    salesManagerEmail: offer.salesManagerEmail ?? null,
    supportName: offer.supportName ?? null,
    supportMobile: offer.supportMobile ?? null,
    supportEmail: offer.supportEmail ?? null,
    currency: offer.currency,
    items,
    subtotal,
    discountPct: offer.discountPct,
    discountAmount,
    totalExclVat,
    vatPct: vatPctValue,
    vatAmount,
    totalInclVat,
    validityDays: offer.validityDays,
    deliveryWeeks: offer.deliveryWeeks,
    paymentTerms: offer.paymentTerms,
    warrantyMonths: offer.warrantyMonths,
    listPrice,
    priceFound,
  };
}
