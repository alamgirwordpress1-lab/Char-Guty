import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import { t } from "../i18n/index.js";
import { getSession } from "../state/session.js";
import { TEXT_STYLES, createButton, COLORS } from "../ui/kit.js";

interface ResultSceneData {
  readonly room: Room | null;
  readonly winner: string | null;
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super("Result");
  }

  create(data: ResultSceneData): void {
    this.cameras.main.setBackgroundColor(COLORS.background);

    const won = data.winner !== null && data.winner === getSession().userId;
    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - 80,
        won ? t("resultWin") : t("resultLose"),
        TEXT_STYLES.title,
      )
      .setOrigin(0.5);

    createButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80, t("backToLobby"), () => {
      data.room?.leave();
      this.scene.start("Lobby");
    });
  }
}
