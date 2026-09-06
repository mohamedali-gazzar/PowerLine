import { describe, it, expect } from "vitest";
import { buildPfc, PFC_DEFAULT, type PfcInput } from "./combos";

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
