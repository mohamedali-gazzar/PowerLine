import type { Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma";
import {
  createOfferSchema,
  previewSchema,
} from "../validation/offer.schema";
import {
  createOffer,
  listOffers,
  getOffer,
  getOfferRaw,
  deleteOffer,
  toConfigInput,
  resolvePricing,
} from "../services/offer.service";
import { assembleOffer, type RmuConfigInput } from "../domain/assembly";
import { priceForConfig } from "../domain/priceList";
import { vatPct } from "../domain/pricing-data";
import { generateOfferPdf } from "../services/pdf.service";
import { buildCommercial } from "../services/commercial.service";
import { generateCommercialPdf } from "../services/pdf-commercial.service";
import { generateSldPdf } from "../services/pdf-sld.service";

export async function postOffer(req: Request, res: Response) {
  try {
    const input = createOfferSchema.parse(req.body);
    const offer = await createOffer(input);
    // Accounts system: attribute the offer to the signed-in user (optionalAuth)
    // and treat generation as the submission moment (feeds the dashboard charts).
    if (req.userId) {
      await prisma.offer.update({
        where: { id: offer.id },
        data: { ownerId: req.userId, submittedAt: new Date() },
      });
    }
    res.status(201).json(offer);
  } catch (err) {
    handleError(err, res);
  }
}

/** Assemble a technical offer from a config without saving — for live preview. */
export function postPreview(req: Request, res: Response) {
  try {
    const cfg = previewSchema.parse(req.body) as RmuConfigInput;
    const generated = assembleOffer(cfg);
    const listPricing = priceForConfig(cfg);
    // vatPct from the pricing master so the on-screen totals match the PDFs.
    res.json({ ...generated, listPricing, vatPct: vatPct() });
  } catch (err) {
    handleError(err, res);
  }
}

// GET /api/offers/next-qtn — suggest the next RMU quotation number (QTN-YY-####),
// one past the highest already used on an RMU offer this year. Suggestion only
// (not reserved), mirroring the LV next-number behaviour.
export async function getNextQtn(_req: Request, res: Response) {
  try {
    const yy = String(new Date().getFullYear() % 100).padStart(2, "0");
    const prefix = `QTN-${yy}-`;
    const rows = await prisma.offer.findMany({
      where: { quotationNo: { startsWith: prefix } },
      select: { quotationNo: true },
    });
    let max = 0;
    for (const r of rows) {
      const m = /(\d+)\s*$/.exec(r.quotationNo ?? "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    res.json({ suggestion: `${prefix}${String(max + 1).padStart(4, "0")}` });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getOffers(req: Request, res: Response) {
  try {
    res.json(await listOffers(req.userId));
  } catch (err) {
    handleError(err, res);
  }
}

export async function getOfferById(req: Request, res: Response) {
  try {
    const offer = await getOffer(req.params.id);
    // Only the owner can view it (hides legacy/other-user offers).
    if (!offer || offer.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    res.json(offer);
  } catch (err) {
    handleError(err, res);
  }
}

export async function deleteOfferById(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    if (!offer || offer.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    await deleteOffer(req.params.id);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
}

export async function getOfferPdf(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    // Owner-only: these are customer quotations. The token may arrive as ?t=
    // because a PDF link is a plain browser navigation (see middleware/auth).
    if (!offer || !offer.rmu || !req.userId || offer.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const generated = assembleOffer(toConfigInput(offer.rmu));
    const pdf = await generateOfferPdf(offer, generated);
    res.setHeader("Content-Type", "application/pdf");
    // Name it like the LV section: "TO-<QTN> Rev 00.pdf".
    const fileQtn = offer.quotationNo || offer.offerNumber;
    res.setHeader(
      "Content-Disposition",
      `${req.query.dl ? "attachment" : "inline"}; filename="TO-${fileQtn} Rev 00.pdf"`
    );
    res.send(pdf);
  } catch (err) {
    handleError(err, res);
  }
}

export async function getCommercialPdf(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    if (!offer || !offer.rmu || !req.userId || offer.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const config = toConfigInput(offer.rmu);
    const generated = assembleOffer(config);
    // Same frozen prices the offer screen shows — never a fresh lookup, or a
    // re-downloaded PDF could disagree with the quotation already sent.
    const { pricing, vatPct: offerVatPct } = resolvePricing(offer, config);
    const data = buildCommercial(offer, generated, pricing, offerVatPct);
    const pdf = await generateCommercialPdf(data);
    res.setHeader("Content-Type", "application/pdf");
    // Name it like the LV section: "CO-<QTN> Rev 00.pdf".
    const fileQtn = offer.quotationNo || offer.offerNumber;
    res.setHeader(
      "Content-Disposition",
      `${req.query.dl ? "attachment" : "inline"}; filename="CO-${fileQtn} Rev 00.pdf"`
    );
    res.send(pdf);
  } catch (err) {
    handleError(err, res);
  }
}

export async function getSldPdf(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    if (!offer || !offer.rmu || !req.userId || offer.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const generated = assembleOffer(toConfigInput(offer.rmu));
    const pdf = await generateSldPdf(offer, generated);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${req.query.dl ? "attachment" : "inline"}; filename="${offer.offerNumber}-${generated.panelCode}-SLD.pdf"`
    );
    res.send(pdf);
  } catch (err) {
    handleError(err, res);
  }
}

function handleError(err: unknown, res: Response) {
  if (err instanceof ZodError) {
    return res
      .status(400)
      .json({ error: "Validation failed", details: err.flatten() });
  }
  if (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  ) {
    return res.status(409).json({ error: "Offer number already exists" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
