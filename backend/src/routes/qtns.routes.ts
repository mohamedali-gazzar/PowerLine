import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  list,
  getNextNumber,
  getOne,
  create,
  update,
  rename,
  remove,
  duplicate,
  submit,
  unsubmit,
  listAttachments,
  uploadAttachment,
  downloadAttachment,
  removeAttachment,
} from "../controllers/qtns.controller";

const router = Router();
router.use(requireAuth);

router.get("/", list);
router.get("/next-number", getNextNumber); // before "/:id"
router.post("/", create);
router.get("/:id", getOne);
router.put("/:id", update);
router.patch("/:id/number", rename);
router.delete("/:id", remove);
router.post("/:id/duplicate", duplicate);
router.post("/:id/submit", submit);
router.post("/:id/unsubmit", unsubmit);

// Specs-tab attachments (files live in their own table, not in the QTN state)
router.get("/:id/attachments", listAttachments);
router.post("/:id/attachments", uploadAttachment);
router.get("/:id/attachments/:fileId", downloadAttachment);
router.delete("/:id/attachments/:fileId", removeAttachment);

export default router;
