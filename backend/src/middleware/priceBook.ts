import type { Request, Response, NextFunction } from "express";
import { refreshPriceBook, priceBookInfo } from "../domain/pricing-data";

/** Makes the request see the currently published price list.
 *
 *  One indexed primary-key read; the full snapshot is only re-read when the
 *  published version actually changed. This is what makes "Update price list &
 *  database" visible on the very next request with no redeploy.
 *
 *  Never blocks the request: if the database is unreachable the last known (or
 *  bundled) prices are served and the response carries X-PriceBook-Stale, so
 *  reads degrade rather than fail. Writes are gated separately. */
export async function withPriceBook(_req: Request, res: Response, next: NextFunction) {
  await refreshPriceBook();
  const info = priceBookInfo();
  res.setHeader("X-PriceBook-Version", String(info.version));
  res.setHeader("X-PriceBook-Source", info.source);
  if (info.stale) res.setHeader("X-PriceBook-Stale", "1");
  next();
}

/** Refuses to CREATE a priced document from prices we are not sure are current —
 *  a customer offer must never be frozen against a stale fallback list. */
export function requireFreshPriceBook(_req: Request, res: Response, next: NextFunction) {
  const info = priceBookInfo();
  if (info.stale) {
    return res.status(503).json({
      error: "The price list is temporarily unavailable — please try again in a moment.",
    });
  }
  next();
}
