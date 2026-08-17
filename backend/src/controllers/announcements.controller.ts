// Owner-posted announcements shown at the top of the Home dashboard.
//
// Two audiences, two read endpoints:
//   • every signed-in user gets ONLY the currently-active ones (published and
//     inside their window) — filtered server-side so scheduled/unpublished text
//     never reaches a browser before its time;
//   • an owner (access.manage) gets EVERY announcement, to manage them.
//
// Times are stored as DateTime and served to the client as epoch-MILLISECOND
// numbers, because the frontend's announcementUtils.ts works in ms (a 32-bit Int
// column cannot hold an ms epoch). Every handler is wrapped in try/catch: an
// unhandled throw in async middleware hangs the request forever under Express 4.

import type { Request, Response } from "express";
import type { Announcement } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";

const TYPES = ["News", "Maintenance", "Alert"] as const;
const PRIORITIES = ["High", "Medium", "Low"] as const;

const createSchema = z.object({
  type: z.enum(TYPES).default("News"),
  priority: z.enum(PRIORITIES).default("Medium"),
  title: z.string().trim().min(1, "A title is required."),
  body: z.string().default(""),
  start: z.number().int("Give the start time as a number of milliseconds."),
  end: z.number().int("Give the end time as a number of milliseconds."),
  published: z.boolean().default(false),
});
// Every field optional for a partial edit (publish toggle, reschedule, …).
const patchSchema = createSchema.partial();

/** Row → client shape: DateTime becomes epoch-ms so announcementUtils can use it. */
const toClient = (a: Announcement) => ({
  id: a.id,
  type: a.type,
  priority: a.priority,
  title: a.title,
  body: a.body,
  start: a.start.getTime(),
  end: a.end.getTime(),
  published: a.published,
  createdBy: a.createdBy,
  updatedAt: a.updatedAt.getTime(),
});

/** GET /api/announcements — the active ones, for every signed-in user. */
export async function listActiveAnnouncements(_req: Request, res: Response) {
  try {
    const now = new Date();
    const rows = await prisma.announcement.findMany({
      where: { published: true, start: { lte: now }, end: { gt: now } },
      orderBy: { start: "desc" },
    });
    res.json({ announcements: rows.map(toClient) });
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/announcements/all — every announcement, owner only (management). */
export async function listAllAnnouncements(_req: Request, res: Response) {
  try {
    const rows = await prisma.announcement.findMany({ orderBy: { start: "desc" } });
    res.json({ announcements: rows.map(toClient) });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/announcements — owner only. */
export async function createAnnouncement(req: Request, res: Response) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const v = parsed.data;
    if (v.end <= v.start) return res.status(400).json({ error: "The end time must be after the start time." });
    const row = await prisma.announcement.create({
      data: {
        type: v.type,
        priority: v.priority,
        title: v.title.trim(),
        body: v.body,
        start: new Date(v.start),
        end: new Date(v.end),
        published: v.published,
        createdBy: req.userEmail ?? "",
      },
    });
    res.json({ announcement: toClient(row) });
  } catch (e) {
    fail(res, e);
  }
}

/** PATCH /api/announcements/:id — owner only. Edit / publish / reschedule. */
export async function updateAnnouncement(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "That announcement no longer exists." });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const v = parsed.data;
    // The window is validated against whatever the row will end up with.
    const start = v.start != null ? new Date(v.start) : existing.start;
    const end = v.end != null ? new Date(v.end) : existing.end;
    if (end <= start) return res.status(400).json({ error: "The end time must be after the start time." });
    const row = await prisma.announcement.update({
      where: { id },
      data: {
        ...(v.type != null && { type: v.type }),
        ...(v.priority != null && { priority: v.priority }),
        ...(v.title != null && { title: v.title.trim() }),
        ...(v.body != null && { body: v.body }),
        ...(v.start != null && { start }),
        ...(v.end != null && { end }),
        ...(v.published != null && { published: v.published }),
      },
    });
    res.json({ announcement: toClient(row) });
  } catch (e) {
    fail(res, e);
  }
}

/** DELETE /api/announcements/:id — owner only. */
export async function deleteAnnouncement(req: Request, res: Response) {
  try {
    await prisma.announcement.delete({ where: { id: String(req.params.id) } }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
