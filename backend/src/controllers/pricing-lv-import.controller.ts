// Bulk LV price update from a spreadsheet.
//
// Two steps on purpose: PREVIEW works out exactly what would change and stores
// it as a pending batch; APPLY replays that stored batch. Nothing is written
// until the person who uploaded the file has seen the numbers and said yes.
//
// Items are matched on the manufacturer part number (Item Code -> ref), which
// is the only stable identifier the two sides share. Descriptions are NEVER
// written back: the combination builders look components up by description, so
// editing one would silently break a build.

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";
import { publishCurrentPrices } from "./pricing.controller";

/** How long a previewed batch stays applicable. */
const BATCH_TTL_MS = 60 * 60 * 1000;
/** Detail rows sent back for display — the full set is stored in the batch. */
const DETAIL_CAP = 300;

/** A row as it comes off the spreadsheet, before any interpretation. */
const rawRowSchema = z.object({
  type: z.string().default(""),
  description: z.string().default(""),
  code: z.string().default(""),
  eur: z.number().default(0),
  egp: z.number().default(0),
  brand: z.string().default(""),
  poles: z.number().int().default(0),
});

const previewSchema = z.object({ rows: z.array(rawRowSchema).min(1).max(6000) });

type RawRow = z.infer<typeof rawRowSchema>;

export interface DiffEntry {
  kind: "update" | "add";
  entity: "LvComponent" | "LvEnclosure";
  entityId?: string;
  code: string;
  label: string;
  fromEur?: number;
  fromEgp?: number;
  eur: number;
  egp: number;
  /** Percent move on the euro price, for the summary. */
  pct?: number;
  row?: RawRow;
}

const normRef = (v: string) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
const searchText = (...parts: string[]) => parts.join(" ").toLowerCase();

/**
 * Two prices are the same money if they differ by less than a millionth.
 *
 * Prices reach the two sides by different arithmetic — a discount applied in a
 * spreadsheet, a float round-tripped through the database — so 2.56 arrives as
 * 2.5599999999999996 on one side and 2.56 on the other. Compared with `!==`
 * that is a "change", and a sync reported a hundred of them that were not real.
 * The tolerance is far below a cent, so a genuine price move is never hidden —
 * some items are priced to four decimals and must not be rounded.
 */
const sameMoney = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * POST /api/pricing/lv/import/preview
 * Works out the change set and parks it. Writes nothing to the price list.
 */
