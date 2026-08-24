// Panel "No. of poles" sizing helper — from the Control Design Guide (Width).
// Each pole = one 18 mm DIN-rail module. Contactors / aux / control widths come from the
// guide; MCB/RCBO/RCCB use their own pole count. Feeds the Panel-type "poles summary" so
// the width needed for the panel can be read off directly.
import { type PanelComponent } from "./store";

export const POLE_CM = 1.8; // one pole = 1.8 cm of DIN-rail width

export type PoleKind = "mcb" | "rcbo" | "rccb" | "af" | "esb" | "aux" | "terminal" | "timer" | "psu" | "relay" | "surge";
export type PoleGroup = "protection" | "contactors" | "control";

export const POLE_GROUP: Record<PoleKind, PoleGroup> = {
  mcb: "protection", rcbo: "protection", rccb: "protection",
  af: "contactors", esb: "contactors", aux: "contactors", terminal: "contactors",
  timer: "control", psu: "control", relay: "control", surge: "control",
};
export const GROUP_LABEL: Record<PoleGroup, string> = { protection: "Protection", contactors: "Contactors", control: "Control" };
export const POLE_KINDS: PoleKind[] = ["mcb", "rcbo", "rccb", "af", "esb", "aux", "terminal", "timer", "psu", "relay", "surge"];
export const KIND_LABEL: Record<PoleKind, string> = {
  mcb: "MCB", rcbo: "RCBO", rccb: "RCCB",
  af: "AF contactors", esb: "ESB contactors", aux: "Contactor aux", terminal: "Terminal blocks",
  timer: "Timer", psu: "Power supply", relay: "Relay", surge: "Surge arrestor",
};

// AF-contactor width (poles) by frame size — from the guide, extended sensibly to the
// frames the guide doesn't list (AF160/250/630/800/1000…).
function afWidth(n: number): number {
  if (n <= 38) return 3;   // AF09~AF38
  if (n <= 96) return 4;   // AF40~AF96
  if (n <= 160) return 5;  // AF116/140/146 (+AF160)
  if (n <= 250) return 9;  // AF190/205 (+AF250)
  if (n <= 370) return 8;  // AF265~AF370
  if (n <= 500) return 11; // AF400/460
  return 12;               // AF580/750 and larger
}
// ESB installation contactor: "ESB40-40N" → 4 poles (the "-40" bank), "ESB16-20N" → 2.
function esbPoles(name: string): number {
  const m = name.match(/ESB\d+-(\d)0/i);
  return m ? +m[1] : 2;
}
// RCBO/RCCB module count from the name (their poles field is 0).
function mdrcsPoles(name: string): number {
  const p = name.match(/\b([1-4])\s*P\b/i); if (p) return +p[1];   // explicit "3P" (RCBO 3P DS203)
  const fh = name.match(/\bF[H]?20(\d)/i); if (fh) return +fh[1];  // RCCB F202 / FH204
  const ds = name.match(/\bDSE?20(\d)/i); if (ds) return +ds[1];   // RCBO DS201 / DSE201 / DS203
  if (/\bDME\d/i.test(name)) return 1;                             // DME100 (1-module RCBO)
  return 1;
}
// MCB rail width = its pole count: a breaker takes one DIN module per pole, so a 1P MCB is
// 1 pole of space and a 3P MCB is 3. The pole count is read from the breaker's own rating —
// the "1P/2P/3P/4P" in its name, or the ABB family code (S201→1P, S203→3P, SN201, S803…) —
// so the space is right even if a saved/hand-typed row's stored poles number is stale. Falls
// back to that stored number, then 1. Sizing only — copper pricing uses the stored field.
function mcbPoles(name: string, polesField: number): number {
  const np = name.match(/\b([1-4])\s*P\b/i); if (np) return +np[1];   // "3P" / "3 P"
  const fam = name.match(/\bS[HN]?[1-9]0([1-4])\b/i); if (fam) return +fam[1]; // S203 / SN201 / S803
  return polesField || 1;
}

/** Classify a component into a pole-summary kind + its rail width (poles), or null if it
 *  is not a DIN-rail item the summary tracks (MCCB/ACB/MMS/pilot/overload/etc.). */
export function componentPoles(c: { name: string; type: string; poles: number }): { kind: PoleKind; poles: number } | null {
  const n = c.name || "";
  if (/^CAL\d|auxiliary contact block/i.test(n)) return { kind: "aux", poles: 1 };            // side-aux (names quote "AF09..96") — match before AF
  if (/contactor/i.test(n) && /\bAF(\d+)/.test(n)) return { kind: "af", poles: afWidth(+n.match(/\bAF(\d+)/)![1]) };
  if (/\bESB\d/i.test(n)) return { kind: "esb", poles: esbPoles(n) };
  if (c.type === "MDRC" || /miniature circuit breaker/i.test(n)) return { kind: "mcb", poles: mcbPoles(n, c.poles) };
  if (/RCCB/i.test(n)) return { kind: "rccb", poles: mdrcsPoles(n) };
  if (/RCBO/i.test(n)) return { kind: "rcbo", poles: mdrcsPoles(n) };
  if (/terminal/i.test(n)) return { kind: "terminal", poles: 1 };
  if (/\btimer\b|time relay|\bCT-[A-Z]/i.test(n)) return { kind: "timer", poles: 3 };          // before "relay" (Time relay)
  if (/power supply|\bCP-[EC]\b|\bCP-[EC]\./i.test(n)) return { kind: "psu", poles: 3 };
  if (/surge|\bOVR\b|\bSPD\b/i.test(n)) return { kind: "surge", poles: 7 };
  if (/\bCR-[MP]\d|\bCM-|interface relay|monitoring relay/i.test(n)) return { kind: "relay", poles: 1 }; // NOT generic "relay" (skips overload)
  return null;
}

/** Aggregate a panel's components into per-kind and per-group pole counts (× qty). */
export function panelPoles(components: PanelComponent[]) {
  const rows = {} as Record<PoleKind, { count: number; poles: number }>;
  const groups: Record<PoleGroup, number> = { protection: 0, contactors: 0, control: 0 };
  let total = 0;
  for (const c of components) {
    if (c.spacer) continue;
    const r = componentPoles(c);
    if (!r) continue;
    const qty = c.qty || 0;
    const poles = r.poles * qty;
    if (!rows[r.kind]) rows[r.kind] = { count: 0, poles: 0 };
    rows[r.kind].count += qty;
    rows[r.kind].poles += poles;
    groups[POLE_GROUP[r.kind]] += poles;
    total += poles;
  }
  return { rows, groups, total };
}
