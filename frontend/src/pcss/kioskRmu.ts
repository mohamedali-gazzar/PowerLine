// P-CSS limitations for a kiosk's ring main unit.
//
// A kiosk IS a P-CSS (compact secondary substation), so the RMU inside it is bound by the P-CSS
// Selector's rules for which ring-main-unit configurations actually exist. The kiosk's RMU is
// stored parametrically (product · voltage · ring/transformer feeders · metering); this bridges
// it to the P-CSS (rmu, cfg) so the catalogue's per-RMU `configs` list decides what is buildable.
// Example: a PRAL (Air) unit has no 3+1+M kiosk configuration.

import type { RmuConfigInput } from "../types";
import { RMUS, type RmuId } from "./data";

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

/** The P-CSS limitation message for this RMU config, or null when the combination is buildable. */
export function rmuKioskLimitation(c: RmuConfigInput): string | null {
  const { rmu, cfg } = mapRmuToPcss(c);
  if (!rmu) return null;
  const meta = RMUS.find((r) => r.id === rmu);
  if (!meta || meta.configs.includes(cfg)) return null;
  return `A ${rmuProductLabel(c)} ring main unit has no ${cfg} configuration inside a kiosk. Available: ${meta.configs.join(", ")}.`;
}
