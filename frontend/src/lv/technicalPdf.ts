// ─────────────────────────────────────────────────────────────────────────────
// Technical Offer → multi-page PDF, rendered from the on-screen HTML.
//
// Why this approach: jsPDF's built-in fonts are Latin-only, so drawing text with
// autoTable turns Arabic into garbage. Instead we let the BROWSER render the offer
// (Arabic / RTL come out exactly like the on-screen preview), lay it out as A4
// page-blocks, paginate the component rows across pages (with the logo header and
// "Page X of Y" footer repeated on every page except the cover), then html2canvas
// each page-block into the PDF. Text isn't selectable (pages are images), but the
// rendering is guaranteed correct — Arabic included.
//
// The caller passes the live `.print-area` element (the rendered offer) plus a
// filename. We read the pieces via data-pdf-* hooks:
//   [data-pdf-cover]     the branded cover sheet (one full-bleed page)
//   [data-pdf-header]    the running logo/project/QTN header (cloned onto each page)
//   [data-pdf-notes]     the notes blocks (paginated)
//   [data-pdf-panel]     each panel; within it:
//     [data-pdf-specblock]  item bar + spec grid (first page of the panel only)
//     [data-pdf-comptable]  the components table (its rows flow across pages)
// ─────────────────────────────────────────────────────────────────────────────
import { jsPDF } from "jspdf";
// html-to-image (SVG foreignObject) renders through the browser engine, so the
// captured pages match the on-screen offer exactly — including tight-row descenders
// that html2canvas clips. That's why the export uses it instead of html2canvas.
import * as htmlToImage from "html-to-image";

const PW = 210; // A4 width (mm)
const PH = 297; // A4 height (mm)

type ExportOpts = { printArea: HTMLElement; filename: string; asBlob?: boolean };

// Strip editor-only chrome + any lingering animation transform from a clone.
function neutralize(el: HTMLElement) {
  el.style.transform = "none";
  el.style.animation = "none";
  el.style.opacity = "1";
  el.querySelectorAll<HTMLElement>(".no-print").forEach((n) => n.remove());
}

// An empty A4 page shell: header (optional) + flex content area + footer.
function pageEl(): HTMLElement {
  const p = document.createElement("div");
  p.style.cssText =
    "width:210mm;height:297mm;box-sizing:border-box;padding:24px 32px 12px;background:#fff;display:flex;flex-direction:column;overflow:hidden;";
  return p;
}
function contentPage(headerEl: HTMLElement | null): { page: HTMLElement; content: HTMLElement } {
  const page = pageEl();
  if (headerEl) {
    const h = headerEl.cloneNode(true) as HTMLElement;
    neutralize(h);
    page.appendChild(h);
  }
  const content = document.createElement("div");
  content.style.cssText = "flex:1 1 auto;min-height:0;overflow:hidden;";
  page.appendChild(content);
  const footer = document.createElement("div");
  footer.className = "pdf-footer";
  footer.style.cssText =
    "flex:0 0 auto;text-align:center;font-size:10.5px;font-weight:600;color:#6b6b72;padding-top:8px;";
  footer.textContent = "Page 0 of 0"; // reserves height; real value stamped once total is known
  page.appendChild(footer);
  return { page, content };
}

// React-controlled <input>s (the note lines) lose their live value on cloneNode,
// and html2canvas renders form controls poorly — so replace each with a text span.
function inlineInputs(orig: HTMLElement, clone: HTMLElement) {
  const oi = Array.from(orig.querySelectorAll("input"));
  const ci = Array.from(clone.querySelectorAll("input"));
  ci.forEach((c, i) => {
    const span = document.createElement("span");
    span.textContent = (oi[i]?.value ?? c.value) || "";
    span.className = c.className;
    span.style.display = "block";
    span.style.whiteSpace = "pre-wrap";
    c.replaceWith(span);
  });
}

function makeCoverPage(coverEl: HTMLElement): HTMLElement {
  const c = coverEl.cloneNode(true) as HTMLElement;
  neutralize(c);
  c.style.width = "210mm";
  c.style.height = "297mm";
  c.style.margin = "0";
  c.style.boxShadow = "none";
  c.dataset.cover = "1";
  return c;
}

