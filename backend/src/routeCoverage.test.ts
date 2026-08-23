// SELF-MAINTAINING SECURITY BOUNDARY TEST.
//
// authBoundary.test.ts lists routes by hand, which means it only protects the routes
// somebody remembered to add. On 23 Aug 2026 a new endpoint (POST /api/offers/:id/transition)
// arrived from the other side of the team and was not in that list — it happened to be
// safe because it sits under a router mounted with requireAuth, but the test would not
// have noticed if it had been mounted anywhere else.
//
// So this file does not list routes. It reads the ACTUAL route table out of the built
// Express app and asserts that every /api route either appears in PUBLIC below, with a
// reason, or refuses an anonymous caller. A new route is therefore protected by default:
// add one without auth and this test fails until it is either guarded or consciously
// declared public.
//
// No database is involved — requireAuth answers 401 before any handler or Prisma call.

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app";

const app = createApp();

/**
 * Routes that are deliberately reachable without a token, each with the reason.
 * Adding to this list is a security decision, not housekeeping.
 */
const PUBLIC: Record<string, string> = {
  "GET /api/health": "Liveness probe. Returns a fixed string, no data.",
  "GET /api/meta/rmu":
    "Option lists and the electrical standards table. The login screen's bundle needs it, and it contains no prices and no customer data.",
  "POST /api/auth/register": "Starts sign-up. Gated to the company e-mail domain and rate limited.",
  "POST /api/auth/verify": "Checks a sign-up code. Attempt-capped.",
  "POST /api/auth/complete": "Finishes sign-up. Requires a valid code.",
  "POST /api/auth/login": "Sign-in itself. Rate limited.",
  "POST /api/auth/dev-login": "Local development only — returns 404 whenever IS_PROD.",
  "POST /api/auth/forgot": "Starts a password reset. Rate limited.",
  "POST /api/auth/reset": "Completes a password reset. Requires a valid code.",
};

type Route = { method: string; path: string };

/** Turn an Express mount regexp back into its path prefix. */
function mountPrefix(re: RegExp | undefined): string {
  if (!re) return "";
  let s = re.source;
  if (s === "^\\/?$" || s === "^\\/$") return "";
  // Express builds mounts as: ^\/api\/offers\/?(?=\/|$)
  s = s.replace("^", "");
  s = s.replace("\\/?(?=\\/|$)", "");
  s = s.replace("(?=\\/|$)", "");
  s = s.replace(/\$$/, "");
  s = s.split("\\/").join("/");
  return s;
}

/** Read the real route table out of the app, following mounted routers. */
function routeTable(): Route[] {
  const out: Route[] = [];
  // Express 4 exposes _router; Express 5 renamed it. Support both so an upgrade does not
  // silently turn this test into a no-op.
  const root = (app as unknown as { _router?: { stack: unknown[] }; router?: { stack: unknown[] } });
  const stack = root._router?.stack ?? root.router?.stack;
  if (!stack) throw new Error("Could not read the Express route table — this test must not silently pass.");

  const walk = (layers: unknown[], prefix: string) => {
    for (const raw of layers) {
      const layer = raw as {
        route?: { path: string; methods: Record<string, boolean> };
        name?: string;
        regexp?: RegExp;
        handle?: { stack?: unknown[] };
      };
      if (layer.route) {
        const path = prefix + layer.route.path;
        for (const [m, on] of Object.entries(layer.route.methods)) {
          if (on) out.push({ method: m.toUpperCase(), path });
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPrefix(layer.regexp));
      }
    }
  };
  walk(stack, "");
  return out;
}

/** Replace :params with a harmless placeholder so the path can actually be requested. */
const concrete = (path: string) => path.replace(/:[A-Za-z0-9_]+/g, "test-id");

const ALL = routeTable().filter((r) => r.path.startsWith("/api") && r.method !== "HEAD");

describe("the route table itself", () => {
  it("was actually discovered — a silent no-op here would be worse than no test", () => {
    expect(ALL.length).toBeGreaterThan(40);
  });

  it("contains no route with an unresolved mount prefix", () => {
    for (const r of ALL) {
      expect(r.path, `${r.method} ${r.path}`).not.toContain("\\");
      expect(r.path, `${r.method} ${r.path}`).toMatch(/^\/api\//);
    }
  });

  it("has every PUBLIC entry still present in the app", () => {
    // Stops this allowlist rotting into a set of exemptions for routes that no longer exist.
    const keys = new Set(ALL.map((r) => `${r.method} ${r.path}`));
    for (const declared of Object.keys(PUBLIC)) {
      expect(keys.has(declared), `${declared} is declared public but no longer exists`).toBe(true);
    }
  });
});

describe("every /api route is protected unless declared public", () => {
  const protectedRoutes = ALL.filter((r) => !PUBLIC[`${r.method} ${r.path}`]);

  it("has protected routes to check", () => {
    expect(protectedRoutes.length).toBeGreaterThan(30);
  });

  it.each(protectedRoutes.map((r) => [r.method, r.path] as const))(
    "%s %s refuses an anonymous caller",
    async (method, path) => {
      const res = await (request(app) as unknown as Record<string, (p: string) => Promise<{ status: number }>>)[
        method.toLowerCase()
      ](concrete(path));
      // 401 is the expected answer. 404 is also acceptable ONLY for a route that does not
      // exist at that concrete path; anything 2xx means an anonymous caller got through.
      expect(res.status, `${method} ${path} answered ${res.status} without a token`).toBe(401);
    },
  );
});

describe("the deliberately public routes still work without a token", () => {
  it("serves the health probe", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("serves the RMU option lists, and they carry no prices", async () => {
    const res = await request(app).get("/api/meta/rmu");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.productTypes)).toBe(true);
    // If prices ever appear here, this route stops being safe to leave open.
    const body = JSON.stringify(res.body).toLowerCase();
    expect(body).not.toContain("baseprice");
    expect(body).not.toContain("listprice");
  });
});
