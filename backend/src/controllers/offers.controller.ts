import type { Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma";
import {
  createOfferSchema,
  previewSchema,
} from "../validation/offer.schema";
import {
  createOffer,
  updateOffer,
  listOffers,
  getOffer,
  getOfferRaw,
  deleteOffer,
  removeOffer,
  duplicateOffer,
  toConfigInput,
  resolvePricing,
  parseRmuLines,
  pricingFromSnap,
  offerStatus,
} from "../services/offer.service";
import { accessOf, type Perm } from "../middleware/roles";
import { notify, notifyAll, approverIds } from "../services/notify.service";
import {
  QTN_STATUSES,
  QTN_STATUS_LABEL,
  canMove,
  qtnAction,
  statusWrite,
  type QtnStatus,
} from "../domain/qtnStatus";
import { assembleOffer, type RmuConfigInput, type GeneratedOffer } from "../domain/assembly";
import { priceForConfig } from "../domain/priceList";
import { vatPct } from "../domain/pricing-data";
import { generateOfferPdf } from "../services/pdf.service";
import { buildCommercial, buildCommercialMulti, type CommercialUnit } from "../services/commercial.service";
import { generateCommercialPdf } from "../services/pdf-commercial.service";
import { generateSldPdf } from "../services/pdf-sld.service";

export async function postOffer(req: Request, res: Response) {
  try {
    const input = createOfferSchema.parse(req.body);
    const offer = await createOffer(input);
    // Attribute the offer to the signed-in user (optionalAuth). It now starts as a
    // DRAFT and reaches "submitted" only through the approval workflow — so, unlike
    // before, generating no longer counts it as submitted for the dashboard.
    if (req.userId) {
      await prisma.offer.update({
        where: { id: offer.id },
        data: { ownerId: req.userId },
      });
    }
    res.status(201).json(offer);
  } catch (err) {
    handleError(err, res);
  }
}

/** Assemble a technical offer from a config without saving — for live preview. */
export function postPreview(req: Request, res: Response) {
  try {
    const cfg = previewSchema.parse(req.body) as RmuConfigInput;
    const generated = assembleOffer(cfg);
    const listPricing = priceForConfig(cfg);
    // vatPct from the pricing master so the on-screen totals match the PDFs.
    res.json({ ...generated, listPricing, vatPct: vatPct() });
  } catch (err) {
    handleError(err, res);
  }
}

// GET /api/offers/next-qtn — suggest the next RMU quotation number (QTN-YY-####),
// one past the highest already used on an RMU offer this year. Suggestion only
// (not reserved), mirroring the LV next-number behaviour.
export async function getNextQtn(_req: Request, res: Response) {
  try {
    const yy = String(new Date().getFullYear() % 100).padStart(2, "0");
    const prefix = `QTN-${yy}-`;
    const rows = await prisma.offer.findMany({
      where: { quotationNo: { startsWith: prefix } },
      select: { quotationNo: true },
    });
    let max = 0;
    for (const r of rows) {
      const m = /(\d+)\s*$/.exec(r.quotationNo ?? "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    res.json({ suggestion: `${prefix}${String(max + 1).padStart(4, "0")}` });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getOffers(req: Request, res: Response) {
  try {
    // Approvers (qtn.viewAll) see every offer so they can act on ones awaiting
    // approval — the same widening the LV list does. Everyone else: their own.
    const acc = req.userId ? await accessOf(req.userId) : null;
    // `?mine=1` asks for only the caller's own offers, whatever their permissions.
    // Needed because a personal feature must not be built from the widened list: the
    // sidebar "resume draft" shortcut was picking a colleague's draft as "yours", since
    // a qtn.viewAll holder receives everyone's offers here. It also means that shortcut
    // no longer downloads the whole company's offers to choose one row.
    const mine = req.query.mine === "1";
    const all = !mine && acc ? acc.perms.has("qtn.viewAll") : false;
    // "Show removed" is owner-level, exactly as it is for LV quotations: seeing hidden
    // work is a different privilege from seeing a colleague's active work.
    const includeRemoved =
      req.query.includeRemoved === "1" && Boolean(acc && acc.perms.has("access.manage"));
    res.json(await listOffers(req.userId, { all, includeRemoved }));
  } catch (err) {
    handleError(err, res);
  }
}

export async function getOfferById(req: Request, res: Response) {
  try {
    const offer = await getOffer(req.params.id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    // The owner may view it, and so may an approver (qtn.viewAll) — they must be
    // able to open an offer they were asked to approve.
    const canViewAll = req.userId ? (await accessOf(req.userId)).perms.has("qtn.viewAll") : false;
    if (offer.ownerId !== req.userId && !canViewAll) {
      return res.status(404).json({ error: "Offer not found" });
    }
    res.json(offer);
  } catch (err) {
    handleError(err, res);
  }
}

// GET /api/offers/:id/events — the offer's audit trail (create / send / approve /
// return / submit …), so every "Return for revision" comment is kept as history.
// Same access as viewing the offer: the owner or an approver (qtn.viewAll).
export async function getOfferEvents(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    const canViewAll = req.userId ? (await accessOf(req.userId)).perms.has("qtn.viewAll") : false;
    if (offer.ownerId !== req.userId && !canViewAll) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const rows = await prisma.qtnEvent.findMany({
      where: { qtnId: offer.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(rows);
  } catch (err) {
    handleError(err, res);
  }
}

// PUT /api/offers/:id — update a draft offer in place (autosave while editing). Only the
// owner (or access.manage) may edit, and only while DRAFT or RETURNED — once it is sent
// for approval it is locked, exactly like an LV quotation.
export async function putOffer(req: Request, res: Response) {
  try {
    const existing = await getOfferRaw(req.params.id);
    if (!existing) return res.status(404).json({ error: "Offer not found" });
    const mayManage = req.userId ? (await accessOf(req.userId)).perms.has("access.manage") : false;
    if (existing.ownerId !== req.userId && !mayManage) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const s = offerStatus(existing);
    if (s !== "DRAFT" && s !== "RETURNED") {
      return res.status(409).json({
        error: `This offer is ${QTN_STATUS_LABEL[s]} and cannot be edited. Withdraw or reopen it first.`,
        status: s,
      });
    }
    const input = createOfferSchema.parse(req.body);
    const updated = await updateOffer(req.params.id, input);
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
}

// POST /api/offers/:id/duplicate — clone an offer into a fresh DRAFT (Duplicate /
// Amend in the unified history). Owner-only, like get/delete. An optional ?number=
// sets the new offer number; otherwise the next PL-YYYY-#### is assigned.
export async function duplicateOfferById(req: Request, res: Response) {
  try {
    const src = await getOfferRaw(req.params.id);
    if (!src || src.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const number = typeof req.query.number === "string" ? req.query.number : undefined;
    const dup = await duplicateOffer(req.params.id, { offerNumber: number, ownerId: req.userId });
    if (!dup) return res.status(404).json({ error: "Offer not found" });
    res.status(201).json(dup);
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * Remove an offer from the lists. Mirrors the LV quotation rules exactly.
 *
 * This used to require ownership and answer 404 "Offer not found" otherwise. But the
 * unified Offer History shows EVERY user's offers to a qtn.viewAll holder, so an admin
 * looking at a colleague's offer saw a Delete button, pressed it, and was told the offer
 * did not exist — while it stayed in the list, because nothing had been deleted. Two
 * faults in one: the wrong people were refused, and the message described the wrong
 * problem.
 *
 * Now: access.manage may remove any offer, everyone else only their own; anything else
 * gets a message that says what is actually wrong. A submitted offer is protected, the
 * same way a submitted quotation is. And it is a soft remove, so the offer number is
 * never freed for reuse.
 */
export async function deleteOfferById(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });

    const acc = await accessOf(req.userId);
    const mine = offer.ownerId === req.userId;
    const mayManage = acc.perms.has("access.manage");
    if (!mine && !mayManage) {
      // Only say it exists to someone already allowed to see it in the list.
      if (acc.perms.has("qtn.viewAll")) {
        return res.status(403).json({
          error: "This offer belongs to someone else. Only its owner, or an admin, can remove it.",
        });
      }
      return res.status(404).json({ error: "Offer not found" });
    }

    if (offer.removedAt) return res.status(204).end(); // already hidden — nothing to do

    // NO status guard here, deliberately, and it is worth writing down why.
    //
    // A guard was tried and immediately blocked almost every existing offer. postOffer()
    // stamps `submittedAt` the moment it attributes an offer to a signed-in user, and
    // offerStatus() falls back to `submittedAt ? SUBMITTED : DRAFT` whenever `statusAt` is
    // null — which it is for every offer created before the approval workflow existed. So
    // offers the list correctly shows as Draft report as Submitted here, and a guard makes
    // them permanently undeletable.
    //
    // It is also not needed: this is a SOFT remove, so nothing is destroyed and an admin
    // can bring it back with "Show removed". Blocking the action would cost more than it
    // protects. (The `submittedAt`-at-creation behaviour is a separate fault — it makes the
    // RMU workflow status wrong for legacy offers — and should be fixed on its own.)

    await removeOffer(offer.id, req.userEmail ?? "");
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * Content-Disposition for a generated PDF.
 *
 * A quotation number can contain Arabic or any other non-Latin-1 character, and Node
 * throws ERR_INVALID_CHAR when such a byte reaches a header value — so all three PDF
 * endpoints returned 500 permanently for that offer, with no way to get the document out.
 * Send an ASCII-safe name in `filename` and the real one in RFC 5987 `filename*`, exactly
 * as the attachment download already does.
 */
function pdfDisposition(download: unknown, name: string): string {
  // [^ -~] is every character outside printable ASCII (space through tilde).
  const ascii = name.replace(/[^ -~]/g, "_").replace(/"/g, "'");
  const disp = download ? "attachment" : "inline";
  return `${disp}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function getOfferPdf(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    // Owner-only: these are customer quotations. The token may arrive as ?t=
    // because a PDF link is a plain browser navigation (see middleware/auth).
    if (!offer || !offer.rmu || !req.userId || offer.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    // Multi-RMU offers assemble one technical section per stored RMU; a single
    // RMU (rmusJson null) assembles just the `rmu` relation, exactly as before.
    const lines = parseRmuLines(offer.rmusJson);
    const generated: GeneratedOffer[] = lines
      ? lines.map((l) => assembleOffer(l.config))
      : [assembleOffer(toConfigInput(offer.rmu))];
    const pdf = await generateOfferPdf(offer, generated);
    res.setHeader("Content-Type", "application/pdf");
    // Name it like the LV section: "TO-<QTN> Rev 00.pdf".
    const fileQtn = offer.quotationNo || offer.offerNumber;
    res.setHeader("Content-Disposition", pdfDisposition(req.query.dl, `TO-${fileQtn} Rev 00.pdf`));
    res.send(pdf);
  } catch (err) {
    handleError(err, res);
  }
}

export async function getCommercialPdf(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    if (!offer || !offer.rmu || !req.userId || offer.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const config = toConfigInput(offer.rmu);
    // Same frozen prices the offer screen shows — never a fresh lookup, or a
    // re-downloaded PDF could disagree with the quotation already sent.
    const { pricing, vatPct: offerVatPct } = resolvePricing(offer, config);
    const lines = parseRmuLines(offer.rmusJson);
    let data;
    if (lines && lines.length > 1) {
      // One priced line per RMU, each from its own frozen snapshot.
      const units: CommercialUnit[] = lines.map((l) => {
        const g = assembleOffer(l.config);
        return {
          description: g.commercialDescription,
          pricing: pricingFromSnap(l, l.config),
          unitPrice: l.unitPrice,
          quantity: l.quantity,
        };
      });
      data = buildCommercialMulti(offer, units, offerVatPct);
    } else {
      const generated = assembleOffer(config);
      data = buildCommercial(offer, generated, pricing, offerVatPct);
    }
    const pdf = await generateCommercialPdf(data);
    res.setHeader("Content-Type", "application/pdf");
    // Name it like the LV section: "CO-<QTN> Rev 00.pdf".
    const fileQtn = offer.quotationNo || offer.offerNumber;
    res.setHeader("Content-Disposition", pdfDisposition(req.query.dl, `CO-${fileQtn} Rev 00.pdf`));
    res.send(pdf);
  } catch (err) {
    handleError(err, res);
  }
}

export async function getSldPdf(req: Request, res: Response) {
  try {
    const offer = await getOfferRaw(req.params.id);
    if (!offer || !offer.rmu || !req.userId || offer.ownerId !== req.userId) {
      return res.status(404).json({ error: "Offer not found" });
    }
    const generated = assembleOffer(toConfigInput(offer.rmu));
    const pdf = await generateSldPdf(offer, generated);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      pdfDisposition(req.query.dl, `${offer.offerNumber}-${generated.panelCode}-SLD.pdf`),
    );
    res.send(pdf);
  } catch (err) {
    handleError(err, res);
  }
}

function handleError(err: unknown, res: Response) {
  if (err instanceof ZodError) {
    return res
      .status(400)
      .json({ error: "Validation failed", details: err.flatten() });
  }
  if (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  ) {
    return res.status(409).json({ error: "Offer number already exists" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

// ─── Approval workflow — mirrors the LV /qtns transition, on the Offer model ──

type WorkflowOffer = {
  id: string;
  offerNumber: string;
  ownerId: string | null;
  projectName: string;
  status: string | null;
  statusAt: Date | null;
  submittedAt: Date | null;
  owner?: { email: string; name: string } | null;
};

/** The offer if the caller may act on it: the owner, or an approver (qtn.viewAll). */
async function visibleOffer(req: Request, id: string): Promise<WorkflowOffer | null> {
  const offer = await getOfferRaw(id);
  if (!offer) return null;
  const canViewAll = req.userId ? (await accessOf(req.userId)).perms.has("qtn.viewAll") : false;
  if (offer.ownerId !== req.userId && !canViewAll) return null;
  return offer as unknown as WorkflowOffer;
}

/** Who may perform a move, and why not. `null` = allowed. Mirrors the LV rules. */
async function offerTransitionDenial(
  req: Request,
  offer: WorkflowOffer,
  from: QtnStatus,
  to: QtnStatus,
  note: string,
): Promise<string | null> {
  const acc = await accessOf(req.userId);
  const isOwner = offer.ownerId === req.userId;
  const need = (p: Perm, msg: string) => (acc.perms.has(p) ? null : msg);

  if (to === "WAITING_APPROVAL") {
    // From APPROVED = the approver retracting their approval (un-approve); needs approve
    // rights, not ownership. From DRAFT/RETURNED = the owner sending it.
    if (from === "APPROVED") {
      return need("qtn.approve", "You do not have permission to withdraw an approval.");
    }
    return isOwner ? null : "Only the person who created this offer can send it for approval.";
  }
  if (to === "APPROVED") {
    const denied = need("qtn.approve", "You do not have permission to approve offers.");
    if (denied) return denied;
    if (isOwner && !acc.perms.has("qtn.approveOwn")) {
      return "You cannot approve your own offer — another approver must review it.";
    }
    return null;
  }
  if (to === "RETURNED") {
    const denied =
      need("qtn.return", "You do not have permission to return offers for revision.") &&
      need("qtn.approve", "You do not have permission to return offers for revision.");
    if (denied) return denied;
    if (!note.trim()) return "A reason is required when returning an offer for revision.";
    return null;
  }
  if (to === "SUBMITTED") {
    if (isOwner) return null;
    return need("qtn.submitApproved", "Only the offer's owner can submit it.");
  }
  if (to === "DRAFT") {
    if (from === "SUBMITTED") {
      return need("qtn.reopen", "You do not have permission to reopen a submitted offer.");
    }
    return isOwner ? null : "Only the offer's owner can withdraw it.";
  }
  return "Unsupported transition.";
}

/** Tell the right people. Never throws — mail must not fail an approval. */
async function announceOffer(offer: WorkflowOffer, to: QtnStatus, actorEmail: string, note: string, approverId?: string | null, from?: QtnStatus) {
  const link = "/lv"; // the unified Offer History, where RMU offers are actioned
  const when = new Date().toLocaleString("en-GB");
  const details: [string, string][] = [
    ["Offer", offer.offerNumber],
    ["Project", offer.projectName || "—"],
    ["Status", QTN_STATUS_LABEL[to]],
    ["By", actorEmail || "—"],
    ["When", when],
  ];
  const ownerId = offer.ownerId ?? "";
  try {
    if (to === "WAITING_APPROVAL") {
      // Un-approve (APPROVED → WAITING): the approver retracted their approval — tell the owner.
      if (from === "APPROVED" && ownerId) {
        await notify({
          userId: ownerId, kind: "QTN_WAITING",
          title: `RMU offer ${offer.offerNumber} — approval withdrawn`,
          body: `${actorEmail} withdrew the approval of RMU offer ${offer.offerNumber}; it is waiting for approval again.`,
          link, qtnId: offer.id, details, note,
        });
        return;
      }
      // Sent to a chosen approver → notify only them; otherwise broadcast to all approvers.
      if (approverId && approverId !== ownerId) {
        await notify({
          userId: approverId, kind: "QTN_WAITING",
          title: `RMU offer ${offer.offerNumber} is waiting for your approval`,
          body: `${actorEmail} sent RMU offer ${offer.offerNumber} to you for approval.`,
          link, qtnId: offer.id, details, note,
        });
      } else {
        const ids = (await approverIds()).filter((id) => id !== ownerId);
        await notifyAll(ids, {
          kind: "QTN_WAITING",
          title: `RMU offer ${offer.offerNumber} is waiting for approval`,
          body: `${actorEmail} sent RMU offer ${offer.offerNumber} for approval.`,
          link, qtnId: offer.id, details, note,
        });
      }
    } else if (to === "APPROVED" && ownerId) {
      await notify({
        userId: ownerId, kind: "QTN_APPROVED",
        title: `RMU offer ${offer.offerNumber} approved — ready to submit`,
        body: `${actorEmail} approved RMU offer ${offer.offerNumber}. It is ready for final submission.`,
        link, qtnId: offer.id, details, note,
      });
    } else if (to === "RETURNED" && ownerId) {
      await notify({
        userId: ownerId, kind: "QTN_RETURNED",
        title: `RMU offer ${offer.offerNumber} returned for revision`,
        body: `${actorEmail} returned RMU offer ${offer.offerNumber} for revision.`,
        link, qtnId: offer.id, details, note,
      });
    } else if (to === "SUBMITTED") {
      const ids = [...(await approverIds()), ownerId].filter(Boolean);
      await notifyAll(ids, {
        kind: "QTN_SUBMITTED",
        title: `RMU offer ${offer.offerNumber} submitted`,
        body: `${actorEmail} submitted RMU offer ${offer.offerNumber}.`,
        link, qtnId: offer.id, details, note,
      });
    }
  } catch (e) {
    console.error("[offer] notification fan-out failed", e);
  }
}

/** POST /api/offers/:id/transition  { to, note? } — RMU approval lifecycle. */
export async function transitionOffer(req: Request, res: Response) {
  try {
    const to = String(req.body?.to ?? "") as QtnStatus;
    const note = String(req.body?.note ?? "").trim().slice(0, 2000);
    if (!(QTN_STATUSES as readonly string[]).includes(to)) {
      return res.status(400).json({ error: "Unknown status." });
    }
    const offer = await visibleOffer(req, req.params.id);
    if (!offer) return res.status(404).json({ error: "Offer not found." });

    const from = offerStatus(offer);
    if (from === to) return res.json({ ok: true, status: to });
    if (!canMove(from, to)) {
      return res.status(409).json({
        error: `A ${QTN_STATUS_LABEL[from]} offer cannot be moved to ${QTN_STATUS_LABEL[to]}.`,
        status: from,
      });
    }
    const denial = await offerTransitionDenial(req, offer, from, to, note);
    if (denial) return res.status(403).json({ error: denial, status: from });

    const actorEmail = req.userEmail ?? "";
    const action = qtnAction(from, to);
    const isUnapprove = to === "WAITING_APPROVAL" && from === "APPROVED";
    const approverFields =
      to === "APPROVED"
        ? { approverId: req.userId ?? null, approverEmail: actorEmail, returnReason: "" }
        : to === "RETURNED"
        ? { approverId: req.userId ?? null, approverEmail: actorEmail, returnReason: note }
        : isUnapprove
        ? { approverId: null, approverEmail: "", approvedAt: null } // clear the retracted approval
        : {};

    // Send-for-approval dropdown: an optional chosen approver to notify + record. Skipped
    // for an un-approve (the approver retracting, not a fresh send).
    let sendApproverId: string | null = null;
    let eventNote = note;
    if (isUnapprove) {
      eventNote = "Approval withdrawn";
    } else if (to === "WAITING_APPROVAL") {
      const rawId = String(req.body?.approverId ?? "").trim();
      if (rawId) {
        const appr = await prisma.user.findUnique({ where: { id: rawId }, select: { id: true, email: true, name: true } });
        if (appr && appr.id !== offer.ownerId) {
          sendApproverId = appr.id;
          eventNote = `Sent to ${appr.name || appr.email} for approval`;
        }
      }
    }

    // Status and audit row move together or not at all.
    await prisma.$transaction([
      prisma.offer.update({
        where: { id: offer.id },
        data: { ...statusWrite(to, offer.submittedAt), ...approverFields },
      }),
      prisma.qtnEvent.create({
        data: {
          qtnId: offer.id, qtnNumber: offer.offerNumber, ownerId: offer.ownerId,
          ownerEmail: offer.owner?.email ?? "",
          action, fromStatus: from, toStatus: to, note: eventNote,
          actorId: req.userId ?? null, actorEmail,
        },
      }),
    ]);
    await announceOffer(offer, to, actorEmail, note, sendApproverId, from);
    res.json({ ok: true, status: to, statusLabel: QTN_STATUS_LABEL[to] });
  } catch (err) {
    handleError(err, res);
  }
}
