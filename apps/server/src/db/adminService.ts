import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
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

/** One page of a list plus the size of the whole filtered set, for "showing 26-50 of 132". */
export interface Page<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface PageRequest {
  readonly page?: number;
  readonly pageSize?: number;
}

export interface PlayerFilters extends PageRequest {
  readonly q?: string;
  readonly status?: "all" | "active" | "banned";
  readonly type?: "all" | "guest" | "registered";
  readonly sort?: "newest" | "oldest" | "coins" | "winPoints";
}

export interface MatchPlayer {
  readonly id: string;
  readonly nickname: string;
}

export interface AdminMatchRow {
  readonly id: string;
  readonly mode: string;
  readonly pot: number;
  readonly playerCount: number;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly players: readonly MatchPlayer[];
  readonly winner: MatchPlayer | null;
}

export interface MatchFilters extends PageRequest {
  readonly q?: string;
  readonly mode?: "all" | "friend" | "random" | "computer";
  readonly status?: "all" | "finished" | "unfinished";
}

export interface AdminLedgerRow {
  readonly id: string;
  readonly userId: string;
  readonly nickname: string;
  readonly currency: "coin" | "wp";
  readonly delta: number;
  readonly reason: string;
  readonly createdAt: Date;
}

export interface LedgerFilters extends PageRequest {
  readonly q?: string;
  readonly currency?: "all" | "coin" | "wp";
  readonly reason?: string;
}

export interface AdminStats {
  readonly players: {
    readonly total: number;
    readonly last24h: number;
    readonly last7d: number;
    readonly guests: number;
    readonly banned: number;
  };
  readonly matches: {
    readonly total: number;
    readonly last24h: number;
    readonly finished: number;
  };
  readonly coinsInCirculation: number;
}

export interface DailyActivity {
  /** YYYY-MM-DD in Dhaka time. */
  readonly day: string;
  readonly signups: number;
  readonly matches: number;
}

const LEDGER_LIMIT = 50;
const MATCH_LIMIT = 20;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
// Bangladesh has no daylight saving, so a fixed offset is exact.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
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

