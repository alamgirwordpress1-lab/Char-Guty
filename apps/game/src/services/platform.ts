import { setAdPlaying, setPlatformMuted } from "./audio.js";

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

interface CrazyGamesSettings {
  readonly muteAudio: boolean;
}

interface CrazyGamesUser {
  readonly username: string;
}

interface CrazyGamesRoom {
  readonly roomId: string;
  readonly isJoinable: boolean;
  readonly inviteParams?: Record<string, string>;
}

/** The slice of the CrazyGames SDK (crazygames-sdk-v3.js) the game uses. */
interface CrazyGamesSdk {
  init(): Promise<void>;
  readonly environment: "local" | "crazygames" | "disabled";
  readonly ad: {
    requestAd(
      type: "midgame" | "rewarded",
      callbacks: { adStarted(): void; adFinished(): void; adError(error: unknown): void },
    ): void;
  };
  readonly user: {
    readonly isUserAccountAvailable: boolean;
    getUser(): Promise<CrazyGamesUser | null>;
    getUserToken(): Promise<string>;
    addAuthListener(listener: (user: CrazyGamesUser | null) => void): void;
  };
  readonly game: {
    readonly settings: CrazyGamesSettings;
    readonly isInstantMultiplayer: boolean;
    addSettingsChangeListener(listener: (settings: CrazyGamesSettings) => void): void;
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    inviteLink(params: Record<string, string>): string;
    getInviteParam(name: string): string | null;
    updateRoom(room: CrazyGamesRoom): void;
    leftRoom(): void;
    addJoinRoomListener(listener: (inviteParams: Partial<Record<string, string>>) => void): void;
  };
}

// Only the fbinstant build loads the SDK script, and it runs before this module does.
const sdk = (globalThis as { FBInstant?: InstantGamesSdk }).FBInstant;
// Likewise only the crazygames build loads CrazyGames' script - unless an ad blocker ate it.
const crazySdk = (globalThis as { CrazyGames?: { SDK?: CrazyGamesSdk } }).CrazyGames?.SDK;
const CRAZY_GAMES_INIT_TIMEOUT_MS = 5000;

const ROOM_CODE = /^[A-Z0-9]{6}$/;
let invitedRoomTaken = false;
let crazyGames: CrazyGamesSdk | null = null;
let inGameplay = false;
let reloadAfterGameplay = false;
let instantMultiplayerTaken = false;
let reportedRoom: { readonly roomId: string; readonly code: string | null } | null = null;
let lastRoomReport = "";

/** True when running as a Facebook Instant Game. */
export const isFacebookInstant = sdk !== undefined;

/** True in the build made for CrazyGames, even if its SDK then fails to start. */
export const isCrazyGamesBuild = import.meta.env.MODE === "crazygames";

/** True once CrazyGames' SDK is running, so its ads, invites and events are live. */
export function isCrazyGames(): boolean {
  return crazyGames !== null;
}

/** Must run before any other SDK call. */
export async function initPlatform(): Promise<void> {
  if (sdk !== undefined) await sdk.initializeAsync();
  if (crazySdk !== undefined) await initCrazyGames(crazySdk);
}

/**
 * Starts CrazyGames' SDK. It only runs on their own pages (and on localhost, with demo
 * ads); anywhere else it reports "disabled" and every call would throw, so the game then
 * carries on as a plain web game. A start that stalls must not hold up loading either.
 */
async function initCrazyGames(candidate: CrazyGamesSdk): Promise<void> {
  const init = candidate.init().then(
    () => true,
    () => false,
  );
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), CRAZY_GAMES_INIT_TIMEOUT_MS);
  });
  if (!(await Promise.race([init, timeout])) || candidate.environment === "disabled") return;
  crazyGames = candidate;
  candidate.game.loadingStart();
  setPlatformMuted(candidate.game.settings.muteAudio);
  candidate.game.addSettingsChangeListener((settings) => setPlatformMuted(settings.muteAudio));
}

/** Mirrors the asset loader's progress (0-1) onto Facebook's own loading screen. */
export function reportLoadingProgress(progress: number): void {
  sdk?.setLoadingProgress(Math.round(progress * 100));
}

/** Hands the screen over from the platform's loading view to the game. */
export async function startPlatformGame(): Promise<void> {
  if (sdk !== undefined) await sdk.startGameAsync();
  crazyGames?.game.loadingStop();
}

/** A game is under way. CrazyGames counts play time from this and keeps its ads out of it. */
export function gameplayStarted(): void {
  if (crazyGames === null || inGameplay) return;
  inGameplay = true;
  crazyGames.game.gameplayStart();
}

