import type { Request, Response } from "express";
import { Readable } from "node:stream";

// A browser-like UA — ABB's product pages 403 an obvious bot/no-UA request.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** GET /api/abb/datasheet?code=<order code>
 *  Resolve and stream the ABB data-sheet PDF for a product order code. The client can't
 *  do this itself — ABB is a different origin (CORS), and the flow is three hops:
 *   1) product page  → the data-sheet DocumentID (structured "DatSheTecInf" attribute)
 *   2) Library Download.aspx → a viewer page embedding the signed PDF URL
 *   3) the signed library.e.abb.com PDF → streamed back as an attachment. */
export async function getAbbDatasheet(req: Request, res: Response) {
  const code = String(req.query.code ?? "").trim();
  if (!/^[A-Za-z0-9._/-]{4,40}$/.test(code)) {
    return res.status(400).json({ error: "Invalid product code." });
  }
  try {
    // 1) product page → data-sheet DocumentID
    const page = await fetch(`https://new.abb.com/products/${encodeURIComponent(code)}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!page.ok) return res.status(502).json({ error: `ABB product page returned ${page.status}.` });
    const html = await page.text();
    const docId = html.match(/"attributeCode":"DatSheTecInf"[\s\S]{0,400}?"documentId":"([^"]+)"/)?.[1];
    if (!docId) return res.status(404).json({ error: "No data sheet is published for this code." });

    // 2) Download.aspx → the PDF directly, or a viewer page with the signed PDF URL
    let pdfRes = await fetch(
      `https://search.abb.com/library/Download.aspx?DocumentID=${encodeURIComponent(docId)}&LanguageCode=en&DocumentPartId=&Action=Launch`,
      { headers: { "User-Agent": UA } }
    );
    if (!/pdf/i.test(pdfRes.headers.get("content-type") ?? "")) {
      const viewer = await pdfRes.text();
      const signed = viewer.match(/https:\/\/library\.e\.abb\.com\/public\/[^"'<>\s]+?\.pdf[^"'<>\s]*/i)?.[0];
      if (!signed) return res.status(502).json({ error: "Data sheet PDF link not found at ABB." });
      pdfRes = await fetch(signed.replace(/&amp;/g, "&"), { headers: { "User-Agent": UA } });
    }
    if (!pdfRes.ok || !pdfRes.body || !/pdf/i.test(pdfRes.headers.get("content-type") ?? "")) {
      return res.status(502).json({ error: "Data sheet download failed at ABB." });
    }

    // 3) stream it back (never buffer — some data sheets are tens of MB)
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${code}.pdf"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    Readable.fromWeb(pdfRes.body as unknown as Parameters<typeof Readable.fromWeb>[0])
      .on("error", () => res.destroy())
      .pipe(res);
  } catch {
    return res.status(502).json({ error: "Could not reach ABB." });
  }
}
