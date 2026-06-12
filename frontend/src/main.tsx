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
