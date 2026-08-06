import type { Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma";
import {
  createQtnSchema,
  updateQtnSchema,
  numberSchema,
  attachmentSchema,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_QTN,
} from "../validation/qtn.schema";
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
    // Carry the Specs-tab files over too — a duplicate is usually a new revision
    // of the same job, and the client's specs still apply to it.
    const files = await prisma.lvAttachment.findMany({ where: { qtnId: src.id } });
    if (files.length) {
      await prisma.lvAttachment.createMany({
        data: files.map((f) => ({
          qtnId: q.id, name: f.name, mime: f.mime, size: f.size, data: f.data, byEmail: f.byEmail,
        })),
      });
    }
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

// POST /api/qtns/:id/unsubmit  — reopens a submitted quotation for editing (drops it
// back out of the submitted counts until it is submitted again)
export async function unsubmit(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const q = await prisma.lvQtn.findFirst({ where: { id: req.params.id, ownerId } });
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    await prisma.lvQtn.update({
      where: { id: q.id },
      data: { submitted: false, submittedAt: null },
    });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}

// ── Specs-tab attachments ───────────────────────────────────────────────────
// Kept out of LvQtn.state on purpose: that JSON is re-saved on an 800 ms debounce
// while the user types, so a file living in it would be re-uploaded on every
// keystroke. These endpoints move the bytes exactly once.

/** The quotation, if it belongs to the caller. Every attachment route goes
 *  through this, so a file is only ever reachable via its own quotation. */
async function ownedQtn(req: Request) {
  return prisma.lvQtn.findFirst({
    where: { id: req.params.id, ownerId: req.userId as string },
    select: { id: true, submitted: true },
  });
}

// GET /api/qtns/:id/attachments  → metadata only (never the bytes, so opening the
// Specs tab stays light no matter how much is attached)
export async function listAttachments(req: Request, res: Response) {
  try {
    const q = await ownedQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    const rows = await prisma.lvAttachment.findMany({
      where: { qtnId: q.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, mime: true, size: true, byEmail: true, createdAt: true },
    });
    res.json(rows);
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/qtns/:id/attachments  { name, mime, data }  — data is plain base64
export async function uploadAttachment(req: Request, res: Response) {
  try {
    const q = await ownedQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    if (q.submitted) return res.status(409).json({ error: "Submitted — reopen the QTN to attach files." });
    const { name, mime, data } = attachmentSchema.parse(req.body);
    // Decode to measure the REAL size and to reject anything that isn't valid
    // base64 — the client-reported length can't be trusted.
    const buf = Buffer.from(data, "base64");
    if (!buf.length) return res.status(400).json({ error: "File is empty or not valid base64." });
    if (buf.length > MAX_ATTACHMENT_BYTES) {
      return res.status(413).json({
        error: `"${name}" is too large. The limit is ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB per file.`,
      });
    }
    const count = await prisma.lvAttachment.count({ where: { qtnId: q.id } });
    if (count >= MAX_ATTACHMENTS_PER_QTN) {
      return res.status(409).json({ error: `This QTN already has ${MAX_ATTACHMENTS_PER_QTN} attachments.` });
    }
    const row = await prisma.lvAttachment.create({
      data: {
        qtnId: q.id,
        name,
        mime: mime || "application/octet-stream",
        size: buf.length,
        data: buf.toString("base64"), // re-encoded, so what we store is canonical
        byEmail: req.userEmail ?? "",
      },
      select: { id: true, name: true, mime: true, size: true, byEmail: true, createdAt: true },
    });
    res.status(201).json(row);
  } catch (e) {
    fail(res, e);
  }
}

// GET /api/qtns/:id/attachments/:fileId  — streams the file itself. A plain browser
// navigation, so it authenticates via ?t= (see middleware/auth readToken).
export async function downloadAttachment(req: Request, res: Response) {
  try {
    const q = await ownedQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    const f = await prisma.lvAttachment.findFirst({ where: { id: req.params.fileId, qtnId: q.id } });
    if (!f) return res.status(404).json({ error: "File not found." });
    const buf = Buffer.from(f.data, "base64");
    res.setHeader("Content-Type", f.mime || "application/octet-stream");
    res.setHeader("Content-Length", String(buf.length));
    // ?dl=1 forces a download; otherwise the browser may preview it (PDFs, images).
    const disp = req.query.dl === "1" ? "attachment" : "inline";
    // RFC 5987 filename* carries non-ASCII names (Arabic file names) intact.
    const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    res.setHeader(
      "Content-Disposition",
      `${disp}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`
    );
    res.send(buf);
  } catch (e) {
    fail(res, e);
  }
}

// DELETE /api/qtns/:id/attachments/:fileId
export async function removeAttachment(req: Request, res: Response) {
  try {
    const q = await ownedQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    if (q.submitted) return res.status(409).json({ error: "Submitted — reopen the QTN to remove files." });
    await prisma.lvAttachment.deleteMany({ where: { id: req.params.fileId, qtnId: q.id } });
    res.status(204).end();
  } catch (e) {
    fail(res, e);
  }
}
