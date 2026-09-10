import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config.js";
import { setMockGame } from "./dev.js";
import { BootScene } from "./scenes/BootScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { LobbyScene } from "./scenes/LobbyScene.js";
import { LoginScene } from "./scenes/LoginScene.js";
import { ResultScene } from "./scenes/ResultScene.js";
import { COLORS } from "./ui/kit.js";

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("mock") === "game") {
  const { createMockGame } = await import("./game/mockRoom.js");
  setMockGame(createMockGame());
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  dom: {
    createContainer: true,
  },
  scene: [BootScene, LoginScene, LobbyScene, GameScene, ResultScene],
};

new Phaser.Game(config);
