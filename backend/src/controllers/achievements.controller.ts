import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { qtnStatus } from "../domain/qtnStatus";

// Milestone achievements, per signed-in user. Two concerns:
//   • which milestones the user has already been shown — stored on the user as a JSON array
//     of thresholds (User.achievementsSeen), so a celebration never fires twice, not after a
//     refresh, a logout, or on another device;
//   • how many panels the user has "completed" — the panels in the quotations they OWN that
//     have left Draft (and are not a superseded / Cancelled revision, which would double-count
//     a job that was amended). Removed quotations are excluded.
// Every handler is scoped to req.userId, so achievements are strictly per-user.

function parseSeen(s: string | null | undefined): number[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

/** GET /api/achievements/seen — the milestone thresholds this user has already been shown. */
export async function getSeen(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { achievementsSeen: true } });
    res.json({ seen: parseSeen(user?.achievementsSeen) });
  } catch (e) {
    console.error("[achievements] getSeen failed", e);
    res.status(500).json({ error: "Could not load achievements." });
  }
}

/** POST /api/achievements/seen { count } — record that a milestone has been shown, so it is
 *  never shown again. Idempotent: re-recording the same milestone just returns the set. */
export async function postSeen(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const count = Number(req.body?.count);
    if (!Number.isFinite(count) || count <= 0) {
      return res.status(400).json({ error: "A milestone count is required." });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { achievementsSeen: true } });
    const seen = [...new Set([...parseSeen(user?.achievementsSeen), Math.round(count)])].sort((a, b) => a - b);
    await prisma.user.update({ where: { id: userId }, data: { achievementsSeen: JSON.stringify(seen) } });
    res.json({ ok: true, seen });
  } catch (e) {
    console.error("[achievements] postSeen failed", e);
    res.status(500).json({ error: "Could not save the achievement." });
  }
}

/** GET /api/achievements/completed-count — the total panels this user has completed: the sum of
 *  panelsCount across the quotations they own whose effective status has left Draft and is not a
 *  superseded (Cancelled) revision. Removed quotations don't count. */
export async function getCompletedCount(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const rows = await prisma.lvQtn.findMany({
      where: { ownerId: userId, removedAt: null },
      select: { status: true, submitted: true, panelsCount: true },
    });
    let count = 0;
    for (const r of rows) {
      const s = qtnStatus(r);
      if (s !== "DRAFT" && s !== "CANCELLED") count += r.panelsCount || 0;
    }
    res.json({ count });
  } catch (e) {
    console.error("[achievements] getCompletedCount failed", e);
    res.status(500).json({ error: "Could not load the completed-panel count." });
  }
}
