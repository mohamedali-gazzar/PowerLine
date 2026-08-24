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
 * The step (row pitch) is measured from the first two rows, and the target index is
 * `from + round(dragDeltaY / step)` clamped to range. Works with mouse and touch (pointer
 * events + `touch-action: none` on the handle).
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

  const handleProps = (i: number) => ({
    style: { touchAction: "none" as const, cursor: "grab" },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return; // left button only for mouse
      const list = rows.current;
      if (list.length < 2) return; // nothing to reorder
      e.preventDefault();
      e.stopPropagation();

      const r0 = list[0]?.getBoundingClientRect();
      const r1 = list[1]?.getBoundingClientRect();
      const step = r0 && r1 ? Math.abs(r1.top - r0.top) : (list[i]?.getBoundingClientRect().height ?? 44) + 6;
      const from = i;
      let startY = e.clientY; // drag origin — shifted by auto-scroll so the maths stays true
      let lastY = e.clientY; // latest pointer position (viewport coords)
      let to = from;
      setDragging(true);

      const grabbed = list[from];
      if (grabbed) {
        grabbed.style.transition = "none"; // follows the pointer instantly
        grabbed.style.zIndex = "30";
        grabbed.style.boxShadow = "0 10px 24px rgba(0,0,0,.13)";
        grabbed.style.opacity = ".97";
        grabbed.style.cursor = "grabbing";
        grabbed.style.willChange = "transform";
      }

      const clampTo = (dy: number) => Math.max(0, Math.min(count - 1, from + Math.round(dy / step)));

      // Position the grabbed row under the pointer and glide the neighbours it passes aside.
      const apply = () => {
        const dy = lastY - startY;
        if (grabbed) grabbed.style.transform = `translateY(${dy}px)`;
        to = clampTo(dy);
        for (let j = 0; j < count; j++) {
          if (j === from) continue;
          const el = rows.current[j];
          if (!el) continue;
          // Rows between the origin and the target slide one step to open the gap.
          let shift = 0;
          if (from < to && j > from && j <= to) shift = -step;
          else if (from > to && j < from && j >= to) shift = step;
          el.style.transition = EASE;
          el.style.transform = shift ? `translateY(${shift}px)` : "";
        }
      };

      // Auto-scroll the container (or the window) while the pointer sits near an edge.
      const scroller = scrollParent(grabbed);
      let raf = 0;
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
          if (moved) { startY -= moved; apply(); } // keep the row glued under the pointer
        }
        raf = requestAnimationFrame(tick);
      };

      const move = (ev: PointerEvent) => { lastY = ev.clientY; apply(); };

      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        cancelAnimationFrame(raf);
        lastY = ev.clientY;
        const finalTo = clampTo(lastY - startY);
        // Let the grabbed row glide to its slot, then commit the reorder and clear styles.
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
      raf = requestAnimationFrame(tick);
    },
  });

  return { setRowRef, handleProps, dragging };
}
