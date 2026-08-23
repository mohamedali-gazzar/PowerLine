// REGRESSION TEST — the quotation lists must never fetch the quotation CONTENT.
//
// On 23 Aug 2026 the live site went down completely: no logins, and no deploys either,
// because the build syncs the schema over the same connection. The cause was the Neon
// data-transfer quota being exhausted, and the largest contributor was this:
// all three list endpoints used `include: ownerSelect`, which fetches every scalar column
// including `state` — the entire quotation as JSON, every panel and every price — purely
// to draw a table row. Even against the tiny local test database that moved 64x more data
// than the endpoint returned.
//
// This test exists so that never comes back. It is cheap and it guards uptime.

import { describe, it, expect } from "vitest";
import { listSelect } from "./qtns.controller";

describe("the quotation list query", () => {
  it("does NOT fetch the quotation content", () => {
    // The whole point. `state` is the heavy column.
    expect("state" in listSelect).toBe(false);
  });

  it("does not fetch anything else the lists never show", () => {
    expect("createdAt" in listSelect).toBe(false);
    expect("statusAt" in listSelect).toBe(false);
  });

  it("still fetches every column the table and the workflow badge need", () => {
    // If one of these is dropped, the list silently renders undefined rather than failing.
    for (const col of [
      "id",
      "number",
      "updatedAt",
      "projectName",
      "customer",
      "panelsCount",
      "totalEgp",
      "submitted", // qtnStatus() falls back to this for pre-workflow rows
      "status",
      "approverEmail",
      "approvedAt",
      "returnReason",
      "submittedForApprovalAt",
      "ownerId",
      "coOwnerId", // legacy co-work slot, unioned in by coOwnersOf
      "removedAt",
      "removedBy",
    ]) {
      expect(col in listSelect, `listSelect is missing "${col}"`).toBe(true);
      expect((listSelect as Record<string, unknown>)[col], `"${col}" must be selected`).toBe(true);
    }
  });

  it("still joins the owner and both co-work shapes", () => {
    // Names shown in the list come from these; dropping one blanks the Owner column.
    expect(listSelect).toHaveProperty("owner");
    expect(listSelect).toHaveProperty("coOwner"); // legacy single slot
    expect(listSelect).toHaveProperty("coOwners"); // join table
  });

  it("selects only booleans and relation objects — no accidental nesting", () => {
    // A stray `include:` or a nested select would quietly widen the query again.
    for (const [key, value] of Object.entries(listSelect)) {
      const ok = value === true || (typeof value === "object" && value !== null);
      expect(ok, `unexpected shape for "${key}"`).toBe(true);
    }
  });
});
