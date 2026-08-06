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
/** The approval states a quotation moves through. Mirrors the server's
 *  domain/qtnStatus.ts — the server is the authority; this is for rendering. */
export const QTN_STATUSES = [
  "DRAFT", "WAITING_APPROVAL", "RETURNED", "APPROVED", "SUBMITTED",
] as const;
export type QtnStatus = (typeof QTN_STATUSES)[number];

export const QTN_STATUS_LABEL: Record<QtnStatus, string> = {
  DRAFT: "Draft",
  WAITING_APPROVAL: "Waiting for approval",
  RETURNED: "Returned for revision",
  APPROVED: "Approved — waiting for submission",
  SUBMITTED: "Submitted",
};

/** Badge colours, keyed by status. */
export const QTN_STATUS_STYLE: Record<QtnStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  WAITING_APPROVAL: "bg-amber-100 text-amber-700",
  RETURNED: "bg-red-100 text-red-700",
  APPROVED: "bg-sky-100 text-sky-700",
  SUBMITTED: "bg-green-100 text-green-700",
};

/** Workflow fields the server attaches to every QTN payload. */
export interface QtnWorkflow {
  status: QtnStatus;
  statusLabel: string;
  locked: boolean;
  approverEmail: string;
  approvedAt: string | null;
  returnReason: string;
  submittedForApprovalAt: string | null;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
}

export interface QtnListItemDto extends QtnWorkflow {
  id: string;
  number: string;
  updatedAt: string;
  projectName: string;
  customer: string;
  panels: number;
  totalEgp: number;
  submitted: boolean;
}
export interface QtnRecordDto extends QtnWorkflow {
  id: string;
  number: string;
  createdAt: string;
  updatedAt: string;
  submitted: boolean;
  state: unknown;
}
/** One row of a quotation's audit trail. */
export interface QtnEventDto {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  note: string;
  actorEmail: string;
  createdAt: string;
}
export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  qtnId: string | null;
  readAt: string | null;
  createdAt: string;
}
/** What the signed-in user is allowed to do — computed by the server on every
 *  request, never derived from the long-lived JWT. */
export interface MyAccess {
  tier: "ADMIN" | "ENGINEER";
  perms: string[];
  role: string;
}
export interface AccessUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tier: "ADMIN" | "ENGINEER";
  perms: string[];
  migrated: boolean;
  notifyByEmail: boolean;
  createdAt: string;
}
/** A file attached to a quotation on the Specs tab. Metadata only — the bytes are
 *  fetched separately via attachmentLink(), so listing stays cheap. */
export interface QtnAttachmentDto {
  id: string;
  name: string;
  mime: string;
  size: number;
  byEmail: string;
  createdAt: string;
}
/** Largest file the API accepts. Mirrors MAX_ATTACHMENT_BYTES on the server, which
 *  is set by Vercel's 4.5 MB request-body limit (base64 inflates bytes by 4/3). */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
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
  /** May change prices. */
  canEdit: boolean;
  /** May at least see them — implied by canEdit. */
  canView: boolean;
  version: number;
  source: "bundled" | "db";
  stale: boolean;
  seedState: "EMPTY" | "SEEDING" | "READY";
  /** Database prices are newer than the published list — publishing is needed.
   *  Catches price changes that bypass the editor (imports, first-run seed). */
  behindLive?: boolean;
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
export interface LvRow {
  id: string;
  sortIndex: number;
  eur: number;
  egp: number;
  /** false = removed from the price list (kept, so saved quotations still work) */
  active?: boolean;
  // components
  t?: string;
  f?: string;
  r?: string;
  d?: string;
  n?: string;
  ref?: string;
  brand?: string;
  poles?: number;
  // enclosures
  fam?: string;
  name?: string;
  ip?: string;
}
/** One spreadsheet line, already parsed out of the workbook. */
export interface LvImportRow {
  type: string;
  family: string;
  rating: string;
  description: string;
  code: string;
  eur: number;
  egp: number;
  brand: string;
  poles: number;
  cuP: number;   // Weight/Panel/Pole
  cuC: number;   // Weight/Cell/Pole
  stock: string;
}

/** A non-price column the sheet would rewrite on an already-catalogued item. */
export interface LvImportFieldChange {
  field: "d" | "brand" | "t" | "f" | "r" | "poles" | "cuP" | "cuC" | "stock";
  label: string;
  from: string;
  to: string;
}

export interface LvImportDiff {
  kind: "update" | "add";
  entity: "LvComponent" | "LvEnclosure";
  code: string;
  label: string;
  fromEur?: number;
  fromEgp?: number;
  eur: number;
  egp: number;
  pct?: number;
  /** False when only data columns moved — the price is left exactly as it is. */
  priceMoved?: boolean;
  /** Description / Brand / Type / Poles rewrites carried by this row. */
  fields?: LvImportFieldChange[];
  /** Row carried no item code and was matched on description — applied only on opt-in. */
  noCode?: boolean;
}

