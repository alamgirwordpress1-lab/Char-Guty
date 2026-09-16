import Phaser from "phaser";
import { GAME_WIDTH, LANDSCAPE } from "../config.js";
import { arenasFor } from "../game/arenas.js";
import type { Arena } from "../game/arenas.js";
import { getSession } from "../state/session.js";
import { freeCoinsOffered, openFreeCoins } from "../ui/freeCoins.js";
import { COLOR, TEXT } from "../ui/theme.js";
import { glossyButton, menuBackground, panel, screenHeader } from "../ui/widgets.js";
import type { ArenaSceneData, MatchmakingSceneData, PlayMode } from "./flow.js";

const PLAYER_COUNTS = [2, 3, 4] as const;
const TITLES: Record<PlayMode, string> = {
  online: "Play Online",
  computer: "Vs Computer",
  friends: "Create a Room",
};
/** Portrait lists the tables down the screen as wide cards; landscape stands them side by side. */
const CARD = LANDSCAPE
  ? { width: 228, height: 380, step: 244, y: 460 }
  : { width: 660, height: 150, step: 168, y: 400 };
const PICKER = LANDSCAPE ? { label: 150, buttons: 212 } : { label: 190, buttons: 250 };

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
      freeCoinsOffered
        ? () =>
            openFreeCoins(this, (balance) => {
              coins.setCoins(balance);
              this.renderArenas();
            })
        : undefined,
    );

    const label = this.mode === "computer" ? "Players (you and computers)" : "Players";
    this.add.text(GAME_WIDTH / 2, PICKER.label, label, TEXT.small).setOrigin(0.5);
    PLAYER_COUNTS.forEach((count, i) => {
      glossyButton(
        this,
        GAME_WIDTH / 2 + (i - 1) * 216,
        PICKER.buttons,
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
    const arenas = arenasFor(this.playerCount);
    arenas.forEach((arena, i) => {
      if (LANDSCAPE) {
        const x = GAME_WIDTH / 2 + (i - (arenas.length - 1) / 2) * CARD.step;
        this.list.add(this.standingCard(x, CARD.y, arena));
      } else {
        this.list.add(this.wideCard(GAME_WIDTH / 2, CARD.y + i * CARD.step, arena));
      }
    });
  }

  private wideCard(x: number, y: number, arena: Arena): Phaser.GameObjects.Container {
    const practice = this.mode === "computer";
    const stake = arena.pot / this.playerCount;
    const left = -CARD.width / 2;

    const badge = this.add.graphics();
    badge.fillStyle(arena.tint, 1).fillCircle(left + 78, 0, 50);
    badge.lineStyle(5, 0xffe89a, 1).strokeCircle(left + 78, 0, 50);
    const parts: Phaser.GameObjects.GameObject[] = [
      panel(this, 0, 0, CARD.width, CARD.height, "card"),
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
    parts.push(...this.playButton(arena, CARD.width / 2 - 96, -4, 164, 88, 58));
    return this.add.container(x, y, parts);
  }

  /** Landscape: the badge on top, then the name, the stakes, and PLAY at the foot. */
  private standingCard(x: number, y: number, arena: Arena): Phaser.GameObjects.Container {
    const practice = this.mode === "computer";
    const stake = arena.pot / this.playerCount;

    const badge = this.add.graphics();
    badge.fillStyle(arena.tint, 1).fillCircle(0, -112, 50);
    badge.lineStyle(5, 0xffe89a, 1).strokeCircle(0, -112, 50);
    const parts: Phaser.GameObjects.GameObject[] = [
      panel(this, 0, 0, CARD.width, CARD.height, "card"),
      badge,
      this.add.image(0, -112, practice ? "icon-robot" : "icon-trophy").setDisplaySize(56, 56),
      this.add
        .text(0, -32, arena.name, {
          ...TEXT.heading,
          fontSize: "24px",
          align: "center",
          wordWrap: { width: CARD.width - 28 },
        })
        .setOrigin(0.5),
    ];
    if (practice) {
      parts.push(
        this.add
          .text(0, 44, `First to\n${arena.pot} points`, { ...TEXT.body, align: "center" })
          .setOrigin(0.5),
      );
    } else {
      parts.push(
        this.add.image(-62, 30, "icon-coin").setDisplaySize(30, 30),
        this.add.text(-40, 30, `Entry ${stake}`, TEXT.body).setOrigin(0, 0.5),
        this.add.image(-62, 66, "icon-coin").setDisplaySize(30, 30),
        this.add
          .text(-40, 66, `Win ${arena.pot}`, { ...TEXT.body, color: COLOR.goldText })
          .setOrigin(0, 0.5),
      );
    }
    parts.push(...this.playButton(arena, 0, 130, 180, 80, 46));
    return this.add.container(x, y, parts);
  }

  /** PLAY (or CREATE), greyed out with a note under it when the entry is more than the player has. */
  private playButton(
    arena: Arena,
    x: number,
    y: number,
    width: number,
    height: number,
    noteBelow: number,
  ): Phaser.GameObjects.GameObject[] {
    const practice = this.mode === "computer";
    const affordable = practice || getSession().coins >= arena.pot / this.playerCount;
    const play = glossyButton(
      this,
      x,
      y,
      this.mode === "friends" ? "CREATE" : "PLAY",
      () => this.play(arena),
      { width, height, color: "green", fontSize: 28 },
    );
    if (affordable) return [play.container];
    play.setEnabled(false);
    const note = this.add
      .text(x, y + noteBelow, "Not enough coins", {
        ...TEXT.small,
        fontSize: "16px",
        color: COLOR.lose,
      })
      .setOrigin(0.5);
    return [play.container, note];
  }

  private play(arena: Arena): void {
    this.scene.start("Matchmaking", {
      mode: this.mode,
      playerCount: this.playerCount,
      pot: arena.pot,
    } satisfies MatchmakingSceneData);
  }
}
