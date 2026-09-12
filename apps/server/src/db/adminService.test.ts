import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { getUserDetail, isBanned, searchUsers, setUserBanned } from "./adminService.js";
import { endMatch, startMatch } from "./matchRepository.js";
import { createTestDb } from "./testDb.js";
import { upsertUser } from "./userService.js";
import { applyLedger } from "./walletService.js";
import type { Database } from "./types.js";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

async function makePlayer(nickname: string): Promise<string> {
  const user = await upsertUser(db, {
    provider: "guest",
    providerId: randomUUID(),
    nickname,
    isGuest: true,
  });
  return user.id;
}

describe("searchUsers", () => {
  it("matches part of a nickname, case-insensitively, and carries the balance", async () => {
    const id = await makePlayer("Rafiq");
    const found = await searchUsers(db, "afi");
    const hit = found.find((u) => u.id === id);
    expect(hit?.nickname).toBe("Rafiq");
    expect(hit?.coins).toBe(300);
    expect(hit?.bannedAt).toBeNull();
  });

  it("finds a player by exact id, and returns nothing for a blank query", async () => {
    const id = await makePlayer("Shimul");
    expect((await searchUsers(db, id)).map((u) => u.id)).toEqual([id]);
    expect(await searchUsers(db, "   ")).toEqual([]);
  });
});

describe("getUserDetail", () => {
  it("returns the coin history and the matches this player was in", async () => {
    const id = await makePlayer("Nadia");
    const other = await makePlayer("Opponent");
    await applyLedger(db, { userId: id, currency: "coin", delta: -100, reason: "match_stake" });
    const matchId = await startMatch(db, {
      mode: "random",
      pot: 200,
      playerCount: 2,
      players: [id, other],
      seed: randomUUID(),
    });
    await endMatch(db, { matchId, winnerId: id, turnLog: [] });

    const detail = await getUserDetail(db, id);
    expect(detail?.coins).toBe(200);
    expect(detail?.ledger.map((l) => l.reason)).toEqual(["match_stake", "signup_bonus"]);
    expect(detail?.matches).toHaveLength(1);
    expect(detail?.matches[0]?.won).toBe(true);
  });

  it("is null for an id that does not exist", async () => {
    expect(await getUserDetail(db, randomUUID())).toBeNull();
  });
});

describe("setUserBanned", () => {
  it("bans with a reason and lifts it again", async () => {
    const id = await makePlayer("Cheater");

    expect(await setUserBanned(db, id, true, " coin farming ")).toBe(true);
    const banned = await getUserDetail(db, id);
    expect(banned?.bannedAt).toBeInstanceOf(Date);
    expect(banned?.banReason).toBe("coin farming");
    expect(await isBanned(db, id)).toBe(true);

    expect(await setUserBanned(db, id, false)).toBe(true);
    const lifted = await getUserDetail(db, id);
    expect(lifted?.bannedAt).toBeNull();
    expect(lifted?.banReason).toBeNull();
    expect(await isBanned(db, id)).toBe(false);
  });

  it("reports a missing user instead of pretending to ban them", async () => {
    expect(await setUserBanned(db, randomUUID(), true)).toBe(false);
  });
});
