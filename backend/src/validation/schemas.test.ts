// CHARACTERIZATION + REGRESSION TESTS for the server-side validation boundary.
//
// Two of these guard fixes made in this pass; the rest pin rules that already existed and
// are easy to break by accident. Anything reaching these schemas is user-controlled.

import { describe, it, expect } from "vitest";
import {
  COMPANY_DOMAIN,
  registerSchema,
  verifySchema,
  completeSchema,
  loginSchema,
  resetSchema,
} from "./auth.schema";
import {
  createQtnSchema,
  updateQtnSchema,
  numberSchema,
  attachmentSchema,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_QTN,
} from "./qtn.schema";

describe("who may open an account", () => {
  it("defaults to the company domain", () => {
    expect(COMPANY_DOMAIN).toBe("powerline.com.eg");
  });

  it("accepts a company address", () => {
    expect(registerSchema.safeParse({ email: "someone@powerline.com.eg" }).success).toBe(true);
  });

  it("normalises case and surrounding space", () => {
    const r = registerSchema.safeParse({ email: "  Someone@PowerLine.com.EG " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("someone@powerline.com.eg");
  });

  it("rejects an outside address", () => {
    expect(registerSchema.safeParse({ email: "someone@gmail.com" }).success).toBe(false);
  });

  it("cannot be fooled by an address that merely CONTAINS the domain", () => {
    // The comment in auth.schema.ts calls these out by name; they must stay rejected.
    for (const email of [
      "outsider@evil.com@powerline.com.eg.attacker.net",
      "outsider@powerline.com.eg.attacker.net",
      "outsider@notpowerline.com.eg",
      "outsider@sub.powerline.com.eg",
    ]) {
      expect(registerSchema.safeParse({ email }).success, email).toBe(false);
    }
  });

  it("gates EVERY step of sign-up, not just the first", () => {
    // Otherwise an outsider skips /register and goes straight to /complete.
    const outside = "outsider@gmail.com";
    expect(verifySchema.safeParse({ email: outside, code: "123456" }).success).toBe(false);
    expect(
      completeSchema.safeParse({ email: outside, code: "123456", password: "longenough1" }).success,
    ).toBe(false);
  });

  it("leaves sign-in and password reset open to any existing account", () => {
    // People who already have an account keep working even if the rule changes.
    expect(loginSchema.safeParse({ email: "old@elsewhere.com", password: "x" }).success).toBe(true);
    expect(
      resetSchema.safeParse({ email: "old@elsewhere.com", code: "123456", password: "longenough1" })
        .success,
    ).toBe(true);
  });

  it("requires a 6-digit code, exactly", () => {
    const base = { email: "a@powerline.com.eg" };
    for (const code of ["12345", "1234567", "12345a", "", "  ", "abcdef"]) {
      expect(verifySchema.safeParse({ ...base, code }).success, `code "${code}"`).toBe(false);
    }
    expect(verifySchema.safeParse({ ...base, code: "123456" }).success).toBe(true);
  });

  it("requires a password of at least 8 characters", () => {
    const base = { email: "a@powerline.com.eg", code: "123456" };
    expect(completeSchema.safeParse({ ...base, password: "short7!" }).success).toBe(false);
    expect(completeSchema.safeParse({ ...base, password: "longenough" }).success).toBe(true);
  });
});

describe("saving a quotation cannot wipe it", () => {
  // REGRESSION: updateQtnSchema used z.unknown(), so null / a string / a number all
  // validated, and the handler wrote JSON.stringify(that) over the stored quotation.
  // One malformed PUT irreversibly erased every panel in a live quotation.
  it("refuses a state that is not an object", () => {
    for (const state of [null, undefined, "", "wiped", 0, 42, true, false, []]) {
      const r = updateQtnSchema.safeParse({ state });
      expect(r.success, `state = ${JSON.stringify(state)}`).toBe(false);
    }
  });

  it("gives a message a non-developer can understand", () => {
    const r = updateQtnSchema.safeParse({ state: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain("nothing was saved");
    }
  });

  it("still accepts a real quotation state, including an empty one", () => {
    expect(updateQtnSchema.safeParse({ state: {} }).success).toBe(true);
    expect(
      updateQtnSchema.safeParse({ state: { panels: [], factors: { vat: 0.14 } } }).success,
    ).toBe(true);
  });

  it("keeps the optional summary optional, and validates it when present", () => {
    expect(updateQtnSchema.safeParse({ state: {} }).success).toBe(true);
    expect(
      updateQtnSchema.safeParse({ state: {}, summary: { projectName: "P", customer: "C" } }).success,
    ).toBe(true);
  });

  it("leaves CREATE permissive — a brand-new quotation legitimately starts empty", () => {
    expect(createQtnSchema.safeParse({ number: "QTN-26-0001", state: {} }).success).toBe(true);
    expect(createQtnSchema.safeParse({ number: "QTN-26-0001" }).success).toBe(true);
  });

  it("always requires a quotation number", () => {
    expect(createQtnSchema.safeParse({ number: "", state: {} }).success).toBe(false);
    expect(createQtnSchema.safeParse({ number: "   ", state: {} }).success).toBe(false);
    expect(numberSchema.safeParse({ number: "QTN-26-0001" }).success).toBe(true);
  });
});

describe("attachment limits", () => {
  it("keeps the documented ceilings", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(3 * 1024 * 1024);
    expect(MAX_ATTACHMENTS_PER_QTN).toBe(30);
  });

  it("requires a name and some data", () => {
    expect(attachmentSchema.safeParse({}).success).toBe(false);
    expect(attachmentSchema.safeParse({ name: "spec.pdf", data: "AAAA" }).success).toBe(true);
  });

  it("accepts any MIME string — which is WHY the download side must not trust it", () => {
    // Pinned deliberately: the schema is permissive here, so the protection lives in
    // downloadAttachment (inline allowlist + nosniff). If this ever becomes strict,
    // that is an improvement, but the download-side guard must stay regardless.
    const r = attachmentSchema.safeParse({ name: "x.html", data: "AAAA", mime: "text/html" });
    expect(r.success).toBe(true);
  });
});
