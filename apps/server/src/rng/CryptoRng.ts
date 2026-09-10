import { randomInt } from "node:crypto";
import type { Rng } from "@char-guty/game-core";

const SCALE = 1_000_000_000;

/** Server-side Rng backed by crypto.randomInt — never Math.random for game outcomes. */
export class CryptoRng implements Rng {
  next(): number {
    return randomInt(0, SCALE) / SCALE;
  }
}
