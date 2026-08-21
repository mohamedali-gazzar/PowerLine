// SECURITY BOUNDARY TESTS — every protected route must reject an anonymous caller.
//
// These run against the real Express app with no database: `requireAuth` answers 401
// before any handler or Prisma call, which is exactly the property being asserted.
//
// The reason this file exists: /api/offers used `optionalAuth`, so signed out,
// POST /api/offers/preview returned the real floor prices (base price, add-ons and list
// price) to anyone on the internet, and POST /api/offers created a permanent owner-less
// row while consuming a number from the PL-YYYY-#### sequence. Verified against
// production before the fix. Do not relax these without a deliberate decision.

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app";

const app = createApp();

/** Routes that must NEVER answer without a valid token. */
const PROTECTED: Array<[method: "get" | "post" | "put" | "patch" | "delete", path: string]> = [
  // RMU offers — the whole router.
  ["get", "/api/offers"],
  ["post", "/api/offers"],
  ["post", "/api/offers/preview"],
  ["get", "/api/offers/next-qtn"],
  ["get", "/api/offers/some-id"],
  ["post", "/api/offers/some-id/duplicate"],
  ["delete", "/api/offers/some-id"],
  ["get", "/api/offers/some-id/pdf"],
  ["get", "/api/offers/some-id/commercial-pdf"],
  ["get", "/api/offers/some-id/sld-pdf"],
  // LV quotations.
  ["get", "/api/qtns"],
  ["post", "/api/qtns"],
  // Account, stats and notifications.
  ["put", "/api/profile"],
  ["get", "/api/account/history"],
  ["get", "/api/stats/weekly"],
  ["get", "/api/stats/evaluation"],
  ["get", "/api/stats/stale-prices"],
  ["get", "/api/notifications"],
  ["post", "/api/notifications/read-all"],
  // Access control.
  ["get", "/api/access/me"],
  ["get", "/api/access/catalogue"],
  ["get", "/api/access/users"],
  ["get", "/api/access/history"],
  // Price book — reads and writes alike.
  ["get", "/api/pricing/version"],
  ["get", "/api/pricing/status"],
  ["get", "/api/pricing/verify"],
  ["post", "/api/pricing/seed"],
  ["get", "/api/pricing/rmu"],
  ["post", "/api/pricing/rmu"],
  ["patch", "/api/pricing/rmu/some-id"],
  ["get", "/api/pricing/lv"],
  ["post", "/api/pricing/lv"],
  ["get", "/api/pricing/lv/facets"],
  ["get", "/api/pricing/history"],
  ["get", "/api/pricing/pending"],
  ["post", "/api/pricing/publish"],
  ["get", "/api/pricing/users"],
  // Catalogues carry every price in the business.
  ["get", "/api/catalog/rmu"],
  ["get", "/api/catalog/lv"],
  ["get", "/api/catalog/lv/changes"],
];

describe("no protected route answers an anonymous caller", () => {
  it.each(PROTECTED)("%s %s -> 401", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status, `${method.toUpperCase()} ${path} returned ${res.status}`).toBe(401);
    // And it must not leak anything in the body beyond the refusal.
    expect(JSON.stringify(res.body)).not.toMatch(/price|basePrice|listPrice/i);
  });
});

describe("the RMU preview no longer discloses the price list", () => {
  // The exact request that leaked $13,190 + $2,000 + $14,000 from production.
  const leakyBody = {
    productType: "PSEC",
    voltageKv: 12,
    lbsBrand: "ABB",
    clientSpec: "EECH",
    nalCount: 2,
    nalfCount: 1,
    hasMetering: true,
    rtuType: "SMART2",
    installation: "OUTDOOR",
    busbarCurrentA: 630,
  };

  it("refuses the anonymous request that used to return real prices", async () => {
    const res = await request(app).post("/api/offers/preview").send(leakyBody);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Not signed in." });
  });

  it("does not accept a token smuggled in the query string on a POST", async () => {
    // ?t= is deliberately restricted to GET/HEAD so a URL can only ever read.
    // Even a VALID token must not authorise a state-changing method this way.
    const res = await request(app).post("/api/offers/preview?t=anything").send(leakyBody);
    expect(res.status).toBe(401);
  });
});

describe("routes that are public on purpose stay public", () => {
  // Guard against over-correcting: these must keep working without a token.
  it("health check", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "powerline-backend" });
  });

  it("the RMU option lists, which carry no prices", async () => {
    const res = await request(app).get("/api/meta/rmu");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("productTypes");
    // Option metadata only — no pricing may ride along here.
    expect(JSON.stringify(res.body)).not.toMatch(/basePrice|listPrice/i);
  });

  it("sign-in and sign-up endpoints remain reachable", async () => {
    // They must not answer 401 — they are how you obtain a token in the first place.
    for (const path of ["/api/auth/login", "/api/auth/register", "/api/auth/forgot"]) {
      const res = await request(app).post(path).send({});
      expect(res.status, `${path} returned ${res.status}`).not.toBe(401);
    }
  });
});
