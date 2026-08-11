import { useState, useRef, useEffect } from "react";

/**
 * RedPriceAlert — urgent "your open QTN is stale" strip with a speaker icon.
 * ----------------------------------------------------------------------------
 * Behaviour:
 *  - Render it only when there is something to warn about (caller gates on the
 *    stale-QTN condition), so the strip's own visibility never lies.
 *  - The × hides it for the session; it returns on reload while still stale,
 *    because the condition — not a timer — controls it.
 *  - Text scrolls as a marquee only when it overflows the bar; hover pauses.
 *
 * Theme-aware (red palette works in light and dark) and styled with the app's
 * Tailwind tokens rather than the inline hex/Calibri it was prototyped with.
 * ----------------------------------------------------------------------------
 */
export default function RedPriceAlert({
  message,
  onAction,
  actionLabel = "Review QTNs",
}: {
  message: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  const [scroll, setScroll] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const marqRef = useRef<HTMLSpanElement | null>(null);

  // Enable scrolling only when the message is wider than the bar.
  useEffect(() => {
    if (marqRef.current && trackRef.current) {
      setScroll(marqRef.current.scrollWidth > trackRef.current.clientWidth);
    }
  }, [message]);

  if (!open) return null;

  // Duplicate the text when scrolling so the loop is seamless.
  const text = scroll
    ? `${message}    •    ${message}`
    : message;

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-red-300/70 bg-red-50 px-3.5 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
      <span className="shrink-0 text-lg text-red-600 dark:text-red-400" aria-hidden>🔊</span>

      <div ref={trackRef} className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
        <span
          ref={marqRef}
          className={`inline-block text-[13px] font-semibold text-red-700 dark:text-red-300 ${scroll ? "pl-marq" : ""}`}
        >
          {text}
        </span>
      </div>

      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
        >
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="shrink-0 text-lg leading-none text-red-500/80 transition hover:text-red-700 dark:hover:text-red-300"
      >
        ×
      </button>

      <style>{`
        @keyframes pl-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .pl-marq { animation: pl-scroll 20s linear infinite; }
        .pl-marq:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
}
