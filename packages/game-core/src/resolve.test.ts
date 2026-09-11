import { describe, expect, it } from "vitest";
import { resolveThrow } from "./resolve.js";
import type { Guti } from "./types.js";

function gutisWithFlats(flatCount: number): Guti[] {
  return [0, 1, 2, 3].map((id): Guti => ({
    id,
    side: id < flatCount ? "F" : "R",
    x: id * 100,
    y: 0,
  }));
}

describe("resolveThrow", () => {
  it("4F is 'four': 4 points, no tokka", () => {
    expect(resolveThrow(gutisWithFlats(4))).toMatchObject({
      flatCount: 4,
      outcome: "four",
      points: 4,
      requiredTokkas: 0,
    });
  });

  it.each([3, 2, 1])("%iF is 'tokka': 0 points, 2 required tokkas", (flatCount) => {
    expect(resolveThrow(gutisWithFlats(flatCount))).toMatchObject({
      flatCount,
      outcome: "tokka",
      points: 0,
      requiredTokkas: 2,
    });
  });

  it("0F is 'instantWin'", () => {
    expect(resolveThrow(gutisWithFlats(0))).toMatchObject({
      flatCount: 0,
      outcome: "instantWin",
      points: 0,
      requiredTokkas: 0,
    });
  });

  it("passes the thrown gutis through", () => {
    const gutis = gutisWithFlats(2);
    expect(resolveThrow(gutis).gutis).toBe(gutis);
  });
});
