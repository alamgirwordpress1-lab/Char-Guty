import { describe, expect, it } from "vitest";
import { canAffordStake, canClaimRewardedAd, MAX_REWARDED_ADS_PER_DAY } from "./economy.js";

describe("canAffordStake", () => {
  it("is true when balance covers the stake exactly", () => {
    expect(canAffordStake(50, 50)).toBe(true);
  });

  it("is true when balance exceeds the stake", () => {
    expect(canAffordStake(100, 50)).toBe(true);
  });

  it("is false when balance falls short", () => {
    expect(canAffordStake(30, 50)).toBe(false);
  });
});

describe("canClaimRewardedAd", () => {
  it("is true below the daily cap", () => {
    expect(canClaimRewardedAd(0)).toBe(true);
    expect(canClaimRewardedAd(MAX_REWARDED_ADS_PER_DAY - 1)).toBe(true);
  });

  it("is false at or above the daily cap", () => {
    expect(canClaimRewardedAd(MAX_REWARDED_ADS_PER_DAY)).toBe(false);
    expect(canClaimRewardedAd(MAX_REWARDED_ADS_PER_DAY + 1)).toBe(false);
  });
});
