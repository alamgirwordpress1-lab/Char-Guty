import { SIGNUP_BONUS_COINS } from "@char-guty/shared";
import { and, eq } from "drizzle-orm";
import { applyLedger } from "./walletService.js";
import { users, wallets } from "./schema.js";
import type { Database } from "./types.js";

export interface UpsertUserInput {
  readonly provider: string;
  readonly providerId: string;
  readonly nickname: string;
  readonly isGuest: boolean;
}

export interface User {
  readonly id: string;
  readonly provider: string;
  readonly providerId: string;
  readonly nickname: string;
  readonly isGuest: boolean;
  readonly bannedAt: Date | null;
}

/** Upserts by (provider, providerId); grants the one-time signup bonus only on first creation. */
export async function upsertUser(db: Database, input: UpsertUserInput): Promise<User> {
  const inserted = await db
    .insert(users)
    .values(input)
    .onConflictDoNothing({ target: [users.provider, users.providerId] })
    .returning();

  const created = inserted[0];
  if (created !== undefined) {
    await db.insert(wallets).values({ userId: created.id, coins: 0, winPoints: 0, version: 0 });
    await applyLedger(db, {
      userId: created.id,
      currency: "coin",
      delta: SIGNUP_BONUS_COINS,
      reason: "signup_bonus",
    });
    return created;
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, input.provider), eq(users.providerId, input.providerId)));
  if (existing === undefined) {
    throw new Error(
      `user upsert race: ${input.provider}/${input.providerId} not found after conflict`,
    );
  }
  return existing;
}

export interface CrazyGamesSignIn {
  readonly crazyGamesUserId: string;
  readonly username: string;
  /** The guest this device was playing as, whose progress moves to the account. */
  readonly guestId?: string | undefined;
}

/**
 * Signs a CrazyGames player in. A returning player gets their account back, renamed if
 * they changed their CrazyGames username. The first time, the guest this device was
 * playing as becomes the account, so its coins and history carry over; with no such
 * guest a new account is made, signup bonus and all.
 */
export async function signInCrazyGamesUser(db: Database, input: CrazyGamesSignIn): Promise<User> {
  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, "crazygames"), eq(users.providerId, input.crazyGamesUserId)));
  if (existing !== undefined) {
    if (existing.nickname === input.username) return existing;
    const [renamed] = await db
      .update(users)
      .set({ nickname: input.username })
      .where(eq(users.id, existing.id))
      .returning();
    return renamed ?? existing;
  }
  if (input.guestId !== undefined) {
    const [linked] = await db
      .update(users)
      .set({
        provider: "crazygames",
        providerId: input.crazyGamesUserId,
        nickname: input.username,
        isGuest: false,
      })
      .where(and(eq(users.provider, "guest"), eq(users.providerId, input.guestId)))
      .returning();
    if (linked !== undefined) return linked;
  }
  return upsertUser(db, {
    provider: "crazygames",
    providerId: input.crazyGamesUserId,
    nickname: input.username,
    isGuest: false,
  });
}