// A divider/separator page → one full-bleed page (like the cover). The controlled
// <textarea> loses its value on cloneNode, so its text is baked into a <div>.
function makeSeparatorPage(sepEl: HTMLElement): HTMLElement {
  const c = sepEl.cloneNode(true) as HTMLElement;
  neutralize(c);
  c.style.width = "210mm";
  c.style.height = "297mm";
  c.style.margin = "0";
  c.style.boxShadow = "none";
  const orig = sepEl.querySelector("textarea");
  const clone = c.querySelector("textarea");
  if (clone) {
    const div = document.createElement("div");
    div.textContent = orig?.value || "";
    div.className = clone.className;
    div.style.whiteSpace = "pre-wrap";
    clone.replaceWith(div);
  }
  return c;
}

// Pack a list of block nodes into A4 content pages (used for the notes).
function paginateBlocks(host: HTMLElement, headerEl: HTMLElement | null, origBlocks: HTMLElement[]): HTMLElement[] {
  const pages: HTMLElement[] = [];
  let bi = 0;
  do {
    const { page, content } = contentPage(headerEl);
    host.appendChild(page);
    while (bi < origBlocks.length) {
      const clone = origBlocks[bi].cloneNode(true) as HTMLElement;
      neutralize(clone);
      inlineInputs(origBlocks[bi], clone);
      content.appendChild(clone);
      if (content.scrollHeight > content.clientHeight + 1) {
        if (content.childElementCount > 1) {
          content.removeChild(clone);
          break;
        }
        bi++; // a single block taller than a page — keep it and move on
        break;
      }
      bi++;
    }
    pages.push(page);
  } while (bi < origBlocks.length);
  return pages;
}

// Paginate one panel: spec block on the first page, then the component table's rows
// flow across pages with the column header (thead) repeated on each.
function paginatePanel(host: HTMLElement, headerEl: HTMLElement | null, panelEl: HTMLElement): HTMLElement[] {
  const specblock = panelEl.querySelector<HTMLElement>("[data-pdf-specblock]");
  const table = panelEl.querySelector<HTMLElement>("[data-pdf-comptable]");
  if (!table) return [];
  const frame = table.parentElement as HTMLElement; // rounded bordered wrapper
  const colgroup = table.querySelector("colgroup");
  const thead = table.querySelector("thead");
  const rows = Array.from(table.querySelectorAll<HTMLElement>(":scope > tbody > tr"));
  const pages: HTMLElement[] = [];
  let ri = 0;
  let first = true;
  do {
    const { page, content } = contentPage(headerEl);
    host.appendChild(page);
    if (first && specblock) {
      const sb = specblock.cloneNode(true) as HTMLElement;
      neutralize(sb);
      content.appendChild(sb);
      const spacer = document.createElement("div");
      spacer.style.height = "12px";
      content.appendChild(spacer);
    }
    // fresh table (frame + colgroup + thead + empty tbody) for this page
    const frameClone = frame.cloneNode(false) as HTMLElement;
    const t = document.createElement("table");
    t.className = table.className;
    t.style.width = "100%";
    if (colgroup) t.appendChild(colgroup.cloneNode(true));
    if (thead) t.appendChild(thead.cloneNode(true));
    const tb = document.createElement("tbody");
    t.appendChild(tb);
    frameClone.appendChild(t);
    content.appendChild(frameClone);
    while (ri < rows.length) {
      tb.appendChild(rows[ri].cloneNode(true));
      if (content.scrollHeight > content.clientHeight + 1) {
        if (tb.childElementCount > 1) {
          tb.removeChild(tb.lastElementChild!);
          break;
        }
        ri++; // single row taller than a page — keep it and move on
        break;
      }
      ri++;
    }
    // Keep a section/group header with its content: if this page ends on header row(s)
    // whose items overflowed onto the next page, move those headers to the next page too
    // (so a header is never stranded as the last row). Guarded to keep ≥1 row per page.
    if (ri < rows.length) {
      while (ri > 0 && tb.childElementCount > 1 && rows[ri - 1].hasAttribute("data-pdf-head")) {
        tb.removeChild(tb.lastElementChild!);
        ri--;
      }
    }
    pages.push(page);
    first = false;
  } while (ri < rows.length);
  return pages;
}

