import Phaser from "phaser";
import { GAME_WIDTH } from "../config.js";
import { arenasFor } from "../game/arenas.js";
import type { Arena } from "../game/arenas.js";
import { getSession } from "../state/session.js";
import { openFreeCoins } from "../ui/freeCoins.js";
import { COLOR, TEXT } from "../ui/theme.js";
import { glossyButton, menuBackground, panel, screenHeader } from "../ui/widgets.js";
import type { ArenaSceneData, MatchmakingSceneData, PlayMode } from "./flow.js";

const PLAYER_COUNTS = [2, 3, 4] as const;
const TITLES: Record<PlayMode, string> = {
  online: "Play Online",
  computer: "Vs Computer",
  friends: "Create a Room",
};
const CARD_WIDTH = 660;
const CARD_HEIGHT = 150;

/** Pick how many players, then a table: its entry and prize, or its target in practice. */
export class ArenaScene extends Phaser.Scene {
  private mode: PlayMode = "online";
  private playerCount = 2;
  private list!: Phaser.GameObjects.Container;

  constructor() {
    super("Arena");
  }

  create(data: ArenaSceneData): void {
    this.mode = data.mode;
    this.playerCount = data.playerCount ?? 2;
    menuBackground(this);

    const coins = screenHeader(
      this,
      TITLES[this.mode],
      () => this.scene.start(this.mode === "friends" ? "Friends" : "Home"),
      () =>
        openFreeCoins(this, (balance) => {
          coins.setCoins(balance);
          this.renderArenas();
        }),
    );

    const label = this.mode === "computer" ? "Players (you and computers)" : "Players";
    this.add.text(GAME_WIDTH / 2, 190, label, TEXT.small).setOrigin(0.5);
    PLAYER_COUNTS.forEach((count, i) => {
      glossyButton(
        this,
        GAME_WIDTH / 2 + (i - 1) * 216,
        250,
        `${count} PLAYERS`,
        () => this.scene.restart({ mode: this.mode, playerCount: count } satisfies ArenaSceneData),
        {
          width: 196,
          height: 84,
          color: count === this.playerCount ? "orange" : "gray",
          fontSize: 26,
        },
      );
    });

    this.list = this.add.container(0, 0);
    this.renderArenas();
  }

  private renderArenas(): void {
    this.list.removeAll(true);
    arenasFor(this.playerCount).forEach((arena, i) => {
      this.list.add(this.arenaCard(GAME_WIDTH / 2, 400 + i * 168, arena));
    });
  }

  private arenaCard(x: number, y: number, arena: Arena): Phaser.GameObjects.Container {
    const practice = this.mode === "computer";
    const stake = arena.pot / this.playerCount;
    const affordable = practice || getSession().coins >= stake;
    const left = -CARD_WIDTH / 2;

    const badge = this.add.graphics();
    badge.fillStyle(arena.tint, 1).fillCircle(left + 78, 0, 50);
    badge.lineStyle(5, 0xffe89a, 1).strokeCircle(left + 78, 0, 50);
    const parts: Phaser.GameObjects.GameObject[] = [
      panel(this, 0, 0, CARD_WIDTH, CARD_HEIGHT, "card"),
      badge,
      this.add.image(left + 78, 0, practice ? "icon-robot" : "icon-trophy").setDisplaySize(56, 56),
      this.add.text(left + 148, -32, arena.name, TEXT.heading).setOrigin(0, 0.5),
    ];
    if (practice) {
      parts.push(
        this.add.text(left + 148, 24, `First to ${arena.pot} points`, TEXT.body).setOrigin(0, 0.5),
      );
    } else {
      parts.push(
        this.add.image(left + 164, 24, "icon-coin").setDisplaySize(34, 34),
        this.add.text(left + 188, 24, `Entry ${stake}`, TEXT.body).setOrigin(0, 0.5),
        this.add.image(left + 336, 24, "icon-coin").setDisplaySize(34, 34),
        this.add
          .text(left + 360, 24, `Win ${arena.pot}`, { ...TEXT.body, color: COLOR.goldText })
          .setOrigin(0, 0.5),
      );
    }

    const play = glossyButton(
      this,
      CARD_WIDTH / 2 - 96,
      -4,
      this.mode === "friends" ? "CREATE" : "PLAY",
      () => this.play(arena),
      { width: 164, height: 88, color: "green", fontSize: 28 },
    );
    parts.push(play.container);
    if (!affordable) {
      play.setEnabled(false);
      parts.push(
        this.add
          .text(CARD_WIDTH / 2 - 96, 54, "Not enough coins", {
            ...TEXT.small,
            fontSize: "16px",
            color: COLOR.lose,
          })
          .setOrigin(0.5),
      );
    }
    return this.add.container(x, y, parts);
  }

  private play(arena: Arena): void {
    this.scene.start("Matchmaking", {
      mode: this.mode,
      playerCount: this.playerCount,
      pot: arena.pot,
    } satisfies MatchmakingSceneData);
  }
}
