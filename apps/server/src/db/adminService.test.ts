import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  getAdminStats,
  getDailyActivity,
  getUserDetail,
  isBanned,
  ledgerReasons,
  listLedger,
  listMatches,
  listPlayers,
  setUserBanned,
} from "./adminService.js";
import { endMatch, startMatch } from "./matchRepository.js";
import { createTestDb } from "./testDb.js";
import { upsertUser } from "./userService.js";
import { applyLedger } from "./walletService.js";
import type { Database } from "./types.js";

// Each block gets a database of its own, so counts and orderings are exact.

async function join(db: Database, nickname: string, isGuest = true): Promise<string> {
  const user = await upsertUser(db, {
    provider: isGuest ? "guest" : "firebase",
    providerId: randomUUID(),
    nickname,
    isGuest,
  });
  return user.id;
}

describe("listPlayers", () => {
  let db: Database;
  let rafiq: string;
  let shimul: string;
  let rich: string;

  beforeAll(async () => {
    db = await createTestDb();
    rafiq = await join(db, "Rafiq");
    shimul = await join(db, "Shimul", false);
    rich = await join(db, "Rich_Player");
    await applyLedger(db, { userId: rich, currency: "coin", delta: 500, reason: "match_win" });
    await setUserBanned(db, shimul, true, "spam");
  }, 30_000);

  it("pages through everyone, newest first, with the total", async () => {
    const first = await listPlayers(db, { pageSize: 2 });
    expect(first.total).toBe(3);
    expect(first.rows.map((r) => r.id)).toEqual([rich, shimul]);
    const second = await listPlayers(db, { pageSize: 2, page: 2 });
    expect(second.rows.map((r) => r.id)).toEqual([rafiq]);
    expect(second.page).toBe(2);
  });

  it("searches part of a nickname, or an exact id", async () => {
    expect((await listPlayers(db, { q: "afi" })).rows.map((r) => r.id)).toEqual([rafiq]);
    expect((await listPlayers(db, { q: shimul })).rows.map((r) => r.id)).toEqual([shimul]);
  });

  it("treats % and _ in a search as plain text", async () => {
    expect((await listPlayers(db, { q: "%" })).total).toBe(0);
    expect((await listPlayers(db, { q: "_" })).rows.map((r) => r.id)).toEqual([rich]);
  });

  it("filters by ban status and account type", async () => {
    expect((await listPlayers(db, { status: "banned" })).rows.map((r) => r.id)).toEqual([shimul]);
    expect((await listPlayers(db, { status: "active" })).total).toBe(2);
    expect((await listPlayers(db, { type: "registered" })).rows.map((r) => r.id)).toEqual([shimul]);
    expect((await listPlayers(db, { type: "guest" })).total).toBe(2);
  });

  it("sorts by coins", async () => {
    expect((await listPlayers(db, { sort: "coins" })).rows[0]?.id).toBe(rich);
  });
});

describe("getUserDetail and bans", () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);

  it("returns the coin history and the matches this player was in", async () => {
    const id = await join(db, "Nadia");
    const other = await join(db, "Opponent");
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

  it("is null for an id that does not exist or is not an id at all", async () => {
    expect(await getUserDetail(db, randomUUID())).toBeNull();
    expect(await getUserDetail(db, "not-a-uuid")).toBeNull();
  });

  it("bans with a trimmed reason and lifts it again", async () => {
    const id = await join(db, "Cheater");

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
    expect(await setUserBanned(db, "not-a-uuid", true)).toBe(false);
  });
});

