// PCSS Engineering Selector — catalogue data.
//
// Transcribed mechanically from tools/reference/pcss-selector-source.html (the
// owner's original standalone tool) so the tables are exact. Where the source
// had a genuine data quirk it is kept and flagged rather than silently "fixed" —
// changing a number here changes what the factory builds.

export type RmuId = "psec50" | "psec375" | "murge" | "lucy" | "pral12" | "pral24";
export type SmartTypeId = "basic" | "ready1" | "ready2" | "smart1" | "smart2";
export type TrPresenceId = "with" | "without";
export type TrTypeId = "dry" | "oil";
export type TrConnId = "stepup" | "stepdown";
export type EehcId = "eehc" | "noeehc";
export type LvConfigId = "incoming" | "inout";
export type LvModeId = "sizing" | "technical";
export type LvPanelId = "175" | "210" | "230" | "1400" | "any";
export type Brand = "ABB" | "Himel";
export type SeriesId = "5ST" | "10ST" | "16ST";
export type TrBand = "500" | "1000" | "1500";

/** An option tile: id + label + one-line explanation. */
export interface Opt<T extends string = string> {
  id: T;
  label: string;
  sub: string;
  icon: string;
}

// ── MV panel (RMU) ───────────────────────────────────────────────────────────

export interface Rmu extends Opt<RmuId> {
  /** Switching configurations this RMU can be built in. */
  configs: string[];
}

export const RMUS: Rmu[] = [
  { id: "psec50", label: "PSEC ABB 50 cm", sub: "ABB ring main unit", icon: "ti-bolt", configs: ["2+1", "3+1", "2+1+M", "3+1+M"] },
  { id: "psec375", label: "PSEC ABB 37.5 cm", sub: "ABB compact RMU", icon: "ti-bolt", configs: ["2+1+M", "3+1+M"] },
  { id: "murge", label: "PSEC Murge", sub: "Murge switchgear", icon: "ti-circuit-switchboard", configs: ["2+1", "2+1+M", "3+1", "3+1+M"] },
  { id: "lucy", label: "Lucy", sub: "Lucy switchgear", icon: "ti-circuit-switchboard", configs: ["2+1", "2+1+M", "3+1", "3+1+M"] },
  { id: "pral12", label: "PRAL12", sub: "190×190×80 cm compact · 12 kV rated", icon: "ti-box", configs: ["2+1", "3+1", "2+1+M"] },
  { id: "pral24", label: "PRAL24", sub: "220×205×110 cm compact · 24 kV rated", icon: "ti-box", configs: ["2+1", "3+1", "2+1+M"] },
];

/** RMUs that can be ordered with smart provisions; the rest skip that step. */
export const SMART_ELIGIBLE_RMUS: RmuId[] = ["psec50", "psec375", "murge", "lucy"];

export const SMART_TYPES: Opt<SmartTypeId>[] = [
  { id: "basic", label: "Basic", sub: "Standard manual switchgear, no smart provisions", icon: "ti-manual-gearbox" },
  { id: "ready1", label: "Ready to be Smart Type 1", sub: "Pre-wired / prepped for future monitoring-only upgrade", icon: "ti-plug-connected" },
  { id: "ready2", label: "Ready to be Smart Type 2", sub: "Pre-wired / prepped for future monitor & control upgrade", icon: "ti-plug-connected" },
  { id: "smart1", label: "Smart Type 1", sub: "Factory-fitted · Monitoring only", icon: "ti-cpu" },
  { id: "smart2", label: "Smart Type 2", sub: "Factory-fitted · Monitor and Control", icon: "ti-cpu" },
];

// ── Transformer ──────────────────────────────────────────────────────────────

