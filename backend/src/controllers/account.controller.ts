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

// GET /api/stats/stale-prices → the current user's OPEN (unsubmitted) LV quotations
// that need bringing in line with the catalogue: they contain a component whose PRICE
// moved in the latest price update (read from the PriceChange audit trail) and whose
// frozen line is still the old one, OR a component that was RETIRED from the list and
// can no longer be quoted. A QTN holding none of these is never flagged, even if other
// prices in it drifted in older versions. changedCount = how many of its lines need
// updating. `applied` lists open QTNs explicitly re-priced to the current version
// (their "prices updated" mark). Empty while prices were never published from the DB
// (version 0). Submitted quotations are never scanned — they are frozen.
type StatePeek = {
  panels?: Array<{ components?: Array<{ ref?: string; eur?: number; egp?: number; spacer?: boolean }> }>;
  pricesAppliedVersion?: number;
};
export async function stalePricedQtns(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const book = await prisma.priceBook.findUnique({
      where: { id: "singleton" },
      select: { version: true, publishedAt: true },
    });
    if (!book || book.version < 1) {
      res.json({ version: 0, publishedAt: null, items: [], applied: [] });
      return;
    }
    // The components whose PRICE actually moved in the latest publish (the audit
    // trail stamps each change with the version it went live in). Only quotations
    // containing one of these are candidates — that is what makes "the change was
    // Himel, so a QTN with no Himel isn't flagged" true. Keyed by reference, with
    // today's price so an already-applied QTN (frozen == current) drops out.
    // The most recent publish that actually MOVED component prices — not simply the
    // newest version, so a later enclosure-only or item-retire publish can't blank
    // the alert and hide quotations the last price update still affects.
    const lastPriced = await prisma.priceChange.findFirst({
      where: { domain: "LV", entity: "LvComponent", field: "price", version: { not: null } },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const changeVersion = lastPriced?.version ?? 0;
    const changeRows = changeVersion
      ? await prisma.priceChange.findMany({
          where: { domain: "LV", version: changeVersion, entity: "LvComponent", field: "price" },
          select: { entityId: true },
        })
      : [];
    const changedIds = [...new Set(changeRows.map((r) => r.entityId))];
    const changedPriceByRef = new Map<string, { eur: number; egp: number }>();
    if (changedIds.length) {
      const changed = await prisma.lvComponent.findMany({
        where: { id: { in: changedIds } },
        select: { ref: true, eur: true, egp: true },
      });
      for (const c of changed) if (c.ref) changedPriceByRef.set(c.ref, { eur: c.eur, egp: c.egp });
    }
    // Components retired from the price list (active === false). A quotation still
    // holding one can't be quoted as-is, so it needs updating whenever that happens —
    // independent of a price move.
    const retired = await prisma.lvComponent.findMany({ where: { active: false }, select: { ref: true } });
    const retiredRefs = new Set<string>();
    for (const c of retired) if (c.ref) retiredRefs.add(c.ref);

    const rows = await prisma.lvQtn.findMany({
      where: { ownerId, submitted: false },
      orderBy: { updatedAt: "desc" },
      select: { id: true, number: true, projectName: true, customer: true, updatedAt: true, state: true },
    });

    const items: Array<{
      id: string; number: string; projectName: string; customer: string;
      updatedAt: Date; changedCount: number; link: string;
    }> = [];
    const applied: string[] = [];

    for (const r of rows) {
      let st: StatePeek;
      try { st = JSON.parse(r.state) as StatePeek; } catch { continue; }
      let changed = 0;
      for (const p of st.panels ?? []) {
        for (const c of p.components ?? []) {
          if (!c || c.spacer || !c.ref) continue;
          if (retiredRefs.has(c.ref)) { changed += 1; continue; } // discontinued item still in the QTN
          const cur = changedPriceByRef.get(c.ref);
          if (cur && (cur.eur !== c.eur || cur.egp !== c.egp)) changed += 1;
        }
      }
      if (changed > 0) {
        items.push({
          id: r.id, number: r.number, projectName: r.projectName,
          customer: r.customer, updatedAt: r.updatedAt, changedCount: changed,
          link: `/lv/qtn/${r.id}`,
        });
      } else if (Number(st.pricesAppliedVersion) === book.version) {
        applied.push(r.id);
      }
    }

    res.json({ version: book.version, publishedAt: book.publishedAt, items, applied });
  } catch (e) {
    fail(res, e);
  }
}

// GET /api/stats/evaluation?period=month|quarter → the estimator performance panel:
// four "you vs team median" metrics over 4 buckets (weekly for month, ~3-weekly for
// quarter): QTN submissions, panels quoted, rework returns (lower is better) and the
// first-time-clean rate. The team benchmark is the MEDIAN + your percentile, so one
// person's outlier/absence doesn't skew it.
export async function estimatorEval(req: Request, res: Response) {
  try {
    const me = req.userId as string;
    const period = req.query.period === "quarter" ? "quarter" : "month";
    const bucketDays = period === "quarter" ? 21 : 7;
    const windowDays = bucketDays * 4;

    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const today = startOfDay(new Date());
    const since = new Date(today); since.setDate(since.getDate() - (windowDays - 1));
    // Look back further for RETURNs so a QTN returned earlier, then approved inside
    // the window, still counts against its first-time-clean rate.
    const returnLookback = new Date(today); returnLookback.setDate(returnLookback.getDate() - windowDays * 2);

    const bucketOf = (d: Date) => {
      const i = Math.floor((startOfDay(d).getTime() - since.getTime()) / (bucketDays * 86_400_000));
      return i < 0 || i > 3 ? -1 : i;
    };

    const [lvQtns, offers, events] = await Promise.all([
      prisma.lvQtn.findMany({ where: { submittedAt: { gte: since } }, select: { submittedAt: true, ownerId: true, panelsCount: true } }),
      prisma.offer.findMany({ where: { submittedAt: { gte: since } }, select: { submittedAt: true, ownerId: true } }),
      prisma.qtnEvent.findMany({ where: { action: { in: ["APPROVE", "RETURN"] }, createdAt: { gte: returnLookback } }, select: { action: true, ownerId: true, qtnId: true, createdAt: true } }),
    ]);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const median = (vals: number[]) => {
      if (!vals.length) return 0;
      const s = [...vals].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const pctLabel = (vals: number[], mine: number, higherBetter: boolean) => {
      const n = vals.length;
      if (n <= 1) return "";
      if (higherBetter) {
        const above = vals.filter((v) => v > mine).length; // people ahead of you
        return `top ${Math.max(1, Math.round(((above + 1) / n) * 100))}%`;
      }
      const worse = vals.filter((v) => v > mine).length; // people with a higher (worse) value
      return `better than ${Math.round((worse / n) * 100)}%`;
    };
    const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
    const val = (m: Map<string, number>, k: string) => m.get(k) ?? 0;

    // 1) QTN submissions (LV + RMU)
    const subByUser = new Map<string, number>();
    const subWeeks = [0, 0, 0, 0];
    const addSub = (ownerId: string | null, at: Date | null) => {
      if (!ownerId || !at) return;
      const b = bucketOf(at);
      if (b < 0) return;
      bump(subByUser, ownerId);
      if (ownerId === me) subWeeks[b] += 1;
    };
    for (const q of lvQtns) addSub(q.ownerId, q.submittedAt);
    for (const o of offers) addSub(o.ownerId, o.submittedAt);

    // 2) Panels quoted (LV) + LV submissions (the rework denominator)
    const panByUser = new Map<string, number>();
    const panWeeks = [0, 0, 0, 0];
    const lvSubByUser = new Map<string, number>();
    const lvSubWeeks = [0, 0, 0, 0];
    for (const q of lvQtns) {
      if (!q.ownerId || !q.submittedAt) continue;
      const b = bucketOf(q.submittedAt);
      if (b < 0) continue;
      bump(panByUser, q.ownerId, q.panelsCount || 0);
      bump(lvSubByUser, q.ownerId);
      if (q.ownerId === me) { panWeeks[b] += q.panelsCount || 0; lvSubWeeks[b] += 1; }
    }

    // 3) Rework returns (lower is better)
    const retByUser = new Map<string, number>();
    const retWeeks = [0, 0, 0, 0];
    const returnedEver = new Set<string>();
    for (const e of events) {
      if (e.action !== "RETURN") continue;
      returnedEver.add(e.qtnId);
      if (!e.ownerId) continue;
      const b = bucketOf(e.createdAt);
      if (b < 0) continue;
      bump(retByUser, e.ownerId);
      if (e.ownerId === me) retWeeks[b] += 1;
    }
    const reworkWeeks = retWeeks.map((r, i) => round2(r / Math.max(1, lvSubWeeks[i])));
    const youRework = round2(val(retByUser, me) / Math.max(1, val(lvSubByUser, me)));
    const reworkRates: number[] = [];
    for (const [u, sub] of lvSubByUser) reworkRates.push(round2(val(retByUser, u) / Math.max(1, sub)));

    // 4) First-time-clean rate (approved with no RETURN ever)
    const apprByUser = new Map<string, number>();
    const cleanByUser = new Map<string, number>();
    const apprWeeks = [0, 0, 0, 0];
    const cleanWeeks = [0, 0, 0, 0];
    for (const e of events) {
      if (e.action !== "APPROVE" || !e.ownerId) continue;
      const b = bucketOf(e.createdAt);
      if (b < 0) continue;
      bump(apprByUser, e.ownerId);
      const clean = !returnedEver.has(e.qtnId);
      if (clean) bump(cleanByUser, e.ownerId);
      if (e.ownerId === me) { apprWeeks[b] += 1; if (clean) cleanWeeks[b] += 1; }
    }
    const cleanPctWeeks = apprWeeks.map((a, i) => Math.round((cleanWeeks[i] / Math.max(1, a)) * 100));
    const youClean = Math.round((val(cleanByUser, me) / Math.max(1, val(apprByUser, me))) * 100);
    const cleanRates: number[] = [];
    for (const [u, appr] of apprByUser) cleanRates.push(Math.round((val(cleanByUser, u) / Math.max(1, appr)) * 100));
    const cleanMedian = Math.round(median(cleanRates));

    res.json({
      period,
      submissions: { weeks: subWeeks, youTotal: val(subByUser, me), teamMedian: Math.round(median([...subByUser.values()])), percentileLabel: pctLabel([...subByUser.values()], val(subByUser, me), true) },
      panels: { weeks: panWeeks, youTotal: val(panByUser, me), teamMedian: Math.round(median([...panByUser.values()])), percentileLabel: pctLabel([...panByUser.values()], val(panByUser, me), true) },
      rework: { weeks: reworkWeeks, youRate: youRework, teamMedian: round2(median(reworkRates)), percentileLabel: pctLabel(reworkRates, youRework, false) },
      clean: { weeks: cleanPctWeeks, youAvg: youClean, teamMedian: cleanMedian, deltaPts: youClean - cleanMedian },
    });
  } catch (e) {
    fail(res, e);
  }
}
