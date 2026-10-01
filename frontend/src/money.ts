// How money is written on screen and on an offer — in ONE place.
//
// The rule, from the owner: show up to two decimals, and drop them when they say nothing.
//
//     1950      → "1,950"
//     1950.00   → "1,950"
//     1950.20   → "1,950.2"
//     1950.25   → "1,950.25"
//
// It used to be rounded to whole money in nineteen separate places, each spelling the same
// `toLocaleString(..., { maximumFractionDigits: 0 })` by hand — so a price of 1,950.25 printed as
// 1,950 and the quarter went missing from the page, while the exported sheets kept it. One
// formatter now, so the next change to how money reads happens once rather than nineteen times.
//
// The locale is pinned to en-US rather than the browser's. Left to the browser, a machine set to
// Arabic renders Arabic-Indic digits (١٬٩٥٠) on an offer that is otherwise in Latin figures — which
// has to match what the customer is quoted.

/** Money for display: thousands separated, up to two decimals, no trailing zeros. */
export function fmtMoney(n: number): string {
  // A NaN price is a bug upstream, but printing "NaN" on an offer helps nobody — show zero and let
  // the blocker checks be the thing that complains.
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
