import type { Scene, SceneContext } from "./types";
import { MILESTONE25_SVG } from "./milestone25Svg";
import "./milestone25.css";

// Milestone 25 ("Breaker Juggler"): the engineer walks to a distribution board, the door swings open,
// three breakers pop into his hands and he juggles them in a cascade — faster and faster until the
// last throws go too high, one bonks his helmet and clicks straight into the DB slot while the others
// land stacked on his head; dizzy, then a proud pose. Ported verbatim from milestone-25.html; the
// physics (parabola tosses of flying <use> breakers) runs through the shared scene context.

const NS = "http://www.w3.org/2000/svg";
const bolt = (c: string) => `<svg width="22" height="30" viewBox="0 0 22 30"><path d="M13 0 L2 17 H10 L7 30 L20 11 H12 Z" fill="${c}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const star = (c: string) => `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 0 l3 6.5 7 1 -5 4.8 1.2 7 -6.2 -3.3 -6.2 3.3 1.2 -7 -5 -4.8 7 -1z" fill="${c}"/></svg>`;

type Item = { el: SVGUseElement; x: number; y: number; r: number };

function run(ctx: SceneContext) {
  const { stage, banner, at, onRaf, particle, shake, showFinal, reduce } = ctx;
  const troupe = stage.querySelector<SVGGElement>("#troupe");
  const flyers = stage.querySelector<SVGGElement>("#flyers");
  const eng = stage.querySelector<SVGGElement>("#eng");
  const dizzy = stage.querySelector<Element>("#dizzy");
  const slotLed = stage.querySelector<Element>("#slotLed");
  if (!troupe || !flyers || !eng || !dizzy || !slotLed) return;

  const EX = 280; // engineer's spot
  const HANDS: [number, number][] = [[EX - 31, 246], [EX + 31, 246]];
  const BOX: [number, number] = [425, 252];
  const SLOT: [number, number] = [445, 262];
  const STACK: [number, number, number][] = [[EX + 1, 183, 90], [EX - 1, 154, 270]]; // breakers stacked on the helmet
  let pos: [number, number] = [-80, 320];
  const place = (x: number, y: number) => { pos = [x, y]; troupe.style.transform = `translate(${x}px,${y}px)`; };
  const ease = { io: (t: number) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, in: (t: number) => t * t, out: (t: number) => 1 - (1 - t) * (1 - t) };
  const tf = (x: number, y: number, r: number) => `translate(${x}px,${y}px) rotate(${r}deg)`;
  const set = (face?: string, arms?: string) => { if (face) eng.dataset.face = face; if (arms) eng.dataset.arms = arms; };
  const add = (...c: string[]) => stage.classList.add(...c);
  const rem = (...c: string[]) => stage.classList.remove(...c);

  function tween(dur: number, e: (t: number) => number, fn: (v: number) => void) {
    const t0 = performance.now();
    const step = (now: number) => { const t = Math.min(1, (now - t0) / dur); fn(e(t)); if (t < 1) onRaf(step); };
    onRaf(step);
  }
  function moveTo(x: number, y: number, dur: number, e = ease.io) { const [x0, y0] = pos; tween(dur, e, (t) => place(x0 + (x - x0) * t, y0 + (y - y0) * t)); }

  let items: Item[] = [];
  function makeItem(id: string): Item {
    const u = document.createElementNS(NS, "use") as SVGUseElement;
    u.setAttribute("href", "#" + id);
    u.style.transform = tf(BOX[0], BOX[1], 0);
    u.style.opacity = "0";
    flyers!.appendChild(u);
    return { el: u, x: BOX[0], y: BOX[1], r: 0 };
  }
  // Fly a breaker along a parabola with spin.
  function toss(it: Item, to: [number, number], dur: number, apex: number, spin = 360, endRot: number | null = null) {
    const x0 = it.x, y0 = it.y, r0 = it.r, x1 = to[0], y1 = to[1], r1 = endRot ?? (r0 + spin);
    const frames: Keyframe[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, x = x0 + (x1 - x0) * t;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (2 * apex - (y0 + y1) / 2) + t * t * y1;
      frames.push({ transform: tf(x, y, r0 + (r1 - r0) * t) });
    }
    it.el.getAnimations().forEach((a) => a.cancel());
    it.el.style.opacity = "1";
    it.el.animate(frames, { duration: dur, easing: "linear", fill: "forwards" });
    it.x = x1; it.y = y1; it.r = r1;
  }
  function wobbleStack() {
    items.slice(1).forEach((it, k) => it.el.animate(
      [{ transform: tf(it.x, it.y, it.r - 4) }, { transform: tf(it.x + 1, it.y, it.r + 4) }],
      { duration: 420 + k * 60, direction: "alternate", iterations: Infinity, easing: "ease-in-out" }));
  }

  function burst(ox: number, oy: number) {
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
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + .3, d = 110 + Math.random() * 70;
      particle("", i % 2 ? bolt("#FFD84A") : star("#FFD84A"), ox, oy, [
        { transform: "translate(-50%,-50%) scale(0) rotate(0)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d * .8}px) scale(1.3) rotate(${(Math.random() - .5) * 60}deg)`, opacity: 1, offset: .45 },
        { transform: `translate(${Math.cos(a) * d * 1.25}px,${Math.sin(a) * d}px) scale(.6)`, opacity: 0 },
      ], 1300, i * 40);
    }
  }
  function clang() { // little white spark ring on the helmet
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      particle("conf", "", EX / 6, 196 / 3.8, [
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * 34}px,${Math.sin(a) * 22}px) scale(.3)`, opacity: 0 },
      ], 380).style.cssText += "width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 6px #FFE45C";
    }
  }

  flyers.innerHTML = ""; // start clean, so a re-run (e.g. React StrictMode's double mount) never stacks breakers
  place(-80, 320); set("happy", "side");
  items = ["jMCB", "jMCB3", "jMCCB"].map(makeItem);

  if (reduce) {
    place(EX, 320);
    ([[1, ...STACK[0]], [2, ...STACK[1]]] as [number, number, number, number][]).forEach(([i, x, y, r]) => {
      const it = items[i]; it.x = x; it.y = y; it.r = r; it.el.style.opacity = "1"; it.el.style.transform = tf(x, y, r);
    });
    const first = items[0]; first.x = SLOT[0]; first.y = SLOT[1]; first.r = 0;
    first.el.style.opacity = "1"; first.el.style.transform = tf(SLOT[0], SLOT[1], 0);
    slotLed.classList.add("on"); add("open"); set("happy", "pose"); showFinal();
    return;
  }

  at(150, () => { shake(); banner.classList.add("pop"); });                     // 1 · shake + banner
  at(400, () => { add("walking"); moveTo(EX, 320, 1000, ease.out); });          // 2 · walks up to the toolbox
  at(1400, () => { rem("walking"); add("open"); set("happy", "juggle"); });     //     DB door swings open
  // breakers pop out of the DB into his hands
  at(1500, () => toss(items[0], HANDS[0], 420, 150, 540));
  at(1700, () => toss(items[1], HANDS[1], 420, 150, 540));
  at(1900, () => toss(items[2], HANDS[0], 420, 150, 540));
  // 3 · juggling cascade: a throw every beat, each tool flies a few beats
  const start = 2320;
  let t = start, n = 0;
  const plan: number[][] = [...Array(7).fill([200, 600, 120]), [200, 550, 120], [200, 500, 125], ...Array(9).fill([150, 450, 130])]; // [beat, flight, apex y]
  plan.forEach(([beat, flight, apex], k) => {
    const it = items[n % 3], from = n % 2, to = 1 - from;
    at(t, () => { toss(it, HANDS[to], flight, apex); });
    if (k === 9) at(t, () => { add("fast", "worried"); set("strain"); });
    t += beat; n++;
  });
  add("juggling");
  // 4 · the last three throws go way too high
  const hi = [t, t + 180, t + 360];
  at(hi[0], () => toss(items[n % 3], [EX, 180], 1000, -60, 900));                 // the MCB comes down on his helmet
  at(hi[1], () => toss(items[(n + 1) % 3], [STACK[0][0], STACK[0][1]], 1150, -80, 720, STACK[0][2]));
  at(hi[2], () => toss(items[(n + 2) % 3], [STACK[1][0], STACK[1][1]], 1250, -90, 720, STACK[1][2]));
  at(hi[0] + 120, () => { rem("juggling", "fast"); set("oh", "side"); });
  const bonk = hi[0] + 1000;
  at(bonk, () => {
    add("bonk"); shake(); clang(); dizzy.classList.add("on"); set("oh");
    const it = items[n % 3]; items = [it, items[(n + 1) % 3], items[(n + 2) % 3]];
    toss(it, SLOT, 520, 120, 380, 720);                                          // …bounces off and clicks straight into the DB
    at(520, () => {
      slotLed.classList.add("on"); shake();
      it.el.animate([{ transform: tf(SLOT[0], SLOT[1], 720) }, { transform: tf(SLOT[0], SLOT[1] - 4, 720) }, { transform: tf(SLOT[0], SLOT[1], 720) }], { duration: 160, fill: "forwards" });
    });
  });
  at(bonk + 160, () => rem("bonk"));
  at(bonk + 420, () => { shake(); });                                            //     …the others land on his head
  at(bonk + 750, () => { dizzy.classList.remove("on"); rem("worried"); set("happy", "pose"); wobbleStack(); }); // 5 · balanced! thumbs up
  at(bonk + 950, () => burst(47, 58));
  at(bonk + 1900, showFinal);
}

export const milestone25Scene: Scene = {
  count: 25,
  scopeClass: "pl-ach-scene-25",
  html: `<div class="pl-ach-flash" id="flash"></div>` + MILESTONE25_SVG,
  run,
};
