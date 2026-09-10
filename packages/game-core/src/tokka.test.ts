import { describe, expect, it } from "vitest";
import { distance, eligibleTokkaPairs } from "./tokka.js";

describe("distance", () => {
  it("computes euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("eligibleTokkaPairs", () => {
  it("pairs gutis within the radius", () => {
    const gutis = [
      { id: 0, position: { x: 0, y: 0 } },
      { id: 1, position: { x: 50, y: 0 } },
      { id: 2, position: { x: 500, y: 0 } },
    ];
    expect(eligibleTokkaPairs(gutis, 80)).toEqual([[0, 1]]);
  });

  it("treats exactly-at-radius as eligible", () => {
    const gutis = [
      { id: 0, position: { x: 0, y: 0 } },
      { id: 1, position: { x: 80, y: 0 } },
    ];
    expect(eligibleTokkaPairs(gutis, 80)).toEqual([[0, 1]]);
  });

  it("returns no pairs when everything is out of range", () => {
    const gutis = [
      { id: 0, position: { x: 0, y: 0 } },
      { id: 1, position: { x: 500, y: 0 } },
    ];
    expect(eligibleTokkaPairs(gutis, 80)).toEqual([]);
  });
});
