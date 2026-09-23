import type { Milestone } from "../milestones";

/**
 * A milestone "scene" — the animated stage for one milestone. Each scene owns its SVG artwork, its
 * own CSS (scoped under `scopeClass`, a class the shell puts on the card so scenes never collide),
 * and a timeline. The shell (MilestoneModal) provides the shared chrome + these helpers via the
 * context, so a new milestone is just a new Scene file.
 */
export interface SceneContext {
  stage: HTMLDivElement;
  card: HTMLDivElement;
  banner: HTMLDivElement;
  final: HTMLDivElement;
  bar: HTMLElement | null;
  btn: HTMLButtonElement | null;
  milestone: Milestone;
  reduce: boolean;
  /** setTimeout that is cleared when the modal unmounts. */
  at(ms: number, fn: () => void): void;
  /** requestAnimationFrame that is cancelled when the modal unmounts; returns the id. */
  onRaf(cb: FrameRequestCallback): number;
  /** Re-trigger the card's shake animation. */
  shake(): void;
  /** Spawn a confetti/spark particle on the stage (positioned in stage %). Auto-removes on finish. */
  particle(cls: string, html: string, x: number, y: number, frames: Keyframe[], dur: number, delay?: number): HTMLDivElement;
  /** Reveal the final "achievement unlocked" card (banner flip, progress bar, focus the button). */
  showFinal(): void;
}

export interface Scene {
  count: number;
  /** Class placed on the card so this scene's CSS (all under `.<scopeClass>`) applies only here. */
  scopeClass: string;
  /** Stage inner markup (SVG, plus any scene-specific overlay), injected after the banner. */
  html: string;
  /** Schedule the animation timeline. Runs once on mount; the shell handles cleanup. */
  run(ctx: SceneContext): void;
}
