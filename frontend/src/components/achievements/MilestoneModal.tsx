import { useEffect, useRef, useState } from "react";
import type { Milestone } from "./milestones";
import { sceneForCount, type SceneContext } from "./scenes";
import "./MilestoneModal.css";

/**
 * Milestone achievement popup. The shell here is generic: it owns the shared chrome (backdrop, card,
 * banner, particles and the final "achievement unlocked" card, all driven by the milestone's props)
 * and provides the timing/particle helpers. Each milestone's animated STAGE — its SVG artwork, its
 * scoped CSS and its timeline — is a Scene (see ./scenes), so adding a milestone is a new scene file.
 */
export default function MilestoneModal({ milestone, onClose }: { milestone: Milestone; onClose: () => void }) {
  const { count, next, title, quote } = milestone;
  const scene = sceneForCount(count);

  const cardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Backdrop fade-in is React-state-driven (not an imperative classList) so a re-render can never
  // strip it and it always applies once the tab is visible. rAF gives the CSS opacity transition a
  // painted frame at 0 to animate from; when the tab is hidden the browser holds the callback until
  // it's shown, so the modal fades in the moment the user actually looks at it.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Keep onClose current without re-running the mount effect (which would restart the animation).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const stage = stageRef.current, card = cardRef.current, banner = bannerRef.current, final = finalRef.current;
    if (!stage || !card || !banner || !final) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    const rafs: number[] = [];
    const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
    const onRaf = (cb: FrameRequestCallback) => { const id = requestAnimationFrame(cb); rafs.push(id); return id; };
    const shake = () => { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); };
    const particle = (cls: string, html: string, x: number, y: number, frames: Keyframe[], dur: number, delay = 0): HTMLDivElement => {
      const el = document.createElement("div");
      el.className = "pl-ach-pt " + cls;
      if (html) el.innerHTML = html;
      el.style.left = x + "%"; el.style.top = y + "%";
      stage.appendChild(el);
      el.animate(frames, { duration: dur, delay, easing: "cubic-bezier(.2,.7,.4,1)", fill: "both" }).onfinish = () => el.remove();
      return el;
    };
    const showFinal = () => {
      banner.textContent = "⚡ ACHIEVEMENT UNLOCKED!";
      banner.classList.remove("pop"); void banner.offsetWidth; banner.classList.add("pop");
      final.classList.add("open");
      onRaf(() => { if (next != null && barRef.current) barRef.current.style.width = (count / next * 100) + "%"; });
      btnRef.current?.focus({ preventScroll: true });
    };

    const ctx: SceneContext = { stage, card, banner, final, bar: barRef.current, btn: btnRef.current, milestone, reduce, at, onRaf, shake, particle, showFinal };
    if (scene) scene.run(ctx); else showFinal();

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);

    return () => {
      timers.forEach(clearTimeout);
      rafs.forEach(cancelAnimationFrame);
      stage.querySelectorAll(".pl-ach-pt").forEach((p) => p.remove());
      document.removeEventListener("keydown", onKey);
    };
    // Runs once on mount; milestone (and therefore its scene) is fixed for the popup's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Final-block title: the part after the last ": " prints in the PowerLine orange.
  const sep = title.lastIndexOf(": ");
  const titleHead = sep >= 0 ? title.slice(0, sep + 2) : title;
  const titleAccent = sep >= 0 ? title.slice(sep + 2) : "";

  return (
    <div className={"pl-ach-backdrop" + (shown ? " show" : "")}>
      <div className={"pl-ach-card " + (scene?.scopeClass ?? "")} ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="pl-ach-title">
        <div className="pl-ach-stage" ref={stageRef}>
          <div className="pl-ach-banner" ref={bannerRef}>{count} PANELS COMPLETED!</div>
          <div dangerouslySetInnerHTML={{ __html: scene?.html ?? "" }} />
        </div>

        <div className="pl-ach-final" ref={finalRef}><div>
          <div className="pl-ach-body">
            <div className="ach-over">{count} PANELS COMPLETED</div>
            <h2 className="ach-title" id="pl-ach-title">{titleHead}{titleAccent && <b>{titleAccent}</b>}</h2>
            <p className="ach-quote">{quote}</p>
            {next != null && (
              <div className="ach-next">
                <div className="ach-next-row"><span>Next milestone: {next} panels</span><span>{next - count} to go</span></div>
                <div className="ach-bar"><i ref={barRef} /></div>
              </div>
            )}
            <button className="ach-btn" ref={btnRef} onClick={onClose}>Let’s do Panel {count + 1} ⚡</button>
          </div>
        </div></div>
      </div>
    </div>
  );
}
