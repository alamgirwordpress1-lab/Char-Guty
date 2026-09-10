export const GUTI_COUNT = 4;
export const GUTI_RADIUS = 15;
export const TOKKAS_PER_MULTI_FLAT = 2;

export interface GameConfig {
  readonly pFlat: number;
  readonly tokkaRadius: number;
  readonly turnTimeoutMs: number;
  readonly potValues: readonly number[];
  readonly gutiRadius: number;
  /** Throw scatter: size of the field gutis land in, in px. */
  readonly fieldWidth: number;
  readonly fieldHeight: number;
  /** Throw scatter: minimum centre-to-centre distance between landed gutis, in px. */
  readonly minSpacing: number;
  /** Sim tuning: constant deceleration applied to a moving guti, in px/s^2. */
  readonly friction: number;
  /** Sim tuning: fixed simulation timestep, in seconds. */
  readonly dt: number;
  /** Sim tuning: speed (px/s) below which a guti is considered stopped. */
  readonly restSpeed: number;
  /** Sim tuning: flick power (px/s) is clamped to this; keep maxFlickPower * dt < 2 * gutiRadius. */
  readonly maxFlickPower: number;
  /** Sim tuning: hard cap on simulated time so a tokka always terminates. */
  readonly maxSimSeconds: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  pFlat: 0.7,
  tokkaRadius: 80,
  turnTimeoutMs: 30_000,
  potValues: [100, 200, 300, 400, 500],
  gutiRadius: GUTI_RADIUS,
  fieldWidth: 400,
  fieldHeight: 300,
  minSpacing: 40,
  friction: 400,
  dt: 1 / 60,
  restSpeed: 2,
  maxFlickPower: 600,
  maxSimSeconds: 5,
};
