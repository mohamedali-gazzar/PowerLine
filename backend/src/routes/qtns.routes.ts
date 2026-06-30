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

export default router;
