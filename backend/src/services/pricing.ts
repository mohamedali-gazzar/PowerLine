// Commercial calculations for an offer. Kept separate so it can be reused by
// both the API responses and the PDF, and unit-tested independently.

export interface PricingInput {
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

export interface PricingResult {
  subtotal: number;
  discountAmount: number;
  total: number;
}

export function computePricing({
  quantity,
  unitPrice,
  discountPct,
}: PricingInput): PricingResult {
  const subtotal = round2(quantity * unitPrice);
  const discountAmount = round2(subtotal * (discountPct / 100));
  const total = round2(subtotal - discountAmount);
  return { subtotal, discountAmount, total };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(amount: number, currency: string): string {
  const fixed = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${fixed}`;
}
