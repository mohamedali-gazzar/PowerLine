// The rule that decides whether a failure means "this quotation is gone" or "something
// broke" — and it is a data-safety rule, not a convenience.
//
// getQtn() used to swallow every error and return null, so a dropped connection was
// indistinguishable from a deleted quotation. The editor bounced the user to a list that
// could not load either, and any unsaved work held on that device (offlineBackup.ts) became
// unreachable, because the only way to recover it is to open the quotation the bounce
// prevented. That is how a connection blip turns into lost work.
//
// Only a server that ANSWERS, saying 404 or 403, ends a quotation. Anything else keeps the
// user on the page with a retry.

import { describe, it, expect } from "vitest";
import { isMissingQtn } from "./qtns";

describe("telling a missing quotation from a broken connection", () => {
  it("treats 404 and 403 as genuinely not available to this user", () => {
    expect(isMissingQtn({ status: 404 })).toBe(true);
    expect(isMissingQtn({ status: 403 })).toBe(true);
  });

  it("does NOT treat a dead connection as a deleted quotation", () => {
    // A fetch failure carries no status at all — the old code read this as "deleted".
    expect(isMissingQtn(new TypeError("Failed to fetch"))).toBe(false);
    expect(isMissingQtn({})).toBe(false);
    expect(isMissingQtn(null)).toBe(false);
    expect(isMissingQtn(undefined)).toBe(false);
  });

  it("does NOT treat a broken server as a deleted quotation", () => {
    for (const status of [500, 502, 503, 504, 408, 429]) {
      expect(isMissingQtn({ status }), String(status)).toBe(false);
    }
  });

  it("does NOT treat an expired session as a deleted quotation", () => {
    // 401 is handled globally (the token is dropped and the app reloads). Reporting it as
    // "no such quotation" would send the user away from work this device is still holding.
    expect(isMissingQtn({ status: 401 })).toBe(false);
  });
});
