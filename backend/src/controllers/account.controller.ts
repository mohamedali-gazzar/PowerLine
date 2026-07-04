import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { profileSchema } from "../validation/account.schema";
import { pub, fail } from "../lib/http";

// PUT /api/profile  { name?, photo? }
export async function updateProfile(req: Request, res: Response) {
  try {
    const { name, photo } = profileSchema.parse(req.body);
    const data: { name?: string; photo?: string | null } = {};
    if (name !== undefined) data.name = name;
    if (photo !== undefined) data.photo = photo;
    const user = await prisma.user.update({ where: { id: req.userId }, data });
    res.json({ user: pub(user) });
  } catch (e) {
    fail(res, e);
  }
}

// GET /api/account/history → the user's LV quotations + RMU offers, newest first
export async function history(req: Request, res: Response) {
  try {
  const ownerId = req.userId as string;
  const [lv, rmu] = await Promise.all([
    prisma.lvQtn.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }),
    prisma.offer.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }),
  ]);
  const items = [
    ...lv.map((q) => ({
      kind: "LV" as const,
      id: q.id,
      number: q.number,
      projectName: q.projectName,
      customer: q.customer,
      updatedAt: q.updatedAt,
      submitted: q.submitted,
      link: `/lv/qtn/${q.id}`,
    })),
    ...rmu.map((o) => ({
      kind: "RMU" as const,
      id: o.id,
      number: o.offerNumber,
      projectName: o.projectName,
      customer: o.customer,
      updatedAt: o.updatedAt,
      submitted: Boolean(o.submittedAt),
      link: `/offers/${o.id}`,
    })),
  ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  res.json({ items });
  } catch (e) {
    fail(res, e);
  }
}

// GET /api/stats/weekly → submitted-QTN counts per week (LV submitted + RMU
// created), total across all users plus the current user's share.
export async function weeklyStats(req: Request, res: Response) {
  try {
  const ownerId = req.userId as string;
  const WEEKS = 8;

  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // Monday = 0
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - day);
    return x;
  };
  const thisWeek = startOfWeek(new Date());
  const since = new Date(thisWeek);
  since.setDate(since.getDate() - 7 * (WEEKS - 1));

  const [lv, rmu] = await Promise.all([
    prisma.lvQtn.findMany({
      where: { submitted: true, submittedAt: { gte: since } },
      select: { submittedAt: true, ownerId: true },
    }),
    prisma.offer.findMany({
      where: { submittedAt: { gte: since } },
      select: { submittedAt: true, ownerId: true },
    }),
  ]);

  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const ws = new Date(since);
    ws.setDate(ws.getDate() + 7 * i);
    return {
      weekStart: ws.toISOString().slice(0, 10),
      label: `${ws.getDate()}/${ws.getMonth() + 1}`,
      total: 0,
      mine: 0,
    };
  });

  const weekIndex = (d: Date) =>
    Math.floor((startOfWeek(d).getTime() - since.getTime()) / (7 * 86_400_000));

  const tally = (rows: { submittedAt: Date | null; ownerId: string | null }[]) => {
    for (const r of rows) {
      if (!r.submittedAt) continue;
      const i = weekIndex(r.submittedAt);
      if (i < 0 || i >= WEEKS) continue;
      buckets[i].total += 1;
      if (r.ownerId === ownerId) buckets[i].mine += 1;
    }
  };
  tally(lv);
  tally(rmu);

  res.json({ weeks: buckets });
  } catch (e) {
    fail(res, e);
  }
}
