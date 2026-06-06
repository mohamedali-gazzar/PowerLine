import type { Offer, OfferInput, RmuConfigInput, GeneratedOffer } from "./types";

// Requests go to "/api/..." and Vite proxies them to the backend (see
// vite.config.ts). In production, serve the frontend behind the same origin
// as the API, or set an absolute base here.
const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      const fe = body?.details?.fieldErrors;
      if (fe) {
        const first = Object.entries(fe)[0];
        if (first) message = `${first[0]}: ${(first[1] as string[])[0]}`;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  listOffers: () => request<Offer[]>("/offers"),
  getOffer: (id: string) => request<Offer>(`/offers/${id}`),
  createOffer: (data: OfferInput) =>
    request<Offer>("/offers", { method: "POST", body: JSON.stringify(data) }),
  deleteOffer: (id: string) =>
    request<void>(`/offers/${id}`, { method: "DELETE" }),
  previewConfig: (cfg: RmuConfigInput) =>
    request<GeneratedOffer>("/offers/preview", {
      method: "POST",
      body: JSON.stringify(cfg),
    }),
  pdfUrl: (id: string) => `${BASE}/offers/${id}/pdf`,
  commercialPdfUrl: (id: string) => `${BASE}/offers/${id}/commercial-pdf`,
};
