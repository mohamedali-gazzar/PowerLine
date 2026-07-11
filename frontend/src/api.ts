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

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  photo: string | null;
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
  pdfUrl: (id: string) => `${BASE}/offers/${id}/pdf`,
  commercialPdfUrl: (id: string) => `${BASE}/offers/${id}/commercial-pdf`,
  sldPdfUrl: (id: string) => `${BASE}/offers/${id}/sld-pdf`,

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
  },

  // ── Docs & Support — retrieval-grounded AI answering ────────────────────────
  support: {
    ai: (
      question: string,
      context: { doc: string; page?: number | null; text: string }[],
      history: { role: "user" | "assistant"; text: string }[] = [],
      topic?: string
    ) =>
      request<{ answer: string }>("/support/ai", {
        method: "POST",
        body: JSON.stringify({ question, context, history, topic }),
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
