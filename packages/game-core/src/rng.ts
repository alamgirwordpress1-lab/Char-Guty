export interface Rng {
  /** Returns a float in [0, 1). Production implementations live outside game-core. */
  next(): number;
}

/** mulberry32: tiny deterministic 32-bit PRNG. For tests and seeded replays. */
export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
