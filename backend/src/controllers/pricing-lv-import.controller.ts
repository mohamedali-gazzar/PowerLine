// Bulk LV price update from a spreadsheet.
//
// Two steps on purpose: PREVIEW works out exactly what would change and stores
// it as a pending batch; APPLY replays that stored batch. Nothing is written
// until the person who uploaded the file has seen the numbers and said yes.
//
// Items are matched on the manufacturer part number (Item Code -> ref), which
// is the only stable identifier the two sides share. Once matched, the sheet is
// the source of truth for the component's DATA too — description, brand, type
// and poles — not just its price. A blank cell always means "no new
// information" and never overwrites what is already there.
//
// Renaming a description is deliberate but not free: the combination builders
// resolve parts by description (catalog.findByName), so a rename that no
// template expects orphans that build. The preview flags every rename for that
// reason — it is never applied silently.
//
// An ENCLOSURE's `name` is the one thing still never rewritten: cell matching
// parses it for dimensions and [fam, name] is unique, so a rename there is a
// structural change, not a relabel. Enclosure rows update their price only.

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";
import { publishCurrentPricesDetailed } from "./pricing.controller";

/** How long a previewed batch stays applicable. */
const BATCH_TTL_MS = 60 * 60 * 1000;
/** Detail rows sent back for display — the full set is stored in the batch. */
const DETAIL_CAP = 300;

/** A row as it comes off the spreadsheet, before any interpretation.
 *  Every data column a component carries is accepted — the template shipped
 *  Weight/Panel/Pole and Weight/Cell/Pole long before anything read them. */
const rawRowSchema = z.object({
  type: z.string().default(""),
  family: z.string().default(""),
  rating: z.string().default(""),
  description: z.string().default(""),
  code: z.string().default(""),
  eur: z.number().default(0),
  egp: z.number().default(0),
  brand: z.string().default(""),
  poles: z.number().int().default(0),
  cuP: z.number().default(0),   // copper kg/pole — panels
  cuC: z.number().default(0),   // copper kg/pole — cells
  stock: z.string().default(""),
});

const previewSchema = z.object({ rows: z.array(rawRowSchema).min(1).max(6000) });

type RawRow = z.infer<typeof rawRowSchema>;

/** One non-price column the sheet would rewrite on an already-catalogued item. */
export interface FieldChange {
  /** LvComponent column. Only the keys in APPLIABLE_FIELDS are ever written. */
  field: "d" | "brand" | "t" | "f" | "r" | "poles" | "cuP" | "cuC" | "stock";
  /** Human label for the preview ("Description", "Brand", …). */
  label: string;
  from: string;
  to: string;
}

/** Every column an import may rewrite, and the label it reports.
 *  A whitelist on purpose: the diff is replayed from stored JSON, so nothing
 *  outside this map can ever be written, whatever a batch claims.
 *
 *  This is the component's whole data set bar two: `ref` is the key rows are
 *  matched on, and `sortIndex` is catalogue ORDER, which is load-bearing for
 *  the combination builders and must never come from a spreadsheet. */
