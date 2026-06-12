// Dropdown options + display labels for the RMU coding system.
// Mirrors the backend domain (backend/src/domain/standards.ts).

export const PRODUCT_CATEGORIES = [
  { key: "RMU", label: "RMU", ready: true, blurb: "Ring Main Units (PRAL air & PSEC SF6)" },
  { key: "KIOSK", label: "Kiosks", ready: true, blurb: "PCSS packaged substation design selector" },
  { key: "LV", label: "LV", ready: true, blurb: "LV panel configurator (ABB database)" },
] as const;

export const PRODUCT_TYPES = ["PRAL", "PSEC"] as const;
export const VOLTAGES = [12, 24] as const;
export const RTU_TYPES = ["NONE", "TYPE1", "TYPE2"] as const;
export const INSTALLATIONS = ["INDOOR", "OUTDOOR"] as const;
export const OFFER_STATUS = ["DRAFT", "SENT", "WON", "LOST"] as const;

// Client specification (coding-system Variable 2, first digit).
export const CLIENT_SPECS = ["EECH", "KAHRABA"] as const;
// Client specs we have a technical offer for (KAHRABA locked until data exists).
export const AVAILABLE_CLIENT_SPECS: readonly string[] = ["EECH"];

// LBS brands the coding system DEFINES per family: PSEC=SF6, PRAL=Air.
export const BRANDS_BY_FAMILY: Record<"PRAL" | "PSEC", readonly string[]> = {
  PSEC: ["ABB", "MURGE", "SCHNEIDER"],
  PRAL: ["ABB", "JGGY", "GRL"],
};

// Brands we actually have data for (technical offer + price). Others are shown
// but LOCKED in the form until their data is added.
export const AVAILABLE_BRANDS_BY_FAMILY: Record<"PRAL" | "PSEC", readonly string[]> = {
  PSEC: ["ABB", "MURGE"],
  PRAL: ["ABB"],
};

export const LABELS: Record<string, string> = {
  PRAL: "PRAL — Air insulated",
  PSEC: "PSEC — SF6 / GIS",
  NONE: "None",
  TYPE1: "RTU Type 1 — Monitor only",
  TYPE2: "RTU Type 2 — Monitor & Control",
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
  EECH: "EECH",
  KAHRABA: "KAHRABA",
};

export const label = (key: string) => LABELS[key] ?? key;
