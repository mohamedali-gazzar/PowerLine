import { Router } from "express";
import {
  register,
  verify,
  complete,
  login,
  devLogin,
  forgot,
  reset,
  me,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", register); // email → send sign-up code
router.post("/verify", verify); // check the code (does not consume)
router.post("/complete", complete); // code + password → create account
router.post("/login", login);
router.post("/dev-login", devLogin); // DEV ONLY — 404s in production
router.post("/forgot", forgot); // email → send reset code
router.post("/reset", reset); // code + new password
router.get("/me", requireAuth, me);

export default router;