export interface LvImportSummary {
  rowsRead: number;
  updates: number;
  additions: number;
  unchanged: number;
  /** Priced items whose cell was left blank — the existing price was kept. */
  blankKept: number;
  noCode: number;
  /** New items with no price: not added, because they would quote as free. */
  unpriced: number;
  duplicates: number;
  /** Rows with no item code, matched on description — offered as an opt-in. */
  noCodeUpdates: number;
  noCodeAdditions: number;
  /** Update rows that move the price. */
  priceUpdates: number;
  /** Update rows that rewrite a data column (description / brand / type / poles). */
  dataUpdates: number;
  /** Update rows that rename a description — these can orphan a combination template. */
  renames: number;
  increases: number;
  decreases: number;
  medianPct: number | null;
  minPct: number | null;
  maxPct: number | null;
}

export interface LvImportPreview {
  batchId: string;
  summary: LvImportSummary;
  updates: LvImportDiff[];
  additions: LvImportDiff[];
  /** Rows with no item code, for review before they are included. */
  noCodeItems: LvImportDiff[];
  warnings: string[];
  truncated: boolean;
  expiresAt: string;
}

/** The catalogue row an audit line refers to — needed to describe an added or
 *  removed item in full, and to work out ABB-discount eligibility. */
export interface CatalogChangeDetail {
  ref?: string; t?: string; f?: string; r?: string; d?: string;
  brand?: string; poles?: number; cuP?: number; cuC?: number; stock?: string;
  fam?: string; name?: string; ip?: string; mount?: string; ral?: string;
  eur?: number; egp?: number; active?: boolean;
}

