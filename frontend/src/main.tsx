import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import AuthPage from "./pages/AuthPage";
import HomeDashboard from "./pages/HomeDashboard";
import OffersListPage from "./pages/OffersListPage";
import NewOfferPage from "./pages/NewOfferPage";
import OfferDetailPage from "./pages/OfferDetailPage";
import KioskSelectorPage from "./pages/KioskSelectorPage";
import LvQtnListPage from "./pages/LvQtnListPage";
import LvConfiguratorPage from "./pages/LvConfiguratorPage";
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
        <Route path="rmu" element={<OffersListPage />} />
        <Route path="kiosks" element={<KioskSelectorPage />} />
        <Route path="lv" element={<LvQtnListPage />} />
        <Route path="lv/qtn/:id" element={<LvConfiguratorPage />} />
        <Route path="offers/new" element={<NewOfferPage />} />
        <Route path="offers/:id" element={<OfferDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

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
