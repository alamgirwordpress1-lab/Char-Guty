import { describe, expect, it } from "vitest";
import { resolveThrow, tokkaPairs } from "./resolve.js";
import type { Guti } from "./types.js";

function gutisWithFlats(flatCount: number): Guti[] {
  return [0, 1, 2, 3].map((id): Guti => ({
    id,
    side: id < flatCount ? "F" : "R",
    x: id * 100,
    y: 0,
  }));
}

const at = (id: number, x: number, y = 0): Guti => ({ id, side: "F", x, y });

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

describe("tokkaPairs", () => {
  it("pairs gutis within the radius", () => {
    expect(tokkaPairs([at(0, 0), at(1, 50), at(2, 500)], 80)).toEqual([[0, 1]]);
  });

  it("includes a pair exactly at the radius", () => {
    expect(tokkaPairs([at(0, 0), at(1, 80)], 80)).toEqual([[0, 1]]);
  });

  it("excludes a pair just beyond the radius", () => {
    expect(tokkaPairs([at(0, 0), at(1, 80.001)], 80)).toEqual([]);
  });

  it("uses euclidean distance, not per-axis distance", () => {
    expect(tokkaPairs([at(0, 0), at(1, 60, 60)], 80)).toEqual([]);
  });

  it("returns every pair once in a cluster", () => {
    expect(tokkaPairs([at(0, 0), at(1, 30), at(2, 60)], 80)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it("orders each pair lower id first regardless of input order", () => {
    expect(tokkaPairs([at(3, 0), at(1, 10)], 80)).toEqual([[1, 3]]);
  });

  it("returns nothing for fewer than two gutis", () => {
    expect(tokkaPairs([], 80)).toEqual([]);
    expect(tokkaPairs([at(0, 0)], 80)).toEqual([]);
  });
});
