import type { Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma";
import { createQtnSchema, updateQtnSchema, numberSchema } from "../validation/qtn.schema";
import { fail } from "../lib/http";

type Summary = {
  projectName?: string;
  customer?: string;
  panelsCount?: number;
  totalEgp?: number;
};

type QtnRow = {
  id: string;
  number: string;
  createdAt: Date;
  updatedAt: Date;
  state: string;
  submitted: boolean;
  projectName: string;
  customer: string;
  panelsCount: number;
  totalEgp: number;
};

const record = (q: QtnRow) => {
  let state: unknown = {};
  try {
    state = JSON.parse(q.state);
  } catch {
    // A corrupt/legacy state row shouldn't crash the request — return an empty state.
  }
  return {
    id: q.id,
    number: q.number,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    submitted: q.submitted,
    state,
  };
};

const listItem = (q: QtnRow) => ({
  id: q.id,
  number: q.number,
  updatedAt: q.updatedAt,
  projectName: q.projectName,
  customer: q.customer,
  panels: q.panelsCount,
  totalEgp: q.totalEgp,
  submitted: q.submitted,
});

function summaryData(s?: Summary) {
  return {
    projectName: s?.projectName ?? "",
    customer: s?.customer ?? "",
    panelsCount: s?.panelsCount ?? 0,
    totalEgp: s?.totalEgp ?? 0,
  };
}

async function numberTaken(ownerId: string, number: string, exceptId?: string) {
  const n = number.trim().toLowerCase();
  const rows = await prisma.lvQtn.findMany({ where: { ownerId }, select: { id: true, number: true } });
  return rows.some((r) => r.id !== exceptId && r.number.trim().toLowerCase() === n);
}

const yy = () => String(new Date().getFullYear() % 100).padStart(2, "0");

async function nextNumber(ownerId: string): Promise<string> {
  const rows = await prisma.lvQtn.findMany({ where: { ownerId }, select: { number: true } });
  let max = 0;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(r.number);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `QTN-${yy()}-${String(max + 1).padStart(4, "0")}`;
}

// GET /api/qtns
export async function list(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const rows = await prisma.lvQtn.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } });
    res.json(rows.map(listItem));
  } catch (e) {
    fail(res, e);
  }
}

// GET /api/qtns/next-number
export async function getNextNumber(req: Request, res: Response) {
  try {
    res.json({ suggestion: await nextNumber(req.userId as string) });
  } catch (e) {
    fail(res, e);
  }
}

// GET /api/qtns/:id
export async function getOne(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const q = await prisma.lvQtn.findFirst({ where: { id: req.params.id, ownerId } });
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    res.json(record(q));
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/qtns  { number, state, summary }
export async function create(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const { number, state, summary } = createQtnSchema.parse(req.body);
    if (await numberTaken(ownerId, number)) {
      return res.status(409).json({ error: "A quotation with this number already exists." });
    }
    const q = await prisma.lvQtn.create({
      data: {
        ownerId,
        number: number.trim(),
        state: JSON.stringify(state ?? {}),
        ...summaryData(summary),
      },
    });
    res.status(201).json(record(q));
  } catch (e) {
    fail(res, e);
  }
}

// PUT /api/qtns/:id  { state, summary }  — debounced live-save from the configurator
export async function update(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const { state, summary } = updateQtnSchema.parse(req.body);
    const q = await prisma.lvQtn.findFirst({ where: { id: req.params.id, ownerId } });
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    await prisma.lvQtn.update({
      where: { id: q.id },
      data: { state: JSON.stringify(state ?? {}), ...summaryData(summary) },
    });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}

// PATCH /api/qtns/:id/number  { number } → { ok, error? }  (200 even on dup)
export async function rename(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const { number } = numberSchema.parse(req.body);
    const q = await prisma.lvQtn.findFirst({ where: { id: req.params.id, ownerId } });
    if (!q) return res.json({ ok: false, error: "Quotation not found." });
    if (await numberTaken(ownerId, number, q.id)) {
      return res.json({ ok: false, error: "A quotation with this number already exists." });
    }
    await prisma.lvQtn.update({ where: { id: q.id }, data: { number: number.trim() } });
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError) {
      return res.json({ ok: false, error: e.issues[0]?.message || "Invalid number." });
    }
    fail(res, e);
  }
}

// DELETE /api/qtns/:id
export async function remove(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    await prisma.lvQtn.deleteMany({ where: { id: req.params.id, ownerId } });
    res.status(204).end();
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/qtns/:id/duplicate
export async function duplicate(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const src = await prisma.lvQtn.findFirst({ where: { id: req.params.id, ownerId } });
    if (!src) return res.status(404).json({ error: "Quotation not found." });
    const q = await prisma.lvQtn.create({
      data: {
        ownerId,
        number: await nextNumber(ownerId),
        state: src.state,
        projectName: src.projectName,
        customer: src.customer,
        panelsCount: src.panelsCount,
        totalEgp: src.totalEgp,
      },
    });
    res.status(201).json(record(q));
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/qtns/:id/submit  — marks the quotation submitted (feeds the charts)
export async function submit(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const q = await prisma.lvQtn.findFirst({ where: { id: req.params.id, ownerId } });
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    await prisma.lvQtn.update({
      where: { id: q.id },
      data: { submitted: true, submittedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
