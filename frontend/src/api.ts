import type { Offer, OfferInput, RmuConfigInput, GeneratedOffer } from "./types";

// Requests go to "/api/..." and Vite proxies them to the backend (see
// vite.config.ts). The JWT (when signed in) is attached automatically.
const BASE = "/api";
const TOKEN_KEY = "powerline-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* ignore */
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    // Session expired/invalid on a protected call → drop the token and bounce to
    // the login wall. Auth endpoints handle their own 401s (wrong credentials).
    if (res.status === 401 && token && !path.startsWith("/auth/")) {
      clearToken();
      if (typeof window !== "undefined") window.location.reload();
    }
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
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Build an authenticated file URL (token + optional download flag), so callers
 *  never hand-append query strings and collide with each other. */
function pdfLink(path: string, dl?: boolean): string {
  const p = new URLSearchParams();
  const token = getToken();
  if (token) p.set("t", token);
  if (dl) p.set("dl", "1");
  const q = p.toString();
  return `${BASE}${path}${q ? `?${q}` : ""}`;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  photo: string | null;
  /** "USER" | "PRICE_ADMIN" | "OWNER" — drives which screens are offered. */
  role: string;
}
export interface AuthResult {
  token: string;
  user: AuthUser;
}
export interface QtnSummaryInput {
  projectName?: string;
  customer?: string;
  panelsCount?: number;
  totalEgp?: number;
}
export interface QtnListItemDto {
  id: string;
  number: string;
  updatedAt: string;
  projectName: string;
  customer: string;
  panels: number;
  totalEgp: number;
  submitted: boolean;
}
export interface QtnRecordDto {
  id: string;
  number: string;
  createdAt: string;
  updatedAt: string;
  submitted: boolean;
  state: unknown;
}
export interface HistoryItem {
  kind: "LV" | "RMU";
  id: string;
  number: string;
  projectName: string;
  customer: string;
  updatedAt: string;
  submitted: boolean;
  link: string;
}
export interface PricingStatus {
  role: string;
  canEdit: boolean;
  version: number;
  source: "bundled" | "db";
  stale: boolean;
  seedState: "EMPTY" | "SEEDING" | "READY";
  counts: { rmuPrices: number; settings: number; lvComponents: number; lvEnclosures: number };
}
export interface RmuPriceRow {
  id: string;
  kind: "PANEL" | "LUCY" | "RTU" | "ADDON";
  key: string;
  priceUsd: number;
  label: string;
  active: boolean;
  updatedBy: string;
  updatedAt: string;
}
export interface PriceChangeRow {
  id: string;
  label: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  actorEmail: string;
  createdAt: string;
}
export interface WeekStat {
  weekStart: string;
  label: string;
  total: number;
  mine: number;
}

