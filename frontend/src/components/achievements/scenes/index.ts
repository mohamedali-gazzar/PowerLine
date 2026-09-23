import type { Scene } from "./types";
import { milestone10Scene } from "./milestone10";
import { milestone25Scene } from "./milestone25";
import { milestone50Scene } from "./milestone50";

// One scene per milestone that has bespoke artwork. Add a new milestone's animation by dropping in a
// scene file and registering it here.
const SCENES: Scene[] = [milestone10Scene, milestone25Scene, milestone50Scene];

/** The scene for a given panel count, or undefined if that milestone has no bespoke animation yet. */
export function sceneForCount(count: number): Scene | undefined {
  return SCENES.find((s) => s.count === count);
}

export type { Scene, SceneContext } from "./types";
