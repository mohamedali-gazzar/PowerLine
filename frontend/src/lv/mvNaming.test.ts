// The default, editable names for MV package panels (RMU / Transformer / Kiosk). Numbered within
// each type in panel order, so a list of RMU, RMU, Transformer, RMU reads RMU-01, RMU-02,
// Transformer-01, RMU-03 — exactly the owner's requested scheme.
import { describe, it, expect } from "vitest";
import { mvDefaultName, mvTypeLabel, newPanel, type LvPanel } from "./store";

function mvPanel(mvType: LvPanel["mvType"], id: string): LvPanel {
  return { ...newPanel(), id, mvType };
}

describe("mvTypeLabel", () => {
  it("labels each MV type", () => {
    expect(mvTypeLabel("rmu")).toBe("RMU");
    expect(mvTypeLabel("transformer")).toBe("Transformer");
    expect(mvTypeLabel("kiosk")).toBe("Kiosk");
  });
});

describe("mvDefaultName", () => {
  it("numbers each type independently, in panel order", () => {
    const panels = [
      mvPanel("rmu", "a"),
      mvPanel("rmu", "b"),
      mvPanel("transformer", "c"),
      mvPanel("rmu", "d"),
      mvPanel("kiosk", "e"),
    ];
    expect(mvDefaultName(panels[0], panels)).toBe("RMU-01");
    expect(mvDefaultName(panels[1], panels)).toBe("RMU-02");
    expect(mvDefaultName(panels[2], panels)).toBe("Transformer-01");
    expect(mvDefaultName(panels[3], panels)).toBe("RMU-03");
    expect(mvDefaultName(panels[4], panels)).toBe("Kiosk-01");
  });

  it("returns '' for a plain LV panel (no mvType)", () => {
    const p = newPanel();
    expect(mvDefaultName(p, [p])).toBe("");
  });
});
