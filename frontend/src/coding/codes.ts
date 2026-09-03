// Building and reading Powerline product codes.
//
// Pure functions, no React and no DOM, so every rule here is testable — see codes.test.ts.
// The standalone guide these came from mixed the rules into the page, which meant nothing
// could be checked and the guide could drift away from what the app actually generates.
//
// ⚠️ THE RMU RULES MUST MATCH THE OFFER ENGINE. `buildProductCode()` in
// backend/src/domain/assembly.ts is what stamps a real customer offer; this file only
// explains it. If the two ever disagree the guide is teaching people something the app does
// not do, so codes.test.ts asserts the shared constants line up.

import {
  RMU_CLASSES,
  RMU_MEAS_TEXT,
  RMU_RANGES,
  RMU_SPECS,
  TR_ACC,
  TR_CORE,
  TR_IPS,
  TR_IP_ACUD,
  TR_VOLTS,
  TR_KVA,
  GEAR_ADAPT,
  GEAR_COUPLERS,
  GEAR_COUPLER_PANELS,
  GEAR_VOLTS,
} from "./data";

/** One decoded piece of a code: the characters, what they are, and what they mean. */
export interface Segment {
  chars: string;
  field: string;
  meaning: string;
  /** Set when the value is outside the documented range — shown to the reader as a fault. */
  problem?: string;
  /**
   * Something worth knowing about a perfectly valid value, e.g. which projects use a
   * protection class. Kept apart from `problem` so a note never reads as an error.
   */
  note?: string;
}

export interface Decoded {
  ok: boolean;
  code: string;
  segments: Segment[];
  summary: string;
  /** Populated when the code cannot be read at all. */
  error?: string;
}

const find = <T extends { code: string }>(list: T[], code: string) =>
  list.find((x) => x.code === code);

// ── RMU ──────────────────────────────────────────────────────────────────────

export interface RmuParts {
  family: string; // PSEC | PRAL
  spec: string; // 10 | 19 | 20 | 29
  cls: string; // AB | MG | SH | GY | GL
  volt: string; // 12 | 24
  ring: string; // 2..5
  trans: string; // 0..2
  meas: string; // M | W
}

/** e.g. PSEC10AB24R2T1M */
export function buildRmuCode(p: RmuParts): string {
  return `${p.family}${p.spec}${p.cls}${p.volt}R${p.ring}T${p.trans}${p.meas}`;
}

/** The cell layout a code describes, e.g. "3+1+M". */
export function rmuLayout(p: Pick<RmuParts, "ring" | "trans" | "meas">): string {
  return `${p.ring}+${p.trans}${p.meas === "M" ? "+M" : ""}`;
}

const RMU_RE = /^(PSEC|PRAL)(\d{2})([A-Z]{2})(12|24)R(\d)T(\d)([MW])$/;

/** Supplier wording depends on the family: SF6 for PSEC, air for PRAL. */
export function rmuClassText(clsCode: string, family: string): string {
  const c = RMU_CLASSES.find((x) => x.code === clsCode);
  if (!c) return "unknown supplier";
  return family === "PRAL" ? c.airen : c.sf6en;
}