describe("listMatches", () => {
  let db: Database;
  let nadia: string;
  let babul: string;
  let finished: string;
  let practice: string;

  beforeAll(async () => {
    db = await createTestDb();
    nadia = await join(db, "Nadia");
    babul = await join(db, "Babul");
    finished = await startMatch(db, {
      mode: "random",
      pot: 200,
      playerCount: 2,
      players: [nadia, babul],
      seed: randomUUID(),
    });
    await endMatch(db, { matchId: finished, winnerId: nadia, turnLog: [] });
    practice = await startMatch(db, {
      mode: "computer",
      pot: 100,
      playerCount: 2,
      players: [babul, "computer-1"],
      seed: randomUUID(),
    });
  }, 30_000);

  it("names the players, shows computer seats as the computer, and names the winner", async () => {
    const page = await listMatches(db);
    expect(page.total).toBe(2);
    expect(page.rows.find((m) => m.id === practice)?.players).toEqual([
      { id: babul, nickname: "Babul" },
      { id: "computer-1", nickname: "Computer" },
    ]);
    expect(page.rows.find((m) => m.id === finished)?.winner).toEqual({
      id: nadia,
      nickname: "Nadia",
    });
  });

  it("finds matches by a player's nickname, without choking on computer seats", async () => {
    expect((await listMatches(db, { q: "nad" })).rows.map((m) => m.id)).toEqual([finished]);
    expect((await listMatches(db, { q: "babul" })).total).toBe(2);
  });

  it("filters by status and mode", async () => {
    expect((await listMatches(db, { status: "unfinished" })).rows.map((m) => m.id)).toEqual([
      practice,
    ]);
    expect((await listMatches(db, { status: "finished" })).rows.map((m) => m.id)).toEqual([
      finished,
    ]);
    expect((await listMatches(db, { mode: "computer" })).rows.map((m) => m.id)).toEqual([practice]);
  });
});

describe("listLedger", () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDb();
    const rina = await join(db, "Rina");
    await join(db, "Other");
    await applyLedger(db, { userId: rina, currency: "wp", delta: 200, reason: "match_win" });
  }, 30_000);

  it("lists every entry with the player's name, newest first", async () => {
    const page = await listLedger(db);
    expect(page.total).toBe(3);
    expect(page.rows[0]).toMatchObject({
      nickname: "Rina",
      currency: "wp",
      delta: 200,
      reason: "match_win",
    });
  });

  it("filters by player, currency and reason", async () => {
    expect((await listLedger(db, { q: "rin" })).total).toBe(2);
    expect((await listLedger(db, { currency: "wp" })).total).toBe(1);
    expect((await listLedger(db, { reason: "signup_bonus" })).total).toBe(2);
  });

  it("offers the reasons that actually occur, for the filter", async () => {
    expect(await ledgerReasons(db)).toEqual(["match_win", "signup_bonus"]);
  });
});

describe("dashboard", () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);

  it("counts players, matches, bans and the coins in play", async () => {
    const a = await join(db, "Ayesha");
    const b = await join(db, "Babul");
    await setUserBanned(db, b, true, "spam");
    const matchId = await startMatch(db, {
      mode: "random",
      pot: 200,
      playerCount: 2,
      players: [a, b],
      seed: randomUUID(),
    });
    await endMatch(db, { matchId, winnerId: a, turnLog: [] });

    const stats = await getAdminStats(db);
    expect(stats.players).toEqual({ total: 2, last24h: 2, last7d: 2, guests: 2, banned: 1 });
    expect(stats.matches).toEqual({ total: 1, last24h: 1, finished: 1 });
    expect(stats.coinsInCirculation).toBe(600);

    // Seen from two days later, those sign-ups have left the 24-hour window but not the week.
    const later = await getAdminStats(db, new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    expect(later.players.last24h).toBe(0);
    expect(later.players.last7d).toBe(2);
  });

  it("buckets sign-ups and matches by Dhaka calendar day, oldest first, empty days included", async () => {
    const activityDb = await createTestDb();
    const id = await join(activityDb, "Today");
    await startMatch(activityDb, {
      mode: "random",
      pot: 100,
      playerCount: 2,
      players: [id, randomUUID()],
      seed: randomUUID(),
    });

    const days = await getDailyActivity(activityDb, 3);
    const todayInDhaka = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(days).toHaveLength(3);
    expect(days[2]).toEqual({ day: todayInDhaka, signups: 1, matches: 1 });
    expect(days[0]).toMatchObject({ signups: 0, matches: 0 });
    expect(days.map((d) => d.day)).toEqual([...days.map((d) => d.day)].sort());
  }, 30_000);
});