export const api = {
  // ── RMU offers ─────────────────────────────────────────────────────────────
  listOffers: () => request<Offer[]>("/offers"),
  getOffer: (id: string) => request<Offer>(`/offers/${id}`),
  createOffer: (data: OfferInput) =>
    request<Offer>("/offers", { method: "POST", body: JSON.stringify(data) }),
  deleteOffer: (id: string) => request<void>(`/offers/${id}`, { method: "DELETE" }),
  previewConfig: (cfg: RmuConfigInput) =>
    request<GeneratedOffer>("/offers/preview", { method: "POST", body: JSON.stringify(cfg) }),
  // PDFs open as plain browser navigations (<a href> / anchor download), which
  // cannot send the Authorization header — so the token travels as ?t=. The
  // backend accepts it for GET only, and serves the file only to the owner.
  pdfUrl: (id: string, dl?: boolean) => pdfLink(`/offers/${id}/pdf`, dl),
  commercialPdfUrl: (id: string, dl?: boolean) => pdfLink(`/offers/${id}/commercial-pdf`, dl),
  sldPdfUrl: (id: string, dl?: boolean) => pdfLink(`/offers/${id}/sld-pdf`, dl),

  // ── Auth ───────────────────────────────────────────────────────────────────
  auth: {
    register: (email: string) =>
      request<{ ok: true; devCode?: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    verify: (email: string, code: string) =>
      request<{ ok: true }>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      }),
    complete: (email: string, code: string, password: string, name?: string) =>
      request<AuthResult>("/auth/complete", {
        method: "POST",
        body: JSON.stringify({ email, code, password, name }),
      }),
    login: (email: string, password: string) =>
      request<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    // DEV ONLY — the backend 404s this in production; the UI button is also stripped
    // from the production build (import.meta.env.DEV).
    devLogin: () => request<AuthResult>("/auth/dev-login", { method: "POST" }),
    forgot: (email: string) =>
      request<{ ok: true; devCode?: string }>("/auth/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    reset: (email: string, code: string, password: string) =>
      request<AuthResult>("/auth/reset", {
        method: "POST",
        body: JSON.stringify({ email, code, password }),
      }),
    me: () => request<{ user: AuthUser }>("/auth/me"),
  },

  // ── Per-user LV quotations ──────────────────────────────────────────────────
  qtns: {
    list: () => request<QtnListItemDto[]>("/qtns"),
    nextNumber: () => request<{ suggestion: string }>("/qtns/next-number"),
    get: (id: string) => request<QtnRecordDto>(`/qtns/${id}`),
    create: (number: string, state: unknown, summary: QtnSummaryInput) =>
      request<QtnRecordDto>("/qtns", {
        method: "POST",
        body: JSON.stringify({ number, state, summary }),
      }),
    update: (id: string, state: unknown, summary: QtnSummaryInput) =>
      request<{ ok: true }>(`/qtns/${id}`, {
        method: "PUT",
        body: JSON.stringify({ state, summary }),
      }),
    rename: (id: string, number: string) =>
      request<{ ok: boolean; error?: string }>(`/qtns/${id}/number`, {
        method: "PATCH",
        body: JSON.stringify({ number }),
      }),
    remove: (id: string) => request<void>(`/qtns/${id}`, { method: "DELETE" }),
    duplicate: (id: string) =>
      request<QtnRecordDto>(`/qtns/${id}/duplicate`, { method: "POST" }),
    submit: (id: string) => request<{ ok: true }>(`/qtns/${id}/submit`, { method: "POST" }),
    unsubmit: (id: string) => request<{ ok: true }>(`/qtns/${id}/unsubmit`, { method: "POST" }),
  },

  // ── Price list (online, database-backed) ────────────────────────────────────
  pricing: {
    status: () => request<PricingStatus>("/pricing/status"),
    setUp: () => request<{ ok: boolean; version: number; counts: Record<string, number>; mismatches?: string[] }>(
      "/pricing/seed",
      { method: "POST" }
    ),
    verify: () => request<{ identical: boolean; mismatches: string[]; counts: Record<string, number> }>("/pricing/verify"),
    list: () => request<{ rows: RmuPriceRow[]; pendingChanges: number }>("/pricing/rmu"),
    setPrice: (id: string, priceUsd: number) =>
      request<{ ok: true; row: RmuPriceRow }>(`/pricing/rmu/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ priceUsd }),
      }),
    pending: () => request<{ changes: PriceChangeRow[] }>("/pricing/pending"),
    publish: (note?: string) =>
      request<{ ok: true; version: number }>("/pricing/publish", {
        method: "POST",
        body: JSON.stringify({ note: note ?? "" }),
      }),
  },

  // ── Account (profile, history, stats) ───────────────────────────────────────
  account: {
    updateProfile: (data: { name?: string; photo?: string | null }) =>
      request<{ user: AuthUser }>("/profile", { method: "PUT", body: JSON.stringify(data) }),
    history: () => request<{ items: HistoryItem[] }>("/account/history"),
    weekly: () => request<{ weeks: WeekStat[] }>("/stats/weekly"),
  },
};
