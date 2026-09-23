import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { LIVE_MILESTONES, type Milestone } from "./milestones";

/**
 * Watches the signed-in user's completed-panel count and surfaces the highest milestone they have
 * reached but not yet seen. "Seen" milestones are stored per user on the server (falling back to a
 * per-user localStorage key when the server field isn't available), so a milestone never shows twice
 * — not after a refresh, a logout, or on another device.
 *
 * Returns the milestone to celebrate plus markSeen() to record it, or null when there's nothing new.
 */
export function useMilestoneCheck(): { milestone: Milestone; markSeen: () => void } | null {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [pending, setPending] = useState<Milestone | null>(null);
  const [seen, setSeen] = useState<number[] | null>(null); // null until loaded

  const lsKey = userId ? `pl-achievements-${userId}` : "";
  const readLocalSeen = useCallback((): number[] => {
    try { return JSON.parse(localStorage.getItem(lsKey) || "[]"); } catch { return []; }
  }, [lsKey]);

  // Load the seen list for this user (server first, localStorage fallback).
  useEffect(() => {
    if (!userId) { setSeen(null); return; }
    let alive = true;
    api.achievements.seen()
      .then((r) => { if (alive) setSeen(r.seen); })
      .catch(() => { if (alive) setSeen(readLocalSeen()); }); // no backend / offline
    return () => { alive = false; };
  }, [userId, readLocalSeen]);

  // Poll the completed-panel count; when it reaches an unseen milestone, queue the highest one.
  useEffect(() => {
    if (!userId || seen === null) return;
    let alive = true;
    const check = async () => {
      let count = 0;
      try { count = (await api.achievements.completedCount()).count; } catch { return; }
      if (!alive) return;
      // Highest live milestone whose threshold is reached and not yet seen.
      const hit = [...LIVE_MILESTONES]
        .filter((m) => count >= m.count && !seen.includes(m.count))
        .sort((a, b) => b.count - a.count)[0];
      if (hit) setPending(hit);
    };
    void check();
    const t = setInterval(() => void check(), 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [userId, seen]);

  const markSeen = useCallback(() => {
    if (!pending) return;
    const next = seen ? [...new Set([...seen, pending.count])] : [pending.count];
    setSeen(next);
    setPending(null);
    try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* ignore */ }
    api.achievements.markSeen(pending.count).catch(() => { /* localStorage already holds it */ });
  }, [pending, seen, lsKey]);

  return pending ? { milestone: pending, markSeen } : null;
}
