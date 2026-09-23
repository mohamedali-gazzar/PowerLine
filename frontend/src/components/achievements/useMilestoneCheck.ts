import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { milestoneForCount, type Milestone } from "./milestones";
import { onPanelCount } from "./milestoneBus";

/**
 * Surfaces the milestone to celebrate the moment the open quotation's panel count reaches a threshold.
 * The configurator calls notePanelCount(count) whenever the panel count goes up — by "+ Add panel", by
 * duplicating, however; if that new total is exactly a milestone (10, 25, …) the user hasn't seen yet,
 * we celebrate it. "Seen" milestones are stored per user on the server (falling back to a per-user
 * localStorage key), so a milestone never shows twice — not after a refresh, a logout, or on another
 * device.
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

  // When the open quotation's panel count reaches a milestone (by any means), celebrate it if unseen.
  useEffect(() => {
    if (!userId || seen === null) return;
    return onPanelCount((count) => {
      const hit = milestoneForCount(count, seen);
      if (hit) setPending(hit);
    });
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
