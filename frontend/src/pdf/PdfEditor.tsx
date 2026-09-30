// The PDF writing surface: pages to click on, a toolbar, and a download.
//
// Shared by the two places it is offered — the standalone tool (pages/PdfTextPage) and the Documents
// card on a quotation's Specs tab — so there is one implementation of the fiddly part and the two can
// never drift.
//
// The pages are SHOWN as pictures (pdf.js draws them) but the download is the real PDF with the typed
// text added on top; pdf/pdfText.ts holds that and the coordinate maths.
//
// The notes are kept HERE and reported outwards on a short delay. The caller inside a quotation writes
// them into the QTN, which autosaves, and a drag fires a position on every mouse move — reporting each
// one would save the quotation dozens of times for a single drag.

import { useEffect, useMemo, useRef, useState } from "react";
import { renderPdfToImages, base64ToBytes, type PdfPageImage } from "../lv/renderPdfPages";
import { uid } from "../lv/store";
import {
  addTextToPdf, exportName, dragGrab, dragTo, LINE_HEIGHT,
  type TextMark, type Rasterise, type MarkProblem,
} from "./pdfText";

// pdf.js is asked for pages at twice their point size, so a page looks sharp on a normal screen and
// stays sharp zoomed in. Every pixel measurement below is turned back into points by dividing by it.
const RENDER_SCALE = 2;
// Arial and Helvetica are metric-compatible — the same letters take the same width — so the preview
// lines up with the Helvetica the PDF is written with.
const FONT_STACK = `Helvetica, Arial, "Liberation Sans", sans-serif`;
const SIZES = [8, 10, 12, 14, 18, 24, 32, 48];
const COLORS = ["#111111", "#D32F2F", "#1565C0", "#2E7D32", "#F57C00"];
/** How long to wait after the last change before telling the caller. */
const REPORT_DELAY = 600;

/** Where the browser puts the baseline inside a line box, measured for the real font. */
interface FontMetrics { ascent: number; descent: number }
let measureCtx: CanvasRenderingContext2D | null = null;
function metricsFor(sizePx: number, bold: boolean): FontMetrics {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const fallback = { ascent: sizePx * 0.9, descent: sizePx * 0.25 };
  if (!measureCtx) return fallback;
  measureCtx.font = `${bold ? "bold " : ""}${sizePx}px ${FONT_STACK}`;
  const m = measureCtx.measureText("Hg");
  const a = m.fontBoundingBoxAscent;
  const d = m.fontBoundingBoxDescent;
  return typeof a === "number" && typeof d === "number" ? { ascent: a, descent: d } : fallback;
}
/** Distance from the top of a mark's box down to its FIRST baseline, in screen pixels. */
function baselineOffset(sizePx: number, bold: boolean): number {
  const { ascent, descent } = metricsFor(sizePx, bold);
  const lineBox = sizePx * LINE_HEIGHT;
  return (lineBox - (ascent + descent)) / 2 + ascent;
}

/** Text the standard PDF fonts cannot write, drawn by the browser instead (Arabic, Greek, symbols). */
const rasterise: Rasterise = async (m) => {
  const scale = 4;                                   // pixels per point — sharp when printed
  const px = m.size * scale;
  const font = `${m.bold ? "bold " : ""}${px}px ${FONT_STACK}`;
  const lines = m.text.split(/\r?\n/);

  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("this browser cannot draw text for the PDF");
  probe.font = font;
  const width = Math.max(1, ...lines.map((l) => probe.measureText(l || " ").width));
  const { ascent, descent } = metricsFor(px, m.bold);
  const height = px * LINE_HEIGHT * (lines.length - 1) + ascent + descent;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width) + 2;
  canvas.height = Math.ceil(height) + 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser cannot draw text for the PDF");
  ctx.font = font;                                   // sizing the canvas resets the context
  ctx.fillStyle = m.color;
  ctx.textBaseline = "alphabetic";
  lines.forEach((l, i) => ctx.fillText(l, 1, 1 + ascent + i * px * LINE_HEIGHT));

  return {
    png: base64ToBytes(canvas.toDataURL("image/png").split(",")[1] ?? ""),
    width: canvas.width / scale,
    height: canvas.height / scale,
    ascent: (1 + ascent) / scale,
  };
};

