import { describe, expect, it } from "vitest";
import { scoreForFlatCount } from "./scoring.js";

describe("scoreForFlatCount", () => {
  it("4F scores 4 points with no tokka", () => {
    expect(scoreForFlatCount(4, 2)).toEqual({
      points: 4,
      tokkasAllowed: 0,
      instantMatchWin: false,
    });
  });

  it.each([3, 2, 1])(
    "%iF grants tokkasPerMultiFlat tokkas and no immediate points",
    (flatCount) => {
      expect(scoreForFlatCount(flatCount, 2)).toEqual({
        points: 0,
        tokkasAllowed: 2,
        instantMatchWin: false,
      });
    },
  );

  it("0F is an instant match win", () => {
    expect(scoreForFlatCount(0, 2)).toEqual({
      points: 0,
      tokkasAllowed: 0,
      instantMatchWin: true,
    });
  });
});
