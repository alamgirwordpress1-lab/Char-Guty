import { DEFAULT_CONFIG } from "@char-guty/game-core";

/** The server simulates in a fieldWidth x fieldHeight box; this maps it onto the screen. */
export const FIELD_SCALE = 1.6;
export const FIELD_LEFT = 40;
export const FIELD_TOP = 400;
export const FIELD_PX_W = DEFAULT_CONFIG.fieldWidth * FIELD_SCALE;
export const FIELD_PX_H = DEFAULT_CONFIG.fieldHeight * FIELD_SCALE;

export function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: FIELD_LEFT + x * FIELD_SCALE, y: FIELD_TOP + y * FIELD_SCALE };
}
