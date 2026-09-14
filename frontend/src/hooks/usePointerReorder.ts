import { useRef, useState } from "react";

/**
 * Lightweight, dependency-free pointer drag-to-reorder for a vertical list — smooth and
 * understated. Attach `setRowRef(i)` to each row and `handleProps(i)` to its drag handle.
 *
 * On grab the row lifts subtly (soft shadow, opacity .97, raised z-index, grabbing cursor —
 * no scaling, no colour flash) and follows the pointer with translateY. The rows it passes
 * glide aside to open a gap (transform, `.19s cubic-bezier(.2,.75,.3,1)`). On release the row
 * settles into its slot, then `onReorder(from, to)` fires so the caller splices the array and
 * re-renders (numbers renumber, totals recompute). It only moves display order — no other math.
 *
 * The drop target is resolved by POSITION: each row's midpoint is captured on grab, and the
 * target index is the count of other rows whose midpoint sits above the pointer. That stays
 * correct when the list has group-header strips or variable-height rows between items — a
 * uniform row pitch does not, and used to make a grabbed panel snap back instead of moving.
 * Works with mouse and touch (pointer events + `touch-action: none` on the handle).
 *
 * When the list is taller than its viewport, holding the row near the top/bottom edge
 * auto-scrolls so a long list can be reordered end-to-end. It scrolls the nearest scrollable
 * ancestor (the list's own `overflow-y-auto` box), falling back to the window, and compensates
 * the drag origin by however much it scrolled so the row stays glued under the pointer.
 */
const EASE = "transform .19s cubic-bezier(.2,.75,.3,1)";
const EDGE = 64; // px from the scroll edge where auto-scroll starts
const MAX_SPEED = 20; // px per frame at the very edge

