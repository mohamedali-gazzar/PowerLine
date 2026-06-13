import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import OffersListPage from "./pages/OffersListPage";
import NewOfferPage from "./pages/NewOfferPage";
import OfferDetailPage from "./pages/OfferDetailPage";
import KioskSelectorPage from "./pages/KioskSelectorPage";
import LvQtnListPage from "./pages/LvQtnListPage";
import LvConfiguratorPage from "./pages/LvConfiguratorPage";
// Brand fonts — self-hosted via @fontsource so local dev stays offline-capable.
// Poppins = body/UI; Montserrat = headline stand-in for Nexa (see index.css).
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource-variable/montserrat";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<OffersListPage />} />
          <Route path="kiosks" element={<KioskSelectorPage />} />
          <Route path="lv" element={<LvQtnListPage />} />
          <Route path="lv/qtn/:id" element={<LvConfiguratorPage />} />
          <Route path="offers/new" element={<NewOfferPage />} />
          <Route path="offers/:id" element={<OfferDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
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
