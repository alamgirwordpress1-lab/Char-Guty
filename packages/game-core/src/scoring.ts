import { GUTI_COUNT } from "./config.js";
import type { ScoreOutcome } from "./types.js";

/**
 * 4F = 4pts, no tokka. 0F = instant match win. 3F/2F/1F earn no points here;
 * points come from completed tokkas, resolved separately via resolveTurnTokkas.
 */
export function scoreForFlatCount(flatCount: number, tokkasPerMultiFlat: number): ScoreOutcome {
  if (flatCount === 0) {
    return { points: 0, tokkasAllowed: 0, instantMatchWin: true };
  }
  if (flatCount === GUTI_COUNT) {
    return { points: GUTI_COUNT, tokkasAllowed: 0, instantMatchWin: false };
  }
  return { points: 0, tokkasAllowed: tokkasPerMultiFlat, instantMatchWin: false };
}