/** Nearest vertically-scrollable ancestor with room to scroll, or null (→ use the window). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

export function usePointerReorder(count: number, onReorder: (from: number, to: number) => void) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const [dragging, setDragging] = useState(false);

  const setRowRef = (i: number) => (el: HTMLElement | null) => { rows.current[i] = el; };

  const clearStyles = () => {
    for (const el of rows.current) {
      if (!el) continue;
      el.style.transition = "";
      el.style.transform = "";
      el.style.zIndex = "";
      el.style.boxShadow = "";
      el.style.opacity = "";
      el.style.cursor = "";
      el.style.willChange = "";
    }
  };

  // Shared drag start, used both by a dedicated grip and by pressing anywhere on the row. A small
  // movement THRESHOLD tells a click apart from a drag: nothing lifts and nothing is prevented until
  // the pointer has moved past it, so a plain click still selects the panel; once it becomes a drag,
  // the click that follows is swallowed so dragging the row doesn't also select it.
  const beginPointerDrag = (i: number, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // left button only for mouse
    const list = rows.current;
    if (list.length < 2) return; // nothing to reorder
    const THRESH = 4; // px before a press becomes a drag
    const from = i;
    const startX = e.clientX;
    let startY = e.clientY; // drag origin — shifted by auto-scroll so the maths stays true
    let lastY = e.clientY;
    let to = from;
    let started = false, raf = 0, scrolled = 0, step = 0;
    let mids: number[] = [];
    const grabbed = list[from];
    let scroller: HTMLElement | null = null;

    // Drop target resolved by POSITION (which row the pointer is over), robust to group-header strips
    // and variable-height rows between items.
    const resolveTo = (): number => {
      let idx = 0;
      for (let j = 0; j < count; j++) if (j !== from && mids[j] < lastY + scrolled) idx++;
      return Math.max(0, Math.min(count - 1, idx));
    };
    const apply = () => {
      const dy = lastY - startY;
      if (grabbed) grabbed.style.transform = `translateY(${dy}px)`;
      to = resolveTo();
      for (let j = 0; j < count; j++) {
        if (j === from) continue;
        const el = rows.current[j];
        if (!el) continue;
        let shift = 0; // rows between the origin and the target glide one step aside to open the gap
        if (from < to && j > from && j <= to) shift = -step;
        else if (from > to && j < from && j >= to) shift = step;
        el.style.transition = EASE;
        el.style.transform = shift ? `translateY(${shift}px)` : "";
      }
    };
    const tick = () => {
      const doc = document.scrollingElement || document.documentElement;
      let top: number, bottom: number, canUp: boolean, canDown: boolean;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        top = rect.top; bottom = rect.bottom;
        canUp = scroller.scrollTop > 0;
        canDown = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
      } else {
        top = 0; bottom = window.innerHeight;
        canUp = doc.scrollTop > 0;
        canDown = doc.scrollTop + doc.clientHeight < doc.scrollHeight - 1;
      }
      let d = 0;
      if (lastY < top + EDGE && canUp) d = -Math.ceil(((top + EDGE - lastY) / EDGE) * MAX_SPEED);
      else if (lastY > bottom - EDGE && canDown) d = Math.ceil(((lastY - (bottom - EDGE)) / EDGE) * MAX_SPEED);
      if (d) {
        const target = scroller ?? doc;
        const before = target.scrollTop;
        target.scrollTop += d;
        const moved = target.scrollTop - before;
        if (moved) { startY -= moved; scrolled += moved; apply(); }
      }
      raf = requestAnimationFrame(tick);
    };
    // Actually lift and start — only after the movement threshold is crossed.
    const begin = () => {
      started = true;
      setDragging(true);
      const r0 = list[0]?.getBoundingClientRect();
      const r1 = list[1]?.getBoundingClientRect();
      step = r0 && r1 ? Math.abs(r1.top - r0.top) : (list[from]?.getBoundingClientRect().height ?? 44) + 6;
      mids = rows.current.map((el) => { const r = el?.getBoundingClientRect(); return r ? r.top + r.height / 2 : Number.POSITIVE_INFINITY; });
      if (grabbed) {
        grabbed.style.transition = "none";
        grabbed.style.zIndex = "30";
        grabbed.style.boxShadow = "0 10px 24px rgba(0,0,0,.13)";
        grabbed.style.opacity = ".97";
        grabbed.style.cursor = "grabbing";
        grabbed.style.willChange = "transform";
      }
      scroller = scrollParent(grabbed);
      document.body.style.userSelect = "none";
      raf = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => {
      lastY = ev.clientY;
      if (!started) {
        if (Math.abs(ev.clientX - startX) < THRESH && Math.abs(ev.clientY - startY) < THRESH) return;
        begin();
      }
      apply();
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cancelAnimationFrame(raf);
      document.body.style.userSelect = "";
      if (!started) return; // never crossed the threshold → a plain click → let it select the panel
      lastY = ev.clientY;
      const finalTo = resolveTo();
      // Swallow the click that a real drag would otherwise fire (so dragging the row's body — even
      // the name — doesn't also select the panel).
      const swallow = (ce: Event) => { ce.stopPropagation(); ce.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, true), 400);
      if (grabbed && finalTo !== from) {
        grabbed.style.transition = EASE;
        grabbed.style.transform = `translateY(${(finalTo - from) * step}px)`;
      }
      const finish = () => { clearStyles(); setDragging(false); if (finalTo !== from) onReorder(from, finalTo); };
      if (finalTo !== from) window.setTimeout(finish, 190);
      else finish();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // The dedicated grip (also works on touch — `touch-action: none`).
  const handleProps = (i: number) => ({
    style: { touchAction: "none" as const, cursor: "grab" },
    onPointerDown: (e: React.PointerEvent) => beginPointerDrag(i, e),
  });

  // Press-and-drag anywhere on the row (mouse/pen only, so touch still scrolls the list). Skips the
  // grip (it has its own handler) and any interactive control, so buttons / inputs keep working.
  const rowDragProps = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-panelgrip], [data-nodrag], input, textarea, select, label")) return;
      beginPointerDrag(i, e);
    },
  });

  return { setRowRef, handleProps, rowDragProps, dragging };
}
