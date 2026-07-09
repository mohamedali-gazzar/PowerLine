// Lucy Electric AEGIS PLUS — SF6 Circuit-Breaker Ring Main Unit.
//
// A separate OEM family from Powerline's PRAL/PSEC: a FIXED catalogue of eight
// configurations transcribed from the Lucy technical offers (12 & 24 kV). Unlike
// PRAL/PSEC, Lucy has NO LBS brand / client spec / fuse rating and its metering
// unit is fixed, so it gets its own assembler + price map rather than reusing the
// algorithmic PRAL/PSEC assembly. The first number is the FEEDER count (Load-Break
// Switch "L", stored as nalCount); the second is the TRANSFORMER count (Circuit
// Breaker "V", stored as nalfCount). "+M" adds the Air-Insulated Metering Unit.

import {
  getRatings,
  rtuHasRtu,
  rtuIsReady,
  rtuTypeNum,
  rtuMotorized,
  type ProductType,
} from "./standards";
import type {
  RmuConfigInput,
  GeneratedOffer,
  Row,
  Cubicle,
  CubicleItem,
  LbsBrand,
  ClientSpec,
} from "./assembly";

export interface LucyConfig {
  key: string; // "0+1" … "3+1+M"  (feeders + transformers [+ metering])
  feeders: number; // Load-Break-Switch ways (L) → nalCount
  transformers: number; // Circuit-Breaker ways (V) → nalfCount
  metering: boolean;
  wayText: string; // Lucy's physical arrangement wording (e.g. "3-way L-V-L")
  priceUsd: number; // selling price (USD, same for 12 & 24 kV)
}

/** The eight quoted Lucy configurations. Price is identical for 12 & 24 kV. */
export const LUCY_CONFIGS: LucyConfig[] = [
  { key: "0+1", feeders: 0, transformers: 1, metering: false, wayText: "1-way V", priceUsd: 8310 },
  { key: "1+1", feeders: 1, transformers: 1, metering: false, wayText: "2-way L-V", priceUsd: 9151 },
  { key: "2+1", feeders: 2, transformers: 1, metering: false, wayText: "3-way L-V-L", priceUsd: 12242 },
  { key: "2+2", feeders: 2, transformers: 2, metering: false, wayText: "4-way L-V-V-L", priceUsd: 16941 },
  { key: "3+1", feeders: 3, transformers: 1, metering: false, wayText: "4-way L-L-V-L", priceUsd: 14220 },
  {
    key: "2+2+M", feeders: 2, transformers: 2, metering: true,
    wayText:
      "2-way L-L (Right Extensible) & 2-way V-V (Left Extensible) coupled together with Air Insulated Metering Unit (Busbar In - Busbar out) configuration",
    priceUsd: 30611,
  },
  {
    key: "2+1+M", feeders: 2, transformers: 1, metering: true,
    wayText:
      "2-way L-L (Right Extensible) & 1-way V (Left Extensible) coupled together with Air Insulated Metering Unit (Busbar In - Busbar out) configuration",
    priceUsd: 24350,
  },
  {
    key: "3+1+M", feeders: 3, transformers: 1, metering: true,
    wayText:
      "3-way L-L-L (Right Extensible) & 1-way V (Left Extensible) coupled together with Air Insulated Metering Unit (Busbar In - Busbar out) configuration",
    priceUsd: 26650,
  },
];

type ConfigCounts = { nalCount: number; nalfCount: number; hasMetering: boolean };

export const lucyKey = (c: ConfigCounts): string =>
  `${c.nalCount}+${c.nalfCount}${c.hasMetering ? "+M" : ""}`;

export const findLucyConfig = (c: ConfigCounts): LucyConfig | undefined =>
  LUCY_CONFIGS.find(
    (x) => x.feeders === c.nalCount && x.transformers === c.nalfCount && x.metering === c.hasMetering
  );

/** Lucy list/selling price (USD) for a config, or null when not in the catalogue. */
export const lucyPrice = (c: ConfigCounts): number | null => findLucyConfig(c)?.priceUsd ?? null;

// ── Bills of material (identical across all Lucy configs) ────────────────────

const CABLE_BOX = "Air insulated cable box & clamps suitable for 1*3C cable upto 400mm2 - Purchaser to confirm";
const MIMIC = "Mimic diagram on front panel, complete with status indicators";
const INTERLOCKS = "Set of positive standard mechanical interlocks";
const AUX_TERMS = "Set of auxiliary terminals";

