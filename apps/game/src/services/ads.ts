import { claimCrazyGamesAdReward, claimInstantAdReward, claimMockAdReward } from "./net.js";
import type { AdRewardResult } from "./net.js";
import {
  isCrazyGamesBuild,
  isFacebookInstant,
  showCrazyGamesAd,
  showInstantAd,
} from "./platform.js";
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
    return creditReward(claimMockAdReward);
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
    return creditReward((token) => claimInstantAdReward(token, crypto.randomUUID()));
  }

  async showInterstitial(): Promise<void> {
    if (this.interstitialPlacement === "") return;
    await showInstantAd("interstitial", this.interstitialPlacement).catch(() => undefined);
  }
}

/**
 * CrazyGames: videos through their SDK. Like Facebook's they give the server no proof, so
 * the claim is trusted and held to the daily cap - and it is only made once a video has
 * played to the end, as CrazyGames requires.
 */
class CrazyGamesAdsService implements AdsService {
  async showRewarded(): Promise<RewardedAdResult> {
    if (!(await showCrazyGamesAd("rewarded"))) return "failed";
    return creditReward((token) => claimCrazyGamesAdReward(token, crypto.randomUUID()));
  }

  async showInterstitial(): Promise<void> {
    await showCrazyGamesAd("midgame");
  }
}

/** Claims a watched video's coins from the server and shows the new balance. */
async function creditReward(
  claim: (token: string) => Promise<AdRewardResult>,
): Promise<RewardedAdResult> {
  const session = getSession();
  try {
    const result = await claim(session.token);
    if (!result.ok) return "failed";
    if (result.coins !== undefined) {
      updateBalance(result.coins, result.winPoints ?? session.winPoints);
    }
    return "rewarded";
  } catch {
    return "failed";
  }
}

export const ads: AdsService = isFacebookInstant
  ? new InstantGamesAdsService()
  : isCrazyGamesBuild
    ? new CrazyGamesAdsService()
    : new WebAdsService();
