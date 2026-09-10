import { MAX_REWARDED_ADS_PER_DAY, REWARDED_AD_COINS } from "@char-guty/shared";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { claimAdReward, DailyAdRewardCapError, DuplicateAdRewardError } from "./adRewardService.js";
import { createTestDb } from "./testDb.js";
import { upsertUser } from "./userService.js";
import { getBalance } from "./walletService.js";
import type { Database } from "./types.js";

let db: Database;

async function newUser(): Promise<string> {
  const user = await upsertUser(db, {
    provider: "guest",
    providerId: randomUUID(),
    nickname: "tester",
    isGuest: true,
  });
  return user.id;
}

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

describe("claimAdReward", () => {
  it("credits the reward on a valid claim", async () => {
    const userId = await newUser();
    const balance = await claimAdReward(db, {
      userId,
      network: "admob",
      transactionId: randomUUID(),
    });
    expect(balance.coins).toBe(300 + REWARDED_AD_COINS);
    expect(await getBalance(db, userId)).toEqual(balance);
  });

  it("rejects a replayed transaction_id and does not double-credit", async () => {
    const userId = await newUser();
    const transactionId = randomUUID();
    const first = await claimAdReward(db, { userId, network: "admob", transactionId });

    await expect(
      claimAdReward(db, { userId, network: "admob", transactionId }),
    ).rejects.toBeInstanceOf(DuplicateAdRewardError);
    expect(await getBalance(db, userId)).toEqual(first);
  });

  it("allows exactly the daily cap and rejects the next one", async () => {
    const userId = await newUser();
    for (let i = 0; i < MAX_REWARDED_ADS_PER_DAY; i++) {
      await claimAdReward(db, { userId, network: "admob", transactionId: randomUUID() });
    }
    const balance = await getBalance(db, userId);
    expect(balance.coins).toBe(300 + MAX_REWARDED_ADS_PER_DAY * REWARDED_AD_COINS);

    await expect(
      claimAdReward(db, { userId, network: "admob", transactionId: randomUUID() }),
    ).rejects.toBeInstanceOf(DailyAdRewardCapError);
    // The rejected 13th claim's own ad_rewards row was rolled back with the rest of
    // its transaction, so the count-based cap check keeps rejecting on a retry too.
    expect(await getBalance(db, userId)).toEqual(balance);
  });

  it("does not let a duplicate on an unrelated user's transaction id succeed twice", async () => {
    const userA = await newUser();
    const userB = await newUser();
    const transactionId = randomUUID();
    await claimAdReward(db, { userId: userA, network: "admob", transactionId });
    await expect(
      claimAdReward(db, { userId: userB, network: "admob", transactionId }),
    ).rejects.toBeInstanceOf(DuplicateAdRewardError);
  });
});
