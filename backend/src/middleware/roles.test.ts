// PERMISSION SHAPE TESTS — pins the "restore cancelled QTNs" capability as admin-only.
//
// A cancelled quotation is a superseded revision; bringing it back is a deliberate override we
// only ever want an admin to have. These pin that: it is a real permission, it is admin-only, and
// no engineer role preset grants it — so an engineer can never be given it.
import { describe, it, expect } from "vitest";
import { PERMS, ADMIN_ONLY_PERMS, ROLE_PRESETS, PERM_LABEL } from "./roles";

describe("qtn.restoreCancelled", () => {
  it("is a real, labelled permission", () => {
    expect(PERMS).toContain("qtn.restoreCancelled");
    expect(PERM_LABEL["qtn.restoreCancelled"]).toBe("Restore cancelled QTNs");
  });

  it("is admin-only", () => {
    expect(ADMIN_ONLY_PERMS).toContain("qtn.restoreCancelled");
  });

  it("is granted by NO engineer role preset (engineers can never hold it)", () => {
    for (const r of ROLE_PRESETS) {
      if (r.tier === "ENGINEER") expect(r.perms).not.toContain("qtn.restoreCancelled");
    }
  });

  it("every admin-only permission is a real permission", () => {
    for (const p of ADMIN_ONLY_PERMS) expect(PERMS).toContain(p);
  });
});
