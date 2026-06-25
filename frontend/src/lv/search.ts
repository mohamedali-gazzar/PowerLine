// Flexible, live filter+rank for the searchable component dropdown (SearchSelect).
//
// Rules:
//  • case-insensitive, re-evaluated on every keystroke;
//  • the query is split into words; an option matches only if it contains ALL of
//    those words, in any order, ignoring spacing — so "XT2N 160", "160 XT2N" and
//    "XT2N160" all match a label like "Tmax XT2N 160";
//  • ranking: options whose text BEGINS WITH the typed text come first, then ones
//    that merely CONTAIN it; within a group, earlier match position first, then
//    shorter label;
//  • an empty query returns the full list in its original order;
//  • matching is against each option's full text (label + hint), not one field.

export interface SearchOption {
  label: string;
  hint?: string;
}

export function rankSearchOptions<T extends SearchOption>(options: T[], query: string, limit = 80): T[] {
  const raw = query.trim().toLowerCase();
  if (!raw) return options.slice(0, limit); // empty box → full list, original order

  const terms = raw.split(/\s+/).filter(Boolean);
  const queryNorm = raw.replace(/\s+/g, ""); // the typed text with spacing removed
  const NO_MATCH = 1e9;

  const scored: { o: T; starts: boolean; pos: number; len: number }[] = [];
  for (const o of options) {
    const hay = (o.label + " " + (o.hint ?? "")).toLowerCase().replace(/\s+/g, "");
    if (!terms.every((t) => hay.includes(t))) continue; // all words present, any order
    const pos = hay.indexOf(queryNorm);
    scored.push({
      o,
      starts: hay.startsWith(queryNorm),
      pos: pos < 0 ? NO_MATCH : pos,
      len: o.label.length,
    });
  }
  scored.sort((a, b) =>
    (a.starts === b.starts ? 0 : a.starts ? -1 : 1) || (a.pos - b.pos) || (a.len - b.len)
  );
  return scored.slice(0, limit).map((x) => x.o);
}
