import { canClaimRewardedAd, REWARDED_AD_COINS } from "@char-guty/shared";
import { and, count, eq, gte } from "drizzle-orm";
import { adRewards } from "./schema.js";
import type { Database } from "./types.js";
import { applyLedger, type WalletBalance } from "./walletService.js";

export class DuplicateAdRewardError extends Error {}
export class DailyAdRewardCapError extends Error {}

const UNIQUE_VIOLATION = "23505";
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** drizzle-orm wraps driver errors in DrizzleQueryError, with the original on `.cause`. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === UNIQUE_VIOLATION) return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export interface ClaimAdRewardInput {
  readonly userId: string;
  readonly network: string;
  readonly transactionId: string;
}

/**
 * Claims one rewarded-ad payout. The ad_rewards row is inserted first and doubles as
 * the dedup gate (the table's unique constraint on transaction_id is the actual source
 * of truth - a duplicate insert fails atomically rather than racing a separate SELECT).
 * If that succeeds, the rolling 24h count (including the row just inserted) enforces
 * the daily cap, then the ledger is credited - all in one transaction, so a duplicate
 * or over-cap claim leaves no trace and a retry is evaluated fresh.
 */
export async function claimAdReward(
  db: Database,
  input: ClaimAdRewardInput,
): Promise<WalletBalance> {
  return db.transaction(async (tx) => {
    try {
      await tx.insert(adRewards).values({
        userId: input.userId,
        network: input.network,
        transactionId: input.transactionId,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DuplicateAdRewardError(`transaction ${input.transactionId} already claimed`);
      }
      throw err;
    }

    const since = new Date(Date.now() - WINDOW_MS);
    const [row] = await tx
      .select({ n: count() })
      .from(adRewards)
      .where(and(eq(adRewards.userId, input.userId), gte(adRewards.verifiedAt, since)));
    const claimsInWindow = row?.n ?? 0;
    if (!canClaimRewardedAd(claimsInWindow - 1)) {
      throw new DailyAdRewardCapError(`daily rewarded-ad cap reached for user ${input.userId}`);
    }

    return applyLedger(tx, {
      userId: input.userId,
      currency: "coin",
      delta: REWARDED_AD_COINS,
      reason: "rewarded_ad",
      refType: "ad_reward",
      refId: input.transactionId,
    });
  });
}
