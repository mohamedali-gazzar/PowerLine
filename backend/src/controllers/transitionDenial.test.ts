// PERMISSION TESTS — who may move a quotation between workflow stages.
//
// These pin transitionDenial(), the gate that turns a would-be status change into an allow
// (null) or a refusal (a human sentence). The focus here is the reviewer's "undo return":
// a Section Head / Team Leader who returned a quotation for revision may take that return
// back (RETURNED → WAITING_APPROVAL), even though they are not the owner. The rest of the
// send-for-approval rule must stay exactly as it was — only an owner / co-worker / admin
// may send a FRESH draft — so those cases are pinned here too.
//
// accessOf() (which reads the database) is mocked, so we can play any role without a DB.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Perm } from "../middleware/roles";

// A mutable box the mocked accessOf() reads, so each test sets its own role.
const box: { tier: string; perms: Set<Perm>; role: string } = {
  tier: "ENGINEER",
  perms: new Set<Perm>(),
  role: "USER",
};

vi.mock("../middleware/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/roles")>();
  return { ...actual, accessOf: vi.fn(async () => box) };
});

// Imported AFTER the mock is registered.
const { transitionDenial } = await import("./qtns.controller");

const perms = (...p: Perm[]) => new Set<Perm>(p);
// Minimal quotation row: an owner, and no co-workers.
const qtn = (ownerId: string) =>
  ({ id: "q1", number: "QTN-1", ownerId, coOwners: [] }) as never;
const reqAs = (userId: string) => ({ userId }) as never;

describe("transitionDenial — a reviewer may undo their own return", () => {
  beforeEach(() => {
    box.tier = "ENGINEER";
    box.perms = new Set<Perm>();
    box.role = "USER";
  });

  it("lets a non-owner reviewer with qtn.return move RETURNED → WAITING_APPROVAL", async () => {
    box.perms = perms("qtn.return");
    const denial = await transitionDenial(reqAs("reviewer"), qtn("owner"), "RETURNED", "WAITING_APPROVAL", "");
    expect(denial).toBeNull();
  });

  it("lets a non-owner reviewer with qtn.approve undo a return too", async () => {
    box.perms = perms("qtn.approve");
    const denial = await transitionDenial(reqAs("reviewer"), qtn("owner"), "RETURNED", "WAITING_APPROVAL", "");
    expect(denial).toBeNull();
  });

  it("still blocks a stranger with no review rights from moving RETURNED → WAITING_APPROVAL", async () => {
    box.perms = perms();
    const denial = await transitionDenial(reqAs("stranger"), qtn("owner"), "RETURNED", "WAITING_APPROVAL", "");
    expect(denial).toBeTruthy();
  });

  it("does NOT let a reviewer send a fresh DRAFT for approval — only undo a return", async () => {
    box.perms = perms("qtn.return");
    const denial = await transitionDenial(reqAs("reviewer"), qtn("owner"), "DRAFT", "WAITING_APPROVAL", "");
    expect(denial).toBeTruthy();
  });

  it("still lets the owner (re)send for approval with no special permission", async () => {
    box.perms = perms();
    const denial = await transitionDenial(reqAs("owner"), qtn("owner"), "RETURNED", "WAITING_APPROVAL", "");
    expect(denial).toBeNull();
  });

  it("still requires approve rights to withdraw an APPROVAL (APPROVED → WAITING)", async () => {
    box.perms = perms("qtn.return"); // return ≠ approve
    const denial = await transitionDenial(reqAs("reviewer"), qtn("owner"), "APPROVED", "WAITING_APPROVAL", "");
    expect(denial).toBeTruthy();
  });
});
