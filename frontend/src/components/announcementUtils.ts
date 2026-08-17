// Pure scheduling helpers for announcements. Times are epoch-millisecond numbers
// throughout (the API serves start/end as ms). Kept side-effect-free so the
// dashboard card and the owner admin screen can share one source of truth.
import type { Announcement } from "../api";

export const H = 3600e3;
export const D = 24 * H;

export function isActive(a: Announcement, nowMs = Date.now()): boolean {
  return a.published && a.start <= nowMs && a.end > nowMs;
}

export type AnnStatus = "unpublished" | "expired" | "scheduled" | "active";
export function statusOf(a: Announcement, nowMs = Date.now()): AnnStatus {
  if (!a.published) return "unpublished";
  if (a.end <= nowMs) return "expired";
  if (a.start > nowMs) return "scheduled";
  return "active";
}

export type RemainTone = "off" | "none" | "soon" | "ok";
export function remaining(a: Announcement, nowMs = Date.now()): { text: string; tone: RemainTone } {
  if (!a.published) return { text: "Hidden", tone: "off" };
  if (a.end <= nowMs) return { text: "Expired", tone: "none" };
  if (a.start > nowMs) return { text: "Scheduled", tone: "off" };
  const left = a.end - nowMs;
  const d = Math.floor(left / D);
  const h = Math.floor((left % D) / H);
  const m = Math.floor((left % H) / 60e3);
  const text = d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  return { text, tone: left < 6 * H ? "soon" : "ok" };
}

export function activeForUsers(list: Announcement[], nowMs = Date.now()): Announcement[] {
  return list.filter((a) => isActive(a, nowMs)).sort((x, y) => y.start - x.start);
}

export type WindowMode = "hours" | "days" | "custom";
export function computeWindow(
  mode: WindowMode,
  { value, startMs, endMs }: { value?: number; startMs?: number; endMs?: number } = {},
  nowMs = Date.now(),
): { start: number; end: number } {
  if (mode === "custom") return { start: startMs ?? nowMs, end: endMs ?? nowMs };
  const start = startMs ?? nowMs;
  const span = mode === "hours" ? (value ?? 0) * H : (value ?? 0) * D;
  return { start, end: start + span };
}

export const fmt = (ms: number): string =>
  new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
