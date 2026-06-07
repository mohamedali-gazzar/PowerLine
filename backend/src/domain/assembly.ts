// Assembly engine: turns an RMU configuration (the "code") into the full
// technical-offer structure, reproducing the approved Powerline/EEHC offers.
// Same input → same output, for any NAL/NALF count (2+1, 3+1, 2+2+M, …).

import {
  PRODUCTS,
  getRatings,
  GENERAL,
  GENERAL_NOTES,
  type ProductType,
  type VoltageKv,
  type RtuType,
  type Installation,
} from "./standards";

export type LbsBrand = "ABB" | "MURGE" | "SCHNEIDER" | "JGGY" | "GRL";
export type ClientSpec = "EECH" | "KAHRABA";

/** Two-letter brand code used in the product code (coding-system Variable 3). */
export const BRAND_CODE: Record<LbsBrand, string> = {
  ABB: "AB",
  MURGE: "MG",
  SCHNEIDER: "SH",
  JGGY: "GY",
  GRL: "GL",
};

/** Human brand word for BOM / commercial text. */
const BRAND_WORD: Record<LbsBrand, string> = {
  ABB: "ABB",
  MURGE: "Murge",
  SCHNEIDER: "Schneider",
  JGGY: "JGGY",
  GRL: "GRL",
};

/** Brands the coding system DEFINES per family: PSEC=SF6 (ABB/Murge/Schneider),
 *  PRAL=Air (ABB/JGGY/GRL). Used for code parsing/display only. */
export const BRANDS_BY_FAMILY: Record<ProductType, LbsBrand[]> = {
  PSEC: ["ABB", "MURGE", "SCHNEIDER"],
  PRAL: ["ABB", "JGGY", "GRL"],
};

/**
 * Brands we actually HAVE data for (verified technical BOM + price list entry),
 * so we can produce a real offer. The price list only covers ABB (P-SEC / P-RAL)
 * and Murge (P-SEC.M) — every other brand is LOCKED until its technical offer
 * and pricing are added. Generating those from ABB's data would be fabrication.
 */
export const AVAILABLE_BRANDS_BY_FAMILY: Record<ProductType, LbsBrand[]> = {
  PSEC: ["ABB", "MURGE"],
  PRAL: ["ABB"],
};

/** True when we have the data to build a real offer for this brand + family. */
export function isBrandAvailable(c: {
  productType: ProductType;
  lbsBrand?: LbsBrand | null;
}): boolean {
  return AVAILABLE_BRANDS_BY_FAMILY[c.productType].includes(
    (c.lbsBrand ?? "ABB") as LbsBrand
  );
}

/**
 * Client specs we have a technical offer for. Only EECH today — KAHRABA is
 * LOCKED until its technical offer exists (the reference offers are all EECH).
 * The price list and SLD are EECH-based too, so the three stay in sync.
 */
export const AVAILABLE_CLIENT_SPECS: ClientSpec[] = ["EECH"];

/** True when we have data for this client specification. */
export function isClientSpecAvailable(spec?: ClientSpec | null): boolean {
  return AVAILABLE_CLIENT_SPECS.includes((spec ?? "EECH") as ClientSpec);
}

export interface RmuConfigInput {
  productType: ProductType;
  voltageKv: VoltageKv;
  lbsBrand?: LbsBrand | null; // LBS brand (see BRANDS_BY_FAMILY); default ABB
  clientSpec?: ClientSpec | null; // client specification: EECH (default) or KAHRABA
  nalCount: number; // LBS without fuse (NAL)
  nalfCount: number; // LBS with fuse (NALF)
  hasMetering: boolean;
  rtuType: RtuType;
  installation: Installation;
  busbarCurrentA: number; // default 630
  fuseRatingA?: number | null; // override; null → standard for the voltage
  // Metering options (only relevant when hasMetering)
  meteringCtPrimaryA?: number | null; // CT primary current (X in "X/5"); null → leave as "X"
  vtCores?: number | null; // VT secondary cores: 1 (default) or 2
  vtBurdenVa?: string | null; // VT burden, default "50-100"
  vtClass?: string | null; // VT accuracy class, default "0.5"
  meteringWithFuse?: boolean | null; // VT-Type: with fuse (true) or without (false/default)
}

