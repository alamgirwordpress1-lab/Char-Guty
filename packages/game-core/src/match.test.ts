import { describe, expect, it } from "vitest";
import { computeStake, hasReachedPot, InvalidMatchConfigError } from "./match.js";
import { DEFAULT_CONFIG } from "./config.js";

describe("computeStake", () => {
  it("splits the pot evenly across players", () => {
    expect(computeStake({ pot: 100, playerCount: 4 }, DEFAULT_CONFIG.potValues)).toEqual({
      stake: 25,
    });
  });

  it("rejects a pot not in the allowed set", () => {
    expect(() => computeStake({ pot: 150, playerCount: 2 }, DEFAULT_CONFIG.potValues)).toThrow(
      InvalidMatchConfigError,
    );
  });

  it("rejects a player count outside 2-4", () => {
    expect(() => computeStake({ pot: 100, playerCount: 1 }, DEFAULT_CONFIG.potValues)).toThrow(
      InvalidMatchConfigError,
    );
    expect(() => computeStake({ pot: 100, playerCount: 5 }, DEFAULT_CONFIG.potValues)).toThrow(
      InvalidMatchConfigError,
    );
  });

  it("rejects a pot that does not divide evenly by player count", () => {
    expect(() => computeStake({ pot: 100, playerCount: 3 }, DEFAULT_CONFIG.potValues)).toThrow(
      InvalidMatchConfigError,
    );
  });
});

describe("hasReachedPot", () => {
  it("is false below the pot and true at or above it", () => {
    expect(hasReachedPot(99, 100)).toBe(false);
    expect(hasReachedPot(100, 100)).toBe(true);
    expect(hasReachedPot(150, 100)).toBe(true);
  });
});
