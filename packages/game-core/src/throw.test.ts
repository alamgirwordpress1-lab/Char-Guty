import { describe, expect, it } from "vitest";
import { throwGutis } from "./throw.js";
import type { Rng } from "./rng.js";

function fakeRng(values: readonly number[]): Rng {
  let i = 0;
  return {
    next(): number {
      const v = values[i % values.length];
      i += 1;
      if (v === undefined) throw new Error("fakeRng: empty values");
      return v;
    },
  };
}

describe("throwGutis", () => {
  it("all below pFlat lands all flat", () => {
    const result = throwGutis(fakeRng([0]), 0.7);
    expect(result.faces).toEqual(["F", "F", "F", "F"]);
    expect(result.flatCount).toBe(4);
  });

  it("all at or above pFlat lands all round", () => {
    const result = throwGutis(fakeRng([0.99]), 0.7);
    expect(result.faces).toEqual(["R", "R", "R", "R"]);
    expect(result.flatCount).toBe(0);
  });

  it("mixes faces per draw and counts flats", () => {
    const result = throwGutis(fakeRng([0.1, 0.9, 0.1, 0.9]), 0.7);
    expect(result.faces).toEqual(["F", "R", "F", "R"]);
    expect(result.flatCount).toBe(2);
  });

  it("a draw exactly equal to pFlat is round (strict less-than)", () => {
    const result = throwGutis(fakeRng([0.7]), 0.7);
    expect(result.faces).toEqual(["R", "R", "R", "R"]);
  });
});