export const TR_ICON_OIL = `<svg width="52" height="52" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="26" y="4" width="3" height="10" rx="1.5" fill="currentColor"/>
  <rect x="35" y="4" width="3" height="10" rx="1.5" fill="currentColor"/>
  <rect x="20" y="12" width="24" height="8" rx="3" fill="currentColor" opacity="0.85"/>
  <rect x="12" y="20" width="40" height="28" rx="4" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2.5"/>
  <rect x="4" y="24" width="6" height="20" rx="2" fill="currentColor" opacity="0.6"/>
  <rect x="54" y="24" width="6" height="20" rx="2" fill="currentColor" opacity="0.6"/>
  <line x1="17" y1="28" x2="47" y2="28" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <line x1="17" y1="34" x2="47" y2="34" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <line x1="17" y1="40" x2="47" y2="40" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
  <rect x="8" y="50" width="48" height="5" rx="2" fill="currentColor"/>
  <circle cx="18" cy="59" r="3.5" fill="currentColor"/>
  <circle cx="46" cy="59" r="3.5" fill="currentColor"/>
</svg>`;

export const TR_ICON_DRY = `<svg width="52" height="52" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="9" y="13" width="13" height="35" rx="6.5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2.5"/>
  <rect x="25.5" y="8" width="13" height="40" rx="6.5" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="2.5"/>
  <rect x="42" y="13" width="13" height="35" rx="6.5" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2.5"/>
  <line x1="9" y1="23" x2="22" y2="23" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="9" y1="31" x2="22" y2="31" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="9" y1="39" x2="22" y2="39" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="25.5" y1="18" x2="38.5" y2="18" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="25.5" y1="26" x2="38.5" y2="26" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="25.5" y1="34" x2="38.5" y2="34" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="42" y1="23" x2="55" y2="23" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="42" y1="31" x2="55" y2="31" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="42" y1="39" x2="55" y2="39" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <rect x="5" y="50" width="54" height="6" rx="2" fill="currentColor"/>
</svg>`;

export const TR_PRESENCE: Opt<TrPresenceId>[] = [
  { id: "with", label: "With Transformer", sub: "Includes integrated TR compartment", icon: "ti-plug-connected" },
  { id: "without", label: "Without Transformer", sub: "Switching station only, no TR bay", icon: "ti-plug-connected-x" },
];

export const TR_BRANDS: string[] = ["Hitachi", "Elsewedy", "Egytrafo", "Powerline", "Matelec"];

/** `icon` holds raw inline SVG here, not a font-icon class name. */
export const TR_TYPES: Opt<TrTypeId>[] = [
  { id: "dry", label: "Dry Type", sub: "Cast-resin, air-cooled transformer", icon: TR_ICON_DRY },
  { id: "oil", label: "Oil Type", sub: "Oil-immersed, liquid-cooled transformer", icon: TR_ICON_OIL },
];

export const TR_CONNECTIONS: Opt<TrConnId>[] = [
  { id: "stepup", label: "Step-Up", sub: "Primary 0.4 kV → Secondary MV", icon: "ti-arrow-up" },
  { id: "stepdown", label: "Step-Down", sub: "Primary MV → Secondary 0.4 kV", icon: "ti-arrow-down" },
];

export const MV_VOLTAGES: string[] = ["3.3", "6.6", "11", "22"];
export const TR_RATINGS: number[] = [50, 63, 80, 100, 125, 160, 200, 250, 300, 400, 500, 630, 800, 1000, 1250, 1500, 1600, 2000];

// ── LV panel & breakers ──────────────────────────────────────────────────────

export interface LvPanel {
  id: LvPanelId;
  label: string;
  sub: string;
  /** Usable internal width in mm; null for "any / not specified". */
  emptyMm: number | null;
  series: SeriesId[];
}

export const LV_PANELS: LvPanel[] = [
  { id: "175", label: "LV panel 175 cm", sub: "Empty distance: 136 cm · suits 5ST-A only", emptyMm: 1360, series: ["5ST"] },
  { id: "210", label: "LV panel 210 cm", sub: "Empty distance: 171 cm · suits 5ST / 10ST", emptyMm: 1710, series: ["5ST", "10ST"] },
  { id: "230", label: "LV panel 230 cm", sub: "Empty distance: 191 cm · suits 16ST", emptyMm: 1910, series: ["16ST"] },
  { id: "1400", label: "LV panel 1400 mm", sub: "Fixed size · Incoming Only configuration", emptyMm: 1400, series: ["5ST", "10ST", "16ST"] },
  { id: "any", label: "Any / not specified", sub: "Show all regardless of LV panel", emptyMm: null, series: ["5ST", "10ST", "16ST"] },
];