export interface Row {
  label: string;
  value: string;
}
export interface CubicleItem {
  qty: number;
  description: string;
}
export interface Cubicle {
  code: string; // QPSC / QPSF / PMC
  name: string; // full heading
  qty: number;
  dims: string;
  items: CubicleItem[];
}
export interface GeneratedOffer {
  configCode: string; // e.g. PRAL12(2+1+M)
  panelCode: string; // catalogue code, e.g. P-RAL12N3F1M1
  priceKey: string; // price-list key (panelCode + "-With Fuse" when applicable)
  commercialDescription: string; // line-item scope text for the commercial offer
  titleProduct: string; // "P-Ral 12KV" or "Smart P-Sec 12KV-TYPE 1"
  titleFamily: string; // "Air Ring Main Unit"
  generalData: Row[];
  electricalData: Row[];
  additionalData: Row[];
  installationNote?: string;
  generalNotes: string[];
  cubicles: Cubicle[];
  communication?: CubicleItem[];
  summary: {
    productType: ProductType;
    lbsBrand: LbsBrand;
    clientSpec: ClientSpec;
    smart: boolean;
    insulation: string;
    voltageKv: number;
    nalCount: number;
    nalfCount: number;
    hasMetering: boolean;
    rtuType: RtuType;
    installation: Installation;
    fuseRatingA: number;
    fuseOverride: boolean;
    busbarCurrentA: number;
    meteringCtPrimaryA: number | null;
    vtCores: number;
    meteringWithFuse: boolean;
    totalCubicles: number;
  };
}

/** Build the human-facing code, e.g. PRAL12(3+1+M). */
export function buildCode(c: RmuConfigInput): string {
  const m = c.hasMetering ? "+M" : "";
  return `${c.productType}${c.voltageKv}(${c.nalCount}+${c.nalfCount}${m})`;
}

/** Is this a Murge-LBS PSEC unit? (Murge applies to PSEC, 12 or 24 kV.) */
export function isMurge(c: RmuConfigInput): boolean {
  return c.productType === "PSEC" && c.lbsBrand === "MURGE";
}

/** LBS brand word for BOM / commercial text (ABB / Murge / Schneider / JGGY / GRL). */
export function brandWord(c: RmuConfigInput): string {
  return BRAND_WORD[(c.lbsBrand ?? "ABB") as LbsBrand];
}

/** Catalogue family prefix: P-RAL / P-SEC / P-SEC.M (Murge). */
function famPrefix(c: RmuConfigInput): string {
  if (c.productType === "PRAL") return "P-RAL";
  return isMurge(c) ? "P-SEC.M" : "P-SEC";
}

/**
 * Legacy catalogue panel code, e.g. P-RAL12N3F1M1 or P-SEC.M24N2F1.
 * {prefix}{kv}N{nal}F{nalf}[M1]
 * Retained ONLY as the price-list lookup key (see priceList.ts / buildPriceKey).
 */
export function buildPanelCode(c: RmuConfigInput): string {
  const m = c.hasMetering ? "M1" : "";
  return `${famPrefix(c)}${c.voltageKv}N${c.nalCount}F${c.nalfCount}${m}`;
}

/**
 * Product code per the RMU Coding System, e.g. PSEC10AB12R3T1M.
 * Layout: {family}{spec}{brand}{kv}R{ring}T{transformer}{M|W}
 *   family      = PSEC (SF6) | PRAL (Air)
 *   spec (##)   = client(EECH=1, KAHRABA=2) + type(Standard=0, Smart=9) → 10/19/20/29
 *   brand (LL)  = AB/MG/SH/GY/GL  (see BRAND_CODE)
 *   kv          = 12 | 24
 *   ring  (R#)  = NAL count, 2–5
 *   trans (T#)  = NALF count, 0–2
 *   measuring   = M (with) | W (without)
 */
export function buildProductCode(c: RmuConfigInput): string {
  const client = (c.clientSpec ?? "EECH") === "KAHRABA" ? "2" : "1";
  const type = c.rtuType !== "NONE" ? "9" : "0"; // Smart (has RTU) vs Standard
  const brand = BRAND_CODE[(c.lbsBrand ?? "ABB") as LbsBrand];
  const meas = c.hasMetering ? "M" : "W";
  return `${c.productType}${client}${type}${brand}${c.voltageKv}R${c.nalCount}T${c.nalfCount}${meas}`;
}

/** True when this configuration is a "Smart" RMU (has RTU/communication). */
export function isSmart(c: RmuConfigInput): boolean {
  return c.rtuType !== "NONE";
}

