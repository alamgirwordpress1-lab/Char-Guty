import { claimInstantAdReward, claimMockAdReward } from "./net.js";
import { isFacebookInstant, showInstantAd } from "./platform.js";
import { getSession, updateBalance } from "../state/session.js";

export type RewardedAdResult = "rewarded" | "closed" | "failed";

/** Android/Facebook Instant Games implementations plug in behind this same shape. */
export interface AdsService {
  showRewarded(): Promise<RewardedAdResult>;
  /** The hook point apps/game calls between a match and the lobby. */
  showInterstitial(): Promise<void>;
}

/** Web/dev: calls the server's ADS_MOCK-gated endpoint instead of a real ad SDK. */
class WebAdsService implements AdsService {
  async showRewarded(): Promise<RewardedAdResult> {
    const session = getSession();
    let result;
    try {
      result = await claimMockAdReward(session.token);
    } catch {
      return "failed";
    }
    if (!result.ok) return "failed";
    if (result.coins !== undefined) {
      updateBalance(result.coins, result.winPoints ?? session.winPoints);
    }
    return "rewarded";
  }

  async showInterstitial(): Promise<void> {
    // Hook point for a real interstitial SDK; nothing to do on web yet.
  }
}

/**
 * Facebook: Audience Network ads through the Instant Games SDK. The placement IDs come from
 * Monetization Manager; until they are set, no video is offered. Facebook gives the server
 * no proof a video was watched, so the reward claim is trusted and held to the daily cap.
 */
class InstantGamesAdsService implements AdsService {
  private readonly rewardedPlacement: string = import.meta.env.VITE_FB_REWARDED_PLACEMENT_ID ?? "";
  private readonly interstitialPlacement: string =
    import.meta.env.VITE_FB_INTERSTITIAL_PLACEMENT_ID ?? "";

  async showRewarded(): Promise<RewardedAdResult> {
    if (this.rewardedPlacement === "") return "failed";
    try {
      await showInstantAd("rewarded", this.rewardedPlacement);
    } catch {
      return "closed";
    }
    const session = getSession();
    try {
      const result = await claimInstantAdReward(session.token, crypto.randomUUID());
      if (!result.ok) return "failed";
      if (result.coins !== undefined) {
        updateBalance(result.coins, result.winPoints ?? session.winPoints);
      }
      return "rewarded";
    } catch {
      return "failed";
    }
  }

  async showInterstitial(): Promise<void> {
    if (this.interstitialPlacement === "") return;
    await showInstantAd("interstitial", this.interstitialPlacement).catch(() => undefined);
  }
}

export const ads: AdsService = isFacebookInstant
  ? new InstantGamesAdsService()
  : new WebAdsService();