export function decodeRmu(raw: string): Decoded {
  const code = raw.trim().toUpperCase();
  const m = RMU_RE.exec(code);
  if (!m) {
    return {
      ok: false,
      code,
      segments: [],
      summary: "",
      error:
        "That is not an RMU code. The shape is family, spec, supplier, kV, then R, T and " +
        "M or W — for example PSEC10AB24R2T1M.",
    };
  }
  const [, family, spec, cls, volt, ring, trans, meas] = m;
  const specRow = find(RMU_SPECS, spec);
  const clsRow = find(RMU_CLASSES, cls);
  const ringN = Number(ring);
  const transN = Number(trans);

  const segments: Segment[] = [
    {
      chars: family,
      field: "Family",
      meaning: family === "PSEC" ? "Ring Main Unit, SF6 load break switch" : "Ring Main Unit, air load break switch",
    },
    {
      chars: spec,
      field: "Client + type",
      meaning: specRow ? specRow.en : "not a defined specification",
      problem: specRow ? (specRow.reserved ? "Reserved — not in use yet." : undefined) : "Unknown specification.",
    },
    {
      chars: cls,
      field: "LBS supplier",
      meaning: rmuClassText(cls, family),
      problem: clsRow ? undefined : "Unknown supplier code.",
    },
    { chars: volt, field: "Voltage", meaning: `${volt} kV` },
    {
      chars: `R${ring}`,
      field: "Ring feeders",
      meaning: `${ringN} ring feeder${ringN === 1 ? "" : "s"}`,
      problem: ringN >= 2 && ringN <= 5 ? undefined : "Ring feeders run from 2 to 5.",
    },
    {
      chars: `T${trans}`,
      field: "Transformer feeders",
      meaning: `${transN} transformer feeder${transN === 1 ? "" : "s"}`,
      problem: transN >= 0 && transN <= 2 ? undefined : "Transformer feeders run from 0 to 2.",
    },
    { chars: meas, field: "Measuring", meaning: RMU_MEAS_TEXT[meas] },
  ];

  const layout = rmuLayout({ ring, trans, meas });
  return {
    ok: true,
    code,
    segments,
    summary:
      `${specRow?.en.replace(/\.$/, "") ?? "RMU"} [${layout}] with ${rmuClassText(cls, family)}, ` +
      `${volt} kV, ${ringN} ring feeder${ringN === 1 ? "" : "s"}, ` +
      `${transN} transformer feeder${transN === 1 ? "" : "s"}, ${RMU_MEAS_TEXT[meas]}.`,
  };
}

/** Every approved code, indexed for an O(1) membership check. */
const APPROVED = new Set(RMU_RANGES.map(([c]) => c));

/** Is this exact code in the engineers' signed-off range? */
export function isApprovedRmu(code: string): boolean {
  return APPROVED.has(code.trim().toUpperCase());
}

/** How many codes the shape allows, versus how many are actually approved. */
export function rmuRangeCoverage(): { approved: number; possible: number } {
  return {
    approved: RMU_RANGES.length,
    // families × specs-in-use × classes × volts × rings × transformers × measuring
    possible: 2 * RMU_SPECS.filter((s) => !s.reserved).length * RMU_CLASSES.length * 2 * 4 * 3 * 2,
  };
}

// ── Transformers (PDTR / POTR) ───────────────────────────────────────────────

export interface TrParts {
  prefix: "PDTR" | "POTR";
  volt: string; // 15 | 11 | 22
  kva: number;
  core: string; // 1 | 2
  ip: string; // 00 | 21 | 23
  acc: string; // 0 | 1
  serial: number;
}

/** Rating field: three digits, kVA ÷ 10. 630 kVA -> "063". */
export function ratingCode(kva: number): string {
  return ("00" + Math.round(kva / 10)).slice(-3);
}

/** The kVA a rating field stands for. Inverse of ratingCode. */
export function ratingKva(code: string): number {
  return Number(code) * 10;
}

/** Serial is a single digit, 0-9, clamped — the engineers' generator does the same. */
export function trSerial(n: number): string {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 0) return "0";
  return String(Math.min(9, v));
}

export function buildTrCode(p: TrParts): string {
  return `${p.prefix}${p.volt}${ratingCode(p.kva)}${p.core}${p.ip}${p.acc}${trSerial(p.serial)}`;
}

/**
 * Does this rating survive the round trip?
 *
 * The field is kVA / 10, so anything not divisible by ten cannot be written exactly —
 * 63 kVA becomes 006, which reads back as 60 kVA. The engineers' guide flagged this in
 * prose; here it is a value the UI and the tests can both use.
 */
export function ratingIsExact(kva: number): boolean {
  return ratingKva(ratingCode(kva)) === kva;
}

/** Other ratings in the range that would produce the SAME field, so the code is ambiguous. */
export function ratingSharedWith(kva: number): number[] {
  const code = ratingCode(kva);
  return (TR_KVA as readonly number[]).filter((k) => k !== kva && ratingCode(k) === code);
}

