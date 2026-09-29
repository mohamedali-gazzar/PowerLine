// Write text onto an existing PDF and hand back a real PDF.
//
// The point is that the ORIGINAL stays a PDF: its own text stays text, its drawings stay vector, and
// only what the user typed is added on top. Rasterising the document to pictures and re-wrapping it
// (which is what the offer exporter does, for a different reason) would make a client's spec sheet
// unsearchable and several times larger, so it is not used here.
//
// No DOM in this file — it is pure apart from pdf-lib, so the coordinate maths is unit-tested.
// Drawing Arabic (or anything else outside the standard PDF encoding) needs the browser, so that one
// step is injected by the screen as `rasterise`.

import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";

/** Page rotation as PDF records it: degrees CLOCKWISE when displayed. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * One piece of typed text.
 *
 * The position is in the page's own points, measured on the page AS DISPLAYED — origin top-left, y
 * downwards, after any rotation has been applied. That is what the user sees and what pdf.js reports,
 * so the screen needs no maths at all; the turn into PDF user space happens once, here.
 *
 * `y` is the BASELINE, not the top of the letters. A baseline is the one line both sides agree on
 * exactly: the browser reports it for the font it is drawing with, and PDF positions text by it. Using
 * the top instead would mean guessing each font's ascender twice and the export would sit a hair off
 * the preview.
 */
export interface TextMark {
  id: string;
  page: number;      // 1-based
  x: number;         // points from the left edge of the displayed page
  y: number;         // points from the top edge, at the first line's baseline
  text: string;
  size: number;      // points
  color: string;     // "#RRGGBB"
  bold: boolean;
}

/** Line spacing for a mark holding more than one line, as a multiple of the size. */
export const LINE_HEIGHT = 1.2;

/**
 * A point on the page as displayed (origin top-left, y down) → PDF user space (origin bottom-left,
 * y up), for a page whose MediaBox is `w` × `h` BEFORE rotation.
 *
 * Rotation is the part that quietly goes wrong: pdf.js hands back a viewport that already accounts
 * for /Rotate, so a click on a landscape scan is in rotated coordinates, while pdf-lib draws in the
 * page's own unrotated space. Without this the text lands on a different part of the page — or off
 * it — and only on the documents that happen to carry a rotation.
 */
export function viewToUser(rot: Rotation, w: number, h: number, vx: number, vy: number): { x: number; y: number } {
  switch (rot) {
    case 90:  return { x: vy,     y: vx };
    case 180: return { x: w - vx, y: vy };
    case 270: return { x: w - vy, y: h - vx };
    default:  return { x: vx,     y: h - vy };
  }
}

/** The size of a page as displayed — swapped on a quarter-turn. */
export function viewSize(rot: Rotation, w: number, h: number): { width: number; height: number } {
  return rot === 90 || rot === 270 ? { width: h, height: w } : { width: w, height: h };
}

/** PDF records rotation as any multiple of 90, positive or negative. Normalise it. */
export function normaliseRotation(angle: number): Rotation {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return (a === 90 || a === 180 || a === 270 ? a : 0) as Rotation;
}

// ── Dragging a mark ──────────────────────────────────────────────────────────
// Two steps of arithmetic that have to agree: where the pointer took hold, and where the mark's
// BASELINE ends up as it moves. They are here, and tested, because they are the kind of thing that
// looks fine and is quietly wrong — the first version moved a note the right distance sideways and
// short vertically, by exactly twice the ascender, and nothing about the screen said so.

/** Where the pointer took hold, measured from the mark's baseline-left point, in screen pixels.
 *  `boxTop` is the top of the mark's box, which sits `ascent` above its first baseline. */
export function dragGrab(pointerX: number, pointerY: number, boxLeft: number, boxTop: number, ascent: number) {
  return { dx: pointerX - boxLeft, dy: pointerY - boxTop - ascent };
}

/** The mark's new baseline point, in page points, as the pointer moves over the sheet. */
export function dragTo(
  pointerX: number, pointerY: number,
  sheetLeft: number, sheetTop: number,
  grab: { dx: number; dy: number },
  pxPerPt: number,
) {
  return { x: (pointerX - sheetLeft - grab.dx) / pxPerPt, y: (pointerY - sheetTop - grab.dy) / pxPerPt };
}

