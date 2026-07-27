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
  getVersion,
  getStatus,
  getRmuCatalog,
  postSeed,
  getVerify,
  listRmuPrices,
  updateRmuPrice,
  retireRmuPrice,
  createRmuPrice,
  postDeriveKey,
  getHistory,
  postUndo,
  listUsers,
  setUserRole,
  getPending,
  postPublish,
} from "./controllers/pricing.controller";
import {
  postLvSeedChunk,
  postLvSettings,
  listLvPrices,
  getLvFacets,
  updateLvPrice,
  createLvComponent,
  getLvCatalog,
} from "./controllers/pricing-lv.controller";
import { withPriceBook } from "./middleware/priceBook";
import { requirePriceAdmin, requireOwner } from "./middleware/roles";
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

  // CORS: use the configured allowlist. If none is set, allow all in dev but
  // DISABLE cross-origin in production (the frontend is same-origin on Vercel, so
  // it still works) rather than defaulting to "*".
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : process.env.NODE_ENV === "production"
    ? false
    : "*";
  app.use(cors({ origin: corsOrigin }));
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

  // ── Price list ─────────────────────────────────────────────────────────────
  // Prices come from the published snapshot in the database (see pricing-data.ts).
  // withPriceBook refreshes the in-process cache when the version changed, which
  // is what makes a publish live on the next request with no redeploy.
  app.get("/api/pricing/version", requireAuth, getVersion);
  app.get("/api/pricing/status", requireAuth, getStatus);
  app.get("/api/pricing/verify", requireAuth, getVerify);
  app.post("/api/pricing/seed", requireAuth, postSeed);
  app.get("/api/catalog/rmu", requireAuth, withPriceBook, getRmuCatalog);
  // Editing — price-admin only. Saves go to the DRAFT; customers only see them
  // once "Update price list & database" (publish) is pressed.
  app.get("/api/pricing/rmu", requireAuth, requirePriceAdmin, listRmuPrices);
  app.patch("/api/pricing/rmu/:id", requireAuth, requirePriceAdmin, updateRmuPrice);
  app.post("/api/pricing/rmu/:id/retire", requireAuth, requirePriceAdmin, retireRmuPrice);
  app.post("/api/pricing/rmu/derive-key", requireAuth, requirePriceAdmin, postDeriveKey);
  app.post("/api/pricing/rmu", requireAuth, requirePriceAdmin, createRmuPrice);
  // LV catalogue (2,121 components + 253 enclosures)
  app.get("/api/catalog/lv", requireAuth, getLvCatalog);
  app.get("/api/pricing/lv", requireAuth, requirePriceAdmin, listLvPrices);
  app.get("/api/pricing/lv/facets", requireAuth, requirePriceAdmin, getLvFacets);
  app.patch("/api/pricing/lv/:id", requireAuth, requirePriceAdmin, updateLvPrice);
  app.post("/api/pricing/lv", requireAuth, requirePriceAdmin, createLvComponent);
  app.post("/api/pricing/lv/seed-chunk", requireAuth, requirePriceAdmin, postLvSeedChunk);
  app.post("/api/pricing/lv/settings", requireAuth, requirePriceAdmin, postLvSettings);

  app.get("/api/pricing/history", requireAuth, requirePriceAdmin, getHistory);
  app.post("/api/pricing/changes/:id/undo", requireAuth, requirePriceAdmin, postUndo);
  // Granting access is owner-only — a price admin cannot promote themselves.
  app.get("/api/pricing/users", requireAuth, requireOwner, listUsers);
  app.post("/api/pricing/users/:id/role", requireAuth, requireOwner, setUserRole);
  app.get("/api/pricing/pending", requireAuth, requirePriceAdmin, getPending);
  app.post("/api/pricing/publish", requireAuth, requirePriceAdmin, postPublish);

  // RMU offers — optionalAuth records a signed-in user as the offer's owner.
  // withPriceBook ensures an offer is priced against the current published list.
  app.use("/api/offers", optionalAuth, withPriceBook, offersRouter);

  return app;
}
