/**
 * The layout, picked once as the game loads: a screen wider than it is tall - a desktop
 * browser, CrazyGames' 16:9 frame - gets the landscape layout, a taller one the portrait
 * layout. ?layout=landscape or ?layout=portrait forces one, for testing.
 */
export const LANDSCAPE = pickLandscape();
export const GAME_WIDTH = LANDSCAPE ? 1280 : 720;
export const GAME_HEIGHT = LANDSCAPE ? 720 : 1280;

export const SERVER_WS_URL = import.meta.env.VITE_SERVER_WS_URL ?? "ws://localhost:2567";
export const SERVER_HTTP_URL = import.meta.env.VITE_SERVER_HTTP_URL ?? "http://localhost:2567";

function pickLandscape(): boolean {
  const forced = new URLSearchParams(window.location.search).get("layout");
  if (forced === "landscape" || forced === "portrait") return forced === "landscape";
  const { innerWidth: width, innerHeight: height } = window;
  // A frame that isn't laid out yet measures 0x0: go by the device instead.
  if (width === 0 || height === 0) return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return width > height;
}
