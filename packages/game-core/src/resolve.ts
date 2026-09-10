import { GUTI_COUNT, TOKKAS_PER_MULTI_FLAT } from "./config.js";
import type { Guti, ThrowResult } from "./types.js";

const FOUR_FLAT_POINTS = 4;

/**
 * 4F: 4 points, no tokka. 0F: instant match win. 3F/2F/1F: no points yet;
 * up to TOKKAS_PER_MULTI_FLAT tokkas at 1 point each, resolved by resolveTurnTokkas.
 */
export function resolveThrow(gutis: readonly Guti[]): ThrowResult {
  const flatCount = gutis.filter((g) => g.side === "F").length;
  if (flatCount === 0) {
    return { gutis, flatCount, outcome: "instantWin", points: 0, requiredTokkas: 0 };
  }
  if (flatCount === GUTI_COUNT) {
    return { gutis, flatCount, outcome: "four", points: FOUR_FLAT_POINTS, requiredTokkas: 0 };
  }
  return { gutis, flatCount, outcome: "tokka", points: 0, requiredTokkas: TOKKAS_PER_MULTI_FLAT };
}

/** Pairs of guti ids whose centres are within radius of each other; each pair once, lower id first. */
export function tokkaPairs(
  gutis: readonly Guti[],
  radius: number,
): Array<readonly [number, number]> {
  const pairs: Array<readonly [number, number]> = [];
  for (let i = 0; i < gutis.length; i++) {
    for (let j = i + 1; j < gutis.length; j++) {
      const a = gutis[i];
      const b = gutis[j];
      if (a === undefined || b === undefined) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= radius) {
        pairs.push([Math.min(a.id, b.id), Math.max(a.id, b.id)]);
      }
    }
  }
  return pairs;
}
