// Dropdown options + display labels for the RMU coding system.
// Mirrors the backend domain (backend/src/domain/standards.ts).

export const PRODUCT_CATEGORIES = [
  { key: "RMU", label: "RMU", ready: true, blurb: "Ring Main Units (PRAL air & PSEC SF6)" },
  { key: "KIOSK", label: "Kiosks", ready: true, blurb: "PCSS packaged substation design selector" },
  { key: "LV", label: "LV", ready: true, blurb: "LV panel configurator (ABB database)" },
] as const;

export const PRODUCT_TYPES = ["PRAL", "PSEC", "LUCY"] as const;
export const VOLTAGES = [12, 24] as const;
export const RTU_TYPES = ["READY1", "READY2", "SMART1", "SMART2"] as const;
export const INSTALLATIONS = ["INDOOR", "OUTDOOR"] as const;
export const OFFER_STATUS = ["DRAFT", "SENT", "WON", "LOST"] as const;

// Client specification (coding-system Variable 2, first digit).
export const CLIENT_SPECS = ["EECH", "KAHRABA"] as const;
// Client specs we have a technical offer for (KAHRABA locked until data exists).
export const AVAILABLE_CLIENT_SPECS: readonly string[] = ["EECH"];

// LBS brands the coding system DEFINES per family: PSEC=SF6, PRAL=Air.
export const BRANDS_BY_FAMILY: Record<"PRAL" | "PSEC" | "LUCY", readonly string[]> = {
  PSEC: ["ABB", "MURGE", "SCHNEIDER"],
  PRAL: ["ABB", "CHINT"],
  LUCY: [], // Lucy is a single-OEM family — no LBS brand choice
};

// Brands we actually have data for (technical offer + price). Others are shown
// but LOCKED in the form until their data is added.
export const AVAILABLE_BRANDS_BY_FAMILY: Record<"PRAL" | "PSEC" | "LUCY", readonly string[]> = {
  PSEC: ["ABB", "MURGE"],
  PRAL: ["ABB"],
  LUCY: [],
};

export const LABELS: Record<string, string> = {
  PRAL: "PRAL — Air insulated",
  PSEC: "PSEC — SF6 / GIS",
  LUCY: "LUCY — SF6 GIS (Lucy AEGIS PLUS)",
  READY1: "Ready to be smart type 1",
  READY2: "Ready to be Smart type 2",
  SMART1: "Smart type 1 (monitor only)",
  SMART2: "Smart type 2 (monitor and control)",
  INDOOR: "Indoor",
  OUTDOOR: "Outdoor",
  DRAFT: "Draft",
  SENT: "Sent",
  WON: "Won",
  LOST: "Lost",
  ABB: "ABB",
  MURGE: "Murge",
  SCHNEIDER: "Schneider",
  JGGY: "JGGY",
  GRL: "GRL",
  CHINT: "Chint",
  EECH: "EECH",
  KAHRABA: "KAHRABA",
};

export const label = (key: string) => LABELS[key] ?? key;

// ── Lucy AEGIS PLUS — fixed catalogue of 8 configurations ────────────────────
// First number = Feeder (Load-Break "L", nalCount); second = Transformer
// (Circuit-Breaker "V", nalfCount); "+M" = Air-Insulated Metering Unit.
// Mirrors backend/src/domain/lucy.ts.
export interface LucyConfigOption {
  key: string;
  nalCount: number;
  nalfCount: number;
  hasMetering: boolean;
  label: string;
}

export const LUCY_CONFIGS: readonly LucyConfigOption[] = [
  { key: "0+1", nalCount: 0, nalfCount: 1, hasMetering: false, label: "0+1 · 1 Transformer" },
  { key: "1+1", nalCount: 1, nalfCount: 1, hasMetering: false, label: "1+1 · 1 Feeder + 1 Transformer" },
  { key: "2+1", nalCount: 2, nalfCount: 1, hasMetering: false, label: "2+1 · 2 Feeders + 1 Transformer" },
  { key: "2+2", nalCount: 2, nalfCount: 2, hasMetering: false, label: "2+2 · 2 Feeders + 2 Transformers" },
  { key: "3+1", nalCount: 3, nalfCount: 1, hasMetering: false, label: "3+1 · 3 Feeders + 1 Transformer" },
  { key: "2+1+M", nalCount: 2, nalfCount: 1, hasMetering: true, label: "2+1+M · 2 Feeders + 1 Transformer + Metering" },
  { key: "2+2+M", nalCount: 2, nalfCount: 2, hasMetering: true, label: "2+2+M · 2 Feeders + 2 Transformers + Metering" },
  { key: "3+1+M", nalCount: 3, nalfCount: 1, hasMetering: true, label: "3+1+M · 3 Feeders + 1 Transformer + Metering" },
];

export const lucyKeyOf = (c: { nalCount: number; nalfCount: number; hasMetering: boolean }) =>
  `${c.nalCount}+${c.nalfCount}${c.hasMetering ? "+M" : ""}`;

export const isLucyConfig = (c: { nalCount: number; nalfCount: number; hasMetering: boolean }) =>
  LUCY_CONFIGS.some((x) => x.key === lucyKeyOf(c));
