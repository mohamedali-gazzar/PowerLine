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

type ExportOpts = { printArea: HTMLElement; filename: string };

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
    pages.push(page);
    first = false;
  } while (ri < rows.length);
  return pages;
}

export async function exportTechnicalPdf(opts: ExportOpts): Promise<void> {
  const { printArea, filename } = opts;
  const cover = printArea.querySelector<HTMLElement>("[data-pdf-cover]");
  const header = printArea.querySelector<HTMLElement>("[data-pdf-header]");
  const notes = printArea.querySelector<HTMLElement>("[data-pdf-notes]");
  const panels = Array.from(printArea.querySelectorAll<HTMLElement>("[data-pdf-panel]"));

  // Off-screen host where page-blocks are laid out and measured, then captured.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;";
  document.body.appendChild(host);

  try {
    const pages: HTMLElement[] = [];
    if (cover) pages.push(makeCoverPage(cover));
    if (notes) pages.push(...paginateBlocks(host, header, Array.from(notes.children) as HTMLElement[]));
    for (const panel of panels) pages.push(...paginatePanel(host, header, panel));
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
    for (let i = 0; i < pages.length; i++) {
      const img = await htmlToImage.toJpeg(pages[i], { quality: 0.92, backgroundColor: "#ffffff", pixelRatio: 2, fontEmbedCSS });
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, PW, PH);
    }
    pdf.save(filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