export interface Breaker {
  id: string;
  label: string;
  widthMm: number;
}

export const STD_BREAKERS: Breaker[] = [
  { id: "xt1", label: "XT1", widthMm: 76 },
  { id: "xt2", label: "XT2", widthMm: 90 },
  { id: "xt3", label: "XT3", widthMm: 105 },
  { id: "xt4", label: "XT4", widthMm: 105 },
  { id: "xt5", label: "XT5", widthMm: 140 },
  { id: "xt6", label: "XT6", widthMm: 209 },
  { id: "xt7", label: "XT7", widthMm: 210 },
];

/** Incoming-only adds the three Emax air circuit breaker frames on top. */
export const INCOMING_ONLY_BREAKERS: Breaker[] = [
  { id: "emax12", label: "Emax 1.2", widthMm: 210 },
  { id: "emax22", label: "Emax 2.2", widthMm: 276 },
  { id: "emax42", label: "Emax 4.2", widthMm: 384 },
  ...STD_BREAKERS,
];

export const INOUT_BREAKERS: Breaker[] = [...STD_BREAKERS];

export const EEHC_ITEMS: Opt<EehcId>[] = [
  { id: "eehc", label: "EEHC Standard", sub: "60 mm gaps between breakers · 20 mm between Switch Fuse units", icon: "ti-certificate" },
  { id: "noeehc", label: "No EEHC Spacing", sub: "Direct zero-clearance component density", icon: "ti-certificate-off" },
];

export const LV_CONFIGS: Opt<LvConfigId>[] = [
  { id: "incoming", label: "Incoming Only", sub: "Emax 1.2 / Emax 2.2 / Emax 4.2 + XT1–XT7", icon: "ti-arrow-bar-to-right" },
  { id: "inout", label: "Incoming & Outgoing", sub: "XT1–XT7 + Switch Fuse", icon: "ti-arrows-left-right" },
];

export const LV_MODES: Opt<LvModeId>[] = [
  { id: "sizing", label: "Sizing", sub: "Physical dimensions only — no ampere/brand data", icon: "ti-ruler-2" },
  { id: "technical", label: "Technical", sub: "Full catalog spec for the technical offer BOM", icon: "ti-file-text" },
];

// ── Switch fuse ──────────────────────────────────────────────────────────────

export const SWITCHFUSE_AMPS: number[] = [160, 250, 400, 630];

/**
 * Width in mm per switch-fuse ampere rating.
 * NOTE 160 A = 500 mm sits well outside the other three (105 mm each). That is
 * what the original tool shipped and it drives real footprint maths, so it is
 * kept verbatim — worth confirming against the mechanical drawings.
 */
export const SWITCHFUSE_WIDTH: Record<number, number> = { "160": 500, "250": 105, "400": 105, "630": 105 };

export const FUSE_LINK_LABEL = "Fuse Link (Set of 3)";
export const SWITCH_FUSE_LABEL = "Switch Fuse";

// ── MCCB catalogue ───────────────────────────────────────────────────────────

export interface MccbRow {
  brand: Brand;
  model: string;
  amp: number;
  sc: string;
  trip: string;
}

