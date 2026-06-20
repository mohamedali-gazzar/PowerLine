import { Link, NavLink, Outlet } from "react-router-dom";
import { PRODUCT_CATEGORIES } from "./options";

const tabPath: Record<string, string> = { RMU: "/", KIOSK: "/kiosks", LV: "/lv" };

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

export default function App() {
  return (
    <div className="flex min-h-screen">
      {/* Left sidebar */}
      <aside className="sticky top-0 flex h-screen w-16 flex-col bg-sidebar lg:w-60">
        <Link
          to="/"
          className="flex items-center px-3 py-5 lg:px-5"
          title="PowerLine — Offer Configurator"
        >
          {/* Official brand logo — reversed (white) variant for the dark sidebar.
              Full lockup when expanded, P-mark when collapsed. */}
          <img src="/brand/logo-white.png" alt="PowerLine" className="hidden h-10 w-auto lg:block" />
          <img src="/brand/mark-white.png" alt="PowerLine" className="mx-auto h-9 w-auto lg:hidden" />
        </Link>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-2 lg:px-3">
          <p className="hidden px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-white/35 lg:block">
            Products
          </p>
          {PRODUCT_CATEGORIES.map((c) => (
            <NavLink
              key={c.key}
              to={tabPath[c.key]}
              end={c.key === "RMU"}
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

        <div className="border-t border-white/10 px-3 py-4 lg:px-5">
          <p className="hidden text-center text-[10px] text-white/30 lg:block">
            powerline.com.eg
          </p>
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
