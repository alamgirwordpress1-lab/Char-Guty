export type Side = "F" | "R";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Guti {
  readonly id: number;
  readonly side: Side;
  readonly x: number;
  readonly y: number;
}

export type ThrowOutcome = "four" | "tokka" | "instantWin";

export interface ThrowResult {
  readonly gutis: readonly Guti[];
  readonly flatCount: number;
  readonly outcome: ThrowOutcome;
  readonly points: number;
  readonly requiredTokkas: number;
}
