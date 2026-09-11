import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/700.css";
import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config.js";
import { setMockGame } from "./dev.js";
import { ArenaScene } from "./scenes/ArenaScene.js";
import { BootScene } from "./scenes/BootScene.js";
import { FriendsScene } from "./scenes/FriendsScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { HomeScene } from "./scenes/HomeScene.js";
import { LeaderboardScene } from "./scenes/LeaderboardScene.js";
import { LoginScene } from "./scenes/LoginScene.js";
import { MatchmakingScene } from "./scenes/MatchmakingScene.js";
import { ProfileScene } from "./scenes/ProfileScene.js";
import { COLOR } from "./ui/theme.js";

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("mock") === "game") {
  const { createMockGame } = await import("./game/mockRoom.js");
  setMockGame(createMockGame());
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: COLOR.navy,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  dom: {
    createContainer: true,
  },
  scene: [
    BootScene,
    LoginScene,
    HomeScene,
    ArenaScene,
    FriendsScene,
    MatchmakingScene,
    GameScene,
    LeaderboardScene,
    ProfileScene,
  ],
};

new Phaser.Game(config);
