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
import { accessOf, type Perm } from "../middleware/roles";
import {
  qtnStatus, statusWrite, isLocked, canMove, qtnAction,
  QTN_STATUSES, QTN_STATUS_LABEL, type QtnStatus,
} from "../domain/qtnStatus";
import { notify, notifyAll, approverIds } from "../services/notify.service";
import { originOf } from "../services/email.service";

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
  status?: string | null;
  statusAt?: Date | null;
  approverEmail?: string;
  approvedAt?: Date | null;
  returnReason?: string;
  submittedAt?: Date | null;
  submittedForApprovalAt?: Date | null;
  ownerId?: string;
  owner?: { email: string; name: string } | null;
  projectName: string;
  customer: string;
  panelsCount: number;
  totalEgp: number;
};

/** The workflow fields every QTN response carries, so the client never derives status. */
const workflowOf = (q: QtnRow) => ({
  status: qtnStatus(q),
  statusLabel: QTN_STATUS_LABEL[qtnStatus(q)],
  locked: isLocked(qtnStatus(q)),
  approverEmail: q.approverEmail ?? "",
  approvedAt: q.approvedAt ?? null,
  returnReason: q.returnReason ?? "",
  submittedForApprovalAt: q.submittedForApprovalAt ?? null,
});

const record = (q: QtnRow) => {
  let state: unknown = {};
  try {
    state = JSON.parse(q.state);
  } catch {
    // A corrupt/legacy state row shouldn't crash the request â€” return an empty state.
  }
  return {
    id: q.id,
    number: q.number,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    submitted: q.submitted, // legacy mirror, kept for older clients mid-rollout
    ...workflowOf(q),
    ownerId: q.ownerId ?? "",
    ownerEmail: q.owner?.email ?? "",
    ownerName: q.owner?.name ?? "",
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
  ...workflowOf(q),
  ownerId: q.ownerId ?? "",
  ownerEmail: q.owner?.email ?? "",
  ownerName: q.owner?.name ?? "",
});

// â”€â”€ Visibility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every QTN read used to be hard-scoped to `ownerId`, which meant an approver
// literally could not open the quotation they were being asked to approve. Reads
// widen for qtn.viewAll; WRITES stay owner-only â€” approvers review, they don't edit.

const ownerSelect = { owner: { select: { email: true, name: true } } } as const;

/** The QTN if the caller may SEE it. */
async function visibleQtn(req: Request) {
  const acc = await accessOf(req.userId);
  const where = acc.perms.has("qtn.viewAll")
    ? { id: req.params.id }
    : { id: req.params.id, ownerId: req.userId as string };
  return prisma.lvQtn.findFirst({ where, include: ownerSelect });
}

/** The QTN if the caller may WRITE its content (ownership only). */
async function writableQtn(req: Request) {
  return prisma.lvQtn.findFirst({
    where: { id: req.params.id, ownerId: req.userId as string },
    include: ownerSelect,
  });
}

/** 409 when the quotation's content is frozen by its status. */
function lockedResponse(res: Response, s: QtnStatus) {
  return res.status(409).json({
    error: `This quotation is ${QTN_STATUS_LABEL[s]} and cannot be edited. Withdraw or reopen it first.`,
    status: s,
  });
}

/** Append an audit row. Never updated, never deleted. */
async function logEvent(e: {
  qtn: { id: string; number: string; ownerId: string; owner?: { email: string } | null };
  action: string;
  from?: QtnStatus | null;
  to: QtnStatus;
  note?: string;
  actorId?: string;
  actorEmail?: string;
}) {
  return prisma.qtnEvent.create({
    data: {
      qtnId: e.qtn.id,
      qtnNumber: e.qtn.number,
      ownerId: e.qtn.ownerId,
      ownerEmail: e.qtn.owner?.email ?? "",
      action: e.action,
      fromStatus: e.from ?? null,
      toStatus: e.to,
      note: e.note ?? "",
      actorId: e.actorId ?? null,
      actorEmail: e.actorEmail ?? "",
    },
  });
}

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

