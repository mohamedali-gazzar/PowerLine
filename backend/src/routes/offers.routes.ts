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
  transitionOffer,
  getOfferEvents,
  putOffer,
  offerActivity,
} from "../controllers/offers.controller";

const router = Router();

router.get("/", getOffers);
router.post("/", postOffer);
router.post("/preview", postPreview);
router.get("/next-qtn", getNextQtn); // must precede "/:id"
router.get("/:id", getOfferById);
router.get("/:id/events", getOfferEvents); // audit trail (return-for-revision history)
router.put("/:id", putOffer); // update a draft offer in place (autosave while editing)
router.post("/:id/activity", offerActivity); // accrue active working time (owner)
router.post("/:id/duplicate", duplicateOfferById);
router.post("/:id/transition", transitionOffer); // RMU approval lifecycle
router.delete("/:id", deleteOfferById);
router.get("/:id/pdf", getOfferPdf);
router.get("/:id/commercial-pdf", getCommercialPdf);
router.get("/:id/sld-pdf", getSldPdf);

export default router;
