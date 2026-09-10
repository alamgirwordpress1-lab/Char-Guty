import { canAffordStake } from "@char-guty/shared";
import { and, eq } from "drizzle-orm";
import { ledger, wallets } from "./schema.js";
import type { Database } from "./types.js";

export class InsufficientCoinsError extends Error {}
export class WalletNotFoundError extends Error {}
export class WalletConflictError extends Error {}

export interface ApplyLedgerInput {
  readonly userId: string;
  readonly currency: "coin" | "wp";
  readonly delta: number;
  readonly reason: string;
  readonly refType?: string;
  readonly refId?: string;
}

export interface WalletBalance {
  readonly coins: number;
  readonly winPoints: number;
}

const MAX_ATTEMPTS = 5;

/**
 * Applies one ledger entry to a wallet inside a transaction, with an optimistic
 * version check (retried on conflict) and a hard floor of 0 coins (rejected, never
 * clamped - see packages/shared/economy.ts). win_points has no floor.
 */
export async function applyLedger(db: Database, input: ApplyLedgerInput): Promise<WalletBalance> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await db.transaction(async (tx) => {
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, input.userId));
      if (wallet === undefined) {
        throw new WalletNotFoundError(`no wallet for user ${input.userId}`);
      }

      const nextCoins = input.currency === "coin" ? wallet.coins + input.delta : wallet.coins;
      const nextWinPoints =
        input.currency === "wp" ? wallet.winPoints + input.delta : wallet.winPoints;
      if (nextCoins < 0) {
        throw new InsufficientCoinsError(`coins would go negative for user ${input.userId}`);
      }

      const updated = await tx
        .update(wallets)
        .set({ coins: nextCoins, winPoints: nextWinPoints, version: wallet.version + 1 })
        .where(and(eq(wallets.userId, input.userId), eq(wallets.version, wallet.version)))
        .returning();
      const row = updated[0];
      if (row === undefined) return null; // lost the optimistic race - caller retries

      await tx.insert(ledger).values({
        userId: input.userId,
        currency: input.currency,
        delta: input.delta,
        reason: input.reason,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      });

      return { coins: row.coins, winPoints: row.winPoints };
    });

    if (result !== null) return result;
  }
  throw new WalletConflictError(
    `could not update wallet for user ${input.userId} after ${MAX_ATTEMPTS} attempts`,
  );
}

export async function getBalance(db: Database, userId: string): Promise<WalletBalance> {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (wallet === undefined) throw new WalletNotFoundError(`no wallet for user ${userId}`);
  return { coins: wallet.coins, winPoints: wallet.winPoints };
}

export async function canAffordAll(
  db: Database,
  userIds: readonly string[],
  stake: number,
): Promise<boolean> {
  const balances = await Promise.all(userIds.map((id) => getBalance(db, id)));
  return balances.every((b) => canAffordStake(b.coins, stake));
}
