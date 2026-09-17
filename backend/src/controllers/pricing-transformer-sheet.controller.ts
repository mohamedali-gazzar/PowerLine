// Transformer technical sheets — an uploaded PDF datasheet per transformer, keyed by the
// TransformerPrice.code. Stored in its own TransformerSheet table (base64 in `data`), mirroring
// the LvAttachment upload/download pattern in qtns.controller.ts. The MV technical offer renders
// whatever is uploaded here, so sheets are managed by upload — never by code changes.
//
// Upload / delete require the price-admin permission; download is any authenticated user, because
// the sheet is a customer-facing datasheet that also has to load inside the offer.

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";

// A full datasheet PDF — larger than a QTN attachment, but kept well under the 8 MB JSON body
// limit once base64 (~+33 %) is applied.
export const MAX_TRANSFORMER_SHEET_BYTES = 5 * 1024 * 1024;

const sheetSchema = z.object({
  name: z.string().trim().min(1, "File name is required.").max(260),
  mime: z.string().trim().max(160).optional(),
  data: z.string().min(1, "File is empty."), // plain base64, no "data:*;base64," prefix
});

const INLINE_OK = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp",
]);

/** A code's IP twin — the same transformer's other IP variant. Two suffix shapes: Powerline
 *  "…2300" (IP23) ↔ "…0000" (IP00); dash form (e.g. Hitachi) "…-23" ↔ "…-00". A transformer may be
 *  stored under just one variant, so its twin is still a valid sheet key. Null when there's no IP
 *  suffix. */
export function ipTwin(code: string): string | null {
  if (/2300$/.test(code)) return code.replace(/2300$/, "0000");
  if (/0000$/.test(code)) return code.replace(/0000$/, "2300");
  if (/-23$/.test(code)) return code.replace(/-23$/, "-00");
  if (/-00$/.test(code)) return code.replace(/-00$/, "-23");
  return null;
}

/** POST /api/pricing/transformer/:code/sheet  { name, mime, data } — upload or replace the sheet. */
export async function uploadTransformerSheet(req: Request, res: Response) {
  try {
    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Missing transformer code." });
    // Accept the code itself OR its IP twin — a transformer's price row stores one of the two IP
    // codes, but a sheet may be uploaded for either the IP23 (…2300) or IP00 (…0000) variant.
    const twin = ipTwin(code);
    const tr = await prisma.transformerPrice.findFirst({
      where: { code: { in: twin ? [code, twin] : [code] } }, select: { id: true },
    });
    if (!tr) return res.status(404).json({ error: "No transformer with that code." });

    const { name, mime, data } = sheetSchema.parse(req.body);
    const buf = Buffer.from(data, "base64");
    if (!buf.length) return res.status(400).json({ error: "File is empty or not valid base64." });
    if (buf.length > MAX_TRANSFORMER_SHEET_BYTES) {
      return res.status(413).json({
        error: `"${name}" is too large. The limit is ${Math.round(MAX_TRANSFORMER_SHEET_BYTES / (1024 * 1024))} MB per sheet.`,
      });
    }
    const finalMime = mime || "application/pdf";
    const stored = { name, mime: finalMime, size: buf.length, data: buf.toString("base64"), byEmail: req.userEmail ?? "" };
    const row = await prisma.transformerSheet.upsert({
      where: { code },
      create: { code, ...stored },
      update: stored,
      select: { code: true, name: true, mime: true, size: true, updatedAt: true },
    });
    res.status(201).json(row);
  } catch (e) {
    fail(res, e);
  }
}

/** GET /api/pricing/transformer/:code/sheet — the file itself (inline; ?dl=1 forces download). */
export async function downloadTransformerSheet(req: Request, res: Response) {
  try {
    const code = String(req.params.code || "").trim();
    const meta = await prisma.transformerSheet.findUnique({
      where: { code }, select: { name: true, mime: true, size: true, updatedAt: true },
    });
    if (!meta) return res.status(404).json({ error: "No technical sheet for this transformer." });

    // Immutable per (size, updatedAt) → strong ETag + long cache; 304 avoids re-reading bytes.
    const etag = `"${code}-${meta.size}-${meta.updatedAt.getTime()}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    const body = await prisma.transformerSheet.findUnique({ where: { code }, select: { data: true } });
    if (!body) return res.status(404).json({ error: "No technical sheet for this transformer." });
    const buf = Buffer.from(body.data, "base64");
    const mime = INLINE_OK.has(meta.mime) ? meta.mime : "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    const disp = req.query.dl === "1" || mime === "application/octet-stream" ? "attachment" : "inline";
    const ascii = meta.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    res.setHeader(
      "Content-Disposition",
      `${disp}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
    );
    res.send(buf);
  } catch (e) {
    fail(res, e);
  }
}

/** DELETE /api/pricing/transformer/:code/sheet — remove the sheet. */
export async function deleteTransformerSheet(req: Request, res: Response) {
  try {
    const code = String(req.params.code || "").trim();
    await prisma.transformerSheet.deleteMany({ where: { code } });
    res.status(204).end();
  } catch (e) {
    fail(res, e);
  }
}
