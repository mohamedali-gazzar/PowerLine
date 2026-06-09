import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import OffersListPage from "./pages/OffersListPage";
import NewOfferPage from "./pages/NewOfferPage";
import OfferDetailPage from "./pages/OfferDetailPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import KioskSelectorPage from "./pages/KioskSelectorPage";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<OffersListPage />} />
          <Route path="kiosks" element={<KioskSelectorPage />} />
          <Route path="lv" element={<ComingSoonPage category="LV" />} />
          <Route path="offers/new" element={<NewOfferPage />} />
          <Route path="offers/:id" element={<OfferDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
