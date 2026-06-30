import { Link, NavLink, Outlet } from "react-router-dom";
import { PRODUCT_CATEGORIES } from "./options";
import { useAuth } from "./auth/AuthContext";

const tabPath: Record<string, string> = { RMU: "/rmu", KIOSK: "/kiosks", LV: "/lv" };

// Small inline icons per product family
const icons: Record<string, JSX.Element> = {
  RMU: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  ),
  KIOSK: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10l9-6 9 6" />
      <path d="M5 9v11h14V9" />
    </svg>
  ),
  LV: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  ),
};

const homeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
);

export default function App() {
  const { user, signOut } = useAuth();
  const initials = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Left sidebar */}
      <aside className="sticky top-0 flex h-screen w-16 flex-col bg-sidebar lg:w-60">
        <Link to="/" className="flex items-center px-3 py-5 lg:px-5" title="PowerLine — Offer Configurator">
          <img src="/brand/logo-white.png" alt="PowerLine" className="hidden h-10 w-auto lg:block" />
          <img src="/brand/mark-white.png" alt="PowerLine" className="mx-auto h-9 w-auto lg:hidden" />
        </Link>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-2 lg:px-3">
          <NavLink to="/" end title="Home"
            className={({ isActive }) => `nav-item justify-center lg:justify-start ${isActive ? "nav-item-active" : ""}`}>
            <span className="shrink-0">{homeIcon}</span>
            <span className="hidden lg:inline">Home</span>
          </NavLink>

          <p className="hidden px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-white/35 lg:block">
            Products
          </p>
          {PRODUCT_CATEGORIES.map((c) => (
            <NavLink
              key={c.key}
              to={tabPath[c.key]}
              title={c.label}
              className={({ isActive }) =>
                `nav-item justify-center lg:justify-start ${isActive ? "nav-item-active" : ""}`
              }
            >
              <span className="shrink-0">{icons[c.key]}</span>
              <span className="hidden lg:inline">{c.label}</span>
              {!c.ready && (
                <span className="ml-auto hidden rounded bg-white/15 px-1.5 text-[9px] uppercase tracking-wide lg:inline">
                  soon
                </span>
              )}
              {(c.key === "KIOSK" || c.key === "LV") && (
                <span className="ml-auto hidden animate-blink rounded bg-white px-1.5 text-[9px] font-bold uppercase tracking-wide text-brand-darker lg:inline">
                  new
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Profile + sign out */}
        <div className="border-t border-white/10 p-3 lg:px-4 lg:py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 text-sm font-bold text-white">
              {user?.photo && /^data:image\//.test(user.photo) ? <img src={user.photo} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="truncate text-xs font-bold text-white">{user?.name || user?.email}</p>
              <button onClick={signOut} className="text-[11px] text-white/50 transition hover:text-white">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1">
        <main className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
