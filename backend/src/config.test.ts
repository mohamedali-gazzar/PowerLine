// Tests for the production-detection and configuration checks.
//
// IS_PROD is a module-level constant, so each case re-imports the module with a different
// environment. The property being proved is that it fails CLOSED: a missing or misspelled
// NODE_ENV must not re-open a dev-only door on a deployed instance.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const KEYS = [
  "NODE_ENV", "VERCEL", "DATABASE_URL", "JWT_SECRET", "APP_URL",
  "SMTP_HOST", "SMTP_USER", "SMTP_PASS",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  vi.resetModules();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

async function load(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  vi.resetModules();
  return await import("./config");
}

describe("deciding whether this is production", () => {
  it("is production when NODE_ENV says so", async () => {
    const c = await load({ NODE_ENV: "production" });
    expect(c.IS_PROD).toBe(true);
    expect(c.IS_DEV).toBe(false);
  });

  it("is ALSO production when only the platform flag is present", async () => {
    // The whole point: VERCEL is injected by the platform and cannot be forgotten,
    // so a missing NODE_ENV can no longer silently enable dev-only behaviour.
    const c = await load({ VERCEL: "1" });
    expect(c.IS_PROD).toBe(true);
  });

  it("treats a misspelled NODE_ENV on a deployed instance as production", async () => {
    const c = await load({ NODE_ENV: "Production", VERCEL: "1" });
    expect(c.IS_PROD).toBe(true);
  });

  it("is development only when NEITHER signal is present", async () => {
    const c = await load({});
    expect(c.IS_PROD).toBe(false);
    expect(c.IS_DEV).toBe(true);
  });

  it("is development for an explicit non-production NODE_ENV with no platform flag", async () => {
    for (const NODE_ENV of ["development", "test", ""]) {
      const c = await load({ NODE_ENV });
      expect(c.IS_PROD, `NODE_ENV=${NODE_ENV}`).toBe(false);
    }
  });
});

describe("checkConfig", () => {
  it("makes a missing required variable an ERROR in production", async () => {
    const c = await load({ NODE_ENV: "production" });
    const { errors } = c.checkConfig();
    expect(errors.join(" ")).toContain("DATABASE_URL");
    expect(errors.join(" ")).toContain("JWT_SECRET");
  });

  it("makes the same thing only a WARNING locally, so offline development still works", async () => {
    const c = await load({});
    const { errors, warnings } = c.checkConfig();
    expect(errors).toEqual([]);
    expect(warnings.join(" ")).toContain("DATABASE_URL");
  });

  it("is silent about required variables once they are set", async () => {
    const c = await load({ NODE_ENV: "production", DATABASE_URL: "postgres://x", JWT_SECRET: "s" });
    expect(c.checkConfig().errors).toEqual([]);
  });

  it("warns loudly when mail is only PARTLY configured", async () => {
    // The dangerous case: it looks configured, and silently sends nothing.
    const c = await load({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@b.c" });
    const { warnings } = c.checkConfig();
    expect(warnings.join(" ")).toContain("SMTP_PASS");
    expect(warnings.join(" ")).toMatch(/DISABLED/i);
  });

  it("does not warn about a complete mail configuration", async () => {
    const c = await load({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p" });
    expect(c.checkConfig().warnings.join(" ")).not.toMatch(/SMTP/);
  });

  it("catches an APP_URL that would break the link in every notification e-mail", async () => {
    for (const APP_URL of ["powerline-chi.vercel.app", "https://x.com/app", "not a url"]) {
      const c = await load({ APP_URL });
      expect(c.checkConfig().warnings.join(" "), APP_URL).toContain("APP_URL");
    }
  });

  it("accepts a correct APP_URL, with or without a trailing slash", async () => {
    for (const APP_URL of ["https://powerline-chi.vercel.app", "https://powerline-chi.vercel.app/"]) {
      const c = await load({ APP_URL });
      expect(c.checkConfig().warnings.join(" "), APP_URL).not.toContain("APP_URL");
    }
  });
});

describe("describeConfig", () => {
  it("reports presence and never a value", async () => {
    const secret = "super-secret-value-do-not-print";
    const c = await load({ NODE_ENV: "production", JWT_SECRET: secret });
    const out = c.describeConfig();
    expect(out).toContain("production");
    expect(out).toContain("JWT_SECRET");
    expect(out).not.toContain(secret);
    expect(out).toContain("MISSING (required)"); // DATABASE_URL is unset here
  });

  it("documents every variable the backend reads", async () => {
    const c = await load({});
    const names = c.ENV_VARS.map((v) => v.name);
    for (const expected of [
      "DATABASE_URL", "JWT_SECRET", "CORS_ORIGIN", "APP_URL",
      "SIGNUP_EMAIL_DOMAIN", "OTP_TTL_MINUTES", "PRICE_BOOK_TTL_MS",
      "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
    ]) {
      expect(names, expected).toContain(expected);
    }
    // Every entry must explain what breaks without it, or the table is decoration.
    for (const v of c.ENV_VARS) {
      expect(v.purpose.length, v.name).toBeGreaterThan(10);
      expect(v.ifMissing.length, v.name).toBeGreaterThan(10);
    }
  });
});
