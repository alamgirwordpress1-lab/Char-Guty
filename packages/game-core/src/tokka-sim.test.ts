import { describe, expect, it } from "vitest";
import { simulateTokkaFlick } from "./tokka-sim.js";
import type { TokkaSimTuning } from "./tokka-sim.js";

const tuning: TokkaSimTuning = { friction: 50, dt: 1 / 60, restSpeed: 2, maxSteps: 600 };

describe("simulateTokkaFlick", () => {
  it("connects when flicked straight at a reachable target", () => {
    const flicked = { position: { x: 0, y: 0 }, velocity: { x: 200, y: 0 }, radius: 15 };
    const target = { position: { x: 100, y: 0 }, radius: 15 };

    const result = simulateTokkaFlick(flicked, target, tuning);

    expect(result.success).toBe(true);
    expect(result.steps).toBeLessThan(tuning.maxSteps);
  });

  it("misses when friction stops it short of the target", () => {
    const flicked = { position: { x: 0, y: 0 }, velocity: { x: 20, y: 0 }, radius: 15 };
    const target = { position: { x: 100, y: 0 }, radius: 15 };

    const result = simulateTokkaFlick(flicked, target, tuning);

    expect(result.success).toBe(false);
    expect(result.finalPosition.x).toBeLessThan(70);
  });

  it("misses when flicked away from the target", () => {
    const flicked = { position: { x: 0, y: 0 }, velocity: { x: -200, y: 0 }, radius: 15 };
    const target = { position: { x: 100, y: 0 }, radius: 15 };

    const result = simulateTokkaFlick(flicked, target, tuning);

    expect(result.success).toBe(false);
    expect(result.finalPosition.x).toBeLessThan(0);
    expect(result.steps).toBeLessThan(tuning.maxSteps);
  });

  it("is bounded by maxSteps when friction never brings it to rest", () => {
    const flicked = { position: { x: 0, y: 0 }, velocity: { x: -10, y: 0 }, radius: 15 };
    const target = { position: { x: 1000, y: 0 }, radius: 15 };
    const neverRests: TokkaSimTuning = { friction: 0, dt: 1 / 60, restSpeed: 2, maxSteps: 50 };

    const result = simulateTokkaFlick(flicked, target, neverRests);

    expect(result.success).toBe(false);
    expect(result.steps).toBe(50);
    expect(result.finalPosition.x).toBeCloseTo((-10 * 50) / 60);
  });

  it("is deterministic for identical inputs", () => {
    const flicked = { position: { x: 5, y: -3 }, velocity: { x: 120, y: 40 }, radius: 15 };
    const target = { position: { x: 90, y: 20 }, radius: 15 };

    const first = simulateTokkaFlick(flicked, target, tuning);
    const second = simulateTokkaFlick(flicked, target, tuning);

    expect(second).toEqual(first);
  });
});
