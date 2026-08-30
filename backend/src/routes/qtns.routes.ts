import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePerm } from "../middleware/roles";
import {
  list,
  listAll,
  queue,
  getNextNumber,
  getOne,
  create,
  update,
  activity,
  putSizingReview,
  rename,
  remove,
  restore,
  duplicate,
  amend,
  submit,
  unsubmit,
  transition,
  events,
  assignees,
  approvers,
  reassign,
  cowork,
  listAttachments,
  uploadAttachment,
  downloadAttachment,
  removeAttachment,
} from "../controllers/qtns.controller";

const router = Router();
router.use(requireAuth);

// Static paths first — "/:id" would otherwise swallow them.
router.get("/", list); // my quotations, every status
router.get("/all", requirePerm("qtn.viewAll"), listAll); // LV Offers History (no drafts)
router.get("/queue", requirePerm("qtn.approve"), queue); // waiting for approval
router.get("/next-number", getNextNumber);
router.get("/assignees", assignees); // users a quotation can be handed to
router.get("/approvers", approvers); // Section Heads & Team Leaders to send for approval

router.post("/", create);
router.get("/:id", getOne);
router.put("/:id", update);
router.patch("/:id/number", rename);
router.delete("/:id", remove); // hides it — never erases; see the controller
// Undo that. Owner only: the person who can hide one from everybody brings it back.
router.post("/:id/restore", requirePerm("access.manage"), restore);
router.post("/:id/duplicate", duplicate);
router.post("/:id/amend", amend); // cancels this revision, opens the next one
router.post("/:id/activity", activity); // accrue active working time (owner/co-owner)
router.put("/:id/sizing-review", putSizingReview); // reviewer's sizing calculation pad (editable while locked)

// Workflow. submit/unsubmit are thin aliases over /transition so an older client
// mid-rollout keeps working.
router.post("/:id/transition", transition);
router.post("/:id/reassign", reassign);
router.post("/:id/cowork", cowork);
router.post("/:id/submit", submit);
router.post("/:id/unsubmit", unsubmit);
router.get("/:id/events", events);

// Specs-tab attachments (files live in their own table, not in the QTN state)
router.get("/:id/attachments", listAttachments);
router.post("/:id/attachments", uploadAttachment);
router.get("/:id/attachments/:fileId", downloadAttachment);
router.delete("/:id/attachments/:fileId", removeAttachment);

export default router;