// GET /api/qtns/:id â€” own it, or hold qtn.viewAll (an approver must be able to
// open what they are approving).
export async function getOne(req: Request, res: Response) {
  try {
    const q = await visibleQtn(req);
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
        status: "DRAFT",
        statusAt: new Date(),
        ...summaryData(summary),
      },
    });
    await logEvent({
      qtn: { ...q, owner: { email: req.userEmail ?? "" } },
      action: "CREATE", from: null, to: "DRAFT",
      actorId: req.userId, actorEmail: req.userEmail ?? "",
    });
    res.status(201).json(record(q));
  } catch (e) {
    fail(res, e);
  }
}

// PUT /api/qtns/:id  { state, summary }  â€” debounced live-save from the configurator
export async function update(req: Request, res: Response) {
  try {
    const { state, summary } = updateQtnSchema.parse(req.body);
    const q = await writableQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    // The real lock. Until now "read-only" was a React constant and the server
    // accepted writes regardless, so the debounced autosave could overwrite a
    // quotation that was already under approval.
    const s = qtnStatus(q);
    if (isLocked(s)) {
      const acc = await accessOf(req.userId);
      if (!(s === "WAITING_APPROVAL" && acc.perms.has("qtn.editWaiting"))) {
        return lockedResponse(res, s);
      }
    }
    await prisma.lvQtn.update({
      where: { id: q.id },
      data: { state: JSON.stringify(state ?? {}), ...summaryData(summary) },
    });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}

// PATCH /api/qtns/:id/number  { number } â†’ { ok, error? }  (200 even on dup)
export async function rename(req: Request, res: Response) {
  try {
    const ownerId = req.userId as string;
    const { number } = numberSchema.parse(req.body);
    const q = await writableQtn(req);
    if (!q) return res.json({ ok: false, error: "Quotation not found." });
    // Note the {ok:false} shape rather than a 4xx: the client's renameQtn only
    // treats THROWN errors as failures, so a real status code would break it.
    const s = qtnStatus(q);
    if (isLocked(s)) {
      return res.json({
        ok: false,
        error: `This quotation is ${QTN_STATUS_LABEL[s]} and cannot be renamed.`,
      });
    }
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
    // deleteMany used to return 204 whatever happened, so deleting a submitted
    // quotation looked like it worked. Only drafts and returned drafts can go.
    const q = await prisma.lvQtn.findFirst({ where: { id: req.params.id, ownerId } });
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    const s = qtnStatus(q);
    if (s !== "DRAFT" && s !== "RETURNED") return lockedResponse(res, s);
    await prisma.lvQtn.deleteMany({ where: { id: q.id, ownerId } });
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
    // Carry the Specs-tab files over too â€” a duplicate is usually a new revision
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

// â”€â”€ Workflow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Who may perform a given move, and why not. `null` = allowed. */
async function transitionDenial(
  req: Request,
  q: { ownerId: string },
  from: QtnStatus,
  to: QtnStatus,
  note: string
): Promise<string | null> {
  const acc = await accessOf(req.userId);
  const isOwner = q.ownerId === req.userId;
  const need = (p: Perm, msg: string) => (acc.perms.has(p) ? null : msg);

  if (to === "WAITING_APPROVAL") {
    return isOwner ? null : "Only the person who created this quotation can send it for approval.";
  }
  if (to === "APPROVED") {
    const denied = need("qtn.approve", "You do not have permission to approve quotations.");
    if (denied) return denied;
    // Self-approval is off unless explicitly granted.
    if (isOwner && !acc.perms.has("qtn.approveOwn")) {
      return "You cannot approve your own quotation â€” another approver must review it.";
    }
    return null;
  }
  if (to === "RETURNED") {
    const denied =
      need("qtn.return", "You do not have permission to return quotations for revision.") &&
      need("qtn.approve", "You do not have permission to return quotations for revision.");
    if (denied) return denied;
    if (!note.trim()) return "A reason is required when returning a quotation for revision.";
    return null;
  }
  if (to === "SUBMITTED") {
    if (isOwner) return null;
    return need("qtn.submitApproved", "Only the quotation's owner can submit it.");
  }
  if (to === "DRAFT") {
    if (from === "SUBMITTED") {
      return need("qtn.reopen", "You do not have permission to reopen a submitted quotation.");
    }
    return isOwner ? null : "Only the quotation's owner can withdraw it.";
  }
  return "Unsupported transition.";
}

/** Tell everyone who needs to know. Never throws â€” mail must not fail an approval. */
async function announce(
  q: { id: string; number: string; ownerId: string; projectName: string },
  to: QtnStatus,
  actorEmail: string,
  note: string,
  origin: string
) {
  const link = `/lv/qtn/${q.id}`;
  const when = new Date().toLocaleString("en-GB");
  const details: [string, string][] = [
    ["QTN", q.number],
    ["Project", q.projectName || "â€”"],
    ["Status", QTN_STATUS_LABEL[to]],
    ["By", actorEmail || "â€”"],
    ["When", when],
  ];
  try {
    if (to === "WAITING_APPROVAL") {
      const ids = (await approverIds()).filter((id) => id !== q.ownerId);
      await notifyAll(ids, {
        kind: "QTN_WAITING",
        title: `QTN ${q.number} is waiting for approval`,
        body: `${actorEmail} sent quotation ${q.number} for approval.`,
        link, qtnId: q.id, details, note, origin,
      });
      return;
    }
    if (to === "APPROVED") {
      await notify({
        userId: q.ownerId, kind: "QTN_APPROVED",
        title: `QTN ${q.number} approved â€” ready to submit`,
        body: `${actorEmail} approved quotation ${q.number}. It is ready for final submission.`,
        link, qtnId: q.id, details, note, origin,
      });
      return;
    }
    if (to === "RETURNED") {
      await notify({
        userId: q.ownerId, kind: "QTN_RETURNED",
        title: `QTN ${q.number} returned for revision`,
        body: `${actorEmail} returned quotation ${q.number} for revision.`,
        link, qtnId: q.id, details, note, origin,
      });
      return;
    }
    if (to === "SUBMITTED") {
      const ids = [...(await approverIds()), q.ownerId];
      await notifyAll(ids, {
        kind: "QTN_SUBMITTED",
        title: `QTN ${q.number} submitted`,
        body: `${actorEmail} submitted quotation ${q.number}.`,
        link, qtnId: q.id, details, note, origin,
      });
    }
  } catch (e) {
    console.error("[qtn] notification fan-out failed", e);
  }
}

/** POST /api/qtns/:id/transition  { to, note? } */
export async function transition(req: Request, res: Response) {
  try {
    const to = String(req.body?.to ?? "") as QtnStatus;
    const note = String(req.body?.note ?? "").trim().slice(0, 2000);
    if (!(QTN_STATUSES as readonly string[]).includes(to)) {
      return res.status(400).json({ error: "Unknown status." });
    }
    // Visible, not writable: an approver acts on a quotation they don't own.
    const q = await visibleQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });

    const from = qtnStatus(q);
    if (from === to) return res.json({ ok: true, status: to });
    if (!canMove(from, to)) {
      return res.status(409).json({
        error: `A ${QTN_STATUS_LABEL[from]} quotation cannot be moved to ${QTN_STATUS_LABEL[to]}.`,
        status: from,
      });
    }
    const denial = await transitionDenial(req, q, from, to, note);
    if (denial) return res.status(403).json({ error: denial, status: from });

    const actorEmail = req.userEmail ?? "";
    const action = qtnAction(from, to);
    const approverFields =
      to === "APPROVED"
        ? { approverId: req.userId ?? null, approverEmail: actorEmail, returnReason: "" }
        : to === "RETURNED"
        ? { approverId: req.userId ?? null, approverEmail: actorEmail, returnReason: note }
        : {};

    // Status and audit row move together or not at all.
    await prisma.$transaction([
      prisma.lvQtn.update({
        where: { id: q.id },
        data: { ...statusWrite(to, q.submittedAt), ...approverFields },
      }),
      prisma.qtnEvent.create({
        data: {
          qtnId: q.id, qtnNumber: q.number, ownerId: q.ownerId,
          ownerEmail: q.owner?.email ?? "",
          action, fromStatus: from, toStatus: to, note,
          actorId: req.userId ?? null, actorEmail,
        },
      }),
    ]);

    // Outside the transaction: a mail failure must not roll back an approval.
    await announce(q, to, actorEmail, note, originOf(req));
    res.json({ ok: true, status: to, statusLabel: QTN_STATUS_LABEL[to] });
  } catch (e) {
    fail(res, e);
  }
}

// Thin aliases so an older client mid-rollout keeps working.
export async function submit(req: Request, res: Response) {
  req.body = { ...(req.body ?? {}), to: "SUBMITTED" };
  return transition(req, res);
}
export async function unsubmit(req: Request, res: Response) {
  req.body = { ...(req.body ?? {}), to: "DRAFT" };
  return transition(req, res);
}

/** GET /api/qtns/queue â€” quotations waiting for approval (needs qtn.approve). */
export async function queue(req: Request, res: Response) {
  try {
    const rows = await prisma.lvQtn.findMany({
      where: { status: "WAITING_APPROVAL" },
      orderBy: { submittedForApprovalAt: "asc" },
      include: ownerSelect,
    });
    res.json(rows.map(listItem));
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/qtns/all â€” every non-draft quotation (LV Offers History). */
export async function listAll(req: Request, res: Response) {
  try {
    const rows = await prisma.lvQtn.findMany({
      // Legacy rows have status NULL; those with submitted = true are Submitted and
      // belong here, the rest are drafts and must never appear.
      where: {
        OR: [
          { status: { in: ["WAITING_APPROVAL", "RETURNED", "APPROVED", "SUBMITTED"] } },
          { AND: [{ status: null }, { submitted: true }] },
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: ownerSelect,
    });
    res.json(rows.map(listItem));
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/qtns/:id/events â€” the audit trail. */
export async function events(req: Request, res: Response) {
  try {
    const q = await visibleQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    const acc = await accessOf(req.userId);
    if (q.ownerId !== req.userId && !acc.perms.has("qtn.audit") && !acc.perms.has("qtn.viewAll")) {
      return res.status(403).json({ error: "You do not have access to the audit trail." });
    }
    const rows = await prisma.qtnEvent.findMany({
      where: { qtnId: q.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(rows);
  } catch (e) {
    fail(res, e);
  }
}

// â”€â”€ Specs-tab attachments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Kept out of LvQtn.state on purpose: that JSON is re-saved on an 800 ms debounce
// while the user types, so a file living in it would be re-uploaded on every
// keystroke. These endpoints move the bytes exactly once.

/** The quotation, if it belongs to the caller â€” for attachment WRITES.
 *  `status` must be selected: the lock checks below read it, and a narrower select
 *  would leave them reading `undefined` and silently letting writes through. */
async function ownedQtn(req: Request) {
  return prisma.lvQtn.findFirst({
    where: { id: req.params.id, ownerId: req.userId as string },
    select: { id: true, submitted: true, status: true, ownerId: true },
  });
}

/** For attachment READS â€” an approver must be able to open the specs they review. */
async function readableQtn(req: Request) {
  const acc = await accessOf(req.userId);
  const where = acc.perms.has("qtn.viewAll")
    ? { id: req.params.id }
    : { id: req.params.id, ownerId: req.userId as string };
  return prisma.lvQtn.findFirst({ where, select: { id: true } });
}

// GET /api/qtns/:id/attachments  â†’ metadata only (never the bytes, so opening the
// Specs tab stays light no matter how much is attached)
export async function listAttachments(req: Request, res: Response) {
  try {
    const q = await readableQtn(req);
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

// POST /api/qtns/:id/attachments  { name, mime, data }  â€” data is plain base64
export async function uploadAttachment(req: Request, res: Response) {
  try {
    const q = await ownedQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    if (isLocked(qtnStatus(q))) return lockedResponse(res, qtnStatus(q));
    const { name, mime, data } = attachmentSchema.parse(req.body);
    // Decode to measure the REAL size and to reject anything that isn't valid
    // base64 â€” the client-reported length can't be trusted.
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

// GET /api/qtns/:id/attachments/:fileId  â€” streams the file itself. A plain browser
// navigation, so it authenticates via ?t= (see middleware/auth readToken).
export async function downloadAttachment(req: Request, res: Response) {
  try {
    const q = await readableQtn(req);
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
    if (isLocked(qtnStatus(q))) return lockedResponse(res, qtnStatus(q));
    await prisma.lvAttachment.deleteMany({ where: { id: req.params.fileId, qtnId: q.id } });
    res.status(204).end();
  } catch (e) {
    fail(res, e);
  }
}
