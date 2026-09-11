export const GUTI_COUNT = 4;
export const GUTI_RADIUS = 13;
export const TOKKAS_PER_MULTI_FLAT = 2;

export interface GameConfig {
  readonly pFlat: number;
  readonly turnTimeoutMs: number;
  readonly potValues: readonly number[];
  readonly gutiRadius: number;
  /** Throw scatter: size of the field gutis land in, in px. Its edge stops sliding gutis. */
  readonly fieldWidth: number;
  readonly fieldHeight: number;
  /**
   * Throw scatter: minimum centre-to-centre distance between landed gutis, in px. Wider
   * spacing means longer tokka shots, which need harder flicks - and those stray more.
   */
  readonly minSpacing: number;
  /** Sim tuning: constant deceleration applied to a moving guti, in px/s^2. */
  readonly friction: number;
  /** Sim tuning: fixed simulation timestep, in seconds. */
  readonly dt: number;
  /** Sim tuning: speed (px/s) below which a guti is considered stopped. */
  readonly restSpeed: number;
  /**
   * Sim tuning: flick power (px/s) is clamped to this; keep maxFlickPower * dt < 2 * gutiRadius.
   * Its stopping distance (power^2 / 2 friction) must span the field's diagonal: a pair can
   * land in opposite corners and still has to be struck.
   */
  readonly maxFlickPower: number;
  /**
   * Flick spread: how far a full-power flick can veer off its aim, either side, in sideways
   * px per px travelled (0.18 is about 10 degrees); a gentler flick veers proportionally
   * less. Without it a steady aim never misses, and one turn could run all the way to the pot.
   */
  readonly flickSpread: number;
  /** Sim tuning: hard cap on simulated time so a tokka always terminates. */
  readonly maxSimSeconds: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  pFlat: 0.7,
  turnTimeoutMs: 30_000,
  potValues: [100, 200, 300, 400, 500],
  gutiRadius: GUTI_RADIUS,
  fieldWidth: 400,
  fieldHeight: 300,
  minSpacing: 70,
  friction: 400,
  dt: 1 / 60,
  restSpeed: 2,
  maxFlickPower: 700,
  flickSpread: 0.18,
  maxSimSeconds: 5,
};
