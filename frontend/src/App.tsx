import { Link, NavLink, Outlet } from "react-router-dom";
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

export default function App() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useTheme();
  const initials = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen">
      {/* Auto-hide sidebar: a thin rail by default that expands on hover and
          overlays the content (so the content keeps its full width). Product
          sections live on the Home dashboard, so the rail only needs Home. */}
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