/** Price-list key: the panel code plus the "-With Fuse" VT variant suffix. */
export function buildPriceKey(c: RmuConfigInput): string {
  const base = buildPanelCode(c);
  return c.hasMetering && c.meteringWithFuse ? `${base}-With Fuse` : base;
}

/** Commercial line-item scope text, in the style of the reference offer. */
export function commercialDescription(c: RmuConfigInput): string {
  const p = PRODUCTS[c.productType];
  const measuring = c.hasMetering ? " with measuring" : "";
  const lbs = p.gasInsulated ? "SF6" : "Air";
  const install = c.installation === "OUTDOOR" ? "outdoor" : "indoor";
  return (
    `Supply of ${c.voltageKv} KV Ring Main Unit Powerline (OEM-${brandWord(c)}) ` +
    `type (${c.nalCount}RC+${c.nalfCount}T)${measuring}, ${lbs} load break switches, ` +
    `for ${install} installation as per technical specifications enclosed.`
  );
}

export function assembleOffer(c: RmuConfigInput): GeneratedOffer {
  const p = PRODUCTS[c.productType];
  const r = getRatings(c.productType, c.voltageKv);
  const fuseOverride = c.fuseRatingA != null; // user entered an exact rating
  const fuseA = c.fuseRatingA ?? r.defaultFuseRatingA;
  const vtCores = c.vtCores ?? 1;
  const ctPrimaryA = c.meteringCtPrimaryA ?? null;
  const insulWord = p.gasInsulated ? "SF6" : "Air";
  const motor = c.rtuType === "TYPE2"; // Type 2 = monitor & control → motorized
  const hasRtu = c.rtuType !== "NONE";

  // Switch names as printed in the BOM.
  const nalSwitch = c.productType === "PRAL" ? "NAL" : "G-Sec";
  const nalfSwitch = c.productType === "PRAL" ? "NALF" : "G-Sec";
  const lbsBrand = brandWord(c); // ABB or Murge
  const mz = (name: string) => (motor ? `Motorized ${name}` : name);

  // ---- Title ----
  const titleProduct = hasRtu
    ? `Smart ${p.productName} ${c.voltageKv}KV-TYPE ${c.rtuType === "TYPE1" ? 1 : 2}`
    : `${p.productName} ${c.voltageKv}KV`;

  // ---- General Data ----
  const generalData: Row[] = [
    { label: "Type", value: GENERAL.type },
    { label: "Application", value: GENERAL.application },
    { label: "Type of apparatus", value: p.apparatusType },
    { label: "Packing", value: GENERAL.packing },
    { label: "Ambient temperature", value: GENERAL.ambientTemperature },
    { label: "Altitude", value: GENERAL.altitude },
    { label: "Humidity", value: GENERAL.humidity },
    { label: "FAT", value: GENERAL.fat },
    { label: "Protection index", value: p.protectionIndex },
    { label: "Internal Arc Classification (IAC)", value: GENERAL.iac },
    { label: "Switchgear color", value: GENERAL.color },
    { label: "Busbars treatment", value: GENERAL.busbarsTreatment },
  ];

  // ---- Electrical Data ----
  const electricalData: Row[] = [
    { label: "Rated voltage", value: `${r.ratedVoltageKv}kV` },
    { label: "Service voltage", value: `${r.serviceVoltageKv}kV` },
    { label: "Power frequency withstand voltage", value: `${r.powerFreqWithstandKv}kV` },
    { label: "BIL", value: `${r.bilKv}kV` },
    { label: "Rated frequency", value: `${r.ratedFrequencyHz}Hz` },
    { label: "Rated busbar current", value: `${c.busbarCurrentA}A` },
    { label: "Rated short circuit current", value: `${r.ratedShortCircuitKa}kA` },
    { label: "Rated short circuit current duration", value: `${r.shortCircuitDurationS}s` },
    { label: "Peak current", value: `${r.peakCurrentKa}kA` },
  ];

  // ---- Additional Data ----
  const additionalData: Row[] = [];
  if (p.gasInsulated) {
    additionalData.push({
      label: "Pressure indicator for switch disconnector",
      value: "With Manometer",
    });
  }
  additionalData.push({
    label: p.gasInsulated
      ? "Flag Relays (AC/DC Loss – Any MCB Trip – SF6 Leakage/Low Gas)"
      : "Flag Relays (AC/DC Loss – Any MCB Trip)",
    value: "Yes",
  });
  additionalData.push({ label: "Limit Switch 220V, 5A", value: "Yes" });

  // ---- Cubicles ----
  const cubicles: Cubicle[] = [];

  if (c.nalCount > 0) {
    cubicles.push({
      code: "QPSC",
      name: `QPSC (Powerline LBS Cubical)-${c.busbarCurrentA}A(${p.cubicleDims})mm²`,
      qty: c.nalCount,
      dims: p.cubicleDims,
      items: nalItems(insulWord, mz(nalSwitch), lbsBrand, hasRtu),
    });
  }
  if (c.nalfCount > 0) {
    cubicles.push({
      code: "QPSF",
      name: `QPSF (Powerline LBS Cubical)-${c.busbarCurrentA}A(${p.cubicleDims})mm²`,
      qty: c.nalfCount,
      dims: p.cubicleDims,
      items: nalfItems(insulWord, mz(nalfSwitch), lbsBrand, c.voltageKv, fuseA, hasRtu, fuseOverride),
    });
  }
  if (c.hasMetering) {
    cubicles.push({
      code: "PMC",
      name: `PMC (Powerline Measurement Cubical)-${c.busbarCurrentA}A (${p.meteringDims})mm²`,
      qty: 1,
      dims: p.meteringDims,
      items: meteringItems(r.serviceVoltageKv, c.voltageKv, ctPrimaryA, vtCores, {
        va: c.vtBurdenVa?.trim() || "50-100",
        cls: c.vtClass?.trim() || "0.5",
        withFuse: !!c.meteringWithFuse,
      }),
    });
  }

  // ---- Communication (RTU) ----
  let communication: CubicleItem[] | undefined;
  if (hasRtu) {
    communication = [
      { qty: 1, description: "RTU" },
      { qty: 3, description: "Expansion module 16 DI" },
      { qty: 1, description: "Power supply 24 VDC, 10A" },
    ];
    if (c.rtuType === "TYPE2") {
      communication.push({ qty: 1, description: "Expansion module 8 DO" });
    }
  }

  const totalCubicles =
    c.nalCount + c.nalfCount + (c.hasMetering ? 1 : 0);

  return {
    configCode: buildCode(c),
    panelCode: buildProductCode(c),
    priceKey: buildPriceKey(c),
    commercialDescription: commercialDescription(c),
    titleProduct,
    titleFamily: p.family,
    generalData,
    electricalData,
    additionalData,
    installationNote:
      c.installation === "OUTDOOR"
        ? "Provided with enclosure for outdoor installation"
        : undefined,
    generalNotes: GENERAL_NOTES,
    cubicles,
    communication,
    summary: {
      productType: c.productType,
      lbsBrand: (c.lbsBrand ?? "ABB") as LbsBrand,
      clientSpec: (c.clientSpec ?? "EECH") as ClientSpec,
      smart: isSmart(c),
      insulation: p.insulation,
      voltageKv: c.voltageKv,
      nalCount: c.nalCount,
      nalfCount: c.nalfCount,
      hasMetering: c.hasMetering,
      rtuType: c.rtuType,
      installation: c.installation,
      fuseRatingA: fuseA,
      fuseOverride,
      busbarCurrentA: c.busbarCurrentA,
      meteringCtPrimaryA: ctPrimaryA,
      vtCores,
      meteringWithFuse: !!c.meteringWithFuse,
      totalCubicles,
    },
  };
}

