import { Router } from "express";
import {
  postOffer,
  postPreview,
  getNextQtn,
  getOffers,
  getOfferById,
  deleteOfferById,
  duplicateOfferById,
  getOfferPdf,
  getCommercialPdf,
  getSldPdf,
} from "../controllers/offers.controller";

const router = Router();

router.get("/", getOffers);
router.post("/", postOffer);
router.post("/preview", postPreview);
router.get("/next-qtn", getNextQtn); // must precede "/:id"
router.get("/:id", getOfferById);
router.post("/:id/duplicate", duplicateOfferById);
router.delete("/:id", deleteOfferById);
router.get("/:id/pdf", getOfferPdf);
router.get("/:id/commercial-pdf", getCommercialPdf);
router.get("/:id/sld-pdf", getSldPdf);

export default router;
