import { GUTI_COUNT } from "./config.js";
import type { Rng } from "./rng.js";
import type { GutiFace, ThrowResult } from "./types.js";

export function throwGutis(rng: Rng, pFlat: number): ThrowResult {
  const faces: GutiFace[] = [];
  for (let i = 0; i < GUTI_COUNT; i++) {
    faces.push(rng.next() < pFlat ? "F" : "R");
  }
  const flatCount = faces.filter((face) => face === "F").length;
  return { faces, flatCount };
}