// ---- per-cubicle bills of material ----

function nalItems(insul: string, switchName: string, brand: string, rtu: boolean): CubicleItem[] {
  const items: CubicleItem[] = [
    { qty: 1, description: `Cubical type: ${insul} LBS LSC2A – load break Switch disconnector unit` },
    { qty: 1, description: "Cable entry for 1-phase cables up to 300 mm2 (Single core)" },
    { qty: 1, description: "Voltage presence indicator with fixed lamps type VPIS" },
    { qty: 1, description: "Anti-condensation heater for cable compartment 230VAC with MCB" },
    { qty: 1, description: "Internal light" },
    { qty: 1, description: "Insulated bar" },
    { qty: 1, description: `${switchName} – ${brand} Three position switch-disconnector with earthing switch and 1-spring operating device` },
  ];
  if (rtu) items.push({ qty: 1, description: "Auxiliary contacts for G-Sec" });
  items.push({ qty: 1, description: "low voltage compartment" });
  items.push({ qty: 1, description: "Earth fault indicator" });
  if (rtu) items.push({ qty: 1, description: "Fault passage indicator" });
  return items;
}

function nalfItems(
  insul: string,
  switchName: string,
  brand: string,
  voltageKv: number,
  fuseA: number,
  rtu: boolean,
  fuseOverride: boolean
): CubicleItem[] {
  const items: CubicleItem[] = [
    { qty: 1, description: `Cubical type: ${insul} LBS.F, LSC2A- Load break Switch with fuse combination unit with cable` },
    { qty: 1, description: "Cable entry for 1-phase cables up to 95 mm2 (Single core)" },
    { qty: 1, description: "Voltage presence indicator with fixed lamps type VPIS" },
    { qty: 1, description: "Operating Handle for Switch-disconnector and Earthing switch" },
    { qty: 1, description: "Anti-condensation heater for cable compartment 230VAC with MCB" },
    { qty: 1, description: "Internal light" },
    { qty: 1, description: "Insulated bar" },
    { qty: 1, description: `${switchName} – ABB Three position switch-disconnector with earthing switch and 2-spring operating device` },
  ];
  if (rtu) items.push({ qty: 1, description: "Auxiliary contacts for G-Sec" });
  // When the user enters an exact fuse rating we drop "up to"; the standard
  // (un-overridden) value keeps "up to" as the catalogue maximum.
  const fuseDesc = fuseOverride
    ? `3 MV fuse ${voltageKv} kV – ${fuseA} A – P&C`
    : `3 MV fuse ${voltageKv} kV – up to ${fuseA} A – P&C`;
  items.push(
    { qty: 1, description: fuseDesc },
    { qty: 1, description: "Downstream earthing switch with limited making capacity (2kA)" },
    { qty: 1, description: "Fuse base" },
    { qty: 1, description: "Fuse tripping" },
    { qty: 1, description: "Indication of fuse status" },
    { qty: 1, description: "Low voltage compartment" }
  );
  if (rtu) items.push({ qty: 1, description: "Fault passage indicator" });
  return items;
}

