import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// A user's saved/favourited combinations — their definition (the component list) only, so the same
// combination can be reused across panels. Every handler is scoped to req.userId, so these are
// strictly per-user and nobody ever sees anybody else's.
//
// There are two kinds, told apart by `qtnId`:
//
//   qtnId = "<a quotation's id>"  SAVED — belongs to that project and is offered only there. Most
//                                 combinations are specific to a job, so a list shared across every
//                                 quotation filled up with other jobs' work.
//   qtnId = ""                    PINNED — the user's own shelf, offered in every quotation. Pinning
//                                 takes a COPY, so clearing a project's list never empties the shelf
//                                 and tidying the shelf never touches a project.
//
// `sig` is a content signature, and [userId, qtnId, sig] is unique: the same combination cannot be
// saved twice in one project, nor pinned twice — but the same one CAN be saved in two projects and
// pinned as well, which is the point.

/** "" for the pinned shelf; otherwise the quotation this belongs to. */
const scopeOf = (v: unknown): string => String(v ?? "").trim().slice(0, 64);

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return []; }
}

const dto = (r: { id: string; qtnId: string; name: string; sig: string; data: string; createdAt: Date }) => ({
  id: r.id, qtnId: r.qtnId, name: r.name, sig: r.sig, comps: safeParse(r.data), createdAt: r.createdAt,
});

/**
 * GET /api/saved-combos?qtnId=… — this project's saved combinations AND the user's pinned ones,
 * newest first, in one list. The caller tells them apart by `qtnId` ("" is pinned), which saves a
 * second request every time a quotation opens.
 */
export async function list(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const qtnId = scopeOf(req.query.qtnId);
    // "" is always included: the pinned shelf belongs with every project. Asking for no project at
    // all (outside a quotation) therefore returns just the shelf.
    const scopes = qtnId ? ["", qtnId] : [""];
    const rows = await prisma.savedCombo.findMany({
      where: { userId, qtnId: { in: scopes } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items: rows.map(dto) });
  } catch (e) {
    console.error("[saved-combos] list failed", e);
    res.status(500).json({ error: "Could not load saved combinations." });
  }
}

/** POST /api/saved-combos { name, sig, comps, qtnId? } — save a combination into a project (or onto
 *  the pinned shelf when no project is given). Re-saving the same one just refreshes it. */
export async function save(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const qtnId = scopeOf(req.body?.qtnId);
    const name = (String(req.body?.name ?? "").trim() || "Combination").slice(0, 200);
    const sig = String(req.body?.sig ?? "").trim();
    const comps = req.body?.comps;
    if (!sig || !Array.isArray(comps) || comps.length === 0) {
      return res.status(400).json({ error: "A combination (signature + items) is required." });
    }
    const data = JSON.stringify(comps);
    const row = await prisma.savedCombo.upsert({
      where: { userId_qtnId_sig: { userId, qtnId, sig } },
      create: { userId, qtnId, name, sig, data },
      update: { name, data }, // re-saving the same combination just refreshes its name/definition
    });
    res.json({ item: dto(row) });
  } catch (e) {
    console.error("[saved-combos] save failed", e);
    res.status(500).json({ error: "Could not save the combination." });
  }
}

/**
 * POST /api/saved-combos/:id/pin — put a COPY of one of the user's combinations on their pinned
 * shelf, so it is offered in every quotation.
 *
 * A copy, deliberately: the project keeps its own, and removing either one leaves the other alone.
 * Pinning the same combination twice refreshes the existing pin rather than failing.
 */
export async function pin(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const src = await prisma.savedCombo.findFirst({ where: { id: req.params.id, userId } });
    if (!src) return res.status(404).json({ error: "Saved combination not found." });
    const row = await prisma.savedCombo.upsert({
      where: { userId_qtnId_sig: { userId, qtnId: "", sig: src.sig } },
      create: { userId, qtnId: "", name: src.name, sig: src.sig, data: src.data },
      update: { name: src.name, data: src.data },
    });
    res.json({ item: dto(row) });
  } catch (e) {
    console.error("[saved-combos] pin failed", e);
    res.status(500).json({ error: "Could not pin the combination." });
  }
}

/** DELETE /api/saved-combos/:id — remove one of the current user's saved combinations. */
export async function remove(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const id = req.params.id;
    const row = await prisma.savedCombo.findFirst({ where: { id, userId }, select: { id: true } });
    if (!row) return res.status(404).json({ error: "Saved combination not found." });
    await prisma.savedCombo.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error("[saved-combos] remove failed", e);
    res.status(500).json({ error: "Could not remove the saved combination." });
  }
}
