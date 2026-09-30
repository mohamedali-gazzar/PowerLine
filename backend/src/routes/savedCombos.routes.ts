import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { list, save, pin, remove } from "../controllers/savedCombos.controller";

// Per-user saved combinations, reusable across panels: saved into one project, or pinned onto the
// user's own shelf and offered in every project. All handlers are scoped to the signed-in user
// inside the controller.
const router = Router();
router.use(requireAuth);
router.get("/", list);
router.post("/", save);
router.post("/:id/pin", pin);
router.delete("/:id", remove);

export default router;
