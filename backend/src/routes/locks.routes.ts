import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { acquire, release } from "../controllers/locks.controller";

// Review locks — "someone is reviewing this" mutual exclusion for approvers, shared by LV
// quotations and RMU offers (keyed by the subject's id). Any signed-in user may acquire;
// the client only turns it on for approvers viewing something Waiting for approval.
const router = Router();
router.use(requireAuth);
router.post("/:id", acquire); // acquire / refresh (heartbeat); { force } to take over (admin)
router.delete("/:id", release); // release when the caller holds it

export default router;
