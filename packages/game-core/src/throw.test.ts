import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, GUTI_COUNT } from "./config.js";
import { SeededRng } from "./rng.js";
import { throwGutis } from "./throw.js";
import type { ThrowConfig } from "./throw.js";
import type { Guti } from "./types.js";

const config: ThrowConfig = {
  pFlat: DEFAULT_CONFIG.pFlat,
  fieldWidth: DEFAULT_CONFIG.fieldWidth,
  fieldHeight: DEFAULT_CONFIG.fieldHeight,
  minSpacing: DEFAULT_CONFIG.minSpacing,
};

function minPairDistance(gutis: readonly Guti[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < gutis.length; i++) {
    for (let j = i + 1; j < gutis.length; j++) {
      const a = gutis[i];
      const b = gutis[j];
      if (a === undefined || b === undefined) continue;
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return min;
}

describe("throwGutis", () => {
  it("returns 4 gutis with ids 0-3", () => {
    const gutis = throwGutis(new SeededRng(1), config);
    expect(gutis.map((g) => g.id)).toEqual([0, 1, 2, 3]);
  });

  it("is deterministic for the same seed", () => {
    expect(throwGutis(new SeededRng(42), config)).toEqual(throwGutis(new SeededRng(42), config));
  });

  it("lands every guti inside the field and respects minSpacing", () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const gutis = throwGutis(rng, config);
      const inField = gutis.every(
        (g) => g.x >= 0 && g.x < config.fieldWidth && g.y >= 0 && g.y < config.fieldHeight,
      );
      expect(inField).toBe(true);
      expect(minPairDistance(gutis)).toBeGreaterThanOrEqual(config.minSpacing);
    }
  });

  it("matches binomial(4, pFlat) flat-count frequencies within ±2% over 20k seeded throws", () => {
    const rng = new SeededRng(2024);
    const throws = 20_000;
    const counts = new Map<number, number>();
    for (let i = 0; i < throws; i++) {
      const flatCount = throwGutis(rng, config).filter((g) => g.side === "F").length;
      counts.set(flatCount, (counts.get(flatCount) ?? 0) + 1);
    }

    const p = config.pFlat;
    const choose = [1, 4, 6, 4, 1];
    for (let k = 0; k <= GUTI_COUNT; k++) {
      const expected = (choose[k] ?? 0) * p ** k * (1 - p) ** (GUTI_COUNT - k);
      const observed = (counts.get(k) ?? 0) / throws;
      expect(Math.abs(observed - expected)).toBeLessThanOrEqual(0.02);
    }
  });

  it("throws when the field cannot satisfy minSpacing", () => {
    const cramped: ThrowConfig = { pFlat: 0.7, fieldWidth: 10, fieldHeight: 10, minSpacing: 100 };
    expect(() => throwGutis(new SeededRng(3), cramped)).toThrow(/minSpacing/);
  });
});
