export interface Rng {
  /** Returns a float in [0, 1). Implementations live outside game-core. */
  next(): number;
}
