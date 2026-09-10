export interface TokkaAttempt {
  readonly success: boolean;
}

export interface TurnResult {
  readonly points: number;
  readonly died: boolean;
  readonly tokkasCompleted: number;
}

/** First failed tokka ends the turn; points from tokkas completed before it are kept. */
export function resolveTurnTokkas(attempts: readonly TokkaAttempt[]): TurnResult {
  let points = 0;
  let tokkasCompleted = 0;
  let died = false;

  for (const attempt of attempts) {
    if (!attempt.success) {
      died = true;
      break;
    }
    points += 1;
    tokkasCompleted += 1;
  }

  return { points, died, tokkasCompleted };
}
