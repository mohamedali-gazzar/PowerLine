import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { list, save, remove } from "../controllers/savedCombos.controller";

// Per-user saved combinations, reusable across panels. All handlers are scoped to the signed-in
// user inside the controller.
const router = Router();
router.use(requireAuth);
router.get("/", list);
router.post("/", save);
router.delete("/:id", remove);

export default router;
