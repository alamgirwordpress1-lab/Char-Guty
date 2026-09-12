/** An Audience Network ad the SDK can load and then show once. */
interface AdInstance {
  loadAsync(): Promise<void>;
  showAsync(): Promise<void>;
}

/** The slice of the Instant Games SDK (fbinstant.8.0.js) the game uses. */
interface InstantGamesSdk {
  initializeAsync(): Promise<void>;
  setLoadingProgress(percentage: number): void;
  startGameAsync(): Promise<void>;
  getEntryPointData(): unknown;
  inviteAsync(payload: {
    image: string;
    text: string;
    data?: Record<string, string>;
  }): Promise<void>;
  getRewardedVideoAsync(placementId: string): Promise<AdInstance>;
  getInterstitialAdAsync(placementId: string): Promise<AdInstance>;
}

// Only the fbinstant build loads the SDK script, and it runs before this module does.
const sdk = (globalThis as { FBInstant?: InstantGamesSdk }).FBInstant;

const ROOM_CODE = /^[A-Z0-9]{6}$/;
let invitedRoomTaken = false;

/** True when running as a Facebook Instant Game. */
export const isFacebookInstant = sdk !== undefined;

/** Must run before any other SDK call. */
export async function initPlatform(): Promise<void> {
  if (sdk !== undefined) await sdk.initializeAsync();
}

/** Mirrors the asset loader's progress (0-1) onto Facebook's own loading screen. */
export function reportLoadingProgress(progress: number): void {
  sdk?.setLoadingProgress(Math.round(progress * 100));
}

/** Hands the screen over from Facebook's loading view to the game. */
export async function startPlatformGame(): Promise<void> {
  if (sdk !== undefined) await sdk.startGameAsync();
}

/** Opens Facebook's friend picker; a friend who accepts launches straight into this room. */
export async function inviteToRoom(roomCode: string, image: string): Promise<void> {
  if (sdk === undefined) throw new Error("Facebook invites only work inside the Instant Game");
  await sdk.inviteAsync({ image, text: "Join my Char Guty room!", data: { roomCode } });
}

/** The room an invite launched this session into - handed out once, then null. */
export function takeInvitedRoomCode(): string | null {
  if (invitedRoomTaken) return null;
  invitedRoomTaken = true;
  const code =
    sdk === undefined
      ? roomCodeFromUrl()
      : (sdk.getEntryPointData() as { roomCode?: unknown } | null)?.roomCode;
  return typeof code === "string" && ROOM_CODE.test(code) ? code : null;
}

/**
 * Outside Facebook the invite is just a link, so the room rides in ?room=. It is wiped
 * from the address bar on the way in, or a reload would drop the player back into a room
 * they have since left.
 */
function roomCodeFromUrl(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("room");
  if (code === null) return null;
  url.searchParams.delete("room");
  window.history.replaceState(null, "", url.toString());
  return code.toUpperCase();
}

/** The link that drops whoever opens it straight into this room. */
export function roomLink(roomCode: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", roomCode);
  return url.toString();
}

/** Loads and plays one ad; rejects on no fill, a video closed early, or too-frequent loads. */
export async function showInstantAd(
  kind: "rewarded" | "interstitial",
  placementId: string,
): Promise<void> {
  if (sdk === undefined) throw new Error("Instant Game ads only work inside Facebook");
  const ad =
    kind === "rewarded"
      ? await sdk.getRewardedVideoAsync(placementId)
      : await sdk.getInterstitialAdAsync(placementId);
  await ad.loadAsync();
  await ad.showAsync();
}
