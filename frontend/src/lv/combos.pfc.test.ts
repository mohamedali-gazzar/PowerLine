import { describe, it, expect, afterEach } from "vitest";
import { buildPfc, PFC_DEFAULT, PFC_PARTS, type PfcInput } from "./combos";
import { COMBOS } from "./catalog";

// A Power Factor Controller (RVC) switches the VARIABLE capacitor steps in and out.
// A fixed-only bank has nothing to switch, so it must not get a controller. These pin
// that rule after the fix to the varSteps === 0 case (which used to add an RVC-12).
const controllers = (i: PfcInput) =>
  buildPfc(i).map((l) => l.desc).filter((d) => /Power Factor Controller/i.test(d));

describe("buildPfc — Power Factor Controller by variable steps", () => {
  it("adds NO controller to a fixed-only bank (no variable steps)", () => {
    const i: PfcInput = { ...PFC_DEFAULT, fixedSteps: 1, fixedKvar: 50, var1Steps: 0, var2Steps: 0 };
    expect(controllers(i)).toEqual([]);
  });

  it("adds a single RVC-6 for 1..6 variable steps", () => {
    const i: PfcInput = { ...PFC_DEFAULT, fixedSteps: 1, var1Steps: 4, var1Kvar: 50, var2Steps: 0 };
    expect(controllers(i)).toEqual(["Power Factor Controller 6 step RVC-6"]);
  });

  it("adds a single RVC-12 for 7..12 variable steps", () => {
    const i: PfcInput = { ...PFC_DEFAULT, fixedSteps: 0, var1Steps: 8, var1Kvar: 50, var2Steps: 0 };
    expect(controllers(i)).toEqual(["Power Factor Controller 12 step RVC-12"]);
  });

  it("adds both controllers for more than 12 variable steps", () => {
    const i: PfcInput = { ...PFC_DEFAULT, fixedSteps: 0, var1Steps: 12, var1Kvar: 50, var2Steps: 5, var2Kvar: 50 };
    expect(controllers(i)).toEqual([
      "Power Factor Controller 6 step RVC-6",
      "Power Factor Controller 12 step RVC-12",
    ]);
  });
});

// The P.F.C parts now come from the uploaded "P.F.C" sheet (COMBOS.pfc), falling back
// to the built-in defaults for anything it omits. These pin that wiring.
describe("buildPfc — parts driven by the uploaded P.F.C sheet (COMBOS.pfc)", () => {
  afterEach(() => { delete (COMBOS as { pfc?: unknown }).pfc; });
  const descs = (i: PfcInput) => buildPfc(i).map((l) => l.desc);
  const oneStep: PfcInput = { ...PFC_DEFAULT, fixedSteps: 1, fixedKvar: 25, var1Steps: 0, var2Steps: 0 };

  it("uses the built-in default capacitor when no sheet is loaded", () => {
    delete (COMBOS as { pfc?: unknown }).pfc;
    expect(descs(oneStep)).toContain(PFC_PARTS.capacitor);
  });

  it("uses the capacitor named in the sheet, overriding the default", () => {
    (COMBOS as { pfc?: unknown }).pfc = { capacitor: "RTR CAP 25 kVAR @ 400V" };
    const d = descs(oneStep);
    expect(d).toContain("RTR CAP 25 kVAR @ 400V");
    expect(d).not.toContain(PFC_PARTS.capacitor);
  });

  it("falls back to the default for any field the sheet omits", () => {
    (COMBOS as { pfc?: unknown }).pfc = { capacitor: "SHEET CAP" }; // no fuse/base named
    const d = descs(oneStep);
    expect(d).toContain("SHEET CAP");
    expect(d).toContain(PFC_PARTS.fuse25);   // 25-kVAR step fuse
    expect(d).toContain(PFC_PARTS.fuseBase);
  });

  it("uses the controllers listed in the sheet", () => {
    (COMBOS as { pfc?: unknown }).pfc = { controllers: [{ desc: "RVC-8 auto", maxVarSteps: 8 }] };
    const i: PfcInput = { ...PFC_DEFAULT, fixedSteps: 0, var1Steps: 5, var1Kvar: 50, var2Steps: 0 };
    expect(descs(i).filter((x) => /RVC/i.test(x))).toEqual(["RVC-8 auto"]);
  });

  it("uses the ventilation parts and quantities from the sheet", () => {
    (COMBOS as { pfc?: unknown }).pfc = { ventilation: [{ qty: 3, desc: "Big Fan" }] };
    const lines = buildPfc(oneStep);
    const fan = lines.find((l) => l.desc === "Big Fan");
    expect(fan?.qty).toBe(3);
    expect(lines.map((l) => l.desc)).not.toContain("Filter"); // default vent replaced
  });
});
