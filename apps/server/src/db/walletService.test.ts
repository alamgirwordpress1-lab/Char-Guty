import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./testDb.js";
import { upsertUser } from "./userService.js";
import {
  applyLedger,
  getBalance,
  InsufficientCoinsError,
  WalletNotFoundError,
} from "./walletService.js";
import type { Database } from "./types.js";

let db: Database;

async function newUser(): Promise<string> {
  const id = randomUUID();
  const user = await upsertUser(db, {
    provider: "guest",
    providerId: id,
    nickname: "tester",
    isGuest: true,
  });
  return user.id;
}

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

describe("applyLedger", () => {
  it("deducts coins and returns the new balance", async () => {
    const userId = await newUser();
    const balance = await applyLedger(db, {
      userId,
      currency: "coin",
      delta: -50,
      reason: "match_stake",
    });
    expect(balance).toEqual({ coins: 250, winPoints: 0 });
    expect(await getBalance(db, userId)).toEqual({ coins: 250, winPoints: 0 });
  });

  it("rejects a delta that would take coins negative, without mutating the wallet", async () => {
    const userId = await newUser();
    await expect(
      applyLedger(db, { userId, currency: "coin", delta: -301, reason: "match_stake" }),
    ).rejects.toBeInstanceOf(InsufficientCoinsError);
    expect(await getBalance(db, userId)).toEqual({ coins: 300, winPoints: 0 });
  });

  it("tracks win_points independently of coins", async () => {
    const userId = await newUser();
    await applyLedger(db, { userId, currency: "wp", delta: 100, reason: "match_win" });
    expect(await getBalance(db, userId)).toEqual({ coins: 300, winPoints: 100 });
  });

  it("applies every concurrent update on the same wallet exactly once (optimistic retry)", async () => {
    const userId = await newUser();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        applyLedger(db, { userId, currency: "coin", delta: -10, reason: "match_stake" }),
      ),
    );
    expect(await getBalance(db, userId)).toEqual({ coins: 250, winPoints: 0 });
  });

  it("throws for an unknown user", async () => {
    await expect(getBalance(db, randomUUID())).rejects.toBeInstanceOf(WalletNotFoundError);
  });
});
