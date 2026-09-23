import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getSeen, postSeen, getCompletedCount } from "../controllers/achievements.controller";

// Per-user milestone achievements. Every handler is scoped to the signed-in user inside the
// controller; requireAuth here means an anonymous caller is refused (routeCoverage.test.ts).
const router = Router();
router.use(requireAuth);
router.get("/seen", getSeen);
router.post("/seen", postSeen);
router.get("/completed-count", getCompletedCount);

export default router;