function paging(request: PageRequest): { page: number; pageSize: number; offset: number } {
  const pageSize = Math.min(
    Math.max(Math.trunc(request.pageSize ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(Math.trunc(request.page ?? 1), 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** A search box is literal text: % and _ must not turn into LIKE wildcards. */
function contains(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function countWhere(filter?: SQL) {
  return filter === undefined
    ? sql<number>`count(*)`.mapWith(Number)
    : sql<number>`count(*) filter (where ${filter})`.mapWith(Number);
}

/** A nickname match, widened to an exact id match when the text is shaped like one. */
function playerMatch(q: string): SQL {
  const byNickname = ilike(users.nickname, contains(q));
  return UUID.test(q) ? (or(eq(users.id, q), byNickname) ?? byNickname) : byNickname;
}

/**
 * The players list: search by nickname or id, filter by ban status and account type,
 * sort, page. Nicknames are not unique, so rows always carry the id the detail view needs.
 */
export async function listPlayers(
  db: Database,
  filters: PlayerFilters = {},
): Promise<Page<AdminUserSummary>> {
  const { page, pageSize, offset } = paging(filters);
  const conditions: SQL[] = [];
  const q = filters.q?.trim();
  if (q) conditions.push(playerMatch(q));
  if (filters.status === "active") conditions.push(isNull(users.bannedAt));
  if (filters.status === "banned") conditions.push(isNotNull(users.bannedAt));
  if (filters.type === "guest") conditions.push(eq(users.isGuest, true));
  if (filters.type === "registered") conditions.push(eq(users.isGuest, false));
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const order = {
    newest: desc(users.createdAt),
    oldest: asc(users.createdAt),
    coins: desc(wallets.coins),
    winPoints: desc(wallets.winPoints),
  }[filters.sort ?? "newest"];

  const rows = await db
    .select(summaryColumns)
    .from(users)
    .innerJoin(wallets, eq(wallets.userId, users.id))
    .where(where)
    .orderBy(order, desc(users.createdAt))
    .limit(pageSize)
    .offset(offset);
  const [counted] = await db
    .select({ total: countWhere() })
    .from(users)
    .innerJoin(wallets, eq(wallets.userId, users.id))
    .where(where);
  return { rows, total: counted?.total ?? 0, page, pageSize };
}

/** One player with everything an admin needs to judge a complaint: balance, coin history, recent games. */
export async function getUserDetail(db: Database, userId: string): Promise<AdminUserDetail | null> {
  if (!UUID.test(userId)) return null;
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
      won: sql<boolean>`coalesce(${matches.winnerId} = ${userId}, false)`.mapWith(Boolean),
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

/**
 * The matches list, with names instead of bare ids. Computer seats share the players
 * array under ids that are not accounts, so the player search compares ids as text
 * (a uuid cast would throw on them) and any seat left unnamed is shown as the computer.
 */
export async function listMatches(
  db: Database,
  filters: MatchFilters = {},
): Promise<Page<AdminMatchRow>> {
  const { page, pageSize, offset } = paging(filters);
  const conditions: SQL[] = [];
  const q = filters.q?.trim();
  if (q) {
    conditions.push(
      sql`exists (select 1 from jsonb_array_elements_text(${matches.players}) as seat(id) join ${users} on ${users.id}::text = seat.id where ${playerMatch(q)})`,
    );
  }
  if (filters.mode !== undefined && filters.mode !== "all")
    conditions.push(eq(matches.mode, filters.mode));
  if (filters.status === "finished") conditions.push(isNotNull(matches.endedAt));
  if (filters.status === "unfinished") conditions.push(isNull(matches.endedAt));
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const rows = await db
    .select({
      id: matches.id,
      mode: matches.mode,
      pot: matches.pot,
      playerCount: matches.playerCount,
      players: matches.players,
      winnerId: matches.winnerId,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
    })
    .from(matches)
    .where(where)
    .orderBy(desc(matches.startedAt))
    .limit(pageSize)
    .offset(offset);
  const [counted] = await db.select({ total: countWhere() }).from(matches).where(where);

  const ids = [
    ...new Set(rows.flatMap((r) => (r.winnerId === null ? r.players : [...r.players, r.winnerId]))),
  ].filter((id) => UUID.test(id));
  const named =
    ids.length === 0
      ? []
      : await db
          .select({ id: users.id, nickname: users.nickname })
          .from(users)
          .where(inArray(users.id, ids));
  const nicknames = new Map(named.map((u) => [u.id, u.nickname]));
  const person = (id: string): MatchPlayer => ({ id, nickname: nicknames.get(id) ?? "Computer" });

  return {
    rows: rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      pot: r.pot,
      playerCount: r.playerCount,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      players: r.players.map(person),
      winner: r.winnerId === null ? null : person(r.winnerId),
    })),
    total: counted?.total ?? 0,
    page,
    pageSize,
  };
}

/** Every coin and win-point movement, newest first, filterable by player, currency and reason. */
export async function listLedger(
  db: Database,
  filters: LedgerFilters = {},
): Promise<Page<AdminLedgerRow>> {
  const { page, pageSize, offset } = paging(filters);
  const conditions: SQL[] = [];
  const q = filters.q?.trim();
  if (q) conditions.push(playerMatch(q));
  if (filters.currency === "coin" || filters.currency === "wp")
    conditions.push(eq(ledger.currency, filters.currency));
  if (filters.reason !== undefined && filters.reason !== "" && filters.reason !== "all") {
    conditions.push(eq(ledger.reason, filters.reason));
  }
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const rows = await db
    .select({
      id: ledger.id,
      userId: ledger.userId,
      nickname: users.nickname,
      currency: ledger.currency,
      delta: ledger.delta,
      reason: ledger.reason,
      createdAt: ledger.createdAt,
    })
    .from(ledger)
    .innerJoin(users, eq(users.id, ledger.userId))
    .where(where)
    .orderBy(desc(ledger.createdAt))
    .limit(pageSize)
    .offset(offset);
  const [counted] = await db
    .select({ total: countWhere() })
    .from(ledger)
    .innerJoin(users, eq(users.id, ledger.userId))
    .where(where);
  return { rows, total: counted?.total ?? 0, page, pageSize };
}

/** The reasons that actually occur in the ledger, for the transactions filter. */
export async function ledgerReasons(db: Database): Promise<string[]> {
  const rows = await db
    .selectDistinct({ reason: ledger.reason })
    .from(ledger)
    .orderBy(ledger.reason);
  return rows.map((r) => r.reason);
}

/** Bans or unbans a player; returns false when there is no such user. */
export async function setUserBanned(
  db: Database,
  userId: string,
  banned: boolean,
  reason?: string,
): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const trimmed = reason?.trim();
  const updated = await db
    .update(users)
    .set(
      banned
        ? { bannedAt: new Date(), banReason: trimmed ? trimmed : null }
        : { bannedAt: null, banReason: null },
    )
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return updated.length > 0;
}

/** Whether this account is banned. */
export async function isBanned(db: Database, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const [row] = await db
    .select({ bannedAt: users.bannedAt })
    .from(users)
    .where(eq(users.id, userId));
  return row?.bannedAt != null;
}

/**
 * The dashboard's headline numbers. "Last 24 hours" rather than "today" on purpose: the
 * server runs in UTC and the owner in Dhaka, so a calendar day would split at 6am.
 */
export async function getAdminStats(db: Database, now = new Date()): Promise<AdminStats> {
  const day = new Date(now.getTime() - DAY_MS);
  const week = new Date(now.getTime() - 7 * DAY_MS);

  const [p] = await db
    .select({
      total: countWhere(),
      last24h: countWhere(gte(users.createdAt, day)),
      last7d: countWhere(gte(users.createdAt, week)),
      guests: countWhere(eq(users.isGuest, true)),
      banned: countWhere(isNotNull(users.bannedAt)),
    })
    .from(users);
  const [m] = await db
    .select({
      total: countWhere(),
      last24h: countWhere(gte(matches.startedAt, day)),
      finished: countWhere(isNotNull(matches.endedAt)),
    })
    .from(matches);
  const [w] = await db
    .select({ coins: sql<number>`coalesce(sum(${wallets.coins}), 0)`.mapWith(Number) })
    .from(wallets);

  return {
    players: {
      total: p?.total ?? 0,
      last24h: p?.last24h ?? 0,
      last7d: p?.last7d ?? 0,
      guests: p?.guests ?? 0,
      banned: p?.banned ?? 0,
    },
    matches: { total: m?.total ?? 0, last24h: m?.last24h ?? 0, finished: m?.finished ?? 0 },
    coinsInCirculation: w?.coins ?? 0,
  };
}

function dhakaDay(instant: Date): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Sign-ups and matches per day for the dashboard chart, oldest day first, with empty
 * days filled in. Days are Dhaka calendar days, since that is the owner's day.
 */
export async function getDailyActivity(
  db: Database,
  days = 14,
  now = new Date(),
): Promise<DailyActivity[]> {
  const shifted = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const todayStart =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
    DHAKA_OFFSET_MS;
  const since = new Date(todayStart - (days - 1) * DAY_MS);

  const dayOf = (column: typeof users.createdAt | typeof matches.startedAt) =>
    sql<string>`to_char((${column} at time zone 'UTC') + interval '6 hours', 'YYYY-MM-DD')`;

  const signupDay = dayOf(users.createdAt);
  const signups = await db
    .select({ day: signupDay, n: countWhere() })
    .from(users)
    .where(gte(users.createdAt, since))
    .groupBy(signupDay);
  const matchDay = dayOf(matches.startedAt);
  const played = await db
    .select({ day: matchDay, n: countWhere() })
    .from(matches)
    .where(gte(matches.startedAt, since))
    .groupBy(matchDay);

  const signupsByDay = new Map(signups.map((r) => [r.day, r.n]));
  const matchesByDay = new Map(played.map((r) => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const day = dhakaDay(new Date(since.getTime() + i * DAY_MS));
    return { day, signups: signupsByDay.get(day) ?? 0, matches: matchesByDay.get(day) ?? 0 };
  });
}
