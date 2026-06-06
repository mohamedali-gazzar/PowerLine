// Builds the commercial-offer data (line items, totals, VAT, terms) from a
// stored offer + its assembled technical content + price-list lookup.

import { round2 } from "./pricing";
import type { GeneratedOffer } from "../domain/assembly";
import type { ConfigPricing } from "../domain/priceList";

export const VAT_PCT = 14; // Egypt VAT

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
  location: string | null;
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
  location: string | null;
  currency: string;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  validityDays: number;
  deliveryWeeks: number | null;
  paymentTerms: string | null;
  warrantyMonths: number | null;
  createdAt: Date | string;
}

export function buildCommercial(
  offer: OfferLike,
  g: GeneratedOffer,
  pricing: ConfigPricing | null
): CommercialData {
  // Panel unit price: the offer's price if set, else the base (floor) price.
  // Add-ons (e.g. Outdoor Enclosure) are shown as their own line items.
  const basePrice = pricing?.basePrice ?? null;
  const listPrice = pricing?.listPrice ?? null;
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
    items.push({
      description: a.name,
      qty,
      unitPrice: round2(a.price),
      total: round2(a.price * qty),
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
    date: new Date(offer.createdAt).toISOString().slice(0, 10),
    customer: offer.customer,
    project: offer.projectName,
    location: offer.location,
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
