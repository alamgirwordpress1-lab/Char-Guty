import { GUTI_COUNT } from "./config.js";
import type { GameConfig } from "./config.js";
import type { Rng } from "./rng.js";
import type { Guti, Side, Vec2 } from "./types.js";

export type ThrowConfig = Pick<GameConfig, "pFlat" | "fieldWidth" | "fieldHeight" | "minSpacing">;

const MAX_PLACEMENT_ATTEMPTS = 100;

/** Throws all 4 gutis: each lands flat with probability pFlat, scattered across the field. */
export function throwGutis(rng: Rng, config: ThrowConfig): Guti[] {
  const gutis: Guti[] = [];
  for (let id = 0; id < GUTI_COUNT; id++) {
    const side: Side = rng.next() < config.pFlat ? "F" : "R";
    const { x, y } = scatter(rng, config, gutis);
    gutis.push({ id, side, x, y });
  }
  return gutis;
}

function scatter(rng: Rng, config: ThrowConfig, placed: readonly Guti[]): Vec2 {
  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
    const x = rng.next() * config.fieldWidth;
    const y = rng.next() * config.fieldHeight;
    if (placed.every((g) => Math.hypot(g.x - x, g.y - y) >= config.minSpacing)) {
      return { x, y };
    }
  }
  throw new Error(
    `could not place a guti with minSpacing ${config.minSpacing} in a ${config.fieldWidth}x${config.fieldHeight} field`,
  );
}