/** One line of the price-list changelog. */
export interface CatalogChangeItem {
  version: number;
  label: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  actorEmail: string;
  createdAt: string;
  entity?: string;
  entityId?: string;
  detail?: CatalogChangeDetail | null;
}
export interface CatalogChanges {
  version: number;
  from: number;
  counts: Record<string, number>;
  total: number;
  items: CatalogChangeItem[];
  publishedAt: string | null;
  publishedBy: string;
  note: string;
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
    /** Every non-draft quotation, all users — the LV Offers History list. */
    listAll: () => request<QtnListItemDto[]>("/qtns/all"),
    /** Quotations waiting for approval (needs qtn.approve). */
    queue: () => request<QtnListItemDto[]>("/qtns/queue"),
    /** Move a quotation through the workflow. `note` is required when returning. */
    transition: (id: string, to: QtnStatus, note?: string) =>
      request<{ ok: true; status: QtnStatus; statusLabel: string }>(`/qtns/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ to, ...(note ? { note } : {}) }),
      }),
    events: (id: string) => request<QtnEventDto[]>(`/qtns/${id}/events`),
    submit: (id: string) => request<{ ok: true }>(`/qtns/${id}/submit`, { method: "POST" }),
    unsubmit: (id: string) => request<{ ok: true }>(`/qtns/${id}/unsubmit`, { method: "POST" }),

    // Specs-tab attachments. `data` is plain base64 (no "data:…;base64," prefix).
    attachments: {
      list: (id: string) => request<QtnAttachmentDto[]>(`/qtns/${id}/attachments`),
      upload: (id: string, file: { name: string; mime: string; data: string }) =>
        request<QtnAttachmentDto>(`/qtns/${id}/attachments`, {
          method: "POST",
          body: JSON.stringify(file),
        }),
      remove: (id: string, fileId: string) =>
        request<void>(`/qtns/${id}/attachments/${fileId}`, { method: "DELETE" }),
      /** Href for opening (dl=false) or downloading (dl=true) an attachment. */
      link: (id: string, fileId: string, dl?: boolean) =>
        pdfLink(`/qtns/${id}/attachments/${fileId}`, dl),
    },
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
    deriveKey: (draft: Record<string, unknown>) =>
      request<{ key: string; exists: boolean; existingPrice: number | null }>("/pricing/rmu/derive-key", {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    add: (draft: Record<string, unknown>) =>
      request<{ ok: true; row: RmuPriceRow }>("/pricing/rmu", {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    retire: (id: string, active: boolean) =>
      request<{ ok: true; row: RmuPriceRow }>(`/pricing/rmu/${id}/retire`, {
        method: "POST",
        body: JSON.stringify({ active }),
      }),
    pending: () => request<{ changes: PriceChangeRow[] }>("/pricing/pending"),
    lvList: (p: {
      kind: "components" | "enclosures";
      q?: string;
      type?: string;
      brand?: string;
      fam?: string;
      noPrice?: boolean;
      page?: number;
      take?: number;
    }) => {
      const s = new URLSearchParams({ kind: p.kind });
      if (p.q) s.set("q", p.q);
      if (p.type) s.set("type", p.type);
      if (p.brand) s.set("brand", p.brand);
      if (p.fam) s.set("fam", p.fam);
      if (p.noPrice) s.set("noPrice", "1");
      s.set("page", String(p.page ?? 0));
      s.set("take", String(p.take ?? 50));
      return request<{ kind: string; rows: LvRow[]; total: number; page: number; take: number }>(
        `/pricing/lv?${s.toString()}`
      );
    },
    lvAdd: (draft: Record<string, unknown>) =>
      request<{ ok: true; row: LvRow }>("/pricing/lv", { method: "POST", body: JSON.stringify(draft) }),
    lvRetire: (id: string, kind: "components" | "enclosures", active: boolean) =>
      request<{ ok: true; row: LvRow }>(`/pricing/lv/${id}/retire?kind=${kind}`, {
        method: "POST",
        body: JSON.stringify({ active }),
      }),
    lvFacets: () => request<{ types: string[]; brands: string[]; families: string[] }>("/pricing/lv/facets"),
    lvSetPrice: (id: string, kind: "components" | "enclosures", eur: number, egp: number) =>
      request<{ ok: true; row: LvRow }>(`/pricing/lv/${id}?kind=${kind}`, {
        method: "PATCH",
        body: JSON.stringify({ eur, egp }),
      }),
    lvSeedChunk: (stage: "LV_COMPONENTS" | "LV_ENCLOSURES", offset: number, rows: unknown[]) =>
      request<{ ok: true; components: number; enclosures: number }>("/pricing/lv/seed-chunk", {
        method: "POST",
        body: JSON.stringify({ stage, offset, rows }),
      }),
    lvSettings: (factors: unknown) =>
      request<{ ok: true; saved: number }>("/pricing/lv/settings", {
        method: "POST",
        body: JSON.stringify({ factors }),
      }),
    lvImportPreview: (rows: LvImportRow[]) =>
      request<LvImportPreview>("/pricing/lv/import/preview", {
        method: "POST",
        body: JSON.stringify({ rows }),
      }),
    lvImportApply: (batchId: string, includeNoCode = false) =>
      request<{ ok: true; updated: number; added: number; skipped: number; published: boolean; version: number | null; blockers?: string[] }>(
        `/pricing/lv/import/${batchId}/apply`,
        { method: "POST", body: JSON.stringify({ includeNoCode }) },
      ),
    lvImportCancel: (batchId: string) =>
      request<{ ok: true }>(`/pricing/lv/import/${batchId}/cancel`, { method: "POST" }),
    history: () => request<{ changes: PriceChangeRow[] }>("/pricing/history"),
    undo: (id: string) => request<{ ok: true }>(`/pricing/changes/${id}/undo`, { method: "POST" }),
    users: () => request<{ users: { id: string; email: string; name: string; role: string }[] }>("/pricing/users"),
    setRole: (id: string, role: string) =>
      request<{ ok: true }>(`/pricing/users/${id}/role`, { method: "POST", body: JSON.stringify({ role }) }),
    publish: (note?: string) =>
      request<{ ok: true; version: number }>("/pricing/publish", {
        method: "POST",
        body: JSON.stringify({ note: note ?? "" }),
      }),
  },

  // ── LV catalogue (readable by every role) ──────────────────────────────────
  catalog: {
    /** What changed in the price list — since `sinceVersion`, else the latest upload. */
    lvChanges: (sinceVersion?: number) =>
      request<CatalogChanges>(`/catalog/lv/changes${sinceVersion ? `?since=${sinceVersion}` : ""}`),
  },

  // ── Account (profile, history, stats) ───────────────────────────────────────
  account: {
    updateProfile: (data: { name?: string; photo?: string | null }) =>
      request<{ user: AuthUser }>("/profile", { method: "PUT", body: JSON.stringify(data) }),
    history: () => request<{ items: HistoryItem[] }>("/account/history"),
    weekly: () => request<{ weeks: WeekStat[] }>("/stats/weekly"),
  },

  // ── In-app notifications ────────────────────────────────────────────────────
  notifications: {
    list: () => request<{ items: NotificationDto[]; unread: number }>("/notifications"),
    read: (id: string) => request<{ ok: true }>(`/notifications/${id}/read`, { method: "POST" }),
    readAll: () => request<{ ok: true }>("/notifications/read-all", { method: "POST" }),
  },

  // ── Access Center ───────────────────────────────────────────────────────────
  access: {
    /** What the signed-in user may do. Every gate in the UI reads this. */
    me: () => request<MyAccess>("/access/me"),
    catalogue: () =>
      request<{ tiers: string[]; perms: { key: string; label: string }[] }>("/access/catalogue"),
    users: () => request<{ users: AccessUser[] }>("/access/users"),
    setAccess: (id: string, data: { tier?: string; perms?: string[] }) =>
      request<{ ok: true }>(`/access/users/${id}`, { method: "POST", body: JSON.stringify(data) }),
    history: () => request<{ items: PriceChangeRow[] }>("/access/history"),
  },
};
