import type { Scene, SceneContext } from "./types";
import { MILESTONE50_SVG } from "./milestone50Svg";
import "./milestone50.css";

// Milestone 50 ("Fully Charged"): the engineer struts in, squats and grabs a big breaker, hoists it
// overhead — then gets ZAPPED (flash, spiky hair, soot, popped helmet, smoke), drops it, shakes it off
// and strikes a proud pose. Ported verbatim from milestone-50.html; the timeline runs through the
// shared scene context.

const bolt = (c: string) => `<svg width="22" height="30" viewBox="0 0 22 30"><path d="M13 0 L2 17 H10 L7 30 L20 11 H12 Z" fill="${c}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const star = (c: string) => `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 0 l3 6.5 7 1 -5 4.8 1.2 7 -6.2 -3.3 -6.2 3.3 1.2 -7 -5 -4.8 7 -1z" fill="${c}"/></svg>`;

function run(ctx: SceneContext) {
  const { stage, banner, at, particle, shake, showFinal, reduce } = ctx;
  const eng = stage.querySelector<SVGGElement>("#eng");
  const flash = stage.querySelector<HTMLElement>("#flash");
  const add = (...c: string[]) => stage.classList.add(...c);
  const rem = (...c: string[]) => stage.classList.remove(...c);
  const set = (face?: string | null, arms?: string | null) => { if (!eng) return; if (face) eng.dataset.face = face; if (arms) eng.dataset.arms = arms; };

  function burst() {
    const ox = 50, oy = 58;
    const colors = ["#F7931E", "#FFD84A", "#C8F03C", "#ffffff", "#5BD1FF", "#FF7C8F"];
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 240;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d * 0.75 - 80;
      const el = particle("conf", "", ox, oy, [
        { transform: "translate(-50%,-50%) scale(.3) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * .75}px,${dy}px) scale(1) rotate(${360 * Math.random()}deg)`, opacity: 1, offset: .4 },
        { transform: `translate(${dx}px,${dy + 160}px) scale(.9) rotate(${720 * Math.random()}deg)`, opacity: 0 },
      ], 1600 + Math.random() * 900, Math.random() * 120);
      el.style.background = colors[i % colors.length];
      if (i % 3 === 0) { el.style.width = "8px"; el.style.height = "8px"; el.style.borderRadius = "50%"; }
    }
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + .3, d = 110 + Math.random() * 70;
      particle("", i % 2 ? bolt("#FFD84A") : star("#FFD84A"), ox, oy, [
        { transform: "translate(-50%,-50%) scale(0) rotate(0)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d * .8}px) scale(1.3) rotate(${(Math.random() - .5) * 60}deg)`, opacity: 1, offset: .45 },
        { transform: `translate(${Math.cos(a) * d * 1.25}px,${Math.sin(a) * d}px) scale(.6)`, opacity: 0 },
      ], 1300, i * 40);
    }
  }
  function dust() {
    for (let i = 0; i < 9; i++) {
      particle("dust", "", 37 + Math.random() * 25, 83, [
        { transform: "translate(-50%,-50%) scale(.3)", opacity: .9 },
        { transform: `translate(${(Math.random() - .5) * 80}px,${-20 - Math.random() * 25}px) scale(${1.2 + Math.random()})`, opacity: 0 },
      ], 700 + Math.random() * 300);
    }
  }
  function smoke() {
    for (let i = 0; i < 6; i++) {
      particle("smoke", "", 48 + Math.random() * 4, 50, [
        { transform: "translate(-50%,-50%) scale(.4)", opacity: .8 },
        { transform: `translate(${(Math.random() - .5) * 40}px,${-60 - Math.random() * 40}px) scale(${1.4 + Math.random()})`, opacity: 0 },
      ], 1100 + Math.random() * 400, i * 90);
    }
  }
  function sparks() {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 80;
      particle("conf", "", 50, 40, [
        { transform: "translate(-50%,-50%) scale(.6)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(.2)`, opacity: 0 },
      ], 450 + Math.random() * 250, Math.random() * 300).style.cssText += "width:4px;height:4px;border-radius:50%;background:#FFF3A0;box-shadow:0 0 6px #FFD000";
    }
  }

  if (reduce) {
    add("after-walk", "posed", "spiky", "sooty-lite", "switched");
    set("happy", "pose");
    showFinal();
    return;
  }

  at(150, () => { shake(); banner.classList.add("pop"); });                                          // 1 · shake + banner
  at(500, () => add("walking"));                                                                     // 2 · confident strut in
  at(2000, () => { rem("walking"); add("after-walk", "squat"); set("strain", "grab"); });            //     squat + grab
  at(2450, () => { rem("squat"); add("lifted", "holding"); set(null, "up"); });                      // 3 · lift overhead
  at(3050, () => set("happy"));                                                                      //     proud
  at(3500, () => {                                                                                   // 4 · ZAP
    add("switched", "zapping", "sooty", "spiky", "popped"); rem("holding"); set("zapped");
    if (flash) { flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go"); }
    shake(); sparks();
  });
  at(4250, () => { rem("zapping"); smoke(); });
  at(4450, () => { rem("lifted"); set(null, "side"); });                                             //     drops the breaker
  at(4780, () => { shake(); dust(); });
  at(5200, () => { rem("popped", "sooty"); add("sooty-lite", "posed"); set("happy", "pose"); });     // 5 · shake it off + thumbs up
  at(5500, burst);
  at(6400, showFinal);                                                                               //     final screen
}

export const milestone50Scene: Scene = {
  count: 50,
  scopeClass: "pl-ach-scene-50",
  html: `<div class="pl-ach-flash" id="flash"></div>` + MILESTONE50_SVG,
  run,
};