// Paginate the Commercial "Main Offer" table: the running header + the column header
// (thead) repeat on every page, rows flow across pages without ever being cut, and the
// totals block is placed after the last row (or a fresh page if it doesn't fit).
function paginateCommercialMain(
  host: HTMLElement,
  headerEl: HTMLElement | null,
  table: HTMLElement,
  totalsEl: HTMLElement | null,
): HTMLElement[] {
  const colgroup = table.querySelector("colgroup");
  const thead = table.querySelector("thead");
  const rows = Array.from(table.querySelectorAll<HTMLElement>(":scope > tbody > tr"));
  const pages: HTMLElement[] = [];
  let lastContent: HTMLElement | null = null;
  let ri = 0;
  do {
    const { page, content } = contentPage(headerEl);
    host.appendChild(page);
    const t = document.createElement("table");
    t.className = table.className;
    t.style.width = "100%";
    if (colgroup) t.appendChild(colgroup.cloneNode(true));
    if (thead) t.appendChild(thead.cloneNode(true));
    const tb = document.createElement("tbody");
    t.appendChild(tb);
    content.appendChild(t);
    while (ri < rows.length) {
      tb.appendChild(rows[ri].cloneNode(true));
      if (content.scrollHeight > content.clientHeight + 1) {
        if (tb.childElementCount > 1) { tb.removeChild(tb.lastElementChild!); break; }
        ri++; break; // a single row taller than a page — keep it and move on
      }
      ri++;
    }
    pages.push(page);
    lastContent = content;
  } while (ri < rows.length);
  // Totals: after the last row if it fits, otherwise a new page.
  if (totalsEl && lastContent) {
    const tot = totalsEl.cloneNode(true) as HTMLElement;
    neutralize(tot);
    lastContent.appendChild(tot);
    if (lastContent.scrollHeight > lastContent.clientHeight + 1) {
      lastContent.removeChild(tot);
      const { page, content } = contentPage(headerEl);
      host.appendChild(page);
      content.appendChild(tot);
      pages.push(page);
    }
  }
  return pages;
}

/**
 * Re-attach hyperlinks after a page has been rasterised.
 *
 * Every page goes into the PDF as an image, so an <a> in the source is just
 * pixels by the time the customer opens the file. jsPDF can carry a link
 * annotation instead: measure the anchor inside its page block, scale px → mm,
 * and lay the clickable rectangle over the same spot on the page.
 *
 * Must run while the page block is still mounted, or the rects are all zero.
 */
function addPageLinks(pdf: jsPDF, page: HTMLElement): void {
  // EVERY anchor, not just tagged ones — the cover's certifications, address, phone,
  // email and social icons are ordinary <a> elements and were all dead in the export.
  // data-pdf-link stays supported as an override for a clickable area that is not an
  // anchor. mailto: and tel: work as PDF URI actions just like http.
  const anchors = page.querySelectorAll<HTMLElement>("a[href], [data-pdf-link]");
  if (!anchors.length) return;
  const box = page.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const sx = PW / box.width;
  const sy = PH / box.height;
  const seen = new Set<HTMLElement>();
  for (const a of anchors) {
    if (seen.has(a)) continue; // an anchor carrying data-pdf-link matches both selectors
    seen.add(a);
    const url = a.getAttribute("data-pdf-link") || a.getAttribute("href") || "";
    if (!url || url.startsWith("#")) continue; // in-page anchors mean nothing in the PDF
    const r = a.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    pdf.link((r.left - box.left) * sx, (r.top - box.top) * sy, r.width * sx, r.height * sy, { url });
  }
}

