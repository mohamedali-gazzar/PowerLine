import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";

/** GET /api/notifications?unread=1 → { items, unread } */
export async function listNotifications(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const onlyUnread = req.query.unread === "1";
    const items = await prisma.notification.findMany({
      where: { userId, ...(onlyUnread ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unread = await prisma.notification.count({ where: { userId, readAt: null } });
    res.json({ items, unread });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/notifications/:id/read */
export async function markRead(req: Request, res: Response) {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.userId as string, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/notifications/read-all */
export async function markAllRead(req: Request, res: Response) {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId as string, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
