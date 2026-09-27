// P-CSS limitations for a kiosk's ring main unit.
//
// A kiosk IS a P-CSS (compact secondary substation), so the RMU inside it is bound by the P-CSS
// Selector's rules for which ring-main-unit configurations actually exist. The kiosk's RMU is
// stored parametrically (product · voltage · ring/transformer feeders · metering); this bridges
// it to the P-CSS (rmu, cfg) so the catalogue's per-RMU `configs` list decides what is buildable.
// Example: a PRAL (Air) unit has no 3+1+M kiosk configuration.

import type { RmuConfigInput } from "../types";
import { DESIGNS, RMUS, type RmuId } from "./data";
import { checkDesignCompatibility, type Selection } from "./engine";

/** How the MV RMU editor labels the product (PRAL · Air / PSEC · SF6 / LUCY · GIS). */
export function rmuProductLabel(c: RmuConfigInput): string {
  return c.productType === "PRAL" ? "PRAL (Air)"
    : c.productType === "PSEC" ? "PSEC (SF6)"
    : c.productType === "LUCY" ? "LUCY (GIS)"
    : String(c.productType);
}

/** Map the kiosk's parametric RMU config to a P-CSS ring-main-unit id and its config string
 *  ("2+1", "3+1+M", …). PSEC maps to the ABB 50 cm unit unless the LBS brand is Murge. */
export function mapRmuToPcss(c: RmuConfigInput): { rmu: RmuId | null; cfg: string } {
  let rmu: RmuId | null = null;
  if (c.productType === "PRAL") rmu = c.voltageKv === 24 ? "pral24" : "pral12";
  else if (c.productType === "LUCY") rmu = "lucy";
  else if (c.productType === "PSEC") rmu = c.lbsBrand === "MURGE" ? "murge" : "psec50";
  const cfg = `${c.nalCount ?? 0}+${c.nalfCount ?? 0}${c.hasMetering ? "+M" : ""}`;
  return { rmu, cfg };
}

/**
 * Which P-CSS enclosures this kiosk may actually be built in — the Selector's own rules, nothing
 * re-stated here: `checkDesignCompatibility` decides, given the kiosk's ring-main unit (mapped to a
 * P-CSS unit + configuration above) and its transformer rating.
 *
 * Two rules do the work. The transformer sets a MINIMUM frame — 5ST up to 500 kVA, 10ST up to
 * 1000, 16ST beyond — and each enclosure carries a per-unit, per-configuration table saying whether
 * that combination exists at all. So a PRAL (Air) 24 kV kiosk only ever comes as P-CSS 16ST-V, and a
 * PSEC 2+1+M likewise, while a 1600 kVA transformer rules every 5ST and 10ST frame out.
 *
 * Returns [] when the RMU does not map to a P-CSS unit, which is the caller's cue to leave the list
 * alone rather than show an empty one.
 */
export function kioskSizeOptions(c: RmuConfigInput, trRatingKva?: number | null): string[] {
  const { rmu, cfg } = mapRmuToPcss(c);
  if (!rmu) return [];
  // checkDesignCompatibility reads only these three fields; the rest of a Selector Selection is the
  // wizard's own project/LV state and has no bearing on which enclosure fits.
  const sel = { rmu, cfg, trRating: trRatingKva ?? null } as unknown as Selection;
  return DESIGNS.filter((d) => checkDesignCompatibility(sel, d)).map((d) => d.name);
}

/** The P-CSS limitation message for this RMU config, or null when the combination is buildable. */
export function rmuKioskLimitation(c: RmuConfigInput): string | null {
  const { rmu, cfg } = mapRmuToPcss(c);
  if (!rmu) return null;
  const meta = RMUS.find((r) => r.id === rmu);
  if (!meta || meta.configs.includes(cfg)) return null;
  return `A ${rmuProductLabel(c)} ring main unit has no ${cfg} configuration inside a kiosk. Available: ${meta.configs.join(", ")}.`;
}
