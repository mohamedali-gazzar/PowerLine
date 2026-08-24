import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { installCachedCatalog, refreshCatalog, onCatalogChange } from "./lv/catalogSource";
import { getToken } from "./api";
import AuthPage from "./pages/AuthPage";
import HomeDashboard from "./pages/HomeDashboard";
import NewOfferPage from "./pages/NewOfferPage";
import OfferDetailPage from "./pages/OfferDetailPage";
import LvQtnListPage from "./pages/LvQtnListPage";
import LvConfiguratorPage from "./pages/LvConfiguratorPage";
// Loaded on demand: the price screen is used occasionally, so its code is only
// downloaded when someone actually opens /pricing — it never weighs on the
// everyday app or on first load.
const PricingAdminPage = React.lazy(() => import("./pages/PricingAdminPage"));
// Same for the P-CSS selector — it carries the full breaker catalogue.
const PcssSelectorPage = React.lazy(() => import("./pages/PcssSelectorPage"));
// And for the Access Center — only admins ever open it.
const AccessCenterPage = React.lazy(() => import("./pages/AccessCenterPage"));
// Announcements manager — owner only, opened rarely.
const AnnouncementsAdminPage = React.lazy(() => import("./pages/AnnouncementsAdminPage"));
// Brand fonts — self-hosted via @fontsource so local dev stays offline-capable.
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource-variable/montserrat";
import "./index.css";

/** Login wall: shows the auth page until the user is signed in, then the app. */
function Gate() {
  const { user, loading } = useAuth();
  const [, bumpCatalog] = React.useState(0);
  // Pull the published prices once the user is known (the endpoint needs a login).
  // refreshCatalog mutates the catalogue arrays IN PLACE, so React sees no change on
  // its own — force one re-render of the whole authed subtree when a new version
  // lands, or a screen already open (e.g. the Sizing picker) keeps showing the
  // catalogue it first rendered with (a newly-published enclosure wouldn't appear).
  React.useEffect(() => {
    if (user) void refreshCatalog(getToken()).then((v) => { if (v) bumpCatalog(v); });
  }, [user]);
  // …and again whenever a catalogue lands later in the session. Publishing from
  // the price list (an edit, an import, the publish button) swaps the catalogue
  // without the user changing, so without this the configurator would keep the
  // version it signed in with — showing an old description next to a price list
  // already displaying the new one.
  React.useEffect(() => onCatalogChange((v) => bumpCatalog(v)), []);
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }
  if (!user) return <AuthPage />;
  return (
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<HomeDashboard />} />
        {/* RMU offers now live in the one unified history — keep the old link working. */}
        <Route path="rmu" element={<Navigate to="/lv" replace />} />
        <Route
          path="kiosks"
          element={
            <React.Suspense fallback={<div className="skeleton h-64" />}>
              <PcssSelectorPage />
            </React.Suspense>
          }
        />
        <Route
          path="pricing"
          element={
            <React.Suspense fallback={<div className="skeleton h-64" />}>
              <PricingAdminPage />
            </React.Suspense>
          }
        />
        <Route
          path="access"
          element={
            <React.Suspense fallback={<div className="skeleton h-64" />}>
              <AccessCenterPage />
            </React.Suspense>
          }
        />
        <Route
          path="announcements"
          element={
            <React.Suspense fallback={<div className="skeleton h-64" />}>
              <AnnouncementsAdminPage />
            </React.Suspense>
          }
        />
        <Route path="lv" element={<LvQtnListPage />} />
        <Route path="lv/qtn/:id" element={<LvConfiguratorPage />} />
        <Route path="offers/new" element={<NewOfferPage />} />
        <Route path="offers/:id/edit" element={<NewOfferPage />} />
        <Route path="offers/:id" element={<OfferDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// Prices: start from the catalogue this browser last saw (synchronous, so the
// first render already has the right prices), then quietly fetch the published
// one. Both are no-ops on failure — the app always has the bundled catalogue
// underneath, so it can never start without prices.
installCachedCatalog();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);

// Fade out the boot splash (index.html) once the app has mounted.
const splashEl = document.getElementById("pl-splash");
if (splashEl) {
  requestAnimationFrame(() => {
    splashEl.classList.add("pl-hide");
    setTimeout(() => splashEl.remove(), 450);
  });
}
