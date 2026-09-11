import { DEFAULT_CONFIG } from "@char-guty/game-core";
import type { Guti } from "@char-guty/game-core";
import { describe, expect, it } from "vitest";
import { chooseComputerTokka, COMPUTER_AIM_ERROR } from "./computerPlayer.js";

const at = (id: number, x: number, y: number): Guti => ({ id, side: "F", x, y });
const deadOn = { next: () => 0.5 };

describe("chooseComputerTokka", () => {
  it("flicks a guti of the closest pair straight at the other, hard enough to reach it", () => {
    const gutis = [at(0, 0, 0), at(1, 300, 200), at(2, 340, 230), at(3, 50, 250)];
    const { shooterId, flick } = chooseComputerTokka(gutis, deadOn);
    expect(shooterId).toBe(1);
    expect(flick.dx).toBeCloseTo(0.8);
    expect(flick.dy).toBeCloseTo(0.6);
    const stoppingDistance = flick.power ** 2 / (2 * DEFAULT_CONFIG.friction);
    expect(stoppingDistance).toBeGreaterThan(50);
  });

  it("can stray up to the aim error either way, so it can miss", () => {
    const gutis = [at(0, 0, 0), at(1, 100, 0), at(2, 300, 250), at(3, 0, 250)];
    const low = chooseComputerTokka(gutis, { next: () => 0 }).flick;
    const high = chooseComputerTokka(gutis, { next: () => 1 }).flick;
    expect(Math.atan2(low.dy, low.dx)).toBeCloseTo(-COMPUTER_AIM_ERROR);
    expect(Math.atan2(high.dy, high.dx)).toBeCloseTo(COMPUTER_AIM_ERROR);
  });
});
