import type { GameSceneData } from "./scenes/GameScene.js";

let mockGame: GameSceneData | null = null;

/** Set by main.ts in dev when the page is opened with `?mock=game`; Boot then skips Login. */
export function setMockGame(data: GameSceneData): void {
  mockGame = data;
}

export function getMockGame(): GameSceneData | null {
  return mockGame;
}