/** Load-Break-Switch (feeder "L") cell items. */
const LBS_ITEMS: CubicleItem[] = [
  { qty: 1, description: "630 Amp triple pole, single break, 3-position ('ON', 'OFF' and 'EARTH') manually operated ring main switch, with independent manually charged spring mechanism and fully rated earth switch, with provision for earth and test of the cable." },
  { qty: 1, description: CABLE_BOX },
  { qty: 1, description: MIMIC },
  { qty: 1, description: INTERLOCKS },
  { qty: 1, description: "Set of VPIS/VDS for each ring switch" },
  { qty: 1, description: AUX_TERMS },
];

/** Circuit-Breaker (transformer "V") cell items. */
const CB_ITEMS: CubicleItem[] = [
  { qty: 1, description: "630 Amp triple pole, Circuit breaker with independent manually charged spring mechanism and earth switch, with provision for earth of the cable." },
  { qty: 1, description: CABLE_BOX },
  { qty: 1, description: MIMIC },
  { qty: 1, description: "Self powered relay for S/C, O/C & E/F protection." },
  { qty: 1, description: "Set of current transformers for relay protection (Purchaser to confirm CT ratio/advise transformer details)." },
  { qty: 1, description: INTERLOCKS },
  { qty: 1, description: "Set of VPIS/VDS for each Circuit Breaker" },
  { qty: 1, description: AUX_TERMS },
];

/** Air-Insulated Metering Unit items — VT primary ratio follows the voltage. */
function amuItems(voltageKv: number): CubicleItem[] {
  const us = voltageKv === 24 ? 22000 : 11000;
  return [
    { qty: 1, description: "Set of Measuring Current Transformers, 100/5A, Class 0.5M5, 10VA (Purchaser to review and confirm the CT details in line with the meter to be supplied under purchaser scope)" },
    { qty: 3, description: `Single Phase Voltage Transformer, Single Ratio (${us}/√3)/(110V/√3), 50VA /Ph, Class 0.5. The VT is provided with 1 No. 2° winding only.` },
    { qty: 1, description: "Set of 3 LV fuses/MCB for VT secondary protection fuses are contained within the auxiliary terminal box." },
    { qty: 1, description: "Space for KWH/KVARH Meter" },
  ];
}

/** "Supplied complete with" — the Earth-Fault-Indicator line depends on feeders. */
function suppliedComplete(feeders: number): CubicleItem[] {
  const items: CubicleItem[] = [];
  if (feeders >= 2) {
    const incomings = feeders - 1;
    items.push({
      qty: 1,
      description: `Earth Fault Indicator, Auto Reset, complete with solid core current transformer (current transformer to be installed in the cable box by cabling contractor) for ${incomings} load break switch incoming${incomings > 1 ? "s" : ""} only`,
    });
  }
  items.push(
    { qty: 1, description: "External stud for earthing connections" },
    { qty: 1, description: "SF6 gas pressure indicator" },
    { qty: 1, description: "Operating Handle" }
  );
  return items;
}

const plural = (n: number) => (n === 1 ? "number" : "numbers");

/** Line-item scope text for the Lucy commercial offer. */
export function lucyCommercialDescription(c: RmuConfigInput): string {
  const measuring = c.hasMetering ? " with Air-Insulated metering" : "";
  const install = c.installation === "OUTDOOR" ? "outdoor" : "indoor";
  return (
    `Supply of ${c.voltageKv} KV SF6 Circuit-Breaker Ring Main Unit, Lucy Electric (AEGIS PLUS), ` +
    `(${c.nalCount} Feeder + ${c.nalfCount} Transformer)${measuring}, for ${install} installation ` +
    `as per technical specifications enclosed.`
  );
}

