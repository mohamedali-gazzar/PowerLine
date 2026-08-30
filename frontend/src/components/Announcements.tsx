import { useEffect, useState } from "react";
import type { Announcement } from "../api";
import { activeForUsers, remaining, fmt } from "./announcementUtils";

// Styled with the app's theme classes, not a fixed palette.
//
// This card used to carry its own hex colours in inline styles (white card, dark ink,
// pale tints). Inline styles cannot respond to the theme, so in dark mode it stayed a
// white block on a dark dashboard with the heading nearly invisible. Everything now
// resolves through the same tokens as every other card — .card, text-ink, text-muted,
// border-line — so it flips with the theme on its own.

/** Per-type tag and icon colours. Both themes stated, because the tints are not tokens. */
const TYPE: Record<string, { tag: string; iconBg: string; icon: string }> = {
  News: {
    tag: "bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    iconBg: "bg-blue-50 dark:bg-blue-400/15",
    icon: "📢",
  },
  Maintenance: {
    tag: "bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    iconBg: "bg-amber-50 dark:bg-amber-400/15",
    icon: "🛠️",
  },
  Alert: {
    tag: "bg-red-50 text-red-700 dark:bg-red-400/15 dark:text-red-300",
    iconBg: "bg-red-50 dark:bg-red-400/15",
    icon: "⚠️",
  },
};

/** The coloured spine down the left of a row. */
const PRIO_BORDER: Record<string, string> = {
  High: "border-l-red-500 dark:border-l-red-400",
  Medium: "border-l-amber-500 dark:border-l-amber-400",
  Low: "border-l-muted/40",
};

export default function Announcements({ items = [] }: { items?: Announcement[] }) {
  const [, tick] = useState(0);
  // Re-render every 30s so "time left" and the active window stay current.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const active = activeForUsers(items);
  if (active.length === 0) return null; // no empty card at the top of the dashboard

  return (
    <div className="card mb-5 p-5">
      <div className="mb-3 flex items-center justify-between">
        {/* Same heading as the "Waiting for your approval" card. */}
        <h2 className="sec-head mb-0">Announcements</h2>
        <span className="chip bg-brand-tint text-brand-dark">{active.length} new</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {active.map((a) => {
          const t = TYPE[a.type] || TYPE.News;
          const r = remaining(a);
          return (
            <div
              key={a.id}
              className={`flex items-start gap-3 rounded-lg border border-line border-l-[3px] bg-surface p-3 ${
                PRIO_BORDER[a.priority] || PRIO_BORDER.Low
              }`}
            >
              <div
                className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg text-[17px] ${t.iconBg}`}
              >
                {t.icon}
              </div>
              <div className="flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${t.tag}`}>
                    {a.type}
                  </span>
                  <span className="text-[13.5px] font-semibold text-ink">{a.title}</span>
                </div>
                {a.body && <p className="text-[12.5px] leading-relaxed text-muted">{a.body}</p>}
                <p className="mt-1.5 text-[11px] text-muted/70">Posted {fmt(a.start)}</p>
              </div>
              <div
                className={`self-center whitespace-nowrap text-[11px] font-semibold ${
                  r.tone === "soon" ? "text-amber-600 dark:text-amber-400" : "text-muted"
                }`}
              >
                {r.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
