// Builds the commercial-offer data (line items, totals, VAT, terms) from a
// stored offer + its assembled technical content + price-list lookup.

import { round2 } from "./pricing";
import type { GeneratedOffer } from "../domain/assembly";
import type { ConfigPricing } from "../domain/priceList";
import { VAT_PCT } from "../domain/pricing-data";

export { VAT_PCT }; // Egypt VAT — from the pricing master (rmu-pricing.json)

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

export function buildCommercial(
  offer: OfferLike,
  g: GeneratedOffer,
  pricing: ConfigPricing | null
): CommercialData {
  // Panel unit price: the offer's price if set, else the base (floor) price.
  // Add-ons (e.g. Outdoor Enclosure) are shown as their own line items.
  // The price list is in USD; when the offer currency is EGP, convert USD-sourced
  // values (base/list price + add-ons) using the offer's stored exchange rate.
  const rate = offer.currency === "EGP" && offer.usdToEgpRate && offer.usdToEgpRate > 0 ? offer.usdToEgpRate : 1;
  const basePrice = pricing?.basePrice != null ? round2(pricing.basePrice * rate) : null;
  const listPrice = pricing?.listPrice != null ? round2(pricing.listPrice * rate) : null;
  const panelUnit =
    offer.unitPrice && offer.unitPrice > 0 ? offer.unitPrice : basePrice ?? 0;
  const qty = offer.quantity || 1;

  const items: CommercialItem[] = [
    {
      description: g.commercialDescription,
      qty,
      unitPrice: round2(panelUnit),
      total: round2(panelUnit * qty),
    },
  ];
  // Additional items (outdoor enclosure, etc.) priced per unit from the sheet.
  for (const a of pricing?.addOns ?? []) {
    const p = round2(a.price * rate);
    items.push({
      description: a.name,
      qty,
      unitPrice: p,
      total: round2(p * qty),
    });
  }

  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const discountAmount = round2(subtotal * (offer.discountPct / 100));
  const totalExclVat = round2(subtotal - discountAmount);
  const vatAmount = round2(totalExclVat * (VAT_PCT / 100));
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
    vatPct: VAT_PCT,
    vatAmount,
    totalInclVat,
    validityDays: offer.validityDays,
    deliveryWeeks: offer.deliveryWeeks,
    paymentTerms: offer.paymentTerms,
    warrantyMonths: offer.warrantyMonths,
    listPrice,
    priceFound: pricing?.found ?? false,
  };
}
