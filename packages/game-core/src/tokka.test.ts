import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config.js";
import { simulateTokka } from "./tokka.js";
import type { TokkaConfig } from "./tokka.js";
import type { Guti } from "./types.js";

const config: TokkaConfig = {
  gutiRadius: DEFAULT_CONFIG.gutiRadius,
  friction: DEFAULT_CONFIG.friction,
  dt: DEFAULT_CONFIG.dt,
  restSpeed: DEFAULT_CONFIG.restSpeed,
  maxFlickPower: DEFAULT_CONFIG.maxFlickPower,
  maxSimSeconds: DEFAULT_CONFIG.maxSimSeconds,
};

const at = (id: number, x: number, y = 0): Guti => ({ id, side: "F", x, y });

// shooter 0 at the origin, target 1 sixty px away, two bystanders well clear of the line
const board: Guti[] = [at(0, 0), at(1, 60), at(2, 300, 200), at(3, 350, -200)];

describe("simulateTokka", () => {
  it("returns identical output across 3 runs for the same input", () => {
    const run = () =>
      simulateTokka(board, 0, 1, { dx: 1, dy: 0.1, power: 300 }, { ...config, recordFrames: true });
    const first = run();
    expect(run()).toEqual(first);
    expect(run()).toEqual(first);
  });

  it("hits when flicked straight at a reachable target", () => {
    const result = simulateTokka(board, 0, 1, { dx: 1, dy: 0, power: 300 }, config);
    expect(result.hit).toBe(true);
    expect(result.finalGutis.find((g) => g.id === 1)?.x).toBeGreaterThan(60);
  });

  it("misses when the flick is too weak to reach", () => {
    const result = simulateTokka(board, 0, 1, { dx: 1, dy: 0, power: 40 }, config);
    expect(result.hit).toBe(false);
  });

  it("misses when flicked away from the target", () => {
    const result = simulateTokka(board, 0, 1, { dx: -1, dy: 0, power: 300 }, config);
    expect(result.hit).toBe(false);
  });

  it("counts as a miss when another guti is struck first", () => {
    const blocked: Guti[] = [at(0, 0), at(1, 100), at(2, 50), at(3, 350, -200)];
    const result = simulateTokka(blocked, 0, 1, { dx: 1, dy: 0, power: 400 }, config);
    expect(result.hit).toBe(false);
  });

  it("clamps power to maxFlickPower", () => {
    const capped = simulateTokka(
      board,
      0,
      1,
      { dx: 1, dy: 0, power: config.maxFlickPower },
      config,
    );
    const excessive = simulateTokka(board, 0, 1, { dx: 1, dy: 0, power: 1e9 }, config);
    expect(excessive).toEqual(capped);
  });

  it("treats negative power as no flick", () => {
    const result = simulateTokka(board, 0, 1, { dx: 1, dy: 0, power: -50 }, config);
    expect(result.hit).toBe(false);
    expect(result.finalGutis).toEqual(board);
  });

  it("records frames only when asked", () => {
    const silent = simulateTokka(board, 0, 1, { dx: 1, dy: 0, power: 300 }, config);
    expect("frames" in silent).toBe(false);

    const replay = simulateTokka(
      board,
      0,
      1,
      { dx: 1, dy: 0, power: 300 },
      { ...config, recordFrames: true },
    );
    expect(replay.frames?.[0]).toEqual(board);
    expect(replay.frames?.at(-1)).toEqual(replay.finalGutis);
  });
});
