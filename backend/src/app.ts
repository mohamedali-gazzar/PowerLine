import express from "express";
import cors from "cors";
import offersRouter from "./routes/offers.routes";
import authRouter from "./routes/auth.routes";
import qtnsRouter from "./routes/qtns.routes";
import { requireAuth, optionalAuth } from "./middleware/auth";
import {
  updateProfile,
  history,
  weeklyStats,
} from "./controllers/account.controller";
import {
  PRODUCT_TYPES,
  VOLTAGES,
  RTU_TYPES,
  INSTALLATIONS,
  PRODUCTS,
  getRatings,
} from "./domain/standards";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
  // Generous limit: profile photos (base64) + large LV quotation states.
  app.use(express.json({ limit: "8mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "powerline-backend" });
  });

  // Option lists + the standards table, so the frontend can show ratings live.
  app.get("/api/meta/rmu", (_req, res) => {
    const ratings: Record<string, ReturnType<typeof getRatings>> = {};
    for (const t of PRODUCT_TYPES)
      for (const v of VOLTAGES) ratings[`${t}-${v}`] = getRatings(t, v);
    res.json({
      productTypes: PRODUCT_TYPES,
      voltages: VOLTAGES,
      rtuTypes: RTU_TYPES,
      installations: INSTALLATIONS,
      products: PRODUCTS,
      ratings,
    });
  });

  // ── Accounts system ────────────────────────────────────────────────────────
  app.use("/api/auth", authRouter);
  app.use("/api/qtns", qtnsRouter); // per-user LV quotations (requireAuth inside)
  app.put("/api/profile", requireAuth, updateProfile);
  app.get("/api/account/history", requireAuth, history);
  app.get("/api/stats/weekly", requireAuth, weeklyStats);

  // RMU offers — optionalAuth records a signed-in user as the offer's owner.
  app.use("/api/offers", optionalAuth, offersRouter);

  return app;
}
