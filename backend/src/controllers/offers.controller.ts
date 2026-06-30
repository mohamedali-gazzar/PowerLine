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
} from "../services/offer.service";
import { assembleOffer, type RmuConfigInput } from "../domain/assembly";
import { priceForConfig } from "../domain/priceList";
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
    res.json({ ...generated, listPricing });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getOffers(_req: Request, res: Response) {
  res.json(await listOffers());
}

export async function getOfferById(req: Request, res: Response) {
  const offer = await getOffer(req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  res.json(offer);
}

export async function deleteOfferById(req: Request, res: Response) {
  try {
    await deleteOffer(req.params.id);
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Offer not found" });
  }
}

export async function getOfferPdf(req: Request, res: Response) {
  const offer = await getOfferRaw(req.params.id);
  if (!offer || !offer.rmu) {
    return res.status(404).json({ error: "Offer not found" });
  }
  const generated = assembleOffer(toConfigInput(offer.rmu));
  const pdf = await generateOfferPdf(offer, generated);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${req.query.dl ? "attachment" : "inline"}; filename="${offer.offerNumber}-${generated.panelCode}-technical.pdf"`
  );
  res.send(pdf);
}

export async function getCommercialPdf(req: Request, res: Response) {
  const offer = await getOfferRaw(req.params.id);
  if (!offer || !offer.rmu) {
    return res.status(404).json({ error: "Offer not found" });
  }
  const config = toConfigInput(offer.rmu);
  const generated = assembleOffer(config);
  const data = buildCommercial(offer, generated, priceForConfig(config));
  const pdf = await generateCommercialPdf(data);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${req.query.dl ? "attachment" : "inline"}; filename="${offer.offerNumber}-commercial.pdf"`
  );
  res.send(pdf);
}

export async function getSldPdf(req: Request, res: Response) {
  const offer = await getOfferRaw(req.params.id);
  if (!offer || !offer.rmu) return res.status(404).json({ error: "Offer not found" });
  const generated = assembleOffer(toConfigInput(offer.rmu));
  const pdf = await generateSldPdf(offer, generated);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${req.query.dl ? "attachment" : "inline"}; filename="${offer.offerNumber}-${generated.panelCode}-SLD.pdf"`
  );
  res.send(pdf);
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
