import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// A user's saved/favourited combinations — their definition (the component list) only, so the same
// combination can be reused across panels. `sig` is a content signature; the [userId, sig] unique
// index means a user can't save the same combination twice. Every handler is scoped to req.userId,
// so saved combinations are strictly per-user.

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return []; }
}

/** GET /api/saved-combos — the current user's saved combinations, newest first. */
export async function list(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const rows = await prisma.savedCombo.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    res.json({ items: rows.map((r) => ({ id: r.id, name: r.name, sig: r.sig, comps: safeParse(r.data), createdAt: r.createdAt })) });
  } catch (e) {
    console.error("[saved-combos] list failed", e);
    res.status(500).json({ error: "Could not load saved combinations." });
  }
}

/** POST /api/saved-combos { name, sig, comps } — save a combination (or refresh the one already
 *  saved under the same signature). Returns the stored item. */
export async function save(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const name = (String(req.body?.name ?? "").trim() || "Combination").slice(0, 200);
    const sig = String(req.body?.sig ?? "").trim();
    const comps = req.body?.comps;
    if (!sig || !Array.isArray(comps) || comps.length === 0) {
      return res.status(400).json({ error: "A combination (signature + items) is required." });
    }
    const data = JSON.stringify(comps);
    const row = await prisma.savedCombo.upsert({
      where: { userId_sig: { userId, sig } },
      create: { userId, name, sig, data },
      update: { name, data }, // re-saving the same combination just refreshes its name/definition
    });
    res.json({ item: { id: row.id, name: row.name, sig: row.sig, comps, createdAt: row.createdAt } });
  } catch (e) {
    console.error("[saved-combos] save failed", e);
    res.status(500).json({ error: "Could not save the combination." });
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
