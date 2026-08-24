import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, type NotificationDto, type MyAccess } from "./api";
import { useAuth } from "./auth/AuthContext";
import { useTheme } from "./theme";

const homeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
);
const moonIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const sunIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const bellIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);
const pinIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </svg>
);
const barsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const priceIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);
const megaphoneIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l14-7v16L3 13z" />
    <path d="M3 11v2a2 2 0 0 0 2 2h1" />
    <path d="M8 15v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2" />
  </svg>
);
// A document with a pencil — the draft the user is currently working on.
const draftIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6" />
    <path d="M14 2v6h6" />
    <path d="M18.4 14.6a1.5 1.5 0 0 1 2.1 2.1L16 21l-3 .8.8-3z" />
  </svg>
);

export default function App() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useTheme();
  const { pathname } = useLocation();
  const initials = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase();

  // Nav permissions — the LV all-users history link is only offered to those allowed.
  const [access, setAccess] = useState<MyAccess | null>(null);
  useEffect(() => {
    if (user) api.access.me().then(setAccess).catch(() => {});
  }, [user]);
  const can = (perm: string) => Boolean(access?.perms.includes(perm));

  // The draft the user is currently working on — the most-recently-updated DRAFT,
  // whether an LV quotation or an RMU offer — offered as a one-click "resume"
  // shortcut in the sidebar (after Home). Refreshed on navigation so it follows
  // whatever they last opened or edited.
  const [activeDraft, setActiveDraft] = useState<{ number: string; href: string } | null>(null);
  useEffect(() => {
    if (!user) { setActiveDraft(null); return; }
    let alive = true;
    Promise.all([
      api.qtns.list().catch(() => [] as Awaited<ReturnType<typeof api.qtns.list>>),
      // `mine` matters: without it a qtn.viewAll holder receives every user's offers and
      // the most-recent draft could be a colleague's, shown as though it were theirs.
      api.listOffers({ mine: true }).catch(() => [] as Awaited<ReturnType<typeof api.listOffers>>),
    ])
      .then(([qs, offers]) => {
        if (!alive) return;
        const drafts = [
          ...qs
            .filter((q) => q.status === "DRAFT" && !q.removedAt)
            .map((q) => ({ number: q.number, updatedAt: q.updatedAt, href: `/lv/qtn/${q.id}` })),
          ...offers
            .filter((o) => o.status === "DRAFT")
            .map((o) => ({ number: o.quotationNo || o.offerNumber, updatedAt: o.updatedAt, href: `/offers/${o.id}` })),
        ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
        const d = drafts[0];
        setActiveDraft(d ? { number: d.number, href: d.href } : null);
      })
      .catch(() => { /* offline / not signed in — just no shortcut */ });
    return () => { alive = false; };
  }, [user, pathname]);

  // Sidebar pin cycle (persisted). Each click on the pin advances the state:
  //   "off"  — auto-hide rail: thin, expands on hover, overlays the content.
  //   "min"  — pinned minimized: locked thin, no hover-expand.
  //   "open" — pinned open: locked expanded, content pushed aside.
  // off → min → open → off …
  const [pinMode, setPinMode] = useState<"off" | "min" | "open">(() => {
    try { const v = localStorage.getItem("pl.sidebarPin"); return v === "min" || v === "open" ? v : "off"; }
    catch { return "off"; }
  });
  useEffect(() => {
    try { localStorage.setItem("pl.sidebarPin", pinMode); } catch { /* ignore */ }
  }, [pinMode]);
  const cyclePin = () => setPinMode((m) => (m === "off" ? "min" : m === "min" ? "open" : "off"));

  // Class fragments that vary by pin state. "open" is always expanded; "min" is
  // always the thin rail (no hover); "off" is thin but hover-expands.
  const asideW = pinMode === "open" ? "w-60 shadow-2xl" : pinMode === "min" ? "w-14" : "w-14 group-hover:w-60 group-hover:shadow-2xl";
  const rowJustify = pinMode === "open" ? "justify-start" : pinMode === "min" ? "justify-center" : "justify-center group-hover:justify-start";
  const lbl = pinMode === "open" ? "whitespace-nowrap" : pinMode === "min" ? "hidden" : "hidden whitespace-nowrap group-hover:inline";
  const blockLbl = pinMode === "open" ? "block" : pinMode === "min" ? "hidden" : "hidden group-hover:block";
  const markCls = pinMode === "open" ? "hidden" : pinMode === "min" ? "" : "group-hover:hidden";
  const fullLogoCls = pinMode === "open" ? "block" : pinMode === "min" ? "hidden" : "hidden group-hover:block";
  const pinTitle =
    pinMode === "off" ? "Pin the sidebar (minimized)" :
    pinMode === "min" ? "Pinned minimized — click to pin open" :
    "Pinned open — click to unpin";

  return (
    <div className="min-h-screen">
      {/* Sidebar. The pin (bottom) cycles: auto-hide → locked-minimized → locked-open. */}
      <div className="group fixed inset-y-0 left-0 z-40">
        <aside className={`flex h-full flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out ${asideW}`}>
          <a
            href="https://pl.powerline.com.eg/app/quotation"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center px-3 py-5 ${rowJustify}`}
            title="PowerLine — Quotation portal"
          >
            <img src="/brand/mark-white.png" alt="PowerLine" className={`h-9 w-auto shrink-0 ${markCls}`} />
            <img src="/brand/logo-white.png" alt="PowerLine" className={`h-10 w-auto ${fullLogoCls}`} />
          </a>

          <nav className="mt-1 flex flex-1 flex-col gap-1 px-2.5">
            <NavLink
              to="/"
              end
              title="Home"
              className={({ isActive }) => `nav-item ${rowJustify} ${isActive ? "nav-item-active" : ""}`}
            >
              <span className="shrink-0">{homeIcon}</span>
              <span className={lbl}>Home</span>
            </NavLink>

            {/* Resume the draft the user is working on — the most-recent DRAFT quotation. */}
            {activeDraft && (
              <NavLink
                to={activeDraft.href}
                title={`Resume draft ${activeDraft.number}`}
                className={({ isActive }) => `nav-item ${rowJustify} ${isActive ? "nav-item-active" : ""}`}
              >
                <span className="shrink-0">{draftIcon}</span>
                <span className={`${lbl} truncate`}>{activeDraft.number}</span>
              </NavLink>
            )}

            <NotificationBell pinMode={pinMode} />

            {/* One history for everything — LV quotations and RMU offers together. */}
            <NavLink to="/lv" title="Offer History" className={({ isActive }) => `nav-item ${rowJustify} ${isActive ? "nav-item-active" : ""}`}>
              <span className="shrink-0">{barsIcon}</span>
              <span className={lbl}>Offers</span>
            </NavLink>
            <NavLink to="/pricing" title="Price list" className={({ isActive }) => `nav-item ${rowJustify} ${isActive ? "nav-item-active" : ""}`}>
              <span className="shrink-0">{priceIcon}</span>
              <span className={lbl}>Price list</span>
            </NavLink>
            {can("announcements.manage") && (
              <NavLink to="/announcements" title="Announcements" className={({ isActive }) => `nav-item ${rowJustify} ${isActive ? "nav-item-active" : ""}`}>
                <span className="shrink-0">{megaphoneIcon}</span>
                <span className={lbl}>Announcements</span>
              </NavLink>
            )}
          </nav>

          {/* Pin toggle + dark/light mode */}
          <div className="flex flex-col gap-1 px-2.5 pb-1">
            <button
              type="button"
              onClick={cyclePin}
              title={pinTitle}
              aria-pressed={pinMode !== "off"}
              className={`nav-item w-full ${rowJustify} ${pinMode !== "off" ? "nav-item-active" : ""}`}
            >
              <span className="shrink-0">{pinIcon}</span>
              <span className={lbl}>{pinMode === "open" ? "Pinned open" : pinMode === "min" ? "Pinned" : "Pin sidebar"}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className={`nav-item w-full ${rowJustify}`}
            >
              <span className="shrink-0">{theme === "dark" ? sunIcon : moonIcon}</span>
              <span className={lbl}>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>

          {/* Profile + sign out */}
          <div className="border-t border-white/10 p-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 text-sm font-bold text-white">
                {user?.photo && /^data:image\//.test(user.photo) ? (
                  <img src={user.photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className={`min-w-0 flex-1 whitespace-nowrap ${blockLbl}`}>
                <p className="truncate text-xs font-bold text-white">{user?.name || user?.email}</p>
                <button onClick={signOut} className="text-[11px] text-white/50 transition hover:text-white">
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Main content — "open" pushes it aside; "off"/"min" keep the thin rail. */}
      <div className={`transition-[padding] duration-200 ${pinMode === "open" ? "pl-60" : "pl-14"}`}>
        <main className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
          <div key={pathname} className="animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/** How long ago a notification arrived, kept short enough for a narrow panel. */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / (60 * 24))}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Unread count in the rail, with a dropdown of the recent notifications. */
function NotificationBell({ pinMode }: { pinMode: "off" | "min" | "open" }) {
  const navigate = useNavigate();
  const rowJustify = pinMode === "open" ? "justify-start" : pinMode === "min" ? "justify-center" : "justify-center group-hover:justify-start";
  const lbl = pinMode === "open" ? "whitespace-nowrap" : pinMode === "min" ? "hidden" : "hidden whitespace-nowrap group-hover:inline";
  // The dropdown anchors just past the rail — further out when pinned open (240px).
  const panelLeft = pinMode === "open" ? "left-60" : "left-16";
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    // The shared request helper reloads the whole page on a 401, so this poller
    // must never surface a rejection — a transient failure would otherwise take
    // the app down with it. On failure it simply keeps the last good list.
    const load = async () => {
      try {
        const r = await api.notifications.list();
        if (live) {
          setItems(r.items);
          setUnread(r.unread);
        }
      } catch {
        /* ignore */
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The panel is portalled to <body>: the sidebar is a 56px rail with
  // overflow-hidden, so a dropdown rendered inside it would be clipped away.
  // Only the vertical anchor is measured — it sits beside the collapsed rail so
  // it doesn't move when the sidebar expands on hover.
  const toggle = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setTop(rect.top);
    setOpen((o) => !o);
  };

  const openNotification = (n: NotificationDto) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      api.notifications.read(n.id).catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  const markAllRead = () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: now })));
    setUnread(0);
    api.notifications.readAll().catch(() => {});
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        className={`nav-item w-full ${rowJustify}`}
      >
        <span className="relative shrink-0">
          {bellIcon}
          {unread > 0 && (
            <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span className={lbl}>Notifications</span>
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Notifications"
            style={{ top }}
            className={`fixed ${panelLeft} z-50 w-80 max-w-[calc(100vw-5rem)] overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop`}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-sm font-bold text-ink">Notifications</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[11px] font-semibold text-brand hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted">Nothing here yet.</p>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto">
                {items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`block w-full border-b border-line px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-brand-tint ${n.readAt ? "" : "bg-brand-tint/50"}`}
                  >
                    <span className="flex items-start gap-2">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-ink">{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-[11px] text-muted">{n.body}</span>}
                        <span className="mt-0.5 block text-[10px] text-muted">{ago(n.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
