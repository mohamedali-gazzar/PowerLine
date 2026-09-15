// REGRESSION TEST — a quotation must never be bricked by a bad MV panel type.
//
// The "+ Add panel" buttons wire onClick={onAdd} → addPanel(clickEvent). When addPanel
// grew an optional `mvType` parameter (for MV's + Kiosk / + RMU / + Transformer), the LV
// buttons started handing it the CLICK EVENT, which landed on p.mvType. Rendering that
// object as the panel-row badge threw "Objects are not valid as a React child" and blanked
// the whole page — and a saved copy would re-crash on every load. addPanel now only accepts
// a real kind string, and normalize() heals any panel that already stored a bad value.

import { describe, it, expect } from "vitest";
import { normalize } from "./qtns";
import type { LvState, LvPanel } from "./store";

// Minimal panel — normalize only reads id / groupId / mvType / mvRmuConfig here.
const panel = (id: string, extra: Partial<LvPanel>): LvPanel =>
  ({ id, groupId: undefined, ...extra } as unknown as LvPanel);

const stateWith = (...panels: LvPanel[]): LvState =>
  ({ panels } as unknown as LvState);

describe("normalize heals a bad MV panel type", () => {
  it("clears an mvType that isn't a real kind (the click-event regression)", () => {
    const bad = { _reactName: "onClick", type: "click" }; // shaped like a React event
    const out = normalize(stateWith(panel("p1", { mvType: bad as unknown as undefined })));
    expect(out.panels[0].mvType).toBeUndefined();
  });

  it("keeps a real MV kind and its RMU config", () => {
    const cfg = { productType: "PRAL" };
    const out = normalize(stateWith(panel("p1", { mvType: "rmu", mvRmuConfig: cfg as never })));
    expect(out.panels[0].mvType).toBe("rmu");
    expect(out.panels[0].mvRmuConfig).toBe(cfg);
  });

  it("drops a stray mvRmuConfig on a non-RMU panel", () => {
    const out = normalize(stateWith(panel("p1", { mvType: "kiosk", mvRmuConfig: { x: 1 } as never })));
    expect(out.panels[0].mvType).toBe("kiosk");
    expect(out.panels[0].mvRmuConfig).toBeUndefined();
  });

  it("leaves an ordinary LV panel (no mvType) alone", () => {
    const out = normalize(stateWith(panel("p1", {})));
    expect(out.panels[0].mvType).toBeUndefined();
    expect(out.panels[0].mvRmuConfig).toBeUndefined();
  });
});
