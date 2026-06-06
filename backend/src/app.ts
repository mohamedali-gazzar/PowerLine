import express from "express";
import cors from "cors";
import offersRouter from "./routes/offers.routes";
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

  app.use(
    cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" })
  );
  app.use(express.json({ limit: "1mb" }));

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

  app.use("/api/offers", offersRouter);

  return app;
}