export const MCCB_CATALOG: MccbRow[] = [
  { brand: "ABB", model: "XT1N 160", amp: 16, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 20, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 25, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 32, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 40, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 50, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 63, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 80, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 100, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 125, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1N 160", amp: 160, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 16, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 20, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 25, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 32, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 40, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 50, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 63, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 80, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 100, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 125, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT1S 160", amp: 160, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT2N 160", amp: 16, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 20, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 25, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 32, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 40, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 50, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 63, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 80, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 100, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 125, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2N 160", amp: 160, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 16, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 20, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 25, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 32, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 40, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 50, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 63, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 80, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 100, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 125, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT2S 160", amp: 160, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT3N 250", amp: 160, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3N 250", amp: 180, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3N 250", amp: 200, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3N 250", amp: 225, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3N 250", amp: 250, sc: "36 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3S 250", amp: 160, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3S 250", amp: 180, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3S 250", amp: 200, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3S 250", amp: 225, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT3S 250", amp: 250, sc: "50 kA", trip: "TMD" },
  { brand: "ABB", model: "XT4N 250", amp: 160, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4N 250", amp: 180, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4N 250", amp: 200, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4N 250", amp: 225, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4N 250", amp: 250, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4S 250", amp: 160, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4S 250", amp: 180, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4S 250", amp: 200, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4S 250", amp: 225, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT4S 250", amp: 250, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5N 400", amp: 250, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5N 400", amp: 320, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5N 400", amp: 400, sc: "36 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5H 400", amp: 250, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5H 400", amp: 320, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5H 400", amp: 400, sc: "50 kA", trip: "TMA / Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5N 630", amp: 500, sc: "36 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5N 630", amp: 630, sc: "36 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5H 630", amp: 500, sc: "50 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT5H 630", amp: 630, sc: "50 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT6N 800", amp: 630, sc: "36 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT6N 800", amp: 700, sc: "36 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT6N 800", amp: 800, sc: "36 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT6S 800", amp: 630, sc: "50 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT6S 800", amp: 700, sc: "50 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT6S 800", amp: 800, sc: "50 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT7N 1250", amp: 800, sc: "36 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT7N 1250", amp: 1000, sc: "36 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT7N 1250", amp: 1250, sc: "36 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT7S 1250", amp: 800, sc: "50 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT7S 1250", amp: 1000, sc: "50 kA", trip: "Ekip DIP LS/I" },
  { brand: "ABB", model: "XT7S 1250", amp: 1250, sc: "50 kA", trip: "Ekip DIP LS/I" },
  { brand: "Himel", model: "HMW1-160", amp: 16, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 20, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 25, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 32, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 40, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 50, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 63, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 80, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 100, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 125, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW1-160", amp: 160, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW2-250", amp: 160, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW2-250", amp: 180, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW2-250", amp: 200, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW2-250", amp: 225, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW2-250", amp: 250, sc: "36 kA", trip: "TMD" },
  { brand: "Himel", model: "HMW3-400", amp: 250, sc: "36 kA", trip: "TMA" },
  { brand: "Himel", model: "HMW3-400", amp: 320, sc: "36 kA", trip: "TMA" },
  { brand: "Himel", model: "HMW3-400", amp: 400, sc: "36 kA", trip: "TMA" },
  { brand: "Himel", model: "HMW4-630", amp: 400, sc: "36 kA", trip: "TMA" },
  { brand: "Himel", model: "HMW4-630", amp: 500, sc: "36 kA", trip: "TMA" },
  { brand: "Himel", model: "HMW4-630", amp: 630, sc: "36 kA", trip: "TMA" },
  { brand: "Himel", model: "HMW5-800", amp: 630, sc: "50 kA", trip: "Electronic LS/I" },
  { brand: "Himel", model: "HMW5-800", amp: 700, sc: "50 kA", trip: "Electronic LS/I" },
  { brand: "Himel", model: "HMW5-800", amp: 800, sc: "50 kA", trip: "Electronic LS/I" },
  { brand: "Himel", model: "HMW6-1250", amp: 800, sc: "50 kA", trip: "Electronic LSI" },
  { brand: "Himel", model: "HMW6-1250", amp: 1000, sc: "50 kA", trip: "Electronic LSI" },
  { brand: "Himel", model: "HMW6-1250", amp: 1250, sc: "50 kA", trip: "Electronic LSI" },
];

/** Panel width in mm per breaker frame, keyed by the model-name prefix. */
export const MCCB_WIDTH_MAP: Record<string, number> = { XT1: 76, XT2: 90, XT3: 105, XT4: 105, XT5: 140, XT6: 209, XT7: 210, HMW1: 76, HMW2: 105, HMW3: 140, HMW4: 140, HMW5: 209, HMW6: 210 };

// ── EEHC metering ────────────────────────────────────────────────────────────

