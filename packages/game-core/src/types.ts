export type GutiFace = "F" | "R";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface ThrowResult {
  readonly faces: readonly GutiFace[];
  readonly flatCount: number;
}

export interface ScoreOutcome {
  readonly points: number;
  readonly tokkasAllowed: number;
  readonly instantMatchWin: boolean;
}
