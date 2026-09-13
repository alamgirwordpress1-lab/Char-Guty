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
import type { MatchmakingSceneData } from "./scenes/flow.js";
import {
  initPlatform,
  onCrazyGamesLogin,
  onRoomInvite,
  reloadBetweenGames,
} from "./services/platform.js";
import { signInWithCrazyGames } from "./services/signIn.js";
import { getSession, hasSession } from "./state/session.js";
import { COLOR } from "./ui/theme.js";

// Inside Facebook the SDK has to be initialised before anything else calls it.
await initPlatform();

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

const game = new Phaser.Game(config);

// CrazyGames: a player who logs in mid-session carries on as that account. When it isn't the
// account they were already playing as, the page restarts between games to load it.
onCrazyGamesLogin(() => {
  const before = hasSession() ? getSession().userId : null;
  void signInWithCrazyGames().then((signedIn) => {
    if (signedIn && (before === null || getSession().userId !== before)) reloadBetweenGames();
  });
});

// Accepting a CrazyGames invite while already in the game goes to that room - unless a game,
// or the search for one, is under way.
onRoomInvite((code) => {
  if (!hasSession() || game.scene.isActive("Game") || game.scene.isActive("Matchmaking")) return;
  game.scene.getScenes(true)[0]?.scene.start("Matchmaking", {
    mode: "friends",
    playerCount: 2,
    pot: null,
    code,
  } satisfies MatchmakingSceneData);
});

// Store screenshots have to come out of the real game at its own 720x1280, and a WebGL
// canvas reads back blank through toDataURL - only the renderer's own snapshot works.
// Opening the game with ?snap hands the instance over so a capture script can call it.
if (new URLSearchParams(window.location.search).has("snap")) {
  (globalThis as { charGutyGame?: Phaser.Game }).charGutyGame = game;
}