/** Play has stopped: the round is over or the player left the table. */
export function gameplayStopped(): void {
  if (crazyGames === null || !inGameplay) return;
  inGameplay = false;
  crazyGames.game.gameplayStop();
  if (reloadAfterGameplay) window.location.reload();
}

/** Restarts the page now, or once the game under way stops - never in the middle of one. */
export function reloadBetweenGames(): void {
  if (inGameplay) reloadAfterGameplay = true;
  else window.location.reload();
}

/** The logged-in CrazyGames player's token; null for a guest there, and anywhere else. */
export async function crazyGamesUserToken(): Promise<string | null> {
  const crazy = crazyGames;
  if (crazy === null) return null;
  try {
    if (!crazy.user.isUserAccountAvailable || (await crazy.user.getUser()) === null) return null;
    return await crazy.user.getUserToken();
  } catch {
    return null;
  }
}

/** Runs when a player logs in to CrazyGames mid-session; logging out reloads the page itself. */
export function onCrazyGamesLogin(listener: () => void): void {
  quietly(() =>
    crazyGames?.user.addAuthListener((user) => {
      if (user !== null) listener();
    }),
  );
}

/** True once, when CrazyGames started the game straight into multiplayer. */
export function takeInstantMultiplayer(): boolean {
  if (instantMultiplayerTaken) return false;
  instantMultiplayerTaken = true;
  return crazyGames?.game.isInstantMultiplayer === true;
}

/**
 * Tells CrazyGames which room the player is in and whether friends can still join it -
 * which only a private room, the kind with a code, ever allows. Repeats are dropped.
 */
export function reportRoom(roomId: string, code: string | null, joinable: boolean): void {
  if (crazyGames === null) return;
  reportedRoom = { roomId, code };
  const room: CrazyGamesRoom =
    code === null
      ? { roomId, isJoinable: false }
      : { roomId, isJoinable: joinable, inviteParams: { room: code } };
  const report = JSON.stringify(room);
  if (report === lastRoomReport) return;
  lastRoomReport = report;
  const crazy = crazyGames;
  quietly(() => crazy.game.updateRoom(room));
}

/** The room the player is in filled up, or has seats free again. */
export function reportRoomJoinable(joinable: boolean): void {
  if (reportedRoom !== null) reportRoom(reportedRoom.roomId, reportedRoom.code, joinable);
}

/** The player left the room they were in. */
export function reportLeftRoom(): void {
  if (crazyGames === null || reportedRoom === null) return;
  reportedRoom = null;
  lastRoomReport = "";
  const crazy = crazyGames;
  quietly(() => crazy.game.leftRoom());
}

/** Runs with the room's code when a player accepts a CrazyGames invite while already playing. */
export function onRoomInvite(listener: (code: string) => void): void {
  quietly(() =>
    crazyGames?.game.addJoinRoomListener((params) => {
      const code = params.room?.toUpperCase();
      if (code !== undefined && ROOM_CODE.test(code)) listener(code);
    }),
  );
}

/** SDK calls that only report or listen: if one throws, the game must carry on regardless. */
function quietly(call: () => void): void {
  try {
    call();
  } catch (err) {
    console.warn(err);
  }
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
  const code = invitedCode();
  return typeof code === "string" && ROOM_CODE.test(code) ? code : null;
}

function invitedCode(): unknown {
  if (sdk !== undefined) {
    return (sdk.getEntryPointData() as { roomCode?: unknown } | null)?.roomCode;
  }
  if (crazyGames !== null) return crazyGames.game.getInviteParam("room")?.toUpperCase();
  return roomCodeFromUrl();
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
  // On CrazyGames the game sits in a frame on their page, so only their own link finds it.
  if (crazyGames !== null) return crazyGames.game.inviteLink({ room: roomCode });
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

/**
 * Plays one CrazyGames video with the game muted; true only if it ran to the end. Any
 * error - no fill, an ad blocker, the cooldown, ads still off during a Basic Launch -
 * comes back as false, and the game simply carries on.
 */
export function showCrazyGamesAd(kind: "midgame" | "rewarded"): Promise<boolean> {
  const crazy = crazyGames;
  if (crazy === null) return Promise.resolve(false);
  return new Promise((resolve) => {
    crazy.ad.requestAd(kind, {
      adStarted: () => setAdPlaying(true),
      adFinished: () => {
        setAdPlaying(false);
        resolve(true);
      },
      adError: () => {
        setAdPlaying(false);
        resolve(false);
      },
    });
  });
}
