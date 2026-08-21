import express from "express";
import cors from "cors";
import offersRouter from "./routes/offers.routes";
import authRouter from "./routes/auth.routes";
import qtnsRouter from "./routes/qtns.routes";
import { requireAuth } from "./middleware/auth";
import {
  updateProfile,
  history,
  weeklyStats,
  estimatorEval,
  stalePricedQtns,
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
  updateLvPoles,
  createLvComponent,
  retireLvItem,
  getLvCatalog,
  getLvCatalogChanges,
  getLvDuplicateNames,
} from "./controllers/pricing-lv.controller";
import {
  postLvImportPreview,
  postLvImportApply,
  postLvImportCancel,
} from "./controllers/pricing-lv-import.controller";
import {
  listCombos,
  putCombo,
  resetCombos,
} from "./controllers/pricing-lv-combos.controller";
import {
  listActiveAnnouncements,
  listAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "./controllers/announcements.controller";
import { withPriceBook } from "./middleware/priceBook";
import { requirePriceAdmin, requireOwner, requirePriceViewer, requireAnnouncements } from "./middleware/roles";
import {
  listNotifications,
  markRead,
  markAllRead,
} from "./controllers/notifications.controller";
import {
  myAccess,
  permCatalogue,
  listAccessUsers,
  setAccess,
  accessHistory,
} from "./controllers/access.controller";
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

  // In-app notifications
  app.get("/api/notifications", requireAuth, listNotifications);
  app.post("/api/notifications/read-all", requireAuth, markAllRead); // before "/:id/read"
  app.post("/api/notifications/:id/read", requireAuth, markRead);

  // Access Center — all permission management lives here. `/me` is authenticated
  // only (every signed-in user must be able to ask what they may do); the rest
  // needs access.manage.
  app.get("/api/access/me", requireAuth, myAccess);
  app.get("/api/access/catalogue", requireAuth, permCatalogue);
  app.get("/api/access/users", requireAuth, requireOwner, listAccessUsers);
  app.post("/api/access/users/:id", requireAuth, requireOwner, setAccess);
  app.get("/api/access/history", requireAuth, requireOwner, accessHistory);

  app.put("/api/profile", requireAuth, updateProfile);
  app.get("/api/account/history", requireAuth, history);
  app.get("/api/stats/weekly", requireAuth, weeklyStats);
  app.get("/api/stats/evaluation", requireAuth, estimatorEval);
  app.get("/api/stats/stale-prices", requireAuth, stalePricedQtns);

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
  // READ endpoints accept "view price list" as well as "edit" — otherwise granting
  // someone view-only access left them with a page they could open but not fill.
  app.get("/api/pricing/rmu", requireAuth, requirePriceViewer, listRmuPrices);
  app.patch("/api/pricing/rmu/:id", requireAuth, requirePriceAdmin, updateRmuPrice);
  app.post("/api/pricing/rmu/:id/retire", requireAuth, requirePriceAdmin, retireRmuPrice);
  app.post("/api/pricing/rmu/derive-key", requireAuth, requirePriceAdmin, postDeriveKey);
  app.post("/api/pricing/rmu", requireAuth, requirePriceAdmin, createRmuPrice);
  // LV catalogue (2,121 components + 253 enclosures)
  app.get("/api/catalog/lv", requireAuth, getLvCatalog);
  // What changed in the price list — readable by everyone, so an offer author can
  // check they are quoting on current prices without price-admin rights.
  app.get("/api/catalog/lv/changes", requireAuth, getLvCatalogChanges);
  app.get("/api/pricing/lv", requireAuth, requirePriceViewer, listLvPrices);
  app.get("/api/pricing/lv/facets", requireAuth, requirePriceViewer, getLvFacets);
  // Items that already share a name — read-only, and viewable by anyone who can
  // see prices: an estimator picking between two identical labels is the person
  // most affected by it.
  app.get("/api/pricing/lv/duplicates", requireAuth, requirePriceViewer, getLvDuplicateNames);
  app.patch("/api/pricing/lv/:id", requireAuth, requirePriceAdmin, updateLvPrice);
  // Pole count drives the connection-copper cost, so it is edited, audited and
  // published exactly like a price. Same permission for the same reason.
  app.patch("/api/pricing/lv/:id/poles", requireAuth, requirePriceAdmin, updateLvPoles);
  app.post("/api/pricing/lv", requireAuth, requirePriceAdmin, createLvComponent);
  app.post("/api/pricing/lv/:id/retire", requireAuth, requirePriceAdmin, retireLvItem);
  app.post("/api/pricing/lv/seed-chunk", requireAuth, requirePriceAdmin, postLvSeedChunk);
  app.post("/api/pricing/lv/settings", requireAuth, requirePriceAdmin, postLvSettings);
  // Circuit-combination templates (ATS / photocell / MCC / WD / motorized).
  // OWNER ONLY (access.manage): these decide what goes into a quoted combination,
  // so a bad edit re-prices work rather than just mislabelling it — a stricter
  // gate than the rest of the price list, which price admins may edit.
  app.get("/api/pricing/lv/combos", requireAuth, requireOwner, listCombos);
  app.post("/api/pricing/lv/combos/reset", requireAuth, requireOwner, resetCombos);
  app.put("/api/pricing/lv/combos/:section", requireAuth, requireOwner, putCombo);
  // Bulk update from a spreadsheet: preview first, apply only on confirmation.
  app.post("/api/pricing/lv/import/preview", requireAuth, requirePriceAdmin, postLvImportPreview);
  app.post("/api/pricing/lv/import/:id/apply", requireAuth, requirePriceAdmin, postLvImportApply);
  app.post("/api/pricing/lv/import/:id/cancel", requireAuth, requirePriceAdmin, postLvImportCancel);

  // Announcements: every signed-in user reads the ACTIVE ones for the dashboard;
  // managing them needs the "announcements.manage" permission (the Admin role holds
  // it; grant it to anyone else from the Access Center).
  app.get("/api/announcements", requireAuth, listActiveAnnouncements);
  app.get("/api/announcements/all", requireAuth, requireAnnouncements, listAllAnnouncements);
  app.post("/api/announcements", requireAuth, requireAnnouncements, createAnnouncement);
  app.patch("/api/announcements/:id", requireAuth, requireAnnouncements, updateAnnouncement);
  app.delete("/api/announcements/:id", requireAuth, requireAnnouncements, deleteAnnouncement);

  app.get("/api/pricing/history", requireAuth, requirePriceViewer, getHistory);
  app.post("/api/pricing/changes/:id/undo", requireAuth, requirePriceAdmin, postUndo);
  // Granting access is owner-only — a price admin cannot promote themselves.
  app.get("/api/pricing/users", requireAuth, requireOwner, listUsers);
  app.post("/api/pricing/users/:id/role", requireAuth, requireOwner, setUserRole);
  app.get("/api/pricing/pending", requireAuth, requirePriceViewer, getPending);
  app.post("/api/pricing/publish", requireAuth, requirePriceAdmin, postPublish);

  // RMU offers. requireAuth, NOT optionalAuth (which this used to use): signed out,
  // POST /offers/preview returned the real floor prices to anyone on the internet — base
  // price, add-ons and list price — and POST /offers created a permanent owner-less row
  // while consuming a number from the PL-YYYY-#### sequence, because createOffer() runs
  // before ownership is attributed. Every handler here already needs req.userId for its
  // ownership check, and PDF links carry the token as ?t= (GET/HEAD only), so nothing
  // legitimate loses access.
  // withPriceBook ensures an offer is priced against the current published list.
  app.use("/api/offers", requireAuth, withPriceBook, offersRouter);

  return app;
}
