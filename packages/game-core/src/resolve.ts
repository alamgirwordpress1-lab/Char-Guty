import { GUTI_COUNT, TOKKAS_PER_MULTI_FLAT } from "./config.js";
import type { Guti, ThrowResult } from "./types.js";

const FOUR_FLAT_POINTS = 4;

/**
 * 4F: 4 points, no tokka. 0F: instant match win. 3F/2F/1F: no points yet;
 * TOKKAS_PER_MULTI_FLAT tokkas at 1 point each.
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
