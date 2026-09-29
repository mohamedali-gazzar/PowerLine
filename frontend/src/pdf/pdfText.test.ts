// The maths that decides WHERE typed text lands on an exported PDF.
//
// Worth testing because it is invisible until it is wrong: a page carrying a /Rotate (every landscape
// scan) is displayed turned, so a click is in turned coordinates while pdf-lib draws in the page's own
// untouched space. Get it wrong and the note lands somewhere else on the page — on some documents only.

import { describe, it, expect } from "vitest";
import {
  viewToUser, viewSize, normaliseRotation, canEncodeWinAnsi, parseColor, exportName, dragGrab, dragTo,
} from "./pdfText";

const W = 595; // A4 portrait, points
const H = 842;

describe("view coordinates → PDF user space", () => {
  it("flips the y axis on an upright page", () => {
    expect(viewToUser(0, W, H, 0, 0)).toEqual({ x: 0, y: H });        // top-left → top-left
    expect(viewToUser(0, W, H, W, H)).toEqual({ x: W, y: 0 });        // bottom-right → bottom-right
    expect(viewToUser(0, W, H, 100, 200)).toEqual({ x: 100, y: 642 });
  });

  it("puts each rotation's displayed top-left on the right corner of the page", () => {
    // Turning the page clockwise brings a different corner to the top-left.
    expect(viewToUser(0, W, H, 0, 0)).toEqual({ x: 0, y: H });        // bottom-left of the paper
    expect(viewToUser(90, W, H, 0, 0)).toEqual({ x: 0, y: 0 });       // 90° cw → bottom-left goes to the top-left
    expect(viewToUser(180, W, H, 0, 0)).toEqual({ x: W, y: 0 });      // 180° → bottom-right
    expect(viewToUser(270, W, H, 0, 0)).toEqual({ x: W, y: H });      // 270° → top-right
  });

  it("keeps every displayed point on the paper", () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const v = viewSize(rot, W, H);
      for (const [vx, vy] of [[0, 0], [v.width, 0], [0, v.height], [v.width, v.height], [v.width / 3, v.height / 7]]) {
        const p = viewToUser(rot, W, H, vx, vy);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(H);
      }
    }
  });

  it("swaps the displayed size on a quarter turn only", () => {
    expect(viewSize(0, W, H)).toEqual({ width: W, height: H });
    expect(viewSize(180, W, H)).toEqual({ width: W, height: H });
    expect(viewSize(90, W, H)).toEqual({ width: H, height: W });
    expect(viewSize(270, W, H)).toEqual({ width: H, height: W });
  });

  it("moving right on screen moves right on the page, whichever way it is turned", () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const a = viewToUser(rot, W, H, 100, 100);
      const b = viewToUser(rot, W, H, 140, 100);   // 40pt further right on screen
      const moved = Math.hypot(b.x - a.x, b.y - a.y);
      expect(moved).toBeCloseTo(40, 6);
    }
  });
});

describe("normaliseRotation", () => {
  it("accepts what PDFs actually carry", () => {
    expect(normaliseRotation(0)).toBe(0);
    expect(normaliseRotation(90)).toBe(90);
    expect(normaliseRotation(360)).toBe(0);
    expect(normaliseRotation(450)).toBe(90);
    expect(normaliseRotation(-90)).toBe(270);   // negative rotations are legal
    expect(normaliseRotation(-270)).toBe(90);
  });
  it("falls back to upright for a nonsense angle", () => {
    expect(normaliseRotation(37)).toBe(0);
  });
});

describe("what the built-in fonts can write", () => {
  it("accepts ordinary typing", () => {
    expect(canEncodeWinAnsi("Approved 12/03 — 250A MCCB, Form 3b")).toBe(true);
    expect(canEncodeWinAnsi("Ürün · café · £250 · 45°C")).toBe(true);
    expect(canEncodeWinAnsi("two\nlines")).toBe(true);
  });
  it("rejects what needs the browser to draw it", () => {
    expect(canEncodeWinAnsi("مطابق للمواصفات")).toBe(false);   // Arabic — has to be shaped
    expect(canEncodeWinAnsi("Δοκιμή")).toBe(false);
    expect(canEncodeWinAnsi("ok ✅")).toBe(false);
  });
});

describe("parseColor", () => {
  const near = (c: ReturnType<typeof parseColor>, r: number, g: number, b: number) => {
    const o = c as unknown as { red: number; green: number; blue: number };
    expect(o.red).toBeCloseTo(r, 5);
    expect(o.green).toBeCloseTo(g, 5);
    expect(o.blue).toBeCloseTo(b, 5);
  };
  it("reads the swatches the screen offers", () => {
    near(parseColor("#000000"), 0, 0, 0);
    near(parseColor("#FF0000"), 1, 0, 0);
    near(parseColor("#f00"), 1, 0, 0);
  });
  it("falls back to black rather than throwing", () => {
    near(parseColor("nonsense"), 0, 0, 0);
    near(parseColor(""), 0, 0, 0);
  });
});

describe("dragging a note", () => {
  // The sheet somewhere on screen, the note's box above its baseline, the page zoomed.
  const sheet = { left: 200, top: 80 };
  const ascent = 22.6;      // what the browser reports for the font at this size
  const pxPerPt = 1.6807;   // a page shown 1000px wide

  it("moves the note by exactly as far as the pointer went", () => {
    // The bug this is here for: sideways was right, downwards was short by twice the ascender.
    const boxLeft = sheet.left + 329.2;
    const boxTop = sheet.top + 119.9;
    const grab = dragGrab(boxLeft + 5, boxTop + 5, boxLeft, boxTop, ascent);
    const before = dragTo(boxLeft + 5, boxTop + 5, sheet.left, sheet.top, grab, pxPerPt);
    const after = dragTo(boxLeft + 125, boxTop + 265, sheet.left, sheet.top, grab, pxPerPt);
    expect((after.x - before.x) * pxPerPt).toBeCloseTo(120, 6);
    expect((after.y - before.y) * pxPerPt).toBeCloseTo(260, 6);
  });

  it("does not shift the note the instant it is grabbed", () => {
    const boxLeft = 340, boxTop = 150;
    const baselineBefore = (boxTop - sheet.top + ascent) / pxPerPt;
    const grab = dragGrab(boxLeft + 9, boxTop + 3, boxLeft, boxTop, ascent);
    const at = dragTo(boxLeft + 9, boxTop + 3, sheet.left, sheet.top, grab, pxPerPt);
    expect(at.x).toBeCloseTo((boxLeft - sheet.left) / pxPerPt, 6);
    expect(at.y).toBeCloseTo(baselineBefore, 6);
  });

  it("works the same at any zoom", () => {
    for (const z of [0.6, 1, 2.4]) {
      const grab = dragGrab(500, 300, 490, 285, ascent);
      const a = dragTo(500, 300, sheet.left, sheet.top, grab, z);
      const b = dragTo(560, 300, sheet.left, sheet.top, grab, z);
      expect(b.x - a.x).toBeCloseTo(60 / z, 6);   // the same 60 screen pixels, in page points
    }
  });
});

describe("exportName", () => {
  it("keeps the original name and says what it is", () => {
    expect(exportName("Client spec.pdf")).toBe("Client spec (with notes).pdf");
    expect(exportName("BOQ rev2.PDF")).toBe("BOQ rev2 (with notes).pdf");
    expect(exportName("")).toBe("document (with notes).pdf");
  });
});
