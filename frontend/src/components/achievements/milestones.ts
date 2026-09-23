// One entry per milestone. The number, title, message and next target all come from here, so
// adding 100/200/300/400 later is just filling in the text (plus a scene in ./scenes for the
// animation). Milestones 10 and 25 are live; entries whose title is still "TBD" are skipped by the
// checker. `next: null` hides the progress bar.
//
// Title convention: the part after the last ": " prints in the PowerLine orange (e.g. "…Mode: ON").
export interface Milestone {
  count: number;
  next: number | null;
  title: string;
  quote: string;
}

export const MILESTONES: Milestone[] = [
  {
    count: 10,
    next: 25,
    title: "Baby Engineer Mode: ON",
    quote: "“10 panels down! Look who’s playing with power! Your journey has officially started. Keep growing, little engineer!”",
  },
  {
    count: 25,
    next: 50,
    title: "Breaker Juggler Mode: ON",
    quote: "“25 panels done! Look at you juggling breakers like a pro. Keep the panels coming!”",
  },
  { count: 50, next: 100, title: "TBD", quote: "TBD" },
  { count: 100, next: 200, title: "TBD", quote: "TBD" },
  { count: 200, next: 300, title: "TBD", quote: "TBD" },
  { count: 300, next: 400, title: "TBD", quote: "TBD" },
  { count: 400, next: null, title: "TBD", quote: "TBD" },
];

/** The live (non-TBD) milestones, ascending by count. */
export const LIVE_MILESTONES: Milestone[] = MILESTONES.filter((m) => m.title !== "TBD");

/** The live milestone with this exact panel count, if any. */
export function milestoneByCount(count: number): Milestone | undefined {
  return LIVE_MILESTONES.find((m) => m.count === count);
}
