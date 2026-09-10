import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./testDb.js";
import { upsertUser } from "./userService.js";
import { getBalance } from "./walletService.js";
import type { Database } from "./types.js";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

describe("upsertUser", () => {
  it("creates a wallet and grants the signup bonus exactly once", async () => {
    const providerId = randomUUID();
    const first = await upsertUser(db, {
      provider: "guest",
      providerId,
      nickname: "alice",
      isGuest: true,
    });
    expect(await getBalance(db, first.id)).toEqual({ coins: 300, winPoints: 0 });

    const second = await upsertUser(db, {
      provider: "guest",
      providerId,
      nickname: "alice-returning",
      isGuest: true,
    });
    expect(second.id).toBe(first.id);
    // No second bonus, and the original nickname/row is what's returned (no upsert-on-conflict update).
    expect(second.nickname).toBe("alice");
    expect(await getBalance(db, first.id)).toEqual({ coins: 300, winPoints: 0 });
  });

  it("gives different providerIds distinct users", async () => {
    const a = await upsertUser(db, {
      provider: "guest",
      providerId: randomUUID(),
      nickname: "a",
      isGuest: true,
    });
    const b = await upsertUser(db, {
      provider: "guest",
      providerId: randomUUID(),
      nickname: "b",
      isGuest: true,
    });
    expect(a.id).not.toBe(b.id);
  });
});
