// A tiny in-app signal: the configurator calls notePanelCount(count) whenever the number of panels in
// the open quotation goes UP — by "+ Add panel", by duplicating, however. The milestone checker
// (useMilestoneCheck) subscribes and, when that count reaches a milestone (10, 25, …) the user hasn't
// seen, shows the popup. A module-level bus keeps the configurator and the app-level modal decoupled —
// no context wiring through the whole tree.

type Listener = (count: number) => void;

const listeners = new Set<Listener>();

/** Called when the open quotation's panel count increases — `count` is the new total. */
export function notePanelCount(count: number): void {
  for (const l of listeners) l(count);
}

/** Subscribe to the panel-count signal. Returns an unsubscribe function. */
export function onPanelCount(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
