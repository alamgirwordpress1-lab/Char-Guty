import { DEFAULT_CONFIG } from "@char-guty/game-core";
import { GAME_WIDTH, LANDSCAPE } from "../config.js";

/** The server simulates in a fieldWidth x fieldHeight box; this maps it onto the screen. */
export const FIELD_SCALE = LANDSCAPE ? 1.8 : 1.6;
export const FIELD_PX_W = DEFAULT_CONFIG.fieldWidth * FIELD_SCALE;
export const FIELD_PX_H = DEFAULT_CONFIG.fieldHeight * FIELD_SCALE;
/** Centred across the screen: in landscape near the top, with the seats down either side. */
export const FIELD_LEFT = (GAME_WIDTH - FIELD_PX_W) / 2;
export const FIELD_TOP = LANDSCAPE ? 52 : 400;

export function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: FIELD_LEFT + x * FIELD_SCALE, y: FIELD_TOP + y * FIELD_SCALE };
}
