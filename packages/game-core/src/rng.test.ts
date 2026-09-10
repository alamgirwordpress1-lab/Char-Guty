import { describe, expect, it } from "vitest";
import { SeededRng } from "./rng.js";

describe("SeededRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new SeededRng(99);
    const b = new SeededRng(99);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    expect(new SeededRng(1).next()).not.toBe(new SeededRng(2).next());
  });

  it("stays within [0, 1) with a mean near 0.5", () => {
    const rng = new SeededRng(5);
    const samples = 10_000;
    let sum = 0;
    let inRange = true;
    for (let i = 0; i < samples; i++) {
      const v = rng.next();
      if (v < 0 || v >= 1) inRange = false;
      sum += v;
    }
    expect(inRange).toBe(true);
    expect(sum / samples).toBeCloseTo(0.5, 1);
  });
});
