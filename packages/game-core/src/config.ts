export const GUTI_COUNT = 4;

export interface GameConfig {
  readonly pFlat: number;
  readonly tokkaRadius: number;
  readonly tokkasPerMultiFlat: number;
  readonly turnTimeoutMs: number;
  readonly potValues: readonly number[];
}

export const DEFAULT_CONFIG: GameConfig = {
  pFlat: 0.7,
  tokkaRadius: 80,
  tokkasPerMultiFlat: 2,
  turnTimeoutMs: 30_000,
  potValues: [100, 200, 300, 400, 500],
};
