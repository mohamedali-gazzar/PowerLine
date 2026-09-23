import { useEffect, useRef, useState } from "react";
import type { Milestone } from "./milestones";
import { MILESTONE10_SVG } from "./milestone10Svg";
import "./MilestoneModal.css";

/**
 * Milestone achievement popup, ported from milestone-10-baby-engineer.html. The SVG artwork,
 * CSS keyframes, animation timeline and text are kept exactly as approved; only the final block's
 * copy is driven by props so the same modal serves every milestone. The inline <script> now lives
 * in a useEffect that runs the timeline once on mount and clears its timeouts / particles on unmount.
 */
export default function MilestoneModal({ milestone, onClose }: { milestone: Milestone; onClose: () => void }) {
  const { count, next, title, quote } = milestone;

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
    const card = cardRef.current, stage = stageRef.current,
      banner = bannerRef.current, final = finalRef.current;
    if (!card || !stage || !banner || !final) return;
    const eng = stage.querySelector<SVGGElement>("#eng");
    const dizzy = stage.querySelector<Element>(".pl-ach-dizzy");

    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const shake = () => { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); };

    function particle(cls: string, html: string, x: number, y: number, frames: Keyframe[], dur: number, delay = 0) {
      const el = document.createElement("div");
      el.className = "pl-ach-pt " + cls;
      if (html) el.innerHTML = html;
      el.style.left = x + "%"; el.style.top = y + "%";
      stage!.appendChild(el);
      el.animate(frames, { duration: dur, delay, easing: "cubic-bezier(.2,.7,.4,1)", fill: "both" }).onfinish = () => el.remove();
      return el;
    }
    const bolt = (c: string) => `<svg width="22" height="30" viewBox="0 0 22 30"><path d="M13 0 L2 17 H10 L7 30 L20 11 H12 Z" fill="${c}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    const star = (c: string) => `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 0 l3 6.5 7 1 -5 4.8 1.2 7 -6.2 -3.3 -6.2 3.3 1.2 -7 -5 -4.8 7 -1z" fill="${c}"/></svg>`;

    function burst() {
      const ox = 31.5, oy = 52; // engineer centre in stage %
      const colors = ["#F7931E", "#FFD84A", "#C8F03C", "#ffffff", "#5BD1FF", "#FF7C8F"];
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
        const dx = Math.cos(a) * d, dy = Math.sin(a) * d * 0.75 - 80;
        const el = particle("conf", "", ox, oy, [
          { transform: "translate(-50%,-50%) scale(.3) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx * .75}px,${dy}px) scale(1) rotate(${360 * Math.random()}deg)`, opacity: 1, offset: .4 },
          { transform: `translate(${dx}px,${dy + 160}px) scale(.9) rotate(${720 * Math.random()}deg)`, opacity: 0 },
        ], 1600 + Math.random() * 900, Math.random() * 120);
        el.style.background = colors[i % colors.length];
        if (i % 3 === 0) { el.style.width = "8px"; el.style.height = "8px"; el.style.borderRadius = "50%"; }
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + .3, d = 110 + Math.random() * 60;
        particle("", i % 2 ? bolt("#FFD84A") : star("#FFD84A"), ox, oy, [
          { transform: "translate(-50%,-50%) scale(0) rotate(0)", opacity: 1 },
          { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d * .8}px) scale(1.3) rotate(${(Math.random() - .5) * 60}deg)`, opacity: 1, offset: .45 },
          { transform: `translate(${Math.cos(a) * d * 1.25}px,${Math.sin(a) * d}px) scale(.6)`, opacity: 0 },
        ], 1300, i * 40);
      }
    }
    function dust() {
      for (let i = 0; i < 8; i++) {
        const x = 63 + Math.random() * 22;
        particle("dust", "", x, 82, [
          { transform: "translate(-50%,-50%) scale(.3)", opacity: .9 },
          { transform: `translate(${(Math.random() - .5) * 70}px,${-20 - Math.random() * 25}px) scale(${1.2 + Math.random()})`, opacity: 0 },
        ], 700 + Math.random() * 300);
      }
    }
    function showFinal() {
      banner!.textContent = "⚡ ACHIEVEMENT UNLOCKED!";
      banner!.classList.remove("pop"); void banner!.offsetWidth; banner!.classList.add("pop");
      final!.classList.add("open");
      requestAnimationFrame(() => { if (next != null && barRef.current) barRef.current.style.width = (count / next * 100) + "%"; });
      btnRef.current?.focus({ preventScroll: true });
    }

    if (reduce) {
      stage.classList.add("after-walk", "posed");
      if (eng) eng.dataset.face = "happy";
      showFinal();
    } else {
      const steps: { at: number; run: () => void }[] = [
        { at: 150, run: () => { shake(); banner.classList.add("pop"); } },                                   // shake + banner pop
        { at: 550, run: () => stage.classList.add("walking") },                                              // waddle in, dragging
        { at: 2450, run: () => { stage.classList.replace("walking", "after-walk"); stage.classList.add("wobble"); } },
        { at: 3000, run: () => { stage.classList.remove("wobble"); stage.classList.add("dropped", "fallen"); if (eng) eng.dataset.face = "oh"; } }, // drop + fall
        { at: 3420, run: () => { shake(); dust(); } },
        { at: 3550, run: () => dizzy?.classList.add("on") },
        { at: 4450, run: () => { dizzy?.classList.remove("on"); stage.classList.remove("fallen"); stage.classList.add("posed"); if (eng) eng.dataset.face = "happy"; } }, // jump + pose
        { at: 4950, run: burst },                                                                            // confetti / bolts / stars
        { at: 5900, run: showFinal },                                                                        // final screen
      ];
      steps.forEach((s) => at(s.at, s.run));
    }

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);

    return () => {
      timers.forEach(clearTimeout);
      stage.querySelectorAll(".pl-ach-pt").forEach((p) => p.remove());
      document.removeEventListener("keydown", onKey);
    };
    // Runs once on mount; milestone is fixed for the popup's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Final-block title: the part after the last ": " prints in the PowerLine orange.
  const sep = title.lastIndexOf(": ");
  const titleHead = sep >= 0 ? title.slice(0, sep + 2) : title;
  const titleAccent = sep >= 0 ? title.slice(sep + 2) : "";

  return (
    <div className={"pl-ach-backdrop" + (shown ? " show" : "")}>
      <div className="pl-ach-card" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="pl-ach-title">
        <div className="pl-ach-stage" ref={stageRef}>
          <div className="pl-ach-banner" ref={bannerRef}>{count} PANELS COMPLETED!</div>
          <div dangerouslySetInnerHTML={{ __html: MILESTONE10_SVG }} />
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
