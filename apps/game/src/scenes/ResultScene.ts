import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import type { GameRoom } from "../game/GameRoom.js";
import { t } from "../i18n/index.js";
import { getSession } from "../state/session.js";
import { COLORS, createButton, TEXT_STYLES } from "../ui/kit.js";

interface ResultSceneData {
  readonly room: GameRoom | null;
  readonly winner: string | null;
  /** Net coin change for this match (stake already paid, pot on a win). */
  readonly delta: number;
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super("Result");
  }

  create(data: ResultSceneData): void {
    this.cameras.main.setBackgroundColor(COLORS.background);

    const won = data.winner !== null && data.winner === getSession().userId;
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 140, won ? t("resultWin") : t("resultLose"), {
        ...TEXT_STYLES.title,
        color: won ? "#ffd166" : TEXT_STYLES.title.color,
      })
      .setOrigin(0.5);

    const sign = data.delta > 0 ? "+" : "";
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, `${t("coins")}: ${sign}${data.delta}`, {
        ...TEXT_STYLES.heading,
        color: data.delta >= 0 ? "#7ee2a8" : "#ff8a80",
      })
      .setOrigin(0.5);

    createButton(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80, t("playAgain"), () => {
      void data.room?.leave(true);
      this.scene.start("Lobby");
    });
  }
}
