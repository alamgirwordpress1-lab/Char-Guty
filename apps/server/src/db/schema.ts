import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const currencyEnum = pgEnum("currency", ["coin", "wp"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(), // 'firebase' | 'guest'
    providerId: text("provider_id").notNull(),
    nickname: text("nickname").notNull(),
    isGuest: boolean("is_guest").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when an admin bans the account: it blocks sign-in and room joins, and is
    // nullable rather than a boolean so the moment of the ban is part of the record.
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    banReason: text("ban_reason"),
  },
  (t) => [uniqueIndex("users_provider_provider_id_key").on(t.provider, t.providerId)],
);

export const wallets = pgTable(
  "wallets",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    coins: integer("coins").notNull().default(0),
    winPoints: integer("win_points").notNull().default(0),
    version: integer("version").notNull().default(0),
  },
  (t) => [check("wallets_coins_non_negative", sql`${t.coins} >= 0`)],
);

export const ledger = pgTable("ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  currency: currencyEnum("currency").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  refType: text("ref_type"),
  refId: text("ref_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  mode: text("mode").notNull(), // 'friend' | 'random' | 'computer'
  pot: integer("pot").notNull(),
  playerCount: integer("player_count").notNull(),
  players: jsonb("players").notNull().$type<string[]>(),
  winnerId: uuid("winner_id"),
  /** Opaque per-match reference token (not a PRNG seed - the server RNG is crypto-random, not replayable). */
  seed: text("seed"),
  turnLog: jsonb("turn_log").$type<unknown>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const adRewards = pgTable("ad_rewards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  network: text("network").notNull(),
  transactionId: text("transaction_id").notNull().unique(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
});
