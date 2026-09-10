export const GUTI_COUNT = 4;
export const GUTI_RADIUS = 15;

export interface GameConfig {
  readonly pFlat: number;
  readonly tokkaRadius: number;
  readonly tokkasPerMultiFlat: number;
  readonly turnTimeoutMs: number;
  readonly potValues: readonly number[];
  readonly gutiRadius: number;
  /** Sim tuning: constant deceleration applied to a flicked guti, in px/s^2. */
  readonly friction: number;
  /** Sim tuning: fixed simulation timestep, in seconds. */
  readonly dt: number;
  /** Sim tuning: speed (px/s) below which a flicked guti is considered stopped. */
  readonly restSpeed: number;
  /** Sim tuning: safety cutoff so a flick simulation always terminates. */
  readonly maxSteps: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  pFlat: 0.7,
  tokkaRadius: 80,
  tokkasPerMultiFlat: 2,
  turnTimeoutMs: 30_000,
  potValues: [100, 200, 300, 400, 500],
  gutiRadius: GUTI_RADIUS,
  friction: 400,
  dt: 1 / 60,
  restSpeed: 2,
  maxSteps: 600,
};
