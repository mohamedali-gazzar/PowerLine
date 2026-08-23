import type { Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma";
import {
  createQtnSchema,
  updateQtnSchema,
  numberSchema,
  reassignSchema,
  coworkSchema,
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
  /// Set when the quotation has been hidden from the lists (never erased).
  removedAt?: Date | null;
  removedBy?: string;
  status?: string | null;
  statusAt?: Date | null;
  approverEmail?: string;
  approvedAt?: Date | null;
  returnReason?: string;
  submittedAt?: Date | null;
  submittedForApprovalAt?: Date | null;
  ownerId?: string;
  owner?: { email: string; name: string } | null;
  coOwnerId?: string | null; // legacy single slot
  coOwner?: { email: string; name: string } | null;
  coOwners?: { userId: string; user: { email: string; name: string } }[];
  projectName: string;
  customer: string;
  panelsCount: number;
  totalEgp: number;
};

/**
 * What the LIST mappers read: a quotation row minus `state` and `createdAt`.
 *
 * Lists show neither, and `state` is the whole quotation as JSON, so selecting it for a
 * table was pure waste — enough of it to exhaust the database's transfer quota. Typing the
 * mappers this narrowly means the compiler rejects a list handler that forgets a column
 * listItem needs, instead of it silently rendering undefined.
 */
type QtnListRow = Omit<QtnRow, "state" | "createdAt">;

// ── Co-Work membership ───────────────────────────────────────────────────────
// Co-workers live in the LvQtnCoOwner join table, but quotations shared before
// that table existed still carry the single legacy `coOwnerId`. Both are read
// through these helpers, so an old share keeps working until it is next edited
// (at which point it is written to the join table and the legacy slot cleared).

/** Everyone sharing this quotation with its owner — join table ∪ legacy slot. */
const coOwnersOf = (q: QtnListRow): { id: string; email: string; name: string }[] => {
  const out = new Map<string, { id: string; email: string; name: string }>();
  (q.coOwners ?? []).forEach((c) =>
    out.set(c.userId, { id: c.userId, email: c.user?.email ?? "", name: c.user?.name ?? "" }),
  );
  if (q.coOwnerId && !out.has(q.coOwnerId)) {
    out.set(q.coOwnerId, { id: q.coOwnerId, email: q.coOwner?.email ?? "", name: q.coOwner?.name ?? "" });
  }
  return [...out.values()];
};

/** Prisma `where` matching a quotation the user owns OR co-works on (either storage). */
const sharedWith = (uid: string) => [
  { ownerId: uid },
  { coOwnerId: uid }, // legacy
  { coOwners: { some: { userId: uid } } },
];

/** The workflow fields every QTN response carries, so the client never derives status. */
const workflowOf = (q: QtnListRow) => ({
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
    // A corrupt/legacy state row shouldn't crash the request — return an empty state.
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
    coOwners: coOwnersOf(q),
    state,
  };
};

const listItem = (q: QtnListRow) => ({
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
  coOwners: coOwnersOf(q),
  // Null unless the row is hidden — only ever non-null in an includeRemoved list.
  removedAt: q.removedAt ?? null,
  removedBy: q.removedBy ?? "",
});

// ── Visibility ───────────────────────────────────────────────────────────────
// Every QTN read used to be hard-scoped to `ownerId`, which meant an approver
// literally could not open the quotation they were being asked to approve. Reads
// widen for qtn.viewAll; WRITES stay owner-only — approvers review, they don't edit.

const ownerSelect = {
  owner: { select: { email: true, name: true } },
  coOwner: { select: { email: true, name: true } }, // legacy slot
  coOwners: { select: { userId: true, user: { select: { email: true, name: true } } } },
} as const;

/**
 * Columns the LIST endpoints need — deliberately WITHOUT `state`.
 *
 * `include: ownerSelect` fetches every scalar column, and `state` is the entire
 * quotation as JSON: every panel, every component, every price. Drawing one table row
 * needs none of it, yet listing pulled all of it for every quotation on every request.
 * On 23 Aug 2026 that helped exhaust the database's data-transfer quota, which took the
 * live site down completely — no logins, and no deploys either, because the build syncs
 * the schema over the same connection.
 *
 * This is EXACTLY the set listItem() reads (through workflowOf and coOwnersOf). Adding a
 * field to listItem means adding it here, or it silently reads undefined.
 */
export const listSelect = {
  id: true,
  number: true,
  updatedAt: true,
  projectName: true,
  customer: true,
  panelsCount: true,
  totalEgp: true,
  // qtnStatus() falls back to this mirror for rows written before the workflow existed.
  submitted: true,
  status: true,
  // workflowOf()
  approverEmail: true,
  approvedAt: true,
  returnReason: true,
  submittedForApprovalAt: true,
  // ownership + co-work
  ownerId: true,
  coOwnerId: true,
  // only ever non-null in an includeRemoved list
  removedAt: true,
  removedBy: true,
  ...ownerSelect,
} as const;

/** The QTN if the caller may SEE it — its owner, its co-owner, or a qtn.viewAll holder. */
async function visibleQtn(req: Request) {
  const acc = await accessOf(req.userId);
  const uid = req.userId as string;
  const where = acc.perms.has("qtn.viewAll")
    ? { id: req.params.id }
    : { id: req.params.id, OR: sharedWith(uid) };
  return prisma.lvQtn.findFirst({ where, include: ownerSelect });
}

/** The QTN if the caller may WRITE it — its owner OR its co-owner. What a co-owner can
 *  actually change is enforced by the per-panel merge in update(), not here. */
async function writableQtn(req: Request) {
  const uid = req.userId as string;
  return prisma.lvQtn.findFirst({
    where: { id: req.params.id, OR: sharedWith(uid) },
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

// GET /api/qtns — my quotations: ones I own OR co-own.
/** Removed quotations are hidden from every list. `?includeRemoved=1` brings them
 *  back, but only for access.manage — the same people who can remove one. */
async function showRemoved(req: Request): Promise<boolean> {
  if (req.query.includeRemoved !== "1") return false;
  return (await accessOf(req.userId)).perms.has("access.manage" as Perm);
}

export async function list(req: Request, res: Response) {
  try {
    const uid = req.userId as string;
    const rows = await prisma.lvQtn.findMany({
      where: {
        AND: [
          { OR: sharedWith(uid) },
          ...((await showRemoved(req)) ? [] : [{ removedAt: null }]),
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: listSelect,
    });
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

// GET /api/qtns/:id — own it, or hold qtn.viewAll (an approver must be able to
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

// ── Co-Work merge ────────────────────────────────────────────────────────────
// While a QTN is shared, a save writes ONLY the saver's own panels; everyone else's
// come straight from the stored state. A co-worker's save also leaves the shared
// fields (project/pricing/terms/…) untouched, since those belong to the owner. So any
// number of people can work at once and none of them can overwrite another's work.
// Panel ownership is read from the STORED state — a saver cannot reassign or edit
// someone else's panel — unassigned panels belong to the owner, and a brand-new panel
// is stamped to whoever saved it.
type PanelLike = { id?: string; ownerId?: string; [k: string]: unknown };
type StateLike = { panels?: PanelLike[]; [k: string]: unknown };
function mergeCoWork(stored: StateLike, incoming: StateLike, primaryId: string, saverId: string): StateLike {
  const storedPanels = Array.isArray(stored?.panels) ? stored.panels : [];
  const incomingPanels = Array.isArray(incoming?.panels) ? incoming.panels : [];
  const storedById = new Map(storedPanels.filter((p) => p?.id).map((p) => [p.id as string, p]));
  const ownerOf = (p: PanelLike) => p?.ownerId || primaryId;

  const merged: PanelLike[] = [];
  const seen = new Set<string>();
  for (const p of incomingPanels) {
    if (!p?.id) { merged.push(p); continue; }
    seen.add(p.id);
    const sp = storedById.get(p.id);
    if (!sp) { merged.push({ ...p, ownerId: saverId }); continue; } // new panel → saver owns it
    if (ownerOf(sp) !== saverId) merged.push(sp);                   // someone else's — authoritative
    else merged.push({ ...p, ownerId: saverId });                   // the saver's own edit
  }
  // Never drop anyone else's panels, even if the saver's client didn't send them back.
  for (const sp of storedPanels) {
    if (sp?.id && !seen.has(sp.id) && ownerOf(sp) !== saverId) merged.push(sp);
  }

  const base = saverId === primaryId ? incoming : stored; // co-workers keep stored shared fields
  return { ...base, panels: merged };
}

// PUT /api/qtns/:id  { state, summary }  — debounced live-save from the configurator
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
    // While the quotation is shared, merge per-panel so no one overwrites anyone else.
    let toStore: unknown = state ?? {};
    if (coOwnersOf(q).length) {
      let stored: StateLike = {};
      try { stored = JSON.parse(q.state) as StateLike; } catch { /* corrupt → treat as empty */ }
      toStore = mergeCoWork(stored, (state ?? {}) as StateLike, q.ownerId, req.userId as string);
    }
    await prisma.lvQtn.update({
      where: { id: q.id },
      data: { state: JSON.stringify(toStore), ...summaryData(summary) },
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
/**
 * DELETE /api/qtns/:id — remove a quotation from the lists.
 *
 * It is HIDDEN, never erased. The live database has no backup, and `number` is
 * unique per owner, so a real delete would free that number to be reused — two
 * different offers could end up sharing a QTN number in customers' hands. The row
 * stays, `removedAt`/`removedBy` are stamped, and the owner can restore it.
 *
 * Only DRAFT and RETURNED can go: once a quotation is approved or submitted it is
 * the record of an offer that went to a customer.
 *
 * Who: the person who owns it (unchanged — engineers have always been able to
 * clear their own drafts), or anyone with access.manage, who can remove any
 * draft/returned quotation from the shared History.
 */
export async function remove(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const mayManage = (await accessOf(userId)).perms.has("access.manage" as Perm);
    const q = mayManage
      ? await prisma.lvQtn.findUnique({ where: { id: req.params.id }, include: ownerSelect })
      : await prisma.lvQtn.findFirst({ where: { id: req.params.id, ownerId: userId }, include: ownerSelect });
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    if (q.removedAt) return res.status(204).end(); // already removed — nothing to do
    const s = qtnStatus(q);
    if (s !== "DRAFT" && s !== "RETURNED") return lockedResponse(res, s);

    await prisma.lvQtn.update({
      where: { id: q.id },
      data: { removedAt: new Date(), removedBy: req.userEmail ?? "" },
    });
    await logEvent({
      qtn: q, action: "REMOVE", from: s, to: s,
      note: "Removed from the lists (kept, and restorable)",
      actorId: userId, actorEmail: req.userEmail ?? "",
    });
    res.status(204).end();
  } catch (e) {
    fail(res, e);
  }
}

/**
 * POST /api/qtns/:id/restore — put a removed quotation back. Owner only
 * (access.manage), so the person who can hide one from everybody is the person
 * who can bring it back.
 */
export async function restore(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const q = await prisma.lvQtn.findUnique({ where: { id: req.params.id }, include: ownerSelect });
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    if (!q.removedAt) return res.json({ ok: true }); // already visible

    await prisma.lvQtn.update({
      where: { id: q.id },
      data: { removedAt: null, removedBy: "" },
    });
    await logEvent({
      qtn: q, action: "RESTORE", from: qtnStatus(q), to: qtnStatus(q),
      note: "Restored to the lists",
      actorId: userId, actorEmail: req.userEmail ?? "",
    });
    res.json({ ok: true });
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

// ── Workflow ────────────────────────────────────────────────────────────────

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
      return "You cannot approve your own quotation — another approver must review it.";
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

/** Tell everyone who needs to know. Never throws — mail must not fail an approval. */
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
    ["Project", q.projectName || "—"],
    ["Status", QTN_STATUS_LABEL[to]],
    ["By", actorEmail || "—"],
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
        title: `QTN ${q.number} approved — ready to submit`,
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

/** GET /api/qtns/queue — quotations waiting for approval (needs qtn.approve). */
export async function queue(req: Request, res: Response) {
  try {
    const rows = await prisma.lvQtn.findMany({
      where: { status: "WAITING_APPROVAL" },
      orderBy: { submittedForApprovalAt: "asc" },
      select: listSelect,
    });
    res.json(rows.map(listItem));
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/qtns/all — every non-draft quotation (LV Offers History). */
export async function listAll(req: Request, res: Response) {
  try {
    const rows = await prisma.lvQtn.findMany({
      // Legacy rows have status NULL; those with submitted = true are Submitted and
      // belong here, the rest are drafts and are left out by default — History is
      // the record of work that has gone somewhere, not everyone's unfinished
      // sketches. `?includeDrafts=1` opts into them, which is what makes a draft
      // reachable for tidying up; the route already requires qtn.viewAll, whose
      // own meaning is "View all QTNs".
      where: {
        AND: [
          ...(req.query.includeDrafts === "1"
            ? []
            : [
                {
                  OR: [
                    { status: { in: ["WAITING_APPROVAL", "RETURNED", "APPROVED", "SUBMITTED"] } },
                    { AND: [{ status: null }, { submitted: true }] },
                  ],
                },
              ]),
          ...((await showRemoved(req)) ? [] : [{ removedAt: null }]),
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: listSelect,
    });
    res.json(rows.map(listItem));
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/qtns/:id/events — the audit trail. */
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

// GET /api/qtns/assignees — colleagues a quotation can be handed over to. Any signed-in
// user may read the picker list (names/e-mails of coworkers); the reassign endpoint
// itself enforces who is allowed to actually move a quotation.
export async function assignees(req: Request, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: req.userId as string } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    res.json({ users });
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/qtns/:id/reassign { toUserId, note? } — hand a quotation to another user by
// transferring ownership, so they can continue it. Allowed for a qtn.reassign holder
// (any quotation, e.g. a manager covering for someone who's out) or the current owner
// (their own). Records a REASSIGN audit row and notifies the new owner. Works at any
// status — it changes the owner, not the content.
export async function reassign(req: Request, res: Response) {
  try {
    const { toUserId, note } = reassignSchema.parse(req.body);
    const q = await visibleQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });

    const acc = await accessOf(req.userId);
    const isOwner = q.ownerId === req.userId;
    if (!acc.perms.has("qtn.reassign") && !isOwner) {
      return res.status(403).json({ error: "You don't have permission to hand this quotation over." });
    }
    if (toUserId === q.ownerId) {
      return res.status(400).json({ error: "That user already owns this quotation." });
    }
    const target = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, name: true, email: true } });
    if (!target) return res.status(404).json({ error: "The chosen user was not found." });

    // ownerId + number is unique — the target must not already own a QTN of this number.
    const clash = await prisma.lvQtn.findFirst({ where: { ownerId: toUserId, number: q.number }, select: { id: true } });
    if (clash) {
      return res.status(409).json({ error: `${target.name || target.email} already has a quotation numbered ${q.number}.` });
    }

    const status = qtnStatus(q);
    const trimmedNote = note?.trim() || "";
    const auditNote = `${q.owner?.email || "owner"} → ${target.email}${trimmedNote ? ` · ${trimmedNote}` : ""}`;
    await prisma.$transaction([
      prisma.lvQtn.update({ where: { id: q.id }, data: { ownerId: toUserId } }),
      prisma.qtnEvent.create({
        data: {
          qtnId: q.id, qtnNumber: q.number, ownerId: toUserId, ownerEmail: target.email,
          action: "REASSIGN", fromStatus: status, toStatus: status, note: auditNote,
          actorId: req.userId ?? null, actorEmail: req.userEmail ?? "",
        },
      }),
    ]);

    // Best-effort (a mail hiccup must not undo the handover).
    await notify({
      userId: toUserId, kind: "QTN_REASSIGNED",
      title: `QTN ${q.number} was handed over to you`,
      body: `${req.userEmail || "A colleague"} handed quotation ${q.number} to you${trimmedNote ? ` — "${trimmedNote}"` : ""}. You can continue it now.`,
      link: `/lv/qtn/${q.id}`, qtnId: q.id, note: trimmedNote || undefined, origin: originOf(req),
    });

    res.json({ ok: true, ownerId: toUserId, ownerEmail: target.email, ownerName: target.name });
  } catch (e) {
    fail(res, e);
  }
}

// POST /api/qtns/:id/cowork { coOwnerIds: string[], note? } — Co-Work: set who shares
// this quotation with its owner, so they can work its panels alongside them. The list
// REPLACES the current one; an empty list ends co-work. Allowed for the owner or a
// qtn.reassign holder. Each panel keeps its own ownerId (in the state) and the save
// endpoint merges per-panel, so any number of people can work at once.
export async function cowork(req: Request, res: Response) {
  try {
    const { coOwnerIds, coOwnerId, note } = coworkSchema.parse(req.body);
    const q = await visibleQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });

    const acc = await accessOf(req.userId);
    if (!acc.perms.has("qtn.reassign") && q.ownerId !== req.userId) {
      return res.status(403).json({ error: "You don't have permission to set a co-worker." });
    }
    // `coOwnerId` is the old single-slot field — still accepted so a client mid-rollout
    // (or a cached bundle) keeps working.
    const wanted = [...new Set(
      (coOwnerIds ?? (coOwnerId ? [coOwnerId] : [])).map((x) => x.trim()).filter(Boolean),
    )];
    if (wanted.includes(q.ownerId)) {
      return res.status(400).json({ error: "The owner is already on this quotation — pick someone else." });
    }
    const targets = wanted.length
      ? await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true, email: true } })
      : [];
    if (targets.length !== wanted.length) {
      return res.status(404).json({ error: "One of the chosen users was not found." });
    }

    const before = new Set(coOwnersOf(q).map((c) => c.id));
    const added = targets.filter((t) => !before.has(t.id));
    const trimmedNote = note?.trim() || "";
    const status = qtnStatus(q);
    const label = targets.length ? targets.map((t) => t.email).join(", ") : "no one";
    await prisma.$transaction([
      // Replace the membership wholesale, and retire the legacy single slot so the
      // two storages can never disagree.
      prisma.lvQtnCoOwner.deleteMany({ where: { qtnId: q.id } }),
      ...targets.map((t) =>
        prisma.lvQtnCoOwner.create({ data: { qtnId: q.id, userId: t.id } })),
      prisma.lvQtn.update({ where: { id: q.id }, data: { coOwnerId: null } }),
      prisma.qtnEvent.create({
        data: {
          qtnId: q.id, qtnNumber: q.number, ownerId: q.ownerId, ownerEmail: q.owner?.email ?? "",
          action: "COWORK", fromStatus: status, toStatus: status,
          note: targets.length
            ? `co-workers → ${label}${trimmedNote ? ` · ${trimmedNote}` : ""}`
            : "co-work ended",
          actorId: req.userId ?? null, actorEmail: req.userEmail ?? "",
        },
      }),
    ]);

    // Only tell the people who are newly on it — re-saving the list shouldn't
    // re-notify everyone who was already there.
    for (const t of added) {
      await notify({
        userId: t.id, kind: "QTN_COWORK",
        title: `You're now co-working QTN ${q.number}`,
        body: `${req.userEmail || "A colleague"} added you as a co-worker on quotation ${q.number}${trimmedNote ? ` — "${trimmedNote}"` : ""}. You can edit the panels assigned to you.`,
        link: `/lv/qtn/${q.id}`, qtnId: q.id, note: trimmedNote || undefined, origin: originOf(req),
      });
    }
    res.json({ ok: true, coOwners: targets.map((t) => ({ id: t.id, email: t.email, name: t.name })) });
  } catch (e) {
    fail(res, e);
  }
}

// ── Specs-tab attachments ───────────────────────────────────────────────────
// Kept out of LvQtn.state on purpose: that JSON is re-saved on an 800 ms debounce
// while the user types, so a file living in it would be re-uploaded on every
// keystroke. These endpoints move the bytes exactly once.

/** The quotation, if it belongs to the caller — for attachment WRITES.
 *  `status` must be selected: the lock checks below read it, and a narrower select
 *  would leave them reading `undefined` and silently letting writes through. */
async function ownedQtn(req: Request) {
  return prisma.lvQtn.findFirst({
    where: { id: req.params.id, ownerId: req.userId as string },
    select: { id: true, submitted: true, status: true, ownerId: true },
  });
}

/** For attachment READS — an approver must be able to open the specs they review. */
async function readableQtn(req: Request) {
  const acc = await accessOf(req.userId);
  const where = acc.perms.has("qtn.viewAll")
    ? { id: req.params.id }
    : { id: req.params.id, ownerId: req.userId as string };
  return prisma.lvQtn.findFirst({ where, select: { id: true } });
}

// GET /api/qtns/:id/attachments  → metadata only (never the bytes, so opening the
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

// POST /api/qtns/:id/attachments  { name, mime, data }  — data is plain base64
export async function uploadAttachment(req: Request, res: Response) {
  try {
    const q = await ownedQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    if (isLocked(qtnStatus(q))) return lockedResponse(res, qtnStatus(q));
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
    const q = await readableQtn(req);
    if (!q) return res.status(404).json({ error: "Quotation not found." });
    const f = await prisma.lvAttachment.findFirst({ where: { id: req.params.fileId, qtnId: q.id } });
    if (!f) return res.status(404).json({ error: "File not found." });
    const buf = Buffer.from(f.data, "base64");
    // The stored MIME comes from the uploader's browser and was echoed straight back as
    // Content-Type with `inline` disposition, on the SAME origin as the app. Attaching an
    // .html (or an SVG through the API) therefore ran script on the PowerLine origin when
    // a colleague opened it, with the 30-day session token and the Outlook Graph token
    // both sitting in localStorage. Only render inline what cannot carry script; anything
    // else downloads instead. image/svg+xml is deliberately absent — SVG executes script,
    // which is the same reason account.schema.ts excludes it from profile photos.
    const INLINE_OK = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ]);
    const mime = INLINE_OK.has(f.mime) ? f.mime : "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", String(buf.length));
    // Without nosniff the browser may sniff the real type back and undo the above.
    res.setHeader("X-Content-Type-Options", "nosniff");
    // ?dl=1 forces a download; a previewable type may render inline, nothing else may.
    const disp =
      req.query.dl === "1" || mime === "application/octet-stream" ? "attachment" : "inline";
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
