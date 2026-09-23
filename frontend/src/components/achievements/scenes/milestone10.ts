import type { Scene, SceneContext } from "./types";
import { MILESTONE10_SVG } from "../milestone10Svg";
import "./milestone10.css";

// Milestone 10 ("Baby Engineer"): the engineer waddles in dragging a breaker, drops it, gets dizzy,
// then jumps up and poses. Ported verbatim from milestone-10-baby-engineer.html; the timeline that
// used to live inline in MilestoneModal now runs here through the shared scene context.

const bolt = (c: string) => `<svg width="22" height="30" viewBox="0 0 22 30"><path d="M13 0 L2 17 H10 L7 30 L20 11 H12 Z" fill="${c}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const star = (c: string) => `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 0 l3 6.5 7 1 -5 4.8 1.2 7 -6.2 -3.3 -6.2 3.3 1.2 -7 -5 -4.8 7 -1z" fill="${c}"/></svg>`;

function run(ctx: SceneContext) {
  const { stage, banner, at, particle, shake, showFinal, reduce } = ctx;
  const eng = stage.querySelector<SVGGElement>("#eng");
  const dizzy = stage.querySelector<Element>(".pl-ach-dizzy");

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

  if (reduce) {
    stage.classList.add("after-walk", "posed");
    if (eng) eng.dataset.face = "happy";
    showFinal();
    return;
  }
  const steps: { at: number; run: () => void }[] = [
    { at: 150, run: () => { shake(); banner.classList.add("pop"); } },
    { at: 550, run: () => stage.classList.add("walking") },
    { at: 2450, run: () => { stage.classList.replace("walking", "after-walk"); stage.classList.add("wobble"); } },
    { at: 3000, run: () => { stage.classList.remove("wobble"); stage.classList.add("dropped", "fallen"); if (eng) eng.dataset.face = "oh"; } },
    { at: 3420, run: () => { shake(); dust(); } },
    { at: 3550, run: () => dizzy?.classList.add("on") },
    { at: 4450, run: () => { dizzy?.classList.remove("on"); stage.classList.remove("fallen"); stage.classList.add("posed"); if (eng) eng.dataset.face = "happy"; } },
    { at: 4950, run: burst },
    { at: 5900, run: showFinal },
  ];
  steps.forEach((s) => at(s.at, s.run));
}

export const milestone10Scene: Scene = {
  count: 10,
  scopeClass: "pl-ach-scene-10",
  html: MILESTONE10_SVG,
  run,
};