const APPLIABLE_FIELDS: Record<FieldChange["field"], string> = {
  d: "Description",
  brand: "Brand",
  t: "Type",
  f: "Family",
  r: "Rating",
  poles: "Poles",
  cuP: "Weight/Panel/Pole",
  cuC: "Weight/Cell/Pole",
  stock: "Stock",
};
/** Columns compared as numbers rather than trimmed text. */
const NUMERIC_FIELDS = new Set<FieldChange["field"]>(["poles", "cuP", "cuC"]);

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
  /** False when the sheet left the price blank and only data columns moved —
   *  apply then leaves the price exactly as it is. */
  priceMoved?: boolean;
  /** Non-price columns this row would rewrite (components only). */
  fields?: FieldChange[];
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
      prisma.lvComponent.findMany({
        select: {
          id: true, ref: true, d: true, n: true, eur: true, egp: true,
          // EVERY column an import may rewrite must be selected — a field left out here
          // reads as undefined, compares as 0/"", and reports a change on every row.
          t: true, f: true, r: true, brand: true, poles: true, cuP: true, cuC: true, stock: true,
        },
      }),
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
        // A blank price cell means "no new information", never "make it free" —
        // but the row can still carry a data change, so it is not skipped here.
        const priceGiven = useEur > 0 || useEgp > 0;
        if (!priceGiven && (existing.eur > 0 || existing.egp > 0)) blankKept++;
        const priceMoved =
          priceGiven && !(sameMoney(existing.eur, useEur) && sameMoney(existing.egp, useEgp));

        // Data columns. Same rule as the price: a blank (or zero) cell says nothing.
        // Driven off APPLIABLE_FIELDS, so adding a column to the catalogue means
        // adding one entry there and one alias in the sheet parser — not a new branch.
        const fields: FieldChange[] = [];
        if (comp) {
          const sheet: Record<FieldChange["field"], string | number> = {
            d: row.description, brand: row.brand, t: row.type, f: row.family, r: row.rating,
            poles: row.poles, cuP: row.cuP, cuC: row.cuC, stock: row.stock,
          };
          for (const key of Object.keys(APPLIABLE_FIELDS) as FieldChange["field"][]) {
            const now = sheet[key];
            const was = (comp as unknown as Record<string, unknown>)[key];
            if (NUMERIC_FIELDS.has(key)) {
              const n = Number(now) || 0;
              if (n > 0 && Math.abs(n - (Number(was) || 0)) > 1e-9) {
                fields.push({ field: key, label: APPLIABLE_FIELDS[key], from: String(was ?? 0), to: String(n) });
              }
            } else {
              const to = String(now ?? "").trim();
              if (to && to !== String(was ?? "").trim()) {
                fields.push({ field: key, label: APPLIABLE_FIELDS[key], from: String(was ?? ""), to });
              }
            }
          }
          // A rename moves the key the combination builders resolve parts by.
          if (fields.some((f) => f.field === "d")) {
            warnings.push(
              `${row.code}: description renamed — any combination template that names the old text will stop finding this part.`,
            );
          }
        } else if (encl && row.description.trim() && row.description.trim() !== encl.name.trim()) {
          // An enclosure's name is parsed for dimensions and is half its unique key.
          warnings.push(`${row.code}: enclosure description differs — left as is (cell matching parses that name). Price still updated.`);
        }

        if (!priceMoved && !fields.length) {
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
          // A data-only row replays its own price, so apply never rewrites it.
          eur: priceMoved ? useEur : existing.eur,
          egp: priceMoved ? useEgp : existing.egp,
          pct: priceMoved && existing.eur > 0 && useEur > 0 ? ((useEur - existing.eur) / existing.eur) * 100 : undefined,
          priceMoved,
          fields,
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
      // An update row can move the price, the data columns, or both.
      priceUpdates: updates.filter((u) => u.priceMoved).length,
      dataUpdates: updates.filter((u) => (u.fields?.length ?? 0) > 0).length,
      renames: updates.filter((u) => u.fields?.some((f) => f.field === "d")).length,
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

          const data: Record<string, unknown> = { updatedBy: by };
          // priceMoved is absent on batches previewed before data columns existed —
          // those were price-only by definition, so undefined must mean "write it".
          const writePrice = d.priceMoved !== false;
          if (writePrice) { data.eur = d.eur; data.egp = d.egp; }

          // Post-update values, needed for the `search` column below.
          const next = { t: cur.t, f: cur.f, r: cur.r, d: cur.d, brand: cur.brand };
          for (const fc of d.fields ?? []) {
            if (!(fc.field in APPLIABLE_FIELDS)) continue; // whitelist — replayed JSON is not trusted
            if (NUMERIC_FIELDS.has(fc.field)) {
              data[fc.field] = fc.field === "poles" ? Math.trunc(Number(fc.to) || 0) : Number(fc.to) || 0;
              continue;
            }
            data[fc.field] = fc.to;
            if (fc.field === "d") data.n = fc.to; // d and n are both combination lookup keys — never let them drift
            if (fc.field in next) (next as Record<string, string>)[fc.field] = fc.to;
          }
          // Keep the one lowercase column the price-list search reads (schema: "t f r d ref brand").
          if ((d.fields?.length ?? 0) > 0) data.search = searchText(next.t, next.f, next.r, next.d, cur.ref, next.brand);

          await prisma.lvComponent.update({ where: { id: cur.id }, data });

          if (writePrice) {
            await prisma.priceChange.create({
              data: {
                domain: "LV", entity: "LvComponent", entityId: cur.id,
                label: cur.d || cur.n || cur.ref, field: "price",
                oldValue: `${cur.eur} EUR / ${cur.egp} EGP`, newValue: `${d.eur} EUR / ${d.egp} EGP`,
                actorId, actorEmail: by,
              },
            });
          }
          // One audit row per data column, so the history reads field by field.
          for (const fc of d.fields ?? []) {
            if (!(fc.field in APPLIABLE_FIELDS)) continue;
            await prisma.priceChange.create({
              data: {
                domain: "LV", entity: "LvComponent", entityId: cur.id,
                label: cur.d || cur.n || cur.ref, field: fc.label.toLowerCase(),
                oldValue: fc.from, newValue: fc.to,
                actorId, actorEmail: by,
              },
            });
          }
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
            // Family and rating used to be dropped here, which is how rows ended up in the
            // catalogue with a blank family that no later import could put back.
            f: r?.family?.trim() || "",
            r: r?.rating?.trim() || "",
            d: d.label,
            n: d.label,
            ref: d.code,
            brand: r?.brand?.trim() || "ABB",
            poles: r?.poles ?? 0,
            cuP: r?.cuP ?? 0,
            cuC: r?.cuC ?? 0,
            stock: r?.stock?.trim() || "",
            eur: d.eur,
            egp: d.egp,
            search: searchText(r?.type ?? "", r?.family ?? "", r?.rating ?? "", d.label, d.code, r?.brand ?? ""),
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
    // The publish guards are RMU-side, so an unrelated gap there can stop an LV import
    // from reaching anyone. Pass the reason back rather than reporting a bare failure.
    const pub = await publishCurrentPricesDetailed(by, `Spreadsheet import: ${updated} updated, ${added} added`);
    res.json({
      ok: true, updated, added, skipped,
      published: pub.version !== null, version: pub.version, blockers: pub.blockers,
    });
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
