import { Router } from "express";
import {
  postOffer,
  postPreview,
  getOffers,
  getOfferById,
  deleteOfferById,
  getOfferPdf,
  getCommercialPdf,
  getSldPdf,
} from "../controllers/offers.controller";

const router = Router();

router.get("/", getOffers);
router.post("/", postOffer);
router.post("/preview", postPreview);
router.get("/:id", getOfferById);
router.delete("/:id", deleteOfferById);
router.get("/:id/pdf", getOfferPdf);
router.get("/:id/commercial-pdf", getCommercialPdf);
router.get("/:id/sld-pdf", getSldPdf);

export default router;
