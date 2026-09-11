/** The slice of the Instant Games SDK (fbinstant.8.0.js) the game uses. */
interface InstantGamesSdk {
  initializeAsync(): Promise<void>;
  setLoadingProgress(percentage: number): void;
  startGameAsync(): Promise<void>;
}

// Only the fbinstant build loads the SDK script, and it runs before this module does.
const sdk = (globalThis as { FBInstant?: InstantGamesSdk }).FBInstant;

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
