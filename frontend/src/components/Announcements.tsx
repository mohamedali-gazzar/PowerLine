import { useEffect, useState } from "react";
import type { Announcement } from "../api";
import { activeForUsers, remaining, fmt } from "./announcementUtils";

// Palette matches the app's brand orange (#F16722). Font is inherited from the
// app so the card sits cohesively on the dashboard.
const C = {
  orange: "#F16722", orangeTint: "#FFF0E8", ink: "#2C2C2D", grey: "#8A8A8B", greyL: "#A0A09E",
  line: "#EDECEA", card: "#FFFFFF",
  redL: "#C0453F", amber: "#B7791F", amberT: "#FBF3E2", blue: "#3A63B8", blueT: "#EAF0FB", redT: "#FBEAE9",
};

const TYPE: Record<string, { tag: { bg: string; fg: string }; iconBg: string; icon: string }> = {
  News: { tag: { bg: C.blueT, fg: C.blue }, iconBg: C.blueT, icon: "📢" },
  Maintenance: { tag: { bg: C.amberT, fg: C.amber }, iconBg: C.amberT, icon: "🛠️" },
  Alert: { tag: { bg: C.redT, fg: C.redL }, iconBg: C.redT, icon: "⚠️" },
};
const PRIO_BORDER: Record<string, string> = { High: C.redL, Medium: C.amber, Low: C.greyL };

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
    <div style={S.card}>
      <div style={S.head}>
        {/* Same heading as the "Waiting for your approval" card — the app's .sec-head
            (16px bold with the short orange underline bar). */}
        <h2 className="sec-head" style={{ marginBottom: 0 }}>Announcements</h2>
        <span style={S.count}>{active.length} new</span>
      </div>
      <div style={S.list}>
        {active.map((a) => {
          const t = TYPE[a.type] || TYPE.News;
          const r = remaining(a);
          return (
            <div key={a.id} style={{ ...S.ann, borderLeftColor: PRIO_BORDER[a.priority] || C.greyL }}>
              <div style={{ ...S.icon, background: t.iconBg }}>{t.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={S.annTop}>
                  <span style={{ ...S.type, background: t.tag.bg, color: t.tag.fg }}>{a.type}</span>
                  <span style={S.annTitle}>{a.title}</span>
                </div>
                {a.body && <div style={S.body}>{a.body}</div>}
                <div style={S.foot}>Posted {fmt(a.start)}</div>
              </div>
              <div style={{ ...S.remain, color: r.tone === "soon" ? C.amber : C.grey }}>{r.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  card: { background: C.card, borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", padding: "16px 20px", marginBottom: 16, color: C.ink },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  count: { fontSize: 12, fontWeight: 600, color: C.orange, background: C.orangeTint, padding: "3px 11px", borderRadius: 12 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  ann: { display: "flex", alignItems: "flex-start", gap: 12, border: `0.5px solid ${C.line}`, borderLeftWidth: 3, borderLeftStyle: "solid", borderRadius: 9, padding: "12px 14px", background: "#fff" },
  icon: { width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flex: "none" },
  annTop: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" },
  type: { fontSize: 10.5, fontWeight: 600, padding: "1px 8px", borderRadius: 6 },
  annTitle: { fontSize: 13.5, fontWeight: 600 },
  body: { fontSize: 12.5, color: C.grey, lineHeight: 1.5 },
  foot: { fontSize: 11, color: C.greyL, marginTop: 6 },
  remain: { fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", alignSelf: "center" },
};