// ── Which text the built-in fonts can actually write ─────────────────────────
// The 14 standard PDF fonts are WinAnsi (Windows-1252): Latin letters, digits, punctuation and the
// accented European letters — and nothing else. Handing them an Arabic word throws while saving, so
// the caller is told in advance and draws that one through the browser instead.
const WIN_ANSI_EXTRAS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""),
);

/** True when every character can be written with the built-in fonts. Newlines and tabs are fine. */
export function canEncodeWinAnsi(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 10 || c === 13 || c === 9) continue;          // newline / tab
    if (c >= 0x20 && c <= 0x7e) continue;                   // ASCII
    if (c >= 0xa0 && c <= 0xff) continue;                   // Latin-1 supplement
    if (WIN_ANSI_EXTRAS.has(ch)) continue;
    return false;
  }
  return true;
}

/** "#RRGGBB" (or "#RGB") → a pdf-lib colour. Anything unreadable is black. */
export function parseColor(hex: string) {
  const s = (hex || "").trim().replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = /^[0-9a-f]{6}$/i.test(full) ? parseInt(full, 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Text the built-in fonts cannot write, drawn by the browser into a picture.
 *
 * The browser is the only thing here that shapes Arabic correctly — joining the letters and running
 * them right to left — so for those marks the screen hands back a transparent PNG of the words and
 * the size it occupies, and that is stamped on instead. The rest of the document is untouched.
 */
export interface RasterText {
  png: Uint8Array;
  width: number;    // points
  height: number;   // points
  ascent: number;   // points from the top of the picture down to the first baseline
}
export type Rasterise = (mark: TextMark) => Promise<RasterText>;

/** Reported per mark that could not be written, so the screen can say which one and why. */
export interface MarkProblem {
  id: string;
  text: string;
  reason: string;
}

export interface AddTextResult {
  bytes: Uint8Array;
  problems: MarkProblem[];
}

/**
 * Put every mark on its page and hand back the new PDF.
 *
 * A mark that cannot be drawn is reported rather than thrown: one bad line must not cost the user
 * the whole export, and they can see exactly which one to fix.
 */
export async function addTextToPdf(
  src: Uint8Array,
  marks: TextMark[],
  rasterise?: Rasterise,
): Promise<AddTextResult> {
  const doc = await PDFDocument.load(src, { ignoreEncryption: true });
  const pages = doc.getPages();
  const problems: MarkProblem[] = [];

  // Embedded lazily: a document nobody typed bold on should not carry a bold font.
  const fonts = new Map<"n" | "b", PDFFont>();
  const fontFor = async (bold: boolean): Promise<PDFFont> => {
    const key = bold ? "b" : "n";
    const had = fonts.get(key);
    if (had) return had;
    const f = await doc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
    fonts.set(key, f);
    return f;
  };

  for (const m of marks) {
    if (!m.text.trim()) continue;
    const page: PDFPage | undefined = pages[m.page - 1];
    if (!page) {
      problems.push({ id: m.id, text: m.text, reason: `page ${m.page} is not in this PDF` });
      continue;
    }
    const { width: w, height: h } = page.getSize();
    const rot = normaliseRotation(page.getRotation().angle);
    try {
      if (canEncodeWinAnsi(m.text)) {
        const font = await fontFor(m.bold);
        const color = parseColor(m.color);
        m.text.split(/\r?\n/).forEach((line, i) => {
          if (!line) return;
          const at = viewToUser(rot, w, h, m.x, m.y + i * m.size * LINE_HEIGHT);
          page.drawText(line, { x: at.x, y: at.y, size: m.size, font, color, rotate: degrees(rot) });
        });
      } else if (rasterise) {
        // Positioned by the same baseline: the picture's bottom edge sits `height - ascent` below it.
        const img = await rasterise(m);
        const at = viewToUser(rot, w, h, m.x, m.y + (img.height - img.ascent));
        const embedded = await doc.embedPng(img.png);
        page.drawImage(embedded, { x: at.x, y: at.y, width: img.width, height: img.height, rotate: degrees(rot) });
      } else {
        problems.push({ id: m.id, text: m.text, reason: "these letters need the browser to draw them" });
      }
    } catch (e) {
      problems.push({ id: m.id, text: m.text, reason: e instanceof Error ? e.message : "could not be written" });
    }
  }

  return { bytes: await doc.save(), problems };
}

/** "Client spec.pdf" → "Client spec (with notes).pdf". */
export function exportName(original: string): string {
  const base = (original || "document.pdf").replace(/\.pdf$/i, "");
  return `${base} (with notes).pdf`;
}