// Built codes carry a single serial digit; reading stays tolerant of longer historic ones.
const TR_RE = /^(PDTR|POTR)(\d{2})(\d{3})(\d)(\d{2})(\d)(\d+)$/;

export function decodeTr(raw: string): Decoded {
  const code = raw.trim().toUpperCase();
  const m = TR_RE.exec(code);
  if (!m) {
    return {
      ok: false,
      code,
      segments: [],
      summary: "",
      error:
        "That is not a transformer code. The shape is PDTR or POTR, then kV, rating, " +
        "winding, protection, accessories and serial — for example PDTR2206312101.",
    };
  }
  const [, prefix, volt, rating, core, ip, acc, serial] = m;
  const kva = ratingKva(rating);
  const voltRow = TR_VOLTS.find(([c]) => c === volt);
  const ipRow = TR_IPS.find(([c]) => c === ip);

  const segments: Segment[] = [
    {
      chars: prefix,
      field: "Product",
      meaning: prefix === "PDTR" ? "Powerline dry-type transformer" : "Powerline oil-immersed transformer",
    },
    {
      chars: volt,
      field: "Primary voltage",
      meaning: voltRow ? voltRow[1] : "not a listed voltage",
      problem: voltRow ? undefined : "Listed voltages are 10.5, 11 and 22 kV.",
    },
    {
      chars: rating,
      field: "Rating",
      meaning: `${kva} kVA (the field is kVA ÷ 10)`,
      problem: ratingSharedWith(kva).length
        ? `This field is also produced by ${ratingSharedWith(kva).join(" and ")} kVA, so the ` +
          `code does not identify one unit on its own.`
        : undefined,
    },
    {
      chars: core,
      field: "Winding",
      meaning: TR_CORE[core] ?? "not a coded winding material",
      problem: TR_CORE[core] ? undefined : "1 is aluminium, 2 is copper.",
    },
    {
      chars: ip,
      field: "Protection",
      meaning: ipRow ? ipRow[1] : "not a listed protection class",
      // Valid class, but worth saying where it is used — a note, not a fault.
      note: ipRow && ip === TR_IP_ACUD ? "Used for New Capital (ACUD) projects." : undefined,
      problem: ipRow
        ? undefined
        : "Listed classes are 00, 21 and 23. The letters IP are never written in the code.",
    },
    {
      chars: acc,
      field: "Accessories",
      meaning: TR_ACC[acc] ?? "not a coded accessory option",
      problem: TR_ACC[acc] ? undefined : "0 is a bare unit, 1 is accessories fitted. 2-9 are unused.",
    },
    {
      chars: serial,
      field: "Serial",
      // A code names a product, not one physical unit, so the digit is parked at 0.
      meaning: Number(serial) === 0 ? "not used" : `unit ${Number(serial)}`,
    },
  ];

  return {
    ok: true,
    code,
    segments,
    summary:
      `${prefix === "PDTR" ? "Dry-type" : "Oil-immersed"} transformer, ${kva} kVA, ` +
      `${voltRow ? voltRow[1] : volt}, ${TR_CORE[core] ?? "winding not coded"}, ` +
      `${ipRow ? ipRow[1].toLowerCase() : "protection not coded"}, ${TR_ACC[acc] ?? "accessories not coded"}.`,
  };
}

// ── MV switchgear (PLGear) ───────────────────────────────────────────────────

export interface GearParts {
  volt: string; // 2 = 12 kV, 4 = 24 kV
  incoming: number;
  outgoing: number;
  couplers: string; // 0 | 1 | 2
  adapt: string; // 0 | 1 | 2
  serial: number;
}

export function buildGearCode(p: GearParts): string {
  const out = ("0" + Math.max(0, Math.floor(p.outgoing || 0))).slice(-2);
  return `PLG${p.volt}I${Math.max(0, Math.floor(p.incoming || 0))}O${out}C${p.couplers}S${p.adapt}${trSerial(p.serial)}`;
}

const GEAR_RE = /^PLG(\d)I(\d+)O(\d{2})C(\d)S(\d)(\d)$/;

