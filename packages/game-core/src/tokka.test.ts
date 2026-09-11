import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config.js";
import { flickSpread, simulateTokka, strayFlick } from "./tokka.js";
import type { TokkaConfig } from "./tokka.js";
import type { Guti } from "./types.js";

const config: TokkaConfig = {
  gutiRadius: DEFAULT_CONFIG.gutiRadius,
  friction: DEFAULT_CONFIG.friction,
  dt: DEFAULT_CONFIG.dt,
  restSpeed: DEFAULT_CONFIG.restSpeed,
  maxFlickPower: DEFAULT_CONFIG.maxFlickPower,
  maxSimSeconds: DEFAULT_CONFIG.maxSimSeconds,
  fieldWidth: DEFAULT_CONFIG.fieldWidth,
  fieldHeight: DEFAULT_CONFIG.fieldHeight,
};

const at = (id: number, x: number, y: number): Guti => ({ id, side: "F", x, y });

// shooter 0 with guti 1 sixty px to its right, and two bystanders well clear of that line
const board: Guti[] = [at(0, 40, 150), at(1, 100, 150), at(2, 300, 40), at(3, 350, 260)];

describe("simulateTokka", () => {
  it("returns identical output across 3 runs for the same input", () => {
    const run = () =>
      simulateTokka(board, 0, { dx: 1, dy: 0.1, power: 300 }, { ...config, recordFrames: true });
    const first = run();
    expect(run()).toEqual(first);
    expect(run()).toEqual(first);
  });

  it("hits the guti it is flicked straight at", () => {
    const result = simulateTokka(board, 0, { dx: 1, dy: 0, power: 300 }, config);
    expect(result.hitId).toBe(1);
    expect(result.finalGutis.find((g) => g.id === 1)?.x).toBeGreaterThan(100);
  });

  it("misses when the flick is too weak to reach", () => {
    expect(simulateTokka(board, 0, { dx: 1, dy: 0, power: 40 }, config).hitId).toBeNull();
  });

  it("misses when flicked away from every guti", () => {
    expect(simulateTokka(board, 0, { dx: -1, dy: 0, power: 300 }, config).hitId).toBeNull();
  });

  it("stops a guti at the mat's edge instead of letting it slide off", () => {
    const result = simulateTokka(board, 0, { dx: -1, dy: 0, power: config.maxFlickPower }, config);
    expect(result.finalGutis.find((g) => g.id === 0)?.x).toBe(config.gutiRadius);
  });

  it("reports whichever guti the shooter touches first", () => {
    const crowded: Guti[] = [at(0, 40, 150), at(1, 140, 150), at(2, 90, 150), at(3, 350, 260)];
    expect(simulateTokka(crowded, 0, { dx: 1, dy: 0, power: 400 }, config).hitId).toBe(2);
  });

  it("clamps power to maxFlickPower", () => {
    const capped = simulateTokka(board, 0, { dx: 1, dy: 0, power: config.maxFlickPower }, config);
    const excessive = simulateTokka(board, 0, { dx: 1, dy: 0, power: 1e9 }, config);
    expect(excessive).toEqual(capped);
  });

  it("treats negative power as no flick", () => {
    const result = simulateTokka(board, 0, { dx: 1, dy: 0, power: -50 }, config);
    expect(result.hitId).toBeNull();
    expect(result.finalGutis).toEqual(board);
  });

  it("records frames only when asked", () => {
    const silent = simulateTokka(board, 0, { dx: 1, dy: 0, power: 300 }, config);
    expect("frames" in silent).toBe(false);

    const replay = simulateTokka(
      board,
      0,
      { dx: 1, dy: 0, power: 300 },
      { ...config, recordFrames: true },
    );
    expect(replay.frames?.[0]).toEqual(board);
    expect(replay.frames?.at(-1)).toEqual(replay.finalGutis);
  });
});

describe("strayFlick", () => {
  const full = DEFAULT_CONFIG.maxFlickPower;
  const straight = (power: number) => ({ dx: 1, dy: 0, power });
  const lowest = { next: () => 0 };
  const middle = { next: () => 0.5 };
  const highest = { next: () => 1 };

  it("veers up to the spread either side at full power, and proportionally less when gentler", () => {
    const left = strayFlick(straight(full), lowest, DEFAULT_CONFIG);
    const right = strayFlick(straight(full), highest, DEFAULT_CONFIG);
    expect(left.dy / left.dx).toBeCloseTo(-DEFAULT_CONFIG.flickSpread);
    expect(right.dy / right.dx).toBeCloseTo(DEFAULT_CONFIG.flickSpread);
    const gentle = strayFlick(straight(full / 4), highest, DEFAULT_CONFIG);
    expect(gentle.dy / gentle.dx).toBeCloseTo(DEFAULT_CONFIG.flickSpread / 4);
    expect(gentle.power).toBe(full / 4);
    expect(strayFlick(straight(full), middle, DEFAULT_CONFIG)).toEqual(straight(full));
  });

  it("caps the spread at full power and has none without power", () => {
    expect(flickSpread(1e9, DEFAULT_CONFIG)).toBeCloseTo(DEFAULT_CONFIG.flickSpread);
    expect(flickSpread(-50, DEFAULT_CONFIG)).toBe(0);
  });

  it("can turn a hard flick straight at a far guti into a miss", () => {
    const far: Guti[] = [at(0, 20, 150), at(1, 380, 150), at(2, 200, 20), at(3, 200, 280)];
    const onAim = strayFlick(straight(full), middle, DEFAULT_CONFIG);
    const wide = strayFlick(straight(full), highest, DEFAULT_CONFIG);
    expect(simulateTokka(far, 0, onAim, config).hitId).toBe(1);
    expect(simulateTokka(far, 0, wide, config).hitId).toBeNull();
  });
});
