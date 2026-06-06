// EEHC standards for Powerline RMUs, transcribed from the approved technical
// offers. This module is the single source of truth for the *constant* data
// that depends only on product type (PRAL/PSEC) and rated voltage (12/24 kV).
// The per-configuration assembly (how many NAL/NALF/metering/RTU) lives in
// assembly.ts.

export type ProductType = "PRAL" | "PSEC";
export type VoltageKv = 12 | 24;
export type RtuType = "NONE" | "TYPE1" | "TYPE2";
export type Installation = "INDOOR" | "OUTDOOR";

export const PRODUCT_TYPES: ProductType[] = ["PRAL", "PSEC"];
export const VOLTAGES: VoltageKv[] = [12, 24];
export const RTU_TYPES: RtuType[] = ["NONE", "TYPE1", "TYPE2"];
export const INSTALLATIONS: Installation[] = ["INDOOR", "OUTDOOR"];

/** Identity of a product family. */
export interface ProductProfile {
  productType: ProductType;
  productName: string; // "P-Ral" | "P-Sec"
  family: string; // "Air Ring Main Unit" | "SF6 Ring Main Unit"
  insulation: string; // "AIR" | "SF6"
  apparatusType: string; // "Switch disconnector type AIR/SF6"
  protectionIndex: string; // "IP42 on front face" | "IP3x on front face"
  cubicleDims: string; // LBS cubicle W*D*H
  meteringDims: string; // metering cubicle W*D*H
  /** Name of the ABB 3-position switch as printed in the cubicle BOM. */
  switchName: string; // "NAL"/"NALF" for PRAL, "G-Sec" for PSEC
  gasInsulated: boolean;
}

export const PRODUCTS: Record<ProductType, ProductProfile> = {
  PRAL: {
    productType: "PRAL",
    productName: "P-Ral",
    family: "Air Ring Main Unit",
    insulation: "AIR",
    apparatusType: "Switch disconnector type AIR",
    protectionIndex: "IP42 on front face",
    cubicleDims: "654*750*2220",
    meteringDims: "600*750*2220",
    switchName: "NAL", // NALF used for the fused unit (handled in assembly)
    gasInsulated: false,
  },
  PSEC: {
    productType: "PSEC",
    productName: "P-Sec",
    family: "SF6 Ring Main Unit",
    insulation: "SF6",
    apparatusType: "Switch disconnector type SF6",
    protectionIndex: "IP3x on front face",
    cubicleDims: "554*1070*1700",
    meteringDims: "500*1070*1700",
    switchName: "G-Sec",
    gasInsulated: true,
  },
};

/** Electrical ratings that depend on type × voltage. */
export interface ElectricalRatings {
  ratedVoltageKv: number;
  serviceVoltageKv: number;
  powerFreqWithstandKv: number;
  bilKv: number;
  ratedFrequencyHz: number;
  ratedBusbarCurrentA: number;
  ratedShortCircuitKa: number;
  shortCircuitDurationS: number;
  peakCurrentKa: number;
  defaultFuseRatingA: number; // "up to X A"
}

// Keyed "TYPE-kV". Values transcribed directly from the offers.
const RATINGS: Record<string, ElectricalRatings> = {
  "PRAL-12": {
    ratedVoltageKv: 12,
    serviceVoltageKv: 11,
    powerFreqWithstandKv: 28,
    bilKv: 75,
    ratedFrequencyHz: 50,
    ratedBusbarCurrentA: 630,
    ratedShortCircuitKa: 25,
    shortCircuitDurationS: 1,
    peakCurrentKa: 62.5,
    defaultFuseRatingA: 100,
  },
  "PRAL-24": {
    ratedVoltageKv: 24,
    serviceVoltageKv: 22,
    powerFreqWithstandKv: 50,
    bilKv: 125,
    ratedFrequencyHz: 50,
    ratedBusbarCurrentA: 630,
    ratedShortCircuitKa: 20,
    shortCircuitDurationS: 1,
    peakCurrentKa: 50,
    defaultFuseRatingA: 80,
  },
  "PSEC-12": {
    ratedVoltageKv: 12,
    serviceVoltageKv: 11,
    powerFreqWithstandKv: 28,
    bilKv: 75,
    ratedFrequencyHz: 50,
    ratedBusbarCurrentA: 630,
    ratedShortCircuitKa: 25,
    shortCircuitDurationS: 1,
    peakCurrentKa: 63,
    defaultFuseRatingA: 100,
  },
  "PSEC-24": {
    ratedVoltageKv: 24,
    serviceVoltageKv: 22,
    powerFreqWithstandKv: 50,
    bilKv: 125,
    ratedFrequencyHz: 50,
    ratedBusbarCurrentA: 630,
    ratedShortCircuitKa: 25,
    shortCircuitDurationS: 1,
    peakCurrentKa: 50,
    defaultFuseRatingA: 80,
  },
};

export function getRatings(
  productType: ProductType,
  voltageKv: VoltageKv
): ElectricalRatings {
  const r = RATINGS[`${productType}-${voltageKv}`];
  if (!r) throw new Error(`No standard ratings for ${productType} ${voltageKv}kV`);
  return r;
}

// Constants shared by every offer (the "General Data" block).
export const GENERAL = {
  type: "RMU - Powerline",
  application: "Standard IEC 62271-200",
  packing: "Domestic",
  ambientTemperature:
    "For working: from -5 °C to +40 °C / For storage: -5 °C",
  altitude: "Altitude for installation above sea level: under 1,000 m",
  humidity: "Relative humidity: max. 95 %",
  fat: "Powerline standard FAT (One day)",
  iac: "Front Accessibility (AF)",
  color: "RAL 7035",
  busbarsTreatment: "insulated",
};

export const GENERAL_NOTES = [
  "Earthing switch is interlocked with LBS operation.",
  "Mechanical interlocking is provided between any cell door and the earthing switch.",
  "Mimic panel for LBS and earthing-switch position indication is provided.",
];
