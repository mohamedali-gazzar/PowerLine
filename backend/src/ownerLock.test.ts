// Tests for the protected-owner rule.
//
// Locking yourself out of the Access Center is the one mistake with no way back through the
// app — recovery means running a script against the production database. This rule makes it
// unreachable, so the matching logic is worth pinning: a near-miss that silently returns
// false would quietly remove the protection.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const KEY = "OWNER_EMAILS";
let saved: string | undefined;

beforeEach(() => { saved = process.env[KEY]; delete process.env[KEY]; vi.resetModules(); });
afterEach(() => { if (saved === undefined) delete process.env[KEY]; else process.env[KEY] = saved; vi.resetModules(); });

async function load(value?: string) {
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  vi.resetModules();
  return await import("./config");
}

describe("who the protected owner is", () => {
  it("defaults to the company owner", async () => {
    const c = await load();
    expect(c.OWNER_EMAILS).toEqual(["mohamed.ali@powerline.com.eg"]);
    expect(c.isProtectedOwner("mohamed.ali@powerline.com.eg")).toBe(true);
  });

  it("ignores case and surrounding space, because addresses arrive both ways", async () => {
    const c = await load();
    for (const e of [
      "MOHAMED.ALI@POWERLINE.COM.EG",
      "  mohamed.ali@powerline.com.eg  ",
      "Mohamed.Ali@PowerLine.com.eg",
    ]) {
      expect(c.isProtectedOwner(e), e).toBe(true);
    }
  });

  it("protects nobody else", async () => {
    const c = await load();
    for (const e of [
      "someone.else@powerline.com.eg",
      "mohamed.ali@gmail.com",
      "mohamed.ali@powerline.com.eg.attacker.net",
      "xmohamed.ali@powerline.com.eg",
      "",
      "   ",
    ]) {
      expect(c.isProtectedOwner(e), JSON.stringify(e)).toBe(false);
    }
    expect(c.isProtectedOwner(null)).toBe(false);
    expect(c.isProtectedOwner(undefined)).toBe(false);
  });

  it("can be moved or shared without a code change", async () => {
    const c = await load("a@powerline.com.eg, B@Powerline.com.eg");
    expect(c.OWNER_EMAILS).toEqual(["a@powerline.com.eg", "b@powerline.com.eg"]);
    expect(c.isProtectedOwner("A@POWERLINE.COM.EG")).toBe(true);
    expect(c.isProtectedOwner("b@powerline.com.eg")).toBe(true);
    // …and the previous owner is no longer protected once ownership moves.
    expect(c.isProtectedOwner("mohamed.ali@powerline.com.eg")).toBe(false);
  });

  it("treats an empty override as no owner rather than as an empty address", async () => {
    // A blank value must not accidentally protect "" and match every user with no email.
    const c = await load("");
    expect(c.OWNER_EMAILS).toEqual(["mohamed.ali@powerline.com.eg"]); // falls back to the default
    expect(c.isProtectedOwner("")).toBe(false);
  });

  it("drops stray separators instead of creating blank entries", async () => {
    const c = await load("a@powerline.com.eg,,  ,b@powerline.com.eg,");
    expect(c.OWNER_EMAILS).toEqual(["a@powerline.com.eg", "b@powerline.com.eg"]);
    expect(c.isProtectedOwner("")).toBe(false);
  });
});
