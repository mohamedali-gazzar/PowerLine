// Bulk transformer price update from a spreadsheet — the same two-step workflow as the LV import.
//
// PREVIEW works out exactly what would change (add / update / remove) and stores it as a pending
// batch; APPLY replays that stored batch. Nothing is written until the uploaded numbers are seen
// and confirmed. Rows are matched on `code` — the only stable key the sheet and the database share.
// Once matched, the sheet is the source of truth for the row's data (cost, rating, voltage, brand,
// insulation). The uploaded price wins outright: a blank/zero COST cell CLEARS the stored price, so
// the database always mirrors the uploaded sheet exactly — no old price is kept behind a blank cell.
// A row the file never mentions becomes a removal candidate (soft-retire), opt-in on apply.

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";
import { publishCurrentPricesDetailed } from "./pricing.controller";

const BATCH_TTL_MS = 60 * 60 * 1000;
const DETAIL_CAP = 400;

const rawRowSchema = z.object({
  code: z.string().default(""),
  ratingKva: z.number().default(0),
  primaryKv: z.number().default(0),
  costEgp: z.number().default(0),
  brand: z.string().default(""),
  insulation: z.string().default(""),
});
const previewSchema = z.object({ rows: z.array(rawRowSchema).min(1).max(5000) });
type RawRow = z.infer<typeof rawRowSchema>;

type DiffKind = "add" | "update" | "remove";
interface FieldChange { field: string; from: string; to: string }
interface DiffEntry {
  kind: DiffKind;
  code: string;
  label: string;
  id?: string;               // existing row id (update / remove)
  row?: RawRow;              // the sheet row (add / update)
  changes?: FieldChange[];
  restore?: boolean;         // a retired row reappearing in the sheet
}

const norm = (s: string) => s.trim();
const key = (s: string) => norm(s).toLowerCase();
const labelOf = (code: string, ratingKva: number, brand: string) =>
  [code, `${ratingKva} kVA`, brand].filter((p) => norm(String(p))).join(" · ");
const searchOf = (code: string, brand: string, insulation: string) =>
  `${code} ${brand} ${insulation}`.toLowerCase();

/** POST /api/pricing/transformer/import/preview */
export async function postTransformerImportPreview(req: Request, res: Response) {
  try {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "The uploaded rows could not be read." });
    // Drop blank spacer lines (a row with no code has no identity).
    const rows = parsed.data.rows.filter((r) => norm(r.code));
    if (!rows.length) return res.status(400).json({ error: "No transformer rows with a Code were found in the sheet." });

    const existing = await prisma.transformerPrice.findMany();
    const byCode = new Map(existing.map((e) => [key(e.code), e]));
    const seen = new Set<string>();

    const additions: DiffEntry[] = [];
    const updates: DiffEntry[] = [];
    const warnings: string[] = [];
    const diff: DiffEntry[] = [];
    let unchanged = 0;

    for (const r of rows) {
      const code = norm(r.code);
      const k = key(code);
      if (seen.has(k)) warnings.push(`Code "${code}" appears more than once — the last row wins.`);
      seen.add(k);

      const cur = byCode.get(k);
      const label = labelOf(code, r.ratingKva, norm(r.brand));
      if (!cur) {
        const e: DiffEntry = { kind: "add", code, label, row: r };
        additions.push(e);
        diff.push(e);
        continue;
      }

      const changes: FieldChange[] = [];
      // Cost: the uploaded sheet is the exact truth — a blank/zero cell overwrites (clears) the price,
      // so an old price is never kept behind a blank cell. The preview shows the "17263 → 0" drop.
      if (cur.costEgp !== r.costEgp) changes.push({ field: "costEgp", from: String(cur.costEgp), to: String(r.costEgp) });
      if (cur.ratingKva !== r.ratingKva) changes.push({ field: "ratingKva", from: String(cur.ratingKva), to: String(r.ratingKva) });
      if (cur.primaryKv !== r.primaryKv) changes.push({ field: "primaryKv", from: String(cur.primaryKv), to: String(r.primaryKv) });
      if (norm(r.brand) && norm(cur.brand) !== norm(r.brand)) changes.push({ field: "brand", from: cur.brand, to: norm(r.brand) });
      if (norm(r.insulation) && norm(cur.insulation) !== norm(r.insulation)) changes.push({ field: "insulation", from: cur.insulation, to: norm(r.insulation) });

      if (!cur.active) {
        // A retired row named again in the sheet comes back.
        const e: DiffEntry = { kind: "update", code, label, id: cur.id, row: r, changes, restore: true };
        updates.push(e);
        diff.push(e);
      } else if (changes.length) {
        const e: DiffEntry = { kind: "update", code, label, id: cur.id, row: r, changes };
        updates.push(e);
        diff.push(e);
      } else {
        unchanged++;
      }
    }

    // Full-sync removals: active rows the file never mentioned (opt-in on apply).
    const removals: DiffEntry[] = existing
      .filter((e) => e.active && !seen.has(key(e.code)))
      .map((e) => ({ kind: "remove" as const, code: e.code, label: labelOf(e.code, e.ratingKva, e.brand), id: e.id }));
    for (const e of removals) diff.push(e);

    const summary = {
      rowsRead: rows.length,
      additions: additions.length,
      updates: updates.length,
      removals: removals.length,
      unchanged,
    };

    const batch = await prisma.priceImportBatch.create({
      data: {
        domain: "TRANSFORMER",
        status: "PENDING",
        rows: JSON.stringify(rows.length),
        diff: JSON.stringify(diff),
        warnings: JSON.stringify(warnings.slice(0, 200)),
        actorId: req.userId ?? null,
        actorEmail: req.userEmail ?? "",
        expiresAt: new Date(Date.now() + BATCH_TTL_MS),
      },
    });

    res.json({
      batchId: batch.id,
      summary,
      additions: additions.slice(0, DETAIL_CAP),
      updates: updates.slice(0, DETAIL_CAP),
      removals: removals.slice(0, DETAIL_CAP),
      warnings: warnings.slice(0, 50),
      truncated: additions.length > DETAIL_CAP || updates.length > DETAIL_CAP || removals.length > DETAIL_CAP,
      expiresAt: batch.expiresAt,
    });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/transformer/import/:id/apply */
