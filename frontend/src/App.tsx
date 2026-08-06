import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, type NotificationDto } from "./api";
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

export default function App() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useTheme();
  const { pathname } = useLocation();
  const initials = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen">
      {/* Auto-hide sidebar: a thin rail by default that expands on hover and
          overlays the content (so the content keeps its full width). Product
          sections live on the Home dashboard, so the rail only needs Home and
          the notification bell. */}
      <div className="group fixed inset-y-0 left-0 z-40">
        <aside className="flex h-full w-14 flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out group-hover:w-60 group-hover:shadow-2xl">
          <Link to="/" className="flex items-center justify-center px-3 py-5 group-hover:justify-start" title="PowerLine — Home">
            <img src="/brand/mark-white.png" alt="PowerLine" className="h-9 w-auto shrink-0 group-hover:hidden" />
            <img src="/brand/logo-white.png" alt="PowerLine" className="hidden h-10 w-auto group-hover:block" />
          </Link>

          <nav className="mt-1 flex flex-1 flex-col gap-1 px-2.5">
            <NavLink
              to="/"
              end
              title="Home"
              className={({ isActive }) =>
                `nav-item justify-center group-hover:justify-start ${isActive ? "nav-item-active" : ""}`
              }
            >
              <span className="shrink-0">{homeIcon}</span>
              <span className="hidden whitespace-nowrap group-hover:inline">Home</span>
            </NavLink>

            <NotificationBell />
          </nav>

          {/* Dark / light mode toggle */}
          <div className="px-2.5 pb-1">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="nav-item w-full justify-center group-hover:justify-start"
            >
              <span className="shrink-0">{theme === "dark" ? sunIcon : moonIcon}</span>
              <span className="hidden whitespace-nowrap group-hover:inline">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
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
              <div className="hidden min-w-0 flex-1 whitespace-nowrap group-hover:block">
                <p className="truncate text-xs font-bold text-white">{user?.name || user?.email}</p>
                <button onClick={signOut} className="text-[11px] text-white/50 transition hover:text-white">
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Main content — offset by the thin rail; the expanded sidebar overlays it. */}
      <div className="pl-14">
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
function NotificationBell() {
  const navigate = useNavigate();
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
        className="nav-item w-full justify-center group-hover:justify-start"
      >
        <span className="relative shrink-0">
          {bellIcon}
          {unread > 0 && (
            <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span className="hidden whitespace-nowrap group-hover:inline">Notifications</span>
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Notifications"
            style={{ top }}
            className="fixed left-16 z-50 w-80 max-w-[calc(100vw-5rem)] overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop"
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
