// The sheet-metal / basic enclosure families (SR-Basic, Unikit, Local) cannot achieve the higher
// forms of separation (3a and up). formFamilyIssue() is the single rule that blocks such a panel
// from every offer; these tests pin exactly when it fires.
import { describe, it, expect } from "vitest";
import { newPanel, formFamilyIssue, type LvPanel } from "./store";

// A "panels"-mode panel in the given family and form — the only shape the rule looks at.
const panel = (family: string, form: string, over: Partial<LvPanel> = {}): LvPanel => ({
  ...newPanel(),
  sizingMode: "panels",
  panelsSizing: { layout: "Single", family, sizing1: "", sizing2: "" },
  form,
  ...over,
});

describe("formFamilyIssue — forbidden form / enclosure combinations", () => {
  it("blocks Forms 3a / 3b / 4a / 4b on SR-Basic, Unikit and Local (Sheet Metal)", () => {
    for (const fam of ["SR-Basic", "Unikit", "Local (Sheet Metal)"]) {
      for (const form of ["3a", "3b", "4a", "4b"]) {
        const msg = formFamilyIssue(panel(fam, form));
        expect(msg, `${fam} + Form ${form}`).not.toBe("");
        expect(msg).toContain(form);
        expect(msg).toContain(fam);
      }
    }
  });

  it("allows Forms 1 / 2a / 2b on those same families", () => {
    for (const fam of ["SR-Basic", "Unikit", "Local (Sheet Metal)"]) {
      for (const form of ["1", "2a", "2b"]) {
        expect(formFamilyIssue(panel(fam, form)), `${fam} + Form ${form}`).toBe("");
      }
    }
  });

  it("allows every form on the compartmentalised families (Minicenter, Primo, Pillars, Coffree)", () => {
    for (const fam of ["Minicenter", "Primo", "Pillars", "Coffree"]) {
      expect(formFamilyIssue(panel(fam, "4b")), fam).toBe("");
    }
  });

  it("does not apply in cells mode — panelsSizing.family is not the real system there", () => {
    expect(formFamilyIssue(panel("SR-Basic", "4a", { sizingMode: "cells" }))).toBe("");
  });

  it("does not apply before an enclosure is chosen (sizingMode none)", () => {
    expect(formFamilyIssue(panel("SR-Basic", "3a", { sizingMode: "none" }))).toBe("");
  });

  it("does not apply to spare / LCP / KWHM cells (no form to check)", () => {
    expect(formFamilyIssue(panel("SR-Basic", "3a", { spare: true }))).toBe("");
  });
});
