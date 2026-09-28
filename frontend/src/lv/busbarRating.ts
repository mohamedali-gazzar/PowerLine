// Busbar Rating — what the panel's bar has to carry, worked out from whatever feeds it.
// Lifted out of LvConfiguratorPage so it can be tested on its own: it is a pure function of the
// panel, with no React, no database and no browser.
import { isSpacer, type LvPanel, type PanelComponent } from "./store";

// Standard incoming C.B ratings (A) — the panel rating snaps to one of these.
export const INCOMER_RATINGS = [80, 100, 125, 160, 250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300];

// Busbar ratings a SWITCH DISCONNECTOR snaps to. Coarser than the breaker ladder above: below
// 160 A there is no smaller bar worth building, 200 and 250 share the 250 bar, and 315 and 400
// share the 400. (Owner, 28 Sep 2026.)
export const SD_BUSBAR_RATINGS = [160, 250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200];

// Predict the Busbar Rating from the incoming C.B: take the largest breaker
// (ACB / MCCB / MCB) in the "Main Incoming" section, read its ampere frame, and snap
// UP to the nearest standard rating. Returns 0 (field stays empty) until an incoming
// C.B is added.
export function predictIncomerRating(p: LvPanel): number {
  // A breaker's catalogue type is "ACB", "MCCB", or — for a miniature C.B — "MDRC"
  // (also "MDRC-Himel" / "MDRCs"), NEVER the literal "MCB". Matching only "MCB" here
  // silently missed every MCB incomer, so its busbar rating never filled.
  const isBreaker = (c: PanelComponent) =>
    /\b(ACB|MCCB|MCB)\b/i.test(c.type || "") || /^MDRC/i.test((c.type || "").trim());
  // Busbar rating follows the C.B's ampere FRAME ("… 160 AF …"), e.g.
  //   MCCB XT2N 63A-36kA 160 AF …  → 160   (frame, not the 63 A rated current)
  //   MCCB XT4N 200A-36kA 250 AF … → 250
  //   ACB  E2.2B 1600A-42kA 1600 AF → 1600
  // Fall back to the rated current only if a breaker has no frame in its name.
  const frameAmps = (c: PanelComponent) => {
    const hay = `${c.rating || ""} ${c.name || ""}`;
    const af = hay.match(/(\d+)\s*AF\b/i); // ABB "… 160 AF …" ampere frame
    if (af) return parseInt(af[1], 10);
    const t = hay.match(/\bT\d[A-Z]?\s+(\d{2,4})\b/i); // Tmax "T5H 400 …" — frame after the type
    if (t) return parseInt(t[1], 10);
    const inA = hay.match(/In\s*=?\s*(\d+)/i) || hay.match(/(\d+)\s*A\b/i); // last resort: rated current
    return inA ? parseInt(inA[1], 10) : 0;
  };
  // Predict from the incoming devices — breakers in the "Main Incoming" section, and any switch
  // disconnector there — so the field stays empty by default and only fills once an incomer exists.
  const incomingSection = (c: PanelComponent) => !isSpacer(c) && /incom/i.test(c.section || "");
  const incoming = p.components.filter((c) => incomingSection(c) && isBreaker(c));

  // A switch disconnector sets the bar too: it carries the full incoming current even though it
  // does not break fault current, so a panel fed through one still needs a bar to match. Its own
  // ladder is coarser than a breaker's — below 160 A there is no smaller bar worth building, and
  // 200/250 share the 250 bar, 315/400 the 400.
  const sdAmps = p.components
    .filter((c) => incomingSection(c) && /^LBS$/i.test((c.type || "").trim()) && /switch\s*disconnector/i.test(c.name || ""))
    .reduce((mx, c) => {
      const m = `${c.rating || ""} ${c.name || ""}`.match(/(\d+)\s*A\b/i);
      return Math.max(mx, m ? parseInt(m[1], 10) : 0);
    }, 0);
  const sdRating = sdAmps
    ? (SD_BUSBAR_RATINGS.find((r) => r >= sdAmps) ?? SD_BUSBAR_RATINGS[SD_BUSBAR_RATINGS.length - 1])
    : 0;

  // Nothing to go on at all.
  if (!incoming.length && !sdRating) return 0;

  // An MCB (MDRC) incomer defaults the Busbar Rating to 100 A: MCBs are small breakers
  // and a 100 A bar is the standard minimum, so use it regardless of the MCB's rated
  // current. In the catalogue an MCB's type is "MDRC" (also "MDRC-Himel" / "MDRCs"),
  // not "MCB". Applies only when EVERY incoming breaker is an MDRC — if an MCCB/ACB is
  // also present, the frame rule below wins so the bar isn't undersized.
  const isMcb = (c: PanelComponent) => /^MDRC/i.test((c.type || "").trim()) || /\bMCB\b/i.test(c.type || "");
  const a = incoming.reduce((mx, c) => Math.max(mx, frameAmps(c)), 0);
  const cbRating = !incoming.length ? 0
    : incoming.every(isMcb) ? 100
    : a ? (INCOMER_RATINGS.find((r) => r >= a) ?? INCOMER_RATINGS[INCOMER_RATINGS.length - 1])
    : 0;

  // Both feed the same bar, so the bigger one wins — never undersize it.
  return Math.max(cbRating, sdRating);
}
