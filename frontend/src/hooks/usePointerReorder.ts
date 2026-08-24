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
 */
const EASE = "transform .19s cubic-bezier(.2,.75,.3,1)";

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
      const startY = e.clientY;
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

      const move = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        if (grabbed) grabbed.style.transform = `translateY(${dy}px)`;
        const to = clampTo(dy);
        for (let j = 0; j < count; j++) {
          if (j === from) continue;
          const el = rows.current[j];
          if (!el) continue;
          // Rows between the origin and the target slide one step to open the gap.
          let shift = 0;
          if (from < to && j > from && j <= to) shift = -step;
          else if (from > to && j < from && j >= to) shift = step;
          el.style.transition = EASE;
          el.style.transform = `translateY(${shift}px)`;
        }
      };

      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        const to = clampTo(ev.clientY - startY);
        // Let the grabbed row glide to its slot, then commit the reorder and clear styles.
        if (grabbed && to !== from) {
          grabbed.style.transition = EASE;
          grabbed.style.transform = `translateY(${(to - from) * step}px)`;
        }
        const finish = () => { clearStyles(); setDragging(false); if (to !== from) onReorder(from, to); };
        if (to !== from) window.setTimeout(finish, 190);
        else finish();
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
  });

  return { setRowRef, handleProps, dragging };
}