export function decodeGear(raw: string): Decoded {
  const code = raw.trim().toUpperCase();
  const m = GEAR_RE.exec(code);
  if (!m) {
    return {
      ok: false,
      code,
      segments: [],
      summary: "",
      error:
        "That is not a switchgear code. The shape is PLG, kV, then I, O, C and S with their " +
        "counts — for example PLG2I1O04C1S11.",
    };
  }
  const [, volt, incoming, outgoing, couplers, adapt, serial] = m;
  const voltRow = GEAR_VOLTS.find(([c]) => c === volt);
  const cRow = GEAR_COUPLERS.find(([c]) => c === couplers);
  const aRow = GEAR_ADAPT.find(([c]) => c === adapt);

  const segments: Segment[] = [
    { chars: "PLG", field: "Product", meaning: "Powerline MV switchgear" },
    {
      chars: volt,
      field: "Voltage",
      meaning: voltRow ? `${voltRow[1]} kV` : "not a listed voltage",
      problem: voltRow ? undefined : "2 is 12 kV, 4 is 24 kV.",
    },
    { chars: `I${incoming}`, field: "Incoming panels", meaning: `${Number(incoming)} incoming` },
    { chars: `O${outgoing}`, field: "Outgoing panels", meaning: `${Number(outgoing)} outgoing` },
    {
      chars: `C${couplers}`,
      field: "Bus couplers",
      meaning: cRow ? cRow[1] : "not a listed option",
      // Each coupler occupies two panels, which the code does not say on its own — the
      // number here counts couplers, not the panels they take up.
      note:
        cRow && Number(couplers) > 0
          ? `Each bus coupler is ${GEAR_COUPLER_PANELS} panels: the bus coupler and its bus riser` +
            (Number(couplers) > 1
              ? `, so ${couplers} couplers take ${Number(couplers) * GEAR_COUPLER_PANELS} panels.`
              : ".")
          : undefined,
      problem: cRow ? undefined : "0, 1 or 2 couplers.",
    },
    {
      chars: `S${adapt}`,
      field: "Service panel",
      meaning: aRow ? aRow[1] : "not a listed option",
      problem: aRow ? undefined : "0 none, 1 ABB, 2 Murge.",
    },
    {
      chars: serial,
      field: "Serial",
      // A code names a product, not one physical unit, so the digit is parked at 0.
      meaning: Number(serial) === 0 ? "not used" : `unit ${Number(serial)}`,
    },
  ];

  // A bus coupler is TWO panels — the coupler and its bus riser — so the coupler digit
  // cannot be added straight into a panel count. This used to add one per coupler and
  // understated every lineup that had one.
  const couplerPanels = Number(couplers) * GEAR_COUPLER_PANELS;
  const panels = Number(incoming) + Number(outgoing) + couplerPanels + (adapt === "0" ? 0 : 1);
  return {
    ok: true,
    code,
    segments,
    summary:
      `MV switchgear at ${voltRow ? voltRow[1] : volt} kV: ${Number(incoming)} incoming, ` +
      `${Number(outgoing)} outgoing, ${cRow ? cRow[1] : couplers}` +
      (couplerPanels > 0 ? ` (${couplerPanels} panels with the bus riser)` : "") +
      `, ${aRow ? aRow[1] : adapt} — ` +
      `${panels} panel${panels === 1 ? "" : "s"} in total.`,
  };
}

// ── One entry point, so the decoder box can take anything ────────────────────

export type System = "rmu" | "transformer" | "gear";

/** Work out which system a code belongs to, then decode it. */
export function decodeAny(raw: string): Decoded & { system?: System } {
  const code = raw.trim().toUpperCase();
  if (/^(PSEC|PRAL)/.test(code)) return { ...decodeRmu(code), system: "rmu" };
  if (/^(PDTR|POTR)/.test(code)) return { ...decodeTr(code), system: "transformer" };
  if (/^PLG/.test(code)) return { ...decodeGear(code), system: "gear" };
  return {
    ok: false,
    code,
    segments: [],
    summary: "",
    error:
      "Codes start with PSEC or PRAL (ring main units), PDTR or POTR (transformers), " +
      "or PLG (switchgear).",
  };
}
