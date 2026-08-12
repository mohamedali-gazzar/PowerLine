import { useEffect, useRef, useState } from "react";

/**
 * Re-run `refresh` on a timer so data added by someone else shows up without a
 * manual page reload. Vercel runs the API as serverless functions, so there is no
 * socket to push on — polling is the mechanism.
 *
 * Two things keep it cheap: it never polls while the tab is hidden (a backgrounded
 * tab costs nothing), and it refreshes immediately when you come back to the tab,
 * which is when staleness is actually noticed.
 *
 * `refresh` is held in a ref and never enters the deps: callers pass an inline
 * arrow that changes identity every render, and re-subscribing on each render would
 * reset the timer so it never fires.
 */
export function useAutoRefresh(refresh: () => void | Promise<void>, intervalMs = 30_000) {
  const fn = useRef(refresh);
  fn.current = refresh;

  useEffect(() => {
    let live = true;
    const run = () => {
      if (!live || document.hidden) return;
      // A poller must never surface a rejection — a transient failure would take the
      // page down with it. On failure the last good data simply stays.
      void Promise.resolve(fn.current()).catch(() => {});
    };
    const timer = setInterval(run, intervalMs);
    const onBack = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [intervalMs]);
}

/**
 * Tracks which items changed between refreshes, so newly-arrived rows can be
 * highlighted briefly. Pass a stable key per item (id) and a stamp that moves when
 * it changes (updatedAt). The first pass marks nothing — everything is "new" on
 * first load, and flashing the whole list would be noise.
 *
 * Marks expire on their own after `holdMs`, so the highlight fades and never needs
 * dismissing.
 */
export function useChangedKeys<T>(
  items: T[] | null | undefined,
  keyOf: (item: T) => string,
  stampOf: (item: T) => string,
  holdMs = 6_000,
): Set<string> {
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const seen = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!items) return;
    const next = new Map(items.map((it) => [keyOf(it), stampOf(it)]));
    const prev = seen.current;
    seen.current = next;
    if (!prev) return; // first load — nothing to flag

    const fresh: string[] = [];
    next.forEach((stamp, key) => {
      if (!prev.has(key) || prev.get(key) !== stamp) fresh.push(key);
    });
    if (!fresh.length) return;

    setChanged((old) => new Set([...old, ...fresh]));
    const t = setTimeout(() => {
      setChanged((old) => {
        const kept = new Set(old);
        fresh.forEach((k) => kept.delete(k));
        return kept;
      });
    }, holdMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, holdMs]);

  return changed;
}