export async function postTransformerImportApply(req: Request, res: Response) {
  try {
    const batch = await prisma.priceImportBatch.findUnique({ where: { id: req.params.id } });
    if (!batch || batch.domain !== "TRANSFORMER") return res.status(404).json({ error: "That import has expired or was already used." });
    if (batch.status !== "PENDING") return res.status(409).json({ error: `This import was already ${batch.status.toLowerCase()}.` });
    if (batch.expiresAt.getTime() < Date.now()) {
      await prisma.priceImportBatch.update({ where: { id: batch.id }, data: { status: "CANCELLED" } });
      return res.status(410).json({ error: "That preview is over an hour old — please upload the file again." });
    }

    const includeRemovals = req.body?.includeRemovals === true;
    const diff: DiffEntry[] = JSON.parse(batch.diff);
    const actorEmail = req.userEmail ?? "";
    const actorId = req.userId ?? null;
    const batchId = batch.id;

    const maxSort = (await prisma.transformerPrice.aggregate({ _max: { sortIndex: true } }))._max.sortIndex ?? 0;
    let nextSort = maxSort + 1;

    let added = 0, updated = 0, removed = 0;

    for (const e of diff) {
      if (e.kind === "add" && e.row) {
        const r = e.row;
        const code = norm(r.code), brand = norm(r.brand), insulation = norm(r.insulation);
        await prisma.transformerPrice.create({
          data: {
            sortIndex: nextSort++, code, ratingKva: r.ratingKva, primaryKv: r.primaryKv,
            costEgp: r.costEgp, brand, insulation, active: true,
            search: searchOf(code, brand, insulation), updatedBy: actorEmail,
          },
        });
        await prisma.priceChange.create({
          data: { domain: "TRANSFORMER", entity: "TransformerPrice", entityId: code, label: e.label, field: "__created", newValue: String(r.costEgp), batchId, actorId, actorEmail },
        });
        added++;
      } else if (e.kind === "update" && e.id && e.row) {
        const r = e.row;
        const data: Record<string, unknown> = { updatedBy: actorEmail, active: true };
        for (const c of e.changes ?? []) {
          if (c.field === "costEgp") data.costEgp = r.costEgp;
          else if (c.field === "ratingKva") data.ratingKva = r.ratingKva;
          else if (c.field === "primaryKv") data.primaryKv = r.primaryKv;
          else if (c.field === "brand") data.brand = norm(r.brand);
          else if (c.field === "insulation") data.insulation = norm(r.insulation);
        }
        data.search = searchOf(norm(r.code), (data.brand as string) ?? norm(r.brand), (data.insulation as string) ?? norm(r.insulation));
        await prisma.transformerPrice.update({ where: { id: e.id }, data });
        for (const c of e.changes ?? []) {
          await prisma.priceChange.create({
            data: { domain: "TRANSFORMER", entity: "TransformerPrice", entityId: e.code, label: e.label, field: c.field, oldValue: c.from, newValue: c.to, batchId, actorId, actorEmail },
          });
        }
        if (e.restore) {
          await prisma.priceChange.create({
            data: { domain: "TRANSFORMER", entity: "TransformerPrice", entityId: e.code, label: e.label, field: "__restored", batchId, actorId, actorEmail },
          });
        }
        updated++;
      } else if (e.kind === "remove" && e.id && includeRemovals) {
        await prisma.transformerPrice.update({ where: { id: e.id }, data: { active: false, updatedBy: actorEmail } });
        await prisma.priceChange.create({
          data: { domain: "TRANSFORMER", entity: "TransformerPrice", entityId: e.code, label: e.label, field: "__retired", batchId, actorId, actorEmail },
        });
        removed++;
      }
    }

    await prisma.priceImportBatch.update({ where: { id: batch.id }, data: { status: "APPLIED" } });
    // Auto-publish (every change goes live). A blocked publish still leaves the draft written, which
    // is what the price screen reads — the button can publish by hand.
    const { version, blockers } = await publishCurrentPricesDetailed(actorEmail, "Transformer price import");
    res.json({ ok: true, added, updated, removed, published: version != null, version, blockers });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/transformer/import/:id/cancel */
export async function postTransformerImportCancel(req: Request, res: Response) {
  try {
    const batch = await prisma.priceImportBatch.findUnique({ where: { id: req.params.id } });
    if (batch && batch.status === "PENDING") {
      await prisma.priceImportBatch.update({ where: { id: batch.id }, data: { status: "CANCELLED" } });
    }
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