// Generic "one .a4-sheet → one (or more) A4 pages" export, for offers whose pages are
// already laid out as fixed A4 sheets (e.g. the Commercial Offer: cover + priced
// summary + EN/AR terms). Each top-level .a4-sheet is cloned, its live input/textarea
// values baked in, captured, and drawn to page-width; a sheet taller than A4 is sliced
// across pages (drawing the same image at successive negative offsets). No per-row
// pagination — the on-screen sheets already are the page layout.
export async function exportSheetsPdf(opts: ExportOpts): Promise<Blob | void> {
  const { printArea, filename } = opts;
  const sheets = Array.from(printArea.querySelectorAll<HTMLElement>(":scope > .a4-sheet"));
  if (!sheets.length) return;

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;";
  host.className = "print-area"; // keep the offer's light palette even when the app is in dark mode
  document.body.appendChild(host);
  try {
    const clones = sheets.map((sheet) => {
      const c = sheet.cloneNode(true) as HTMLElement;
      neutralize(c);
      inlineInputs(sheet, c);
      // Controlled <textarea>s (e.g. terms editor) lose their value on cloneNode — bake it.
      const ot = Array.from(sheet.querySelectorAll("textarea"));
      const ct = Array.from(c.querySelectorAll("textarea"));
      ct.forEach((cta, i) => {
        const d = document.createElement("div");
        d.textContent = ot[i]?.value || "";
        d.className = cta.className;
        d.style.whiteSpace = "pre-wrap";
        cta.replaceWith(d);
      });
      c.style.width = "210mm";
      c.style.margin = "0";
      c.style.boxShadow = "none";
      for (const el of c.querySelectorAll<HTMLElement>(".no-print")) el.remove();
      host.appendChild(c);
      return c;
    });

    await new Promise((r) => setTimeout(r, 40));
    await document.fonts.ready;

    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    let fontEmbedCSS: string | undefined;
    try { fontEmbedCSS = await htmlToImage.getFontEmbedCSS(host); } catch { /* per-call embedding */ }

    let firstPage = true;
    for (const c of clones) {
      const rect = c.getBoundingClientRect();
      const imgHmm = rect.width ? (PW * rect.height) / rect.width : PH; // height at page width
      const img = await htmlToImage.toJpeg(c, { quality: 0.92, backgroundColor: "#ffffff", pixelRatio: 2, fontEmbedCSS });
      const nPages = Math.max(1, Math.ceil((imgHmm - 0.5) / PH));
      for (let i = 0; i < nPages; i++) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        pdf.addImage(img, "JPEG", 0, -i * PH, PW, imgHmm); // page bounds clip to this slice
      }
    }
    if (opts.asBlob) return pdf.output("blob");
    pdf.save(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}

// Commercial Offer export. The cover and the "Main Offer" table are laid out as real
// A4 page-blocks (so the header + column header repeat on every page and rows never get
// cut); the Terms & Conditions sheets keep the whole-sheet capture (one page each in
// normal use).
export async function exportCommercialPdf(opts: ExportOpts): Promise<Blob | void> {
  const { printArea, filename } = opts;
  const cover = printArea.querySelector<HTMLElement>("[data-pdf-cover]");
  const header = printArea.querySelector<HTMLElement>("[data-pdf-header]");
  const mainTable = printArea.querySelector<HTMLElement>("[data-pdf-cotable]");
  const totals = printArea.querySelector<HTMLElement>("[data-pdf-totals]");
  const mainSheet = mainTable ? (mainTable.closest(".a4-sheet") as HTMLElement | null) : null;
  const termSheets = Array.from(printArea.querySelectorAll<HTMLElement>(":scope > .a4-sheet"))
    .filter((s) => s !== cover && s !== mainSheet);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;";
  host.className = "print-area"; // keep the offer's light palette even when the app is in dark mode
  document.body.appendChild(host);
  try {
    // Cover + paginated Main Offer, as A4 page-blocks.
    const blockPages: HTMLElement[] = [];
    if (cover) blockPages.push(makeCoverPage(cover));
    if (mainTable) blockPages.push(...paginateCommercialMain(host, header, mainTable, totals));
    host.append(...blockPages);
    // Drop the reserved "Page X of Y" footer — the commercial offer has no page footer.
    for (const p of blockPages) {
      p.querySelectorAll<HTMLElement>(".pdf-footer").forEach((f) => f.remove());
      for (const el of p.querySelectorAll<HTMLElement>(".no-print")) el.remove();
    }

    // Terms & Conditions sheets, captured whole (values baked in), sliced if taller than A4.
    const termClones = termSheets.map((ts) => {
      const c = ts.cloneNode(true) as HTMLElement;
      neutralize(c);
      inlineInputs(ts, c);
      const ot = Array.from(ts.querySelectorAll("textarea"));
      const ct = Array.from(c.querySelectorAll("textarea"));
      ct.forEach((cta, i) => {
        const d = document.createElement("div");
        d.textContent = ot[i]?.value || "";
        d.className = cta.className;
        d.style.whiteSpace = "pre-wrap";
        cta.replaceWith(d);
      });
      c.style.width = "210mm";
      c.style.margin = "0";
      c.style.boxShadow = "none";
      for (const el of c.querySelectorAll<HTMLElement>(".no-print")) el.remove();
      host.appendChild(c);
      return c;
    });

    if (!blockPages.length && !termClones.length) return;
    await new Promise((r) => setTimeout(r, 40));
    await document.fonts.ready;

    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    let fontEmbedCSS: string | undefined;
    try { fontEmbedCSS = await htmlToImage.getFontEmbedCSS(host); } catch { /* per-call embedding */ }

    let firstPage = true;
    for (const p of blockPages) {
      const img = await htmlToImage.toJpeg(p, { quality: 0.92, backgroundColor: "#ffffff", pixelRatio: 2, fontEmbedCSS });
      if (!firstPage) pdf.addPage();
      firstPage = false;
      pdf.addImage(img, "JPEG", 0, 0, PW, PH);
      addPageLinks(pdf, p);
    }
    for (const c of termClones) {
      const rect = c.getBoundingClientRect();
      const imgHmm = rect.width ? (PW * rect.height) / rect.width : PH;
      const img = await htmlToImage.toJpeg(c, { quality: 0.92, backgroundColor: "#ffffff", pixelRatio: 2, fontEmbedCSS });
      const nPages = Math.max(1, Math.ceil((imgHmm - 0.5) / PH));
      for (let i = 0; i < nPages; i++) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
        pdf.addImage(img, "JPEG", 0, -i * PH, PW, imgHmm);
      }
    }
    if (opts.asBlob) return pdf.output("blob");
    pdf.save(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}

export async function exportTechnicalPdf(opts: ExportOpts): Promise<Blob | void> {
  const { printArea, filename } = opts;
  const cover = printArea.querySelector<HTMLElement>("[data-pdf-cover]");
  const header = printArea.querySelector<HTMLElement>("[data-pdf-header]");
  const notes = printArea.querySelector<HTMLElement>("[data-pdf-notes]");
  // Panels and divider pages together, in document order (dividers sit before their panel).
  const body = Array.from(printArea.querySelectorAll<HTMLElement>("[data-pdf-panel], [data-pdf-separator]"));

  // Off-screen host where page-blocks are laid out and measured, then captured.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;";
  host.className = "print-area"; // keep the offer's light palette even when the app is in dark mode
  document.body.appendChild(host);

  try {
    const pages: HTMLElement[] = [];
    if (cover) pages.push(makeCoverPage(cover));
    if (notes) pages.push(...paginateBlocks(host, header, Array.from(notes.children) as HTMLElement[]));
    for (const el of body) {
      if (el.hasAttribute("data-pdf-separator")) pages.push(makeSeparatorPage(el));
      else pages.push(...paginatePanel(host, header, el));
    }
    if (!pages.length) return;

    host.append(...pages); // ensure all mounted, in order (cover wasn't mounted yet)
    const total = pages.length;
    pages.forEach((p, i) => {
      const f = p.querySelector<HTMLElement>(".pdf-footer");
      if (f) f.textContent = `Page ${i + 1} of ${total}`; // cover has no .pdf-footer
    });

    await new Promise((r) => setTimeout(r, 40)); // let layout settle
    await document.fonts.ready; // web fonts loaded before capture

    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    // Embed the web fonts once (Montserrat/Poppins) so each page's foreignObject renders
    // them without re-fetching per page. Nexa is a system font and needs no embedding.
    let fontEmbedCSS: string | undefined;
    try { fontEmbedCSS = await htmlToImage.getFontEmbedCSS(host); } catch { /* fall back to per-call embedding */ }
    // .no-print only exists inside @media print, and this export renders SCREEN styles,
    // so anything marked no-print would otherwise be baked into the PDF. The pages are
    // clones, so stripping here cannot touch the live offer.
    for (const p of pages) for (const el of p.querySelectorAll<HTMLElement>(".no-print")) el.remove();

    for (let i = 0; i < pages.length; i++) {
      const img = await htmlToImage.toJpeg(pages[i], { quality: 0.92, backgroundColor: "#ffffff", pixelRatio: 2, fontEmbedCSS });
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, PW, PH);
      addPageLinks(pdf, pages[i]);
    }
    if (opts.asBlob) return pdf.output("blob");
    pdf.save(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
