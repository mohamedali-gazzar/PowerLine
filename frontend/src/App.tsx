import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";

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
    <div className="min-h-screen">
      {/* Auto-hide sidebar: a thin rail by default that expands on hover and
          overlays the content (so the content keeps its full width). Product
          sections live on the Home dashboard, so the rail only needs Home. */}
      <div className="group fixed inset-y-0 left-0 z-40">
        <aside className="flex h-full w-14 flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out group-hover:w-60 group-hover:shadow-2xl">
          <Link to="/" className="flex items-center px-3 py-5" title="PowerLine — Home">
            <img src="/brand/mark-white.png" alt="PowerLine" className="h-9 w-auto shrink-0 group-hover:hidden" />
            <img src="/brand/logo-white.png" alt="PowerLine" className="hidden h-10 w-auto group-hover:block" />
          </Link>

          <nav className="mt-1 flex flex-1 flex-col gap-1 px-2.5">
            <NavLink
              to="/"
              end
              title="Home"
              className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
            >
              <span className="shrink-0">{homeIcon}</span>
              <span className="hidden whitespace-nowrap group-hover:inline">Home</span>
            </NavLink>
          </nav>

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
