// The sheet-metal / basic enclosure families (SR-Basic, Unikit, Local) cannot achieve the higher
// forms of separation (3a and up). That is only a WARNING now — the user may proceed — so the rule
// lives in one predicate, formFamilyConflict(form, family), which decides whether to raise the
// prompt in whichever order the two were chosen. These tests pin exactly when it fires.
import { describe, it, expect } from "vitest";
import { formFamilyConflict } from "./catalog";

const SHEET_METAL = ["SR-Basic", "Unikit", "Local (Sheet Metal)"];
const RESTRICTED = ["3a", "3b", "4a", "4b"];
const OK_FORMS = ["1", "2a", "2b"];
const OTHER_FAMILIES = ["Minicenter", "Primo", "Pillars", "Coffree"];

describe("formFamilyConflict — when to warn about form / enclosure", () => {
  it("warns for every restricted form on every sheet-metal family", () => {
    for (const fam of SHEET_METAL) {
      for (const form of RESTRICTED) {
        expect(formFamilyConflict(form, fam), `${form} + ${fam}`).toBe(true);
      }
    }
  });

  it("does not warn for the lower forms on sheet-metal families", () => {
    for (const fam of SHEET_METAL) {
      for (const form of OK_FORMS) {
        expect(formFamilyConflict(form, fam), `${form} + ${fam}`).toBe(false);
      }
    }
  });

  it("does not warn on the compartmentalised families, even for restricted forms", () => {
    for (const fam of OTHER_FAMILIES) {
      for (const form of RESTRICTED) {
        expect(formFamilyConflict(form, fam), `${form} + ${fam}`).toBe(false);
      }
    }
  });

  it("does not warn when no family is chosen yet", () => {
    expect(formFamilyConflict("3a", "")).toBe(false);
  });
});
