import type { Settlement } from "@char-guty/game-core";
import { canAffordStake, SIGNUP_BONUS_COINS } from "@char-guty/shared";

/** In-memory guest wallet: playerId -> coin balance. Replace with Postgres later. */
const balances = new Map<string, number>();

export function ensureAccount(playerId: string): void {
  if (!balances.has(playerId)) balances.set(playerId, SIGNUP_BONUS_COINS);
}

export function getBalance(playerId: string): number {
  return balances.get(playerId) ?? 0;
}

export function canAffordAll(playerIds: readonly string[], stake: number): boolean {
  return playerIds.every((id) => canAffordStake(getBalance(id), stake));
}

/** Applies a game-core Settlement's net deltas (stake deducted, winner's pot credited). */
export function applySettlement(settlement: Settlement): void {
  for (const [playerId, delta] of Object.entries(settlement.deltas)) {
    balances.set(playerId, getBalance(playerId) + delta);
  }
}
