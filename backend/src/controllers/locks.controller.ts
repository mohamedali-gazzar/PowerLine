import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { accessOf } from "../middleware/roles";

// A review lock is considered FREE once its heartbeat is older than this — so a closed tab
// or crashed client never holds a quotation hostage. The client heartbeats well inside it.
const TTL_MS = 45_000;

/** POST /api/locks/:id  { force? } — acquire or refresh the "someone is reviewing this"
 *  lock on a quotation (LvQtn.id) or offer (Offer.id). Returns whether the caller now holds
 *  it, and who holds it when they don't. `force` lets an admin take over an active lock. */
export async function acquire(req: Request, res: Response) {
  try {
    const subjectId = req.params.id;
    const me = req.userId as string;
    if (!subjectId || !me) return res.status(400).json({ error: "Missing subject or user." });
    const force = req.body?.force === true;
    const now = Date.now();

    const existing = await prisma.reviewLock.findUnique({ where: { subjectId } });
    const held = existing && existing.heartbeatAt.getTime() >= now - TTL_MS; // a fresh, live lock
    const mineAlready = existing?.userId === me;

    let canTake = !held || mineAlready;
    if (!canTake && force) {
      const acc = await accessOf(me);
      canTake = acc.perms.has("access.manage"); // only an admin may steal a live lock
    }
    if (!canTake && existing) {
      return res.json({ mine: false, heldBy: { id: existing.userId, name: existing.userName, email: existing.userEmail } });
    }

    const u = await prisma.user.findUnique({ where: { id: me }, select: { name: true, email: true } });
    const data = { userId: me, userName: u?.name ?? "", userEmail: u?.email ?? "", heartbeatAt: new Date() };
    const lock = await prisma.reviewLock.upsert({
      where: { subjectId },
      create: { subjectId, ...data },
      update: data,
    });
    return res.json({ mine: true, heldBy: { id: lock.userId, name: lock.userName, email: lock.userEmail } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}

/** DELETE /api/locks/:id — release the lock, only if the caller holds it. */
export async function release(req: Request, res: Response) {
  try {
    const subjectId = req.params.id;
    const me = req.userId as string;
    if (subjectId && me) await prisma.reviewLock.deleteMany({ where: { subjectId, userId: me } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}