export interface MeteringRow {
  trRating: number;
  incoming: string;
  amp: number;
  type: "MCCB" | "ACB";
  ct: string;
  brand: string;
  model: string;
  /** Full-load current at 400 V. */
  flc: number;
  trip: string;
}

/**
 * Ascending by trRating; looked up as "first band >= the transformer rating",
 * so 315 and 2500 are band ceilings rather than selectable ratings.
 */
export const METERING_DATABASE: MeteringRow[] = [
  { trRating: 50, incoming: "100 A MCCB", amp: 100, type: "MCCB", ct: "3 × CT 100/5", brand: "ABB", model: "XT1S 160", flc: 72, trip: "TMD" },
  { trRating: 100, incoming: "160 A MCCB", amp: 160, type: "MCCB", ct: "3 × CT 150/5", brand: "ABB", model: "XT1S 160", flc: 144, trip: "TMD" },
  { trRating: 160, incoming: "250 A MCCB", amp: 250, type: "MCCB", ct: "3 × CT 250/5", brand: "ABB", model: "XT4S 250", flc: 231, trip: "TMA / Ekip DIP LS/I" },
  { trRating: 200, incoming: "320 A MCCB", amp: 320, type: "MCCB", ct: "3 × CT 300/5", brand: "ABB", model: "XT5H 400", flc: 289, trip: "TMA / Ekip DIP LS/I" },
  { trRating: 250, incoming: "400 A MCCB", amp: 400, type: "MCCB", ct: "3 × CT 400/5", brand: "ABB", model: "XT5H 400", flc: 361, trip: "TMA / Ekip DIP LS/I" },
  { trRating: 315, incoming: "500 A MCCB", amp: 500, type: "MCCB", ct: "3 × CT 500/5", brand: "ABB", model: "XT5H 630", flc: 455, trip: "Ekip DIP LS/I" },
  { trRating: 400, incoming: "630 A MCCB", amp: 630, type: "MCCB", ct: "3 × CT 600/5", brand: "ABB", model: "XT5H 630", flc: 577, trip: "Ekip DIP LS/I" },
  { trRating: 500, incoming: "800 A MCCB", amp: 800, type: "MCCB", ct: "3 × CT 800/5", brand: "ABB", model: "XT6S 800", flc: 722, trip: "Ekip DIP LS/I" },
  { trRating: 630, incoming: "1000 A MCCB", amp: 1000, type: "MCCB", ct: "3 × CT 1000/5", brand: "ABB", model: "XT7S 1250", flc: 909, trip: "Ekip DIP LS/I" },
  { trRating: 800, incoming: "1250 A MCCB", amp: 1250, type: "MCCB", ct: "3 × CT 1200/5", brand: "ABB", model: "XT7S 1250", flc: 1155, trip: "Ekip DIP LS/I" },
  { trRating: 1000, incoming: "1600 A ACB", amp: 1600, type: "ACB", ct: "3 × CT 1500/5", brand: "ABB", model: "Emax 2 E2.2", flc: 1443, trip: "Ekip Touch LI" },
  { trRating: 1250, incoming: "2000 A ACB", amp: 2000, type: "ACB", ct: "3 × CT 2000/5", brand: "ABB", model: "Emax 2 E2.2", flc: 1804, trip: "Ekip Touch LI" },
  { trRating: 1600, incoming: "2500 A ACB", amp: 2500, type: "ACB", ct: "3 × CT 2500/5", brand: "ABB", model: "Emax 2 E4.2", flc: 2309, trip: "Ekip Touch LI" },
  { trRating: 2000, incoming: "3200 A ACB", amp: 3200, type: "ACB", ct: "3 × CT 4000/5", brand: "ABB", model: "Emax 2 E4.2", flc: 2887, trip: "Ekip Touch LI" },
  { trRating: 2500, incoming: "4000 A ACB", amp: 4000, type: "ACB", ct: "3 × CT 4000/5", brand: "ABB", model: "Emax 2 E6.2", flc: 3608, trip: "Ekip Touch LI" },
];

export const METERING_COMMON = { ammeters: 3, voltmeter: 1, voltSelector: "7 Position", ampSelector: "3 Position", kwhSpace: 1, lamps: "Set of 3", meteringType: "EEHC" };

