import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { ledger, matches, users, wallets } from "./schema.js";
import type { Database } from "./types.js";

export interface AdminUserSummary {
  readonly id: string;
  readonly nickname: string;
  readonly isGuest: boolean;
  readonly createdAt: Date;
  readonly bannedAt: Date | null;
  readonly banReason: string | null;
  readonly coins: number;
  readonly winPoints: number;
}

export interface AdminLedgerEntry {
  readonly currency: "coin" | "wp";
  readonly delta: number;
  readonly reason: string;
  readonly createdAt: Date;
}

export interface AdminMatch {
  readonly id: string;
  readonly mode: string;
  readonly pot: number;
  readonly playerCount: number;
  readonly won: boolean;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  readonly ledger: readonly AdminLedgerEntry[];
  readonly matches: readonly AdminMatch[];
}

const SEARCH_LIMIT = 25;
const LEDGER_LIMIT = 50;
const MATCH_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summaryColumns = {
  id: users.id,
  nickname: users.nickname,
  isGuest: users.isGuest,
  createdAt: users.createdAt,
  bannedAt: users.bannedAt,
  banReason: users.banReason,
  coins: wallets.coins,
  winPoints: wallets.winPoints,
};

/**
 * Finds players by nickname (partial, case-insensitive) or by exact id. Nicknames are
 * not unique - two players can pick the same one - so this always returns a list and
 * the caller picks from it by id.
 */
export async function searchUsers(db: Database, query: string): Promise<AdminUserSummary[]> {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const byNickname = ilike(users.nickname, `%${trimmed}%`);
  const where = UUID.test(trimmed) ? or(eq(users.id, trimmed), byNickname) : byNickname;
  return db
    .select(summaryColumns)
    .from(users)
    .innerJoin(wallets, eq(wallets.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(SEARCH_LIMIT);
}

/** One player with everything an admin needs to judge a complaint: balance, coin history, recent games. */
export async function getUserDetail(db: Database, userId: string): Promise<AdminUserDetail | null> {
  const [summary] = await db
    .select(summaryColumns)
    .from(users)
    .innerJoin(wallets, eq(wallets.userId, users.id))
    .where(eq(users.id, userId));
  if (summary === undefined) return null;

  const entries = await db
    .select({
      currency: ledger.currency,
      delta: ledger.delta,
      reason: ledger.reason,
      createdAt: ledger.createdAt,
    })
    .from(ledger)
    .where(eq(ledger.userId, userId))
    .orderBy(desc(ledger.createdAt))
    .limit(LEDGER_LIMIT);

  const played = await db
    .select({
      id: matches.id,
      mode: matches.mode,
      pot: matches.pot,
      playerCount: matches.playerCount,
      won: sql<boolean>`${matches.winnerId} = ${userId}`.mapWith(Boolean),
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
    })
    .from(matches)
    // players is a jsonb array of user ids, so containment is the index-friendly test.
    .where(sql`${matches.players} @> ${JSON.stringify([userId])}::jsonb`)
    .orderBy(desc(matches.startedAt))
    .limit(MATCH_LIMIT);

  return { ...summary, ledger: entries, matches: played };
}

/** Bans or unbans a player; returns false when there is no such user. */
export async function setUserBanned(
  db: Database,
  userId: string,
  banned: boolean,
  reason?: string,
): Promise<boolean> {
  const updated = await db
    .update(users)
    .set(
      banned
        ? { bannedAt: new Date(), banReason: reason?.trim() ?? null }
        : { bannedAt: null, banReason: null },
    )
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return updated.length > 0;
}

/** Whether this account is banned - checked on sign-in and on every room join. */
export async function isBanned(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ bannedAt: users.bannedAt })
    .from(users)
    .where(and(eq(users.id, userId)));
  return row?.bannedAt != null;
}
