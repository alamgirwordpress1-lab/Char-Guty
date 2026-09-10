import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import { t } from "../i18n/index.js";
import type { MatchEndedMsg } from "../services/roomState.js";
import { COLORS, createButton, TEXT_STYLES } from "../ui/kit.js";

interface GameSceneData {
  readonly room: Room;
}

/** Gameplay is not built yet - this just holds the live room and lets you leave. */
export class GameScene extends Phaser.Scene {
  private room: Room | null = null;

  constructor() {
    super("Game");
  }

  create(data: GameSceneData): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.room = data.room;

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, t("gameComingSoon"), TEXT_STYLES.heading)
      .setOrigin(0.5);

    this.room.onMessage<MatchEndedMsg>("matchEnded", (payload) => {
      this.scene.start("Result", { room: this.room, winner: payload.winner });
    });

    createButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, t("leave"), () => {
      this.room?.leave();
      this.scene.start("Lobby");
    });
  }

  shutdown(): void {
    this.room = null;
  }
}