// ── Power factor correction ──────────────────────────────────────────────────

/** Capacitor step nameplate rating at 525 V. */
export const CAP_STEP_RATED_525 = 25;
/** What one step actually delivers on a 400 V system. */
export const CAP_STEP_EFFECTIVE_400 = 14.7;

export interface PfRow {
  min: number;
  max: number;
  steps: number;
  relay: string;
  capCurrent: number;
  mccbAmp: number;
  abbModel: string;
  himelModel: string;
  trip: string;
  contactors: number;
}

/**
 * Bands are deliberately not contiguous — 801-999, 1251-1499, 1601-1999 and
 * anything above 2000 have no EEHC bracket, and the UI says so.
 */
export const PF_DATABASE: PfRow[] = [
  { min: 0, max: 800, steps: 2, relay: "12-Step", capCurrent: 72, mccbAmp: 80, abbModel: "XT2S 160", himelModel: "HMW1-160", trip: "TMA / Ekip DIP LS/I", contactors: 2 },
  { min: 1000, max: 1250, steps: 4, relay: "12-Step", capCurrent: 144, mccbAmp: 160, abbModel: "XT2S 160", himelModel: "HMW1-160", trip: "TMA / Ekip DIP LS/I", contactors: 4 },
  { min: 1500, max: 1600, steps: 5, relay: "12-Step", capCurrent: 180, mccbAmp: 180, abbModel: "XT4S 250", himelModel: "HMW2-250", trip: "TMA / Ekip DIP LS/I", contactors: 5 },
  { min: 2000, max: 2000, steps: 7, relay: "12-Step", capCurrent: 252, mccbAmp: 250, abbModel: "XT4S 250", himelModel: "HMW2-250", trip: "TMA / Ekip DIP LS/I", contactors: 7 },
];

// ── P-CSS design blueprints ──────────────────────────────────────────────────

/** Which switching configs of a given RMU a design can house (1 = yes). */
export type CfgCompat = Record<string, 0 | 1>;

export interface Design {
  name: string;
  /** Outer shell L×W×H in cm. */
  outer: string;
  /** LV compartment depth in cm. */
  lv: number;
  /** Transformer compartment depth in cm. */
  tr: number;
  /** Inner clearance L×W×H in cm. */
  inner: string;
  kg: number;
  series: SeriesId;
  /** The LV panel chassis this design is built around. */
  lvp: LvPanelId;
  psec50: CfgCompat;
  psec375: CfgCompat;
  murge: CfgCompat;
  lucy: CfgCompat;
  pral12: CfgCompat;
  pral24: CfgCompat;
}

/**
 * NOTE two compatibility maps below carry a "2+0" key where every other row
 * says "2+1" — a typo in the original tool. Both are set to 0, and a missing
 * key reads as incompatible exactly like an explicit 0, so behaviour is
 * identical either way. Left verbatim so this table still diffs cleanly
 * against the source.
 */