/** Assemble the full Lucy technical offer into the shared GeneratedOffer shape. */
export function assembleLucyOffer(c: RmuConfigInput): GeneratedOffer {
  const voltageKv = c.voltageKv;
  const r = getRatings("LUCY" as ProductType, voltageKv);
  const feeders = c.nalCount;
  const transformers = c.nalfCount;
  const metering = c.hasMetering;
  const busbarA = c.busbarCurrentA || 630;
  const outdoor = c.installation === "OUTDOOR";
  const cfg = findLucyConfig(c);
  const wayText = cfg?.wayText ?? `${feeders + transformers}-way`;

  // Smart / RTU (optional) — same levels as PSEC.
  const hasRtu = rtuHasRtu(c.rtuType);
  const ready = rtuIsReady(c.rtuType);
  const typeNum = rtuTypeNum(c.rtuType);
  const titleBase = hasRtu
    ? `Smart Lucy AEGIS PLUS ${voltageKv}KV-TYPE ${typeNum}`
    : ready
    ? `Lucy AEGIS PLUS ${voltageKv}KV (Ready to be Smart-TYPE ${typeNum})`
    : `Lucy AEGIS PLUS ${voltageKv}KV`;
  // Generic RTU hardware (not in Lucy's sheet — same kit PSEC uses).
  let communication: CubicleItem[] | undefined;
  if (hasRtu) {
    communication = [
      { qty: 1, description: "RTU" },
      { qty: 3, description: "Expansion module 16 DI" },
      { qty: 1, description: "Power supply 24 VDC, 10A" },
    ];
    if (rtuMotorized(c.rtuType)) communication.push({ qty: 1, description: "Expansion module 8 DO" });
  }

  const headerType = metering
    ? "SF6 Insulated Circuit Breaker Ring Main Unit along with Air Insulated Metering Unit (AEGIS PLUS)"
    : "SF6 Insulated Circuit Breaker Ring Main Unit (AEGIS PLUS)";

  const generalData: Row[] = [
    { label: "Make", value: "Lucy Electric" },
    { label: "Type", value: headerType },
    { label: "Type of apparatus", value: "SF6 insulated Circuit Breaker / Load Break Switch (AEGIS PLUS)" },
    { label: "Application", value: "Standard IEC 62271-200" },
    { label: "Configuration", value: `${voltageKv}kV, 21kA/3sec, IP41, suitable for ${outdoor ? "outdoor (with enclosure)" : "indoor"} use — Unit shall be ${wayText}.` },
    { label: "Installation", value: outdoor ? "Outdoor" : "Indoor" },
    { label: "Protection index", value: outdoor ? "IP54 (outdoor enclosure)" : "IP41" },
    { label: "Switchgear color", value: "Gray RAL 7032, powder coated and stoved" },
    { label: "Packing", value: "Domestic" },
  ];

  const electricalData: Row[] = [
    { label: "Rated voltage", value: `${r.ratedVoltageKv}kV` },
    { label: "Service voltage", value: `${r.serviceVoltageKv}kV` },
    { label: "Power frequency withstand voltage", value: `${r.powerFreqWithstandKv}kV` },
    { label: "BIL", value: `${r.bilKv}kV` },
    { label: "Rated frequency", value: `${r.ratedFrequencyHz}Hz` },
    { label: "Rated busbar current", value: `${busbarA}A` },
    { label: "Rated short circuit current", value: `${r.ratedShortCircuitKa}kA` },
    { label: "Rated short circuit current duration", value: `${r.shortCircuitDurationS}s` },
    { label: "Peak current", value: `${r.peakCurrentKa}kA` },
  ];

  const cubicles: Cubicle[] = [];
  if (feeders > 0) {
    cubicles.push({
      code: "LBS",
      name: `Load Break Switch 630A (L) (${feeders} ${plural(feeders)})`,
      qty: feeders,
      dims: "",
      items: LBS_ITEMS,
    });
  }
  cubicles.push({
    code: "CB",
    name: `Circuit Breaker 630A (V) (${transformers} ${plural(transformers)})`,
    qty: transformers,
    dims: "",
    items: CB_ITEMS,
  });
  if (metering) {
    cubicles.push({
      code: "AMU",
      name: "Air Insulated Metering Unit (AMU) (Busbar In - Busbar Out)",
      qty: 1,
      dims: "",
      items: amuItems(voltageKv),
    });
  }
  cubicles.push({
    code: "EXTRA",
    name: "Supplied Complete With",
    qty: 1,
    dims: "",
    items: suppliedComplete(feeders),
  });

  return {
    configCode: `LUCY${voltageKv}(${feeders}+${transformers}${metering ? "+M" : ""})`,
    panelCode: "", // Lucy has no Powerline product code — left blank on purpose
    priceKey: `LUCY-${lucyKey(c)}`,
    commercialDescription: lucyCommercialDescription(c),
    titleProduct: `${titleBase} (${outdoor ? "Outdoor" : "Indoor"})`,
    titleFamily: "SF6 Circuit-Breaker Ring Main Unit",
    generalData,
    electricalData,
    additionalData: [],
    installationNote: outdoor ? "Provided with enclosure for outdoor installation" : undefined,
    generalNotes: [
      "All steelwork will be finish painted gray to RAL 7032, powder coated and stoved.",
    ],
    cubicles,
    communication,
    summary: {
      productType: "LUCY" as ProductType,
      lbsBrand: "ABB" as LbsBrand, // N/A for Lucy (not shown in the Lucy view)
      clientSpec: "EECH" as ClientSpec, // N/A for Lucy
      smart: hasRtu,
      insulation: "SF6",
      voltageKv,
      nalCount: feeders,
      nalfCount: transformers,
      hasMetering: metering,
      rtuType: c.rtuType,
      installation: c.installation,
      fuseRatingA: 0,
      fuseOverride: false,
      busbarCurrentA: busbarA,
      meteringCtPrimaryA: metering ? 100 : null,
      vtCores: 1,
      meteringWithFuse: false,
      totalCubicles: feeders + transformers + (metering ? 1 : 0),
    },
  };
}
