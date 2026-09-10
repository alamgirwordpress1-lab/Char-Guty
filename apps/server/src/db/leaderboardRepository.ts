import { and, desc, eq, gte, sql } from "drizzle-orm";
import { ledger, users, wallets } from "./schema.js";
import type { Database } from "./types.js";

export type LeaderboardPeriod = "week" | "all";

export interface LeaderboardEntry {
  readonly userId: string;
  readonly nickname: string;
  readonly winPoints: number;
}

const LIMIT = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Top 50 by win_points. "week" is a rolling 7 days (summed from the ledger), not a calendar week. */
export async function getLeaderboard(
  db: Database,
  period: LeaderboardPeriod,
): Promise<LeaderboardEntry[]> {
  if (period === "all") {
    return db
      .select({ userId: users.id, nickname: users.nickname, winPoints: wallets.winPoints })
      .from(wallets)
      .innerJoin(users, eq(users.id, wallets.userId))
      .orderBy(desc(wallets.winPoints))
      .limit(LIMIT);
  }

  const since = new Date(Date.now() - WEEK_MS);
  const winPoints = sql<number>`sum(${ledger.delta})`.mapWith(Number);
  return db
    .select({ userId: ledger.userId, nickname: users.nickname, winPoints })
    .from(ledger)
    .innerJoin(users, eq(users.id, ledger.userId))
    .where(and(eq(ledger.currency, "wp"), gte(ledger.createdAt, since)))
    .groupBy(ledger.userId, users.nickname)
    .orderBy(desc(winPoints))
    .limit(LIMIT);
}