export async function postLvImportPreview(req: Request, res: Response) {
  try {
    const { rows } = previewSchema.parse(req.body);

    const [components, enclosures] = await Promise.all([
      prisma.lvComponent.findMany({ select: { id: true, ref: true, d: true, n: true, eur: true, egp: true } }),
      prisma.lvEnclosure.findMany({ select: { id: true, ref: true, name: true, eur: true, egp: true } }),
    ]);
    const compByRef = new Map(components.filter((c) => c.ref).map((c) => [normRef(c.ref), c]));
    const enclByRef = new Map(enclosures.filter((e) => e.ref).map((e) => [normRef(e.ref), e]));

    const diff: DiffEntry[] = [];
    const warnings: string[] = [];
    let unchanged = 0;
    let blankKept = 0;
    let noCode = 0;
    let unpriced = 0;
    const seen = new Set<string>();
    let duplicates = 0;

    for (const row of rows) {
      const code = normRef(row.code);
      if (!code) {
        noCode++;
        continue;
      }
      if (seen.has(code)) {
        duplicates++;
        continue; // first occurrence wins; a file cannot price the same part twice
      }
      seen.add(code);

      const eur = Number(row.eur) || 0;
      const egp = Number(row.egp) || 0;
      if (eur > 0 && egp > 0) {
        warnings.push(`${row.code}: priced in both EUR and EGP — EUR used, EGP ignored.`);
      }
      const useEur = eur > 0 ? eur : 0;
      const useEgp = eur > 0 ? 0 : egp;

      const comp = compByRef.get(code);
      const encl = enclByRef.get(code);
      const existing = comp ?? encl;

      if (existing) {
        // A blank price cell means "no new information", never "make it free".
        if (useEur === 0 && useEgp === 0) {
          if (existing.eur > 0 || existing.egp > 0) blankKept++;
          continue;
        }
        if (sameMoney(existing.eur, useEur) && sameMoney(existing.egp, useEgp)) {
          unchanged++;
          continue;
        }
        diff.push({
          kind: "update",
          entity: comp ? "LvComponent" : "LvEnclosure",
          entityId: existing.id,
          code: row.code.trim(),
          label: (comp ? comp.d || comp.n : (encl as { name: string }).name) || row.code,
          fromEur: existing.eur,
          fromEgp: existing.egp,
          eur: useEur,
          egp: useEgp,
          pct: existing.eur > 0 && useEur > 0 ? ((useEur - existing.eur) / existing.eur) * 100 : undefined,
        });
        continue;
      }

      // Not in the price list — a new item.
      if (useEur === 0 && useEgp === 0) {
        unpriced++;
        warnings.push(`${row.code}: new item with no price — not added (it would quote as free).`);
        continue;
      }
      if (!row.description.trim()) {
        warnings.push(`${row.code}: new item with no description — not added.`);
        continue;
      }
      diff.push({
        kind: "add",
        entity: "LvComponent",
        code: row.code.trim(),
        label: row.description.trim(),
        eur: useEur,
        egp: useEgp,
        row,
      });
    }

    const updates = diff.filter((d) => d.kind === "update");
    const additions = diff.filter((d) => d.kind === "add");
    const pcts = updates.map((u) => u.pct).filter((p): p is number => typeof p === "number").sort((a, b) => a - b);

    const summary = {
      rowsRead: rows.length,
      updates: updates.length,
      additions: additions.length,
      unchanged,
      blankKept,
      noCode,
      unpriced,
      duplicates,
      increases: updates.filter((u) => typeof u.pct === "number" && u.pct > 0).length,
      decreases: updates.filter((u) => typeof u.pct === "number" && u.pct < 0).length,
      medianPct: pcts.length ? pcts[Math.floor(pcts.length / 2)] : null,
      minPct: pcts.length ? pcts[0] : null,
      maxPct: pcts.length ? pcts[pcts.length - 1] : null,
    };

    const batch = await prisma.priceImportBatch.create({
      data: {
        domain: "LV",
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
      updates: updates.slice(0, DETAIL_CAP),
      additions: additions.slice(0, DETAIL_CAP),
      warnings: warnings.slice(0, 50),
      truncated: updates.length > DETAIL_CAP || additions.length > DETAIL_CAP,
      expiresAt: batch.expiresAt,
    });
  } catch (e) {
    fail(res, e);
  }
}

/**
 * POST /api/pricing/lv/import/:id/apply
 * Replays a previewed batch. Prices become part of the draft price list; they
 * reach quotations when the list is next published.
 */
export async function postLvImportApply(req: Request, res: Response) {
  try {
    const batch = await prisma.priceImportBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) return res.status(404).json({ error: "That import has expired or was already used." });
    if (batch.status !== "PENDING") {
      return res.status(409).json({ error: `This import was already ${batch.status.toLowerCase()}.` });
    }
    if (batch.expiresAt.getTime() < Date.now()) {
      await prisma.priceImportBatch.update({ where: { id: batch.id }, data: { status: "CANCELLED" } });
      return res.status(410).json({ error: "That preview is over an hour old — please upload the file again." });
    }

    const diff = JSON.parse(batch.diff) as DiffEntry[];
    const by = req.userEmail ?? "";
    const actorId = req.userId ?? null;

    let updated = 0;
    let added = 0;
    let skipped = 0;

    // Append-only: the catalogue ORDER is load-bearing, so new items go after
    // everything that already exists.
    const last = await prisma.lvComponent.findFirst({ orderBy: { sortIndex: "desc" }, select: { sortIndex: true } });
    let nextSortIndex = (last?.sortIndex ?? -1) + 1;

    for (const d of diff) {
      if (d.kind === "update" && d.entityId) {
        if (d.entity === "LvComponent") {
          // Re-read so the audit records what the price actually was, even if it
          // moved between preview and apply.
          const cur = await prisma.lvComponent.findUnique({ where: { id: d.entityId } });
          if (!cur) { skipped++; continue; }
          await prisma.lvComponent.update({
            where: { id: cur.id },
            data: { eur: d.eur, egp: d.egp, updatedBy: by },
          });
          await prisma.priceChange.create({
            data: {
              domain: "LV", entity: "LvComponent", entityId: cur.id,
              label: cur.d || cur.n || cur.ref, field: "price",
              oldValue: `${cur.eur} EUR / ${cur.egp} EGP`, newValue: `${d.eur} EUR / ${d.egp} EGP`,
              actorId, actorEmail: by,
            },
          });
        } else {
          const cur = await prisma.lvEnclosure.findUnique({ where: { id: d.entityId } });
          if (!cur) { skipped++; continue; }
          await prisma.lvEnclosure.update({
            where: { id: cur.id },
            data: { eur: d.eur, egp: d.egp, updatedBy: by },
          });
          await prisma.priceChange.create({
            data: {
              domain: "LV", entity: "LvEnclosure", entityId: cur.id,
              label: cur.name || cur.ref, field: "price",
              oldValue: `${cur.eur} EUR / ${cur.egp} EGP`, newValue: `${d.eur} EUR / ${d.egp} EGP`,
              actorId, actorEmail: by,
            },
          });
        }
        updated++;
        continue;
      }

      if (d.kind === "add") {
        // Guard against the same part being added twice by two overlapping imports.
        const clash = await prisma.lvComponent.findFirst({ where: { ref: d.code } });
        if (clash) { skipped++; continue; }
        const r = d.row;
        const row = await prisma.lvComponent.create({
          data: {
            sortIndex: nextSortIndex++,
            t: r?.type?.trim() || "",
            f: "",
            r: "",
            d: d.label,
            n: d.label,
            ref: d.code,
            brand: r?.brand?.trim() || "ABB",
            poles: r?.poles ?? 0,
            eur: d.eur,
            egp: d.egp,
            search: searchText(r?.type ?? "", d.label, d.code, r?.brand ?? ""),
            updatedBy: by,
          },
        });
        await prisma.priceChange.create({
          data: {
            domain: "LV", entity: "LvComponent", entityId: row.id,
            label: row.d, field: "__created",
            newValue: d.eur > 0 ? `${d.eur} EUR` : `${d.egp} EGP`,
            actorId, actorEmail: by,
          },
        });
        added++;
      }
    }

    await prisma.priceImportBatch.update({ where: { id: batch.id }, data: { status: "APPLIED" } });

    // Live immediately — changing a price and it reaching a quotation are one act.
    const version = await publishCurrentPrices(by, `Spreadsheet import: ${updated} updated, ${added} added`);
    res.json({ ok: true, updated, added, skipped, published: version !== null, version });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/lv/import/:id/cancel — throw away a previewed batch. */
export async function postLvImportCancel(req: Request, res: Response) {
  try {
    const batch = await prisma.priceImportBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) return res.json({ ok: true });
    if (batch.status === "PENDING") {
      await prisma.priceImportBatch.update({ where: { id: batch.id }, data: { status: "CANCELLED" } });
    }
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
