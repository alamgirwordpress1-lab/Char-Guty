export interface MatchSetup {
  readonly pot: number;
  readonly playerCount: number;
}

export interface MatchStake {
  readonly stake: number;
}

export class InvalidMatchConfigError extends Error {}

export function computeStake(
  { pot, playerCount }: MatchSetup,
  validPots: readonly number[],
): MatchStake {
  if (!validPots.includes(pot)) {
    throw new InvalidMatchConfigError(`pot ${pot} is not one of ${validPots.join(", ")}`);
  }
  if (playerCount < 2 || playerCount > 4) {
    throw new InvalidMatchConfigError(`playerCount ${playerCount} must be between 2 and 4`);
  }
  if (pot % playerCount !== 0) {
    throw new InvalidMatchConfigError(
      `pot ${pot} does not divide evenly by ${playerCount} players`,
    );
  }
  return { stake: pot / playerCount };
}

export function hasReachedPot(currentPoints: number, pot: number): boolean {
  return currentPoints >= pot;
}