function meteringItems(
  serviceVoltageKv: number,
  voltageKv: number,
  ctPrimaryA: number | null,
  vtCores: number,
  vt: { va: string; cls: string; withFuse: boolean }
): CubicleItem[] {
  const us = serviceVoltageKv * 1000; // 11000 / 22000

  // CT: if the user gave the primary current, fill it into the CT description
  // and the "X/5" core ratio; otherwise leave the original "X" placeholders.
  const ctDesc =
    ctPrimaryA != null
      ? `Generic Cast Epoxy DIN CT ${voltageKv} KV, Ip=${ctPrimaryA} A`
      : "Generic Cast Epoxy DIN CT X KV, Ip=X A (X: to be determined by the client)";
  const ctCore =
    ctPrimaryA != null
      ? `Core1: ${ctPrimaryA}/5; 10-15 VA; CL 0.5; fs 5; Frequency: 50Hz`
      : "Core1: X/5; 10-15 VA; CL 0.5; fs 5; Frequency: 50Hz";

  const items: CubicleItem[] = [
    { qty: 1, description: "Cubical type: measurement, LSC2A – Universal Metering Panel" },
    { qty: 1, description: "Sealable door lock" },
    { qty: 1, description: "Insulated bar" },
    { qty: 1, description: "Low voltage compartment" },
    { qty: 3, description: ctDesc },
    { qty: 3, description: ctCore },
    { qty: 3, description: "Voltage Transformer Phase-earth" },
    // Core 1 secondary = 110/√3 (phase-earth)
    { qty: 3, description: `Core 1: Us=${us}/√3 : 110/√3 V; ${vt.va} VA; CL ${vt.cls}` },
  ];
  // Two-core VT adds a second core whose secondary is 110/3 (residual/open-delta).
  if (vtCores >= 2) {
    items.push({ qty: 3, description: `Core 2: Us=${us}/√3 : 110/3 V; ${vt.va} VA; CL ${vt.cls}` });
  }
  // VT protection fuses when the "with fuse" variant is selected.
  if (vt.withFuse) {
    items.push({ qty: 3, description: `MV fuse ${voltageKv} kV for VT protection – P&C` });
  }
  items.push(
    { qty: 3, description: "Ammeter ; CL0.5" },
    { qty: 1, description: "Voltmeter ; CL0.5" },
    { qty: 1, description: "Selector 7 position" }
  );
  return items;
}
