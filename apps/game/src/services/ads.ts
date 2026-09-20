import {
  claimCrazyGamesAdReward,
  claimInstantAdReward,
  claimMockAdReward,
  fetchWallet,
} from "./net.js";
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
  /** False where no ad network is wired up: then Free Coins isn't offered at all. */
  readonly offersRewarded: boolean;
  showRewarded(): Promise<RewardedAdResult>;
  /** The hook point apps/game calls between a match and the lobby. */
  showInterstitial(): Promise<void>;
}

/** Web/dev: calls the server's ADS_MOCK-gated endpoint instead of a real ad SDK. */
class WebAdsService implements AdsService {
  // Only the dev server's mock rewards exist here. A published web or Android build has no
  // video to show, and a button that can never pay out reads as broken to store reviewers.
  readonly offersRewarded = import.meta.env.DEV;

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
  readonly offersRewarded = this.rewardedPlacement !== "";

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
  readonly offersRewarded = true;

  async showRewarded(): Promise<RewardedAdResult> {
    if (!(await showCrazyGamesAd("rewarded"))) return "failed";
    return creditReward((token) => claimCrazyGamesAdReward(token, crypto.randomUUID()));
  }

  async showInterstitial(): Promise<void> {
    await showCrazyGamesAd("midgame");
  }
}

/**
 * Android: AdMob rewarded video through Capacitor. Google tells the server itself that the
 * video was watched (server-side verification), so the coins arrive through
 * /ads/reward-callback and the client only reads the wallet back afterwards. Until the ad
 * unit IDs are set - which AdMob only grants once the app is live on Play - no video is
 * offered, because a Free Coins button with nothing behind it reads as broken.
 */
class AdMobAdsService implements AdsService {
  private readonly rewardedId: string = import.meta.env.VITE_ADMOB_REWARDED_ID ?? "";
  private readonly interstitialId: string = import.meta.env.VITE_ADMOB_INTERSTITIAL_ID ?? "";
  readonly offersRewarded = this.rewardedId !== "";
  private sdk: Promise<typeof import("@capacitor-community/admob")> | null = null;

  async showRewarded(): Promise<RewardedAdResult> {
    if (this.rewardedId === "") return "failed";
    const { userId, coins } = getSession();
    try {
      const { AdMob } = await this.ready();
      await AdMob.prepareRewardVideoAd({ adId: this.rewardedId, ssv: { userId } });
      await AdMob.showRewardVideoAd();
    } catch (err) {
      // Closing the video early rejects here, and so does one that never loaded.
      return /dismiss|cancel|clos/i.test(String(err)) ? "closed" : "failed";
    }
    return waitForServerReward(coins);
  }

  async showInterstitial(): Promise<void> {
    if (this.interstitialId === "") return;
    try {
      const { AdMob } = await this.ready();
      await AdMob.prepareInterstitial({ adId: this.interstitialId });
      await AdMob.showInterstitial();
    } catch {
      // An ad that doesn't turn up is not worth interrupting the game for.
    }
  }

  /** Starts the SDK once, and asks for consent before the first ad is requested. */
  private ready(): Promise<typeof import("@capacitor-community/admob")> {
    this.sdk ??= (async () => {
      const admob = await import("@capacitor-community/admob");
      await admob.AdMob.initialize();
      // Google's EU user consent policy: players in the EEA and the UK have to be asked
      // before a personalised ad is requested. Elsewhere the form never comes up.
      try {
        const consent = await admob.AdMob.requestConsentInfo();
        if (
          consent.status === admob.AdmobConsentStatus.REQUIRED &&
          consent.isConsentFormAvailable === true
        ) {
          await admob.AdMob.showConsentForm();
        }
      } catch {
        // No form configured in AdMob yet: the SDK then serves non-personalised ads.
      }
      return admob;
    })();
    return this.sdk;
  }
}

/**
 * The reward AdMob pays through the server: the coins land by callback, so the wallet is
 * read back until they show up.
 */
async function waitForServerReward(before: number): Promise<RewardedAdResult> {
  const session = getSession();
  for (let tries = 0; tries < 6; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      const wallet = await fetchWallet(session.token);
      if (wallet.coins > before) {
        updateBalance(wallet.coins, wallet.winPoints);
        return "rewarded";
      }
    } catch {
      // The callback may still be on its way; look again.
    }
  }
  return "failed";
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
    : import.meta.env.MODE === "android"
      ? new AdMobAdsService()
      : new WebAdsService();
