export const SIGNUP_BONUS_COINS = 300;
export const REWARDED_AD_COINS = 25;
export const MAX_REWARDED_ADS_PER_DAY = 12;

/** Coins must never go below 0 — check this before deducting a stake, don't clamp after. */
export function canAffordStake(balance: number, stake: number): boolean {
  return balance >= stake;
}

export function canClaimRewardedAd(adsClaimedToday: number): boolean {
  return adsClaimedToday < MAX_REWARDED_ADS_PER_DAY;
}
