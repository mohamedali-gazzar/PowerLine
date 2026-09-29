// End to end for the export: build a PDF, write on it, then READ THE RESULT BACK with a PDF reader
// and check the words are where the user put them.
//
// The unit tests next door check the coordinate maths in isolation; this checks the whole path,
// including the bits that are easy to get subtly wrong — the y axis flip, the baseline, and a page
// carrying a /Rotate, where the reader reports positions in the turned frame the user clicked in.

import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { addTextToPdf, type TextMark } from "./pdfText";

const W = 595;   // A4 portrait
const H = 842;

/** A two-page PDF: one upright, one carrying a quarter turn (what a landscape scan looks like). */
async function makeSource(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([W, H]);
  p1.drawText("original page one", { x: 50, y: H - 50, size: 10, font });
  const p2 = doc.addPage([W, H]);
  p2.setRotation({ type: "degrees", angle: 90 } as never);
  p2.drawText("original page two", { x: 50, y: H - 50, size: 10, font });
  return doc.save();
}

const mark = (over: Partial<TextMark>): TextMark => ({
  id: "m1", page: 1, x: 100, y: 200, text: "NOTE", size: 14, color: "#D32F2F", bold: false, ...over,
});

/** Every text item a reader finds, with where it sits ON THE PAGE AS DISPLAYED. */
// Imported once for the whole file: the first load of pdf.js in node takes a few seconds, and
// paying that inside the first test is what made it look like a hang.
const reader = import("pdfjs-dist/legacy/build/pdf.mjs");
async function readBack(bytes: Uint8Array): Promise<{ page: number; text: string; x: number; y: number }[]> {
  const pdfjs = await reader;
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false }).promise;
  const out: { page: number; text: string; x: number; y: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    // The viewport is the page AS DISPLAYED — the same frame the user clicked in — and applying it
    // to each item's transform gives a position measured from the top-left, y downwards.
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items as { str: string; transform: number[] }[]) {
      if (!item.str.trim()) continue;
      const t = pdfjs.Util.transform(viewport.transform, item.transform);
      out.push({ page: n, text: item.str, x: t[4], y: t[5] });
    }
  }
  await doc.destroy();
  return out;
}

describe("writing text onto a PDF", () => {
  it("puts the note where it was placed, and leaves the original text alone", async () => {
    const { bytes, problems } = await addTextToPdf(await makeSource(), [mark({})]);
    expect(problems).toEqual([]);

    const items = await readBack(bytes);
    expect(items.some((i) => i.text.includes("original page one"))).toBe(true);
    const note = items.find((i) => i.text === "NOTE");
    expect(note).toBeTruthy();
    expect(note!.page).toBe(1);
    expect(note!.x).toBeCloseTo(100, 1);
    expect(note!.y).toBeCloseTo(200, 1);   // the baseline, measured from the top of the page
  }, 30_000);

  it("puts it in the same displayed spot on a page that carries a quarter turn", async () => {
    // Deliberately the SAME view coordinates: what the user sees is what should come back, whichever
    // way the page is turned. Get the rotation wrong and this lands hundreds of points away.
    const { bytes } = await addTextToPdf(await makeSource(), [mark({ page: 2, text: "TURNED" })]);
    const note = (await readBack(bytes)).find((i) => i.text === "TURNED");
    expect(note).toBeTruthy();
    expect(note!.x).toBeCloseTo(100, 1);
    expect(note!.y).toBeCloseTo(200, 1);
  }, 30_000);

  it("writes each line of a multi-line note under the one before", async () => {
    const { bytes } = await addTextToPdf(await makeSource(), [mark({ text: "first\nsecond", size: 20 })]);
    const items = await readBack(bytes);
    const a = items.find((i) => i.text === "first");
    const b = items.find((i) => i.text === "second");
    expect(a && b).toBeTruthy();
    expect(b!.y - a!.y).toBeCloseTo(24, 1);   // 20pt at the 1.2 line spacing
    expect(b!.x).toBeCloseTo(a!.x, 1);
  }, 30_000);

  it("reports a note it cannot write instead of losing the whole export", async () => {
    const { bytes, problems } = await addTextToPdf(await makeSource(), [
      mark({ id: "ok", text: "fine" }),
      mark({ id: "ar", text: "مطابق" }),          // needs the browser; no rasteriser passed here
    ]);
    expect(problems.map((p) => p.id)).toEqual(["ar"]);
    expect((await readBack(bytes)).some((i) => i.text === "fine")).toBe(true);
  }, 30_000);

  it("skips empty notes and does not mind a page that is not there", async () => {
    const { bytes, problems } = await addTextToPdf(await makeSource(), [
      mark({ id: "blank", text: "   " }),
      mark({ id: "gone", page: 9, text: "nowhere" }),
    ]);
    expect(problems.map((p) => p.id)).toEqual(["gone"]);
    expect((await readBack(bytes)).every((i) => i.text !== "nowhere")).toBe(true);
  }, 30_000);
});
