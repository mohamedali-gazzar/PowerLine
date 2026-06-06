// Dropdown options + display labels for the RMU coding system.
// Mirrors the backend domain (backend/src/domain/standards.ts).

export const PRODUCT_CATEGORIES = [
  { key: "RMU", label: "RMU", ready: true, blurb: "Ring Main Units (PRAL air & PSEC SF6)" },
  { key: "KIOSK", label: "Kiosks", ready: false, blurb: "Packaged substation kiosks" },
  { key: "LV", label: "LV", ready: false, blurb: "Low-voltage distribution panels" },
] as const;

export const PRODUCT_TYPES = ["PRAL", "PSEC"] as const;
export const VOLTAGES = [12, 24] as const;
export const RTU_TYPES = ["NONE", "TYPE1", "TYPE2"] as const;
export const INSTALLATIONS = ["INDOOR", "OUTDOOR"] as const;
export const OFFER_STATUS = ["DRAFT", "SENT", "WON", "LOST"] as const;

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
};

export const label = (key: string) => LABELS[key] ?? key;
