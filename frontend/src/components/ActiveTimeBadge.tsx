import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Live "active working time" for a quotation — the real hands-on time, summed across engaged
// sessions, NOT the wall-clock from creating it to submitting it. A second is counted only while
// the tab is visible and the user has interacted within the idle window; the accrued seconds are
// flushed to the server in small deltas (and on tab-hide / unmount), where they add to the stored
// total. Self-contained so its once-a-second re-render never touches the (huge) configurator page.

const IDLE_MS = 90_000; // no mouse/keyboard for 90s → idle, stop counting
const TICK_MS = 1_000;
const FLUSH_EVERY = 20; // push accrued seconds to the server every 20s (also on hide/unmount)

/** "1h 05m" / "42m 09s" / "18s". `withSeconds=false` gives a compact "1h 5m" / "42m" / "<1m". */
export function fmtActive(totalSeconds: number, withSeconds = false): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return withSeconds ? `${m}m ${String(sec).padStart(2, "0")}s` : `${m}m`;
  return withSeconds ? `${sec}s` : s > 0 ? "<1m" : "0m";
}

export default function ActiveTimeBadge({
  qtnId,
  initialSeconds,
  enabled,
}: {
  qtnId: string | undefined;
  initialSeconds: number;
  enabled: boolean; // accrue only while the user can actively build (owner/co-owner, not frozen)
}) {
  const [accrued, setAccrued] = useState(0); // seconds accrued THIS session — drives the live display
  const lastActivity = useRef(Date.now());
  const pending = useRef(0); // accrued-but-not-yet-flushed seconds
  const accruedRef = useRef(0);

  // Any interaction anywhere on the page counts as "still working".
  useEffect(() => {
    const mark = () => { lastActivity.current = Date.now(); };
    const evs = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"];
    for (const e of evs) window.addEventListener(e, mark, { passive: true });
    return () => { for (const e of evs) window.removeEventListener(e, mark); };
  }, []);

  useEffect(() => {
    if (!qtnId || !enabled) return;
    const flush = (keepalive = false) => {
      const n = pending.current;
      if (n <= 0) return;
      pending.current = 0;
      api.qtns.activity(qtnId, n, keepalive).catch(() => { pending.current += n; }); // retry next flush
    };
    const tick = window.setInterval(() => {
      const active = document.visibilityState === "visible" && Date.now() - lastActivity.current < IDLE_MS;
      if (!active) return;
      accruedRef.current += 1;
      pending.current += 1;
      setAccrued(accruedRef.current);
      if (pending.current >= FLUSH_EVERY) flush();
    }, TICK_MS);
    const onHide = () => { if (document.visibilityState === "hidden") flush(true); };
    const onUnload = () => flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      flush(true); // flush the remainder when leaving the quotation
    };
  }, [qtnId, enabled]);

  const total = (initialSeconds || 0) + accrued;
  return (
    <span
      title="Active working time on this quotation — the sum of engaged sessions, not the time from creating it to submitting it."
      className="inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-sm font-bold text-muted">
      ⏱ {fmtActive(total, true)}
    </span>
  );
}
