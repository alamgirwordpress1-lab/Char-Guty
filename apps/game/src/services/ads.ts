import { claimMockAdReward } from "./net.js";
import { getSession, updateBalance } from "../state/session.js";

export type RewardedAdResult = "rewarded" | "closed" | "failed";

/** Android/Facebook Instant Games implementations plug in behind this same shape. */
export interface AdsService {
  showRewarded(): Promise<RewardedAdResult>;
  /** No-op for now - the hook point apps/game calls between a match and the lobby. */
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

export const ads: AdsService = new WebAdsService();