export const DESIGNS: Design[] = [
  { name: "P-CSS 5ST-A", outer: "215×95×208", lv: 50, tr: 156, inner: "195×85×199", kg: 1520, series: "5ST", lvp: "175", psec50: { "2+1": 1, "3+1": 1, "2+1+M": 1, "3+1+M": 1 }, psec375: { "2+1+M": 0, "3+1+M": 0 }, murge: { "2+1": 1, "2+1+M": 1, "3+1": 1, "3+1+M": 1 }, lucy: { "2+1": 1, "2+1+M": 1, "3+1": 1, "3+1+M": 1 }, pral12: { "2+1": 1, "3+1": 1, "2+1+M": 1 }, pral24: { "2+0": 0, "2+1+M": 0, "3+1": 0 } },
  { name: "P-CSS 5ST-C", outer: "240×130×208", lv: 50, tr: 156, inner: "220×120×199", kg: 1647, series: "5ST", lvp: "210", psec50: { "2+1": 1, "3+1": 1, "2+1+M": 1, "3+1+M": 1 }, psec375: { "2+1+M": 1, "3+1+M": 1 }, murge: { "2+1": 1, "2+1+M": 1, "3+1": 1, "3+1+M": 1 }, lucy: { "2+1": 1, "2+1+M": 1, "3+1": 1, "3+1+M": 1 }, pral12: { "2+0": 0, "3+1": 0, "2+1+M": 0 }, pral24: { "2+1": 0, "2+1+M": 0, "3+1": 0 } },
  { name: "P-CSS 10ST-I", outer: "240×95×218", lv: 50, tr: 156, inner: "220×85×209", kg: 1647, series: "10ST", lvp: "210", psec50: { "2+1": 0, "3+1": 0, "2+1+M": 0, "3+1+M": 0 }, psec375: { "2+1+M": 0, "3+1+M": 0 }, murge: { "2+1": 0, "2+1+M": 0, "3+1": 0, "3+1+M": 0 }, lucy: { "2+1": 0, "2+1+M": 0, "3+1": 0, "3+1+M": 0 }, pral12: { "2+1": 1, "3+1": 1, "2+1+M": 1 }, pral24: { "2+1": 0, "2+1+M": 0, "3+1": 0 } },
  { name: "P-CSS 10ST-K", outer: "240×140×226", lv: 50, tr: 180, inner: "220×130×216", kg: 1837, series: "10ST", lvp: "210", psec50: { "2+1": 1, "3+1": 1, "2+1+M": 1, "3+1+M": 1 }, psec375: { "2+1+M": 1, "3+1+M": 1 }, murge: { "2+1": 1, "2+1+M": 1, "3+1": 1, "3+1+M": 1 }, lucy: { "2+1": 1, "2+1+M": 1, "3+1": 1, "3+1+M": 1 }, pral12: { "2+1": 0, "3+1": 0, "2+1+M": 0 }, pral24: { "2+1": 0, "2+1+M": 0, "3+1": 0 } },
  { name: "P-CSS 16ST-U", outer: "260×95×226", lv: 50, tr: 205, inner: "240×85×216", kg: 1948, series: "16ST", lvp: "230", psec50: { "2+1": 0, "3+1": 0, "2+1+M": 0, "3+1+M": 0 }, psec375: { "2+1+M": 0, "3+1+M": 0 }, murge: { "2+1": 1, "3+1": 1, "2+1+M": 1, "3+1+M": 1 }, lucy: { "2+1": 1, "3+1": 1, "2+1+M": 1, "3+1+M": 1 }, pral12: { "2+1": 1, "3+1": 1, "2+1+M": 1 }, pral24: { "2+1": 0, "2+1+M": 0, "3+1": 0 } },
  { name: "P-CSS 16ST-V", outer: "260×130×238", lv: 50, tr: 205, inner: "240×120×228", kg: 2040, series: "16ST", lvp: "230", psec50: { "2+1": 1, "3+1": 1, "2+1+M": 1, "3+1+M": 1 }, psec375: { "2+1+M": 1, "3+1+M": 1 }, murge: { "2+1": 1, "2+1+M": 1, "3+1": 1, "3+1+M": 1 }, lucy: { "2+1": 1, "2+1+M": 1, "3+1": 1, "3+1+M": 1 }, pral12: { "2+1": 0, "3+1": 0, "2+1+M": 0 }, pral24: { "2+1": 1, "2+1+M": 1, "3+1": 1 } },
];

// ── Band ranking ─────────────────────────────────────────────────────────────

/** Minimum P-CSS series a transformer band needs. */
export const TR_BAND_RANK: Record<TrBand, number> = { "500": 1, "1000": 2, "1500": 3 };
export const BAND_LV_PANEL: Record<number, LvPanelId> = { 1: "175", 2: "210", 3: "230" };
export const SERIES_RANK: Record<SeriesId, number> = { "5ST": 1, "10ST": 2, "16ST": 3 };

// ── Lookup helpers ───────────────────────────────────────────────────────────

export const rmuById = (id: string | null) => RMUS.find((r) => r.id === id) ?? null;
export const lvPanelById = (id: string | null) => LV_PANELS.find((p) => p.id === id) ?? null;