export interface PdfEditorProps {
  /** The PDF to write on. Never modified — the download is built from a copy of it. */
  bytes: Uint8Array;
  /** Shown in the toolbar and used to name the download. */
  name: string;
  /** Notes to start from. Read once — remount (a `key`) to load a different document's notes. */
  initialMarks?: TextMark[];
  /** Told about the notes shortly after they settle. */
  onMarksChange?: (marks: TextMark[]) => void;
  /** Teammates viewing somebody else's quotation can read and download, not type. */
  readOnly?: boolean;
  /** The button on the left of the toolbar, when the caller has somewhere to go back to. */
  onBack?: () => void;
  backLabel?: string;
}

export default function PdfEditor({
  bytes, name, initialMarks, onMarksChange, readOnly = false, onBack, backLabel = "Back",
}: PdfEditorProps) {
  const [pages, setPages] = useState<PdfPageImage[]>([]);
  const [loading, setLoading] = useState("Opening…");
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<MarkProblem[]>([]);
  const [saving, setSaving] = useState(false);

  const [marks, setMarks] = useState<TextMark[]>(() => initialMarks ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState(14);
  const [color, setColor] = useState(COLORS[0]);
  const [bold, setBold] = useState(false);
  const [pxPerPt, setPxPerPt] = useState(1.2);
  const [focusWanted, setFocusWanted] = useState<string | null>(null);

  const editing = useRef<string | null>(null);   // the mark whose text is being typed
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const touched = useRef(false);                 // nothing is reported until something is changed

  const selectedMark = marks.find((m) => m.id === selected) ?? null;

  /** Page sizes in points — pdf.js renders at RENDER_SCALE, so this is the page's own size. */
  const pageSizes = useMemo(
    () => pages.map((p) => ({ width: p.width / RENDER_SCALE, height: p.height / RENDER_SCALE })),
    [pages],
  );

  // Draw the document. Pages appear as they arrive rather than all at the end, because a long
  // datasheet takes a few seconds and a blank screen looks broken.
  useEffect(() => {
    let alive = true;
    setPages([]); setError(""); setLoading("Opening…");
    (async () => {
      try {
        const out: PdfPageImage[] = [];
        await renderPdfToImages(bytes.slice(), RENDER_SCALE, (page, i, total) => {
          if (!alive) return;
          out.push(page);
          setPages([...out]);
          setLoading(i < total ? `Opening page ${i} of ${total}…` : "");
          if (i === 1) setPxPerPt(fitZoom(page.width / RENDER_SCALE));
        });
        if (alive) setLoading("");
      } catch (e) {
        if (!alive) return;
        setPages([]); setLoading("");
        setError(e instanceof Error ? `That PDF could not be opened — ${e.message}` : "That PDF could not be opened.");
      }
    })();
    return () => { alive = false; };
  }, [bytes]);

  // Report the notes once they settle — see the note at the top of the file.
  useEffect(() => {
    if (!touched.current || !onMarksChange) return;
    const t = setTimeout(() => onMarksChange(marks), REPORT_DELAY);
    return () => clearTimeout(t);
  }, [marks, onMarksChange]);

  /** Start at a width that fits the window, within sensible limits. */
  const fitZoom = (widthPt: number): number =>
    Math.min(2, Math.max(0.6, Math.min(window.innerWidth - 260, 1000) / widthPt));

  // A box just added is put straight into typing, so a click lands the cursor and the user types.
  // This has to wait for React to have PUT the box on the page — doing it in the click handler (or on
  // the next animation frame) reaches for an element that does not exist yet and the typing is lost.
  useEffect(() => {
    if (!focusWanted) return;
    document.getElementById(`mark-${focusWanted}`)?.focus();
    setFocusWanted(null);
  }, [focusWanted, marks]);

  // Escape drops the selection; Delete removes the selected mark unless it is being typed in.
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelected(null); (document.activeElement as HTMLElement)?.blur?.(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected && editing.current !== selected) {
        change((prev) => prev.filter((m) => m.id !== selected));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, readOnly]);

  // Dragging a mark — on the window, so the pointer can leave the little box.
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const page = marks.find((m) => m.id === d.id)?.page ?? 1;
      const sheet = document.getElementById(`pdf-sheet-${page}`);
      if (!sheet) return;
      const r = sheet.getBoundingClientRect();
      const at = dragTo(e.clientX, e.clientY, r.left, r.top, d, pxPerPt);
      change((prev) => prev.map((m) => (m.id === d.id ? { ...m, x: at.x, y: at.y } : m)));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [marks, pxPerPt]);

  /** Every change goes through here, so nothing is reported outwards until something really moved. */
  const change = (next: (prev: TextMark[]) => TextMark[]) => {
    touched.current = true;
    setMarks(next);
  };

  /** A click on blank paper starts a new piece of text there. */
  const addAt = (pageNo: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (e.target !== e.currentTarget) return;      // a click on an existing mark, not the page
    const r = e.currentTarget.getBoundingClientRect();
    const sizePx = size * pxPerPt;
    const id = uid();
    change((prev) => [...prev, {
      id, page: pageNo, text: "", size, color, bold,
      x: (e.clientX - r.left) / pxPerPt,
      // The click is where the letters should START, so the baseline sits one ascender below it.
      y: (e.clientY - r.top + baselineOffset(sizePx, bold)) / pxPerPt,
    }]);
    setSelected(id);
    setProblems([]);
    setFocusWanted(id);   // the box does not exist yet — focused once React has put it there
  };

  const patch = (id: string, p: Partial<TextMark>) =>
    change((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)));

  /** An empty box left behind is litter — drop it when the user clicks away. */
  const tidy = (id: string) =>
    change((prev) => prev.filter((m) => m.id !== id || m.text.trim() !== ""));

  const download = async () => {
    setSaving(true); setError(""); setProblems([]);
    try {
      const { bytes: out, problems: bad } = await addTextToPdf(bytes.slice(), marks, rasterise);
      setProblems(bad);
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = exportName(name);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? `The PDF could not be written — ${e.message}` : "The PDF could not be written.");
    } finally {
      setSaving(false);
    }
  };

  const typedCount = marks.filter((m) => m.text.trim()).length;

  return (
    <>
      {/* Toolbar — follows the page down, because the pages are long. */}
      <div className="sticky top-0 z-20 mb-4 card flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
        {onBack && <button type="button" className="btn-ghost text-xs" onClick={onBack}>{backLabel}</button>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink" title={name}>{name}</p>
          <p className="text-[11px] text-muted">
            {pages.length} page{pages.length === 1 ? "" : "s"}
            {typedCount > 0 && ` · ${typedCount} note${typedCount === 1 ? "" : "s"}`}
            {loading && ` · ${loading}`}
          </p>
        </div>

        {!readOnly && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Size</span>
              <select className="input w-20 py-1 text-xs" value={size}
                onChange={(e) => { const v = +e.target.value; setSize(v); if (selectedMark) patch(selectedMark.id, { size: v }); }}>
                {SIZES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button key={c} type="button" title={c}
                  onClick={() => { setColor(c); if (selectedMark) patch(selectedMark.id, { color: c }); }}
                  className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110
                    ${color === c ? "border-brand ring-2 ring-brand/40" : "border-line"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>

            <button type="button"
              onClick={() => { const v = !bold; setBold(v); if (selectedMark) patch(selectedMark.id, { bold: v }); }}
              className={`btn-ghost px-3 py-1 text-xs font-black ${bold ? "border-brand bg-brand-tint text-brand-dark" : ""}`}>B</button>
          </>
        )}

        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost px-2 py-1 text-xs" title="Zoom out"
            onClick={() => setPxPerPt((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}>−</button>
          <span className="w-12 text-center text-[11px] font-semibold text-muted">{Math.round(pxPerPt * 100 / 1.333)}%</span>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" title="Zoom in"
            onClick={() => setPxPerPt((z) => Math.min(4, +(z + 0.2).toFixed(2)))}>+</button>
        </div>

        <button type="button" className="btn-primary text-xs" disabled={saving || !!loading} onClick={() => void download()}>
          {saving ? "Preparing…" : "Download PDF"}
        </button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
      {problems.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-bold">The PDF downloaded, but {problems.length} note{problems.length === 1 ? "" : "s"} could not be written:</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {problems.map((p) => <li key={p.id}>“{p.text.slice(0, 40)}” — {p.reason}</li>)}
          </ul>
        </div>
      )}

      <p className="mb-3 text-xs text-muted">
        {readOnly
          ? "This quotation belongs to someone else, so the notes cannot be changed here — but the PDF can still be downloaded with them on."
          : <>Click anywhere on a page to type. Drag the <b>✥</b> handle to move a note, <b>✕</b> to remove it.</>}
      </p>

      <div className="flex flex-col items-center gap-6 pb-16">
        {pages.map((p, i) => {
          const pageNo = i + 1;
          const sz = pageSizes[i];
          return (
            <div key={pageNo} className="relative">
              <div className="absolute -top-5 left-0 text-[11px] font-bold text-muted">Page {pageNo}</div>
              <div
                id={`pdf-sheet-${pageNo}`}
                onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
                onClick={(e) => addAt(pageNo, e)}
                className={`relative select-none bg-white shadow-lift ring-1 ring-line ${readOnly ? "" : "cursor-text"}`}
                style={{ width: sz.width * pxPerPt, height: sz.height * pxPerPt }}>
                <img src={p.dataUrl} alt={`Page ${pageNo}`} draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full" />
                {marks.filter((m) => m.page === pageNo).map((m) => (
                  <MarkBox key={m.id} mark={m} pxPerPt={pxPerPt} readOnly={readOnly}
                    selected={selected === m.id}
                    onSelect={() => { setSelected(m.id); setSize(m.size); setColor(m.color); setBold(m.bold); }}
                    onText={(text) => patch(m.id, { text })}
                    onRemove={() => { change((prev) => prev.filter((x) => x.id !== m.id)); setSelected(null); }}
                    onDragStart={(dx, dy) => { drag.current = { id: m.id, dx, dy }; }}
                    onEditing={(on) => { editing.current = on ? m.id : null; if (!on) tidy(m.id); }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** One piece of typed text sitting on a page. */
function MarkBox({ mark, pxPerPt, selected, readOnly, onSelect, onText, onRemove, onDragStart, onEditing }: {
  mark: TextMark; pxPerPt: number; selected: boolean; readOnly: boolean;
  onSelect: () => void;
  onText: (text: string) => void;
  onRemove: () => void;
  onDragStart: (dx: number, dy: number) => void;
  onEditing: (on: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sizePx = mark.size * pxPerPt;
  const lineBox = sizePx * LINE_HEIGHT;
  const top = mark.y * pxPerPt - baselineOffset(sizePx, mark.bold);

  // The text is written into the box by the user, so React must not re-write it underneath them —
  // only put it back when it differs (a size change, say, re-renders with the same text).
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerText !== mark.text) el.innerText = mark.text;
  }, [mark.text]);

  return (
    <div className="absolute" style={{ left: mark.x * pxPerPt, top }}>
      {selected && !readOnly && (
        <div className="absolute -top-6 left-0 flex items-center gap-1">
          <button type="button" title="Drag to move" aria-label="Move this note"
            onMouseDown={(e) => {
              e.preventDefault(); e.stopPropagation();
              const box = (e.currentTarget.parentElement?.parentElement as HTMLElement).getBoundingClientRect();
              const grab = dragGrab(e.clientX, e.clientY, box.left, box.top, baselineOffset(sizePx, mark.bold));
              onDragStart(grab.dx, grab.dy);
            }}
            className="cursor-move rounded bg-brand px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-soft">✥</button>
          <button type="button" title="Remove this note" aria-label="Remove this note"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-soft">✕</button>
        </div>
      )}
      <div
        id={`mark-${mark.id}`}
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        spellCheck={false}
        onMouseDown={(e) => { e.stopPropagation(); onSelect(); }}
        onFocus={() => { onSelect(); onEditing(true); }}
        onBlur={() => onEditing(false)}
        onInput={(e) => onText((e.currentTarget as HTMLDivElement).innerText.replace(/\n$/, ""))}
        className={`min-w-[1ch] whitespace-pre outline-none ${readOnly ? "" : "cursor-text"} ${selected ? "ring-1 ring-dashed ring-brand" : ""}`}
        style={{
          fontFamily: FONT_STACK,
          fontSize: `${sizePx}px`,
          lineHeight: `${lineBox}px`,
          fontWeight: mark.bold ? 700 : 400,
          color: mark.color,
        }}
      />
      {!mark.text && !selected && (
        <span className="pointer-events-none absolute left-0 top-0 text-[11px] italic text-muted">type…</span>
      )}
    </div>
  );
}
