import Phaser from "phaser";
import { GAME_WIDTH } from "../config.js";
import { fetchLeaderboard } from "../services/net.js";
import type { LeaderboardEntry, LeaderboardPeriod } from "../services/net.js";
import { getSession } from "../state/session.js";
import { openFreeCoins } from "../ui/freeCoins.js";
import { COLOR, TEXT } from "../ui/theme.js";
import {
  avatar,
  glossyButton,
  menuBackground,
  panel,
  screenHeader,
  shortName,
} from "../ui/widgets.js";

const LIST_Y = 740;
const FIRST_ROW_Y = 350;
const ROW_HEIGHT = 86;
const SHOWN = 10;
const MEDALS = [0xffd166, 0xd9e2ec, 0xe39b5a];

export class LeaderboardScene extends Phaser.Scene {
  private period: LeaderboardPeriod = "all";
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super("Leaderboard");
  }

  create(data: { period?: LeaderboardPeriod }): void {
    this.period = data.period ?? "all";
    menuBackground(this);
    const coins = screenHeader(
      this,
      "Leaderboard",
      () => this.scene.start("Home"),
      () => openFreeCoins(this, (balance) => coins.setCoins(balance)),
    );

    const tabs: readonly (readonly [LeaderboardPeriod, string])[] = [
      ["all", "ALL TIME"],
      ["week", "THIS WEEK"],
    ];
    tabs.forEach(([period, label], i) => {
      glossyButton(
        this,
        GAME_WIDTH / 2 + (i === 0 ? -150 : 150),
        214,
        label,
        () => this.scene.restart({ period }),
        { width: 280, height: 84, color: period === this.period ? "orange" : "gray", fontSize: 28 },
      );
    });

    panel(this, GAME_WIDTH / 2, LIST_Y, 660, 900, "glass");
    this.status = this.add.text(GAME_WIDTH / 2, LIST_Y, "Loading...", TEXT.body).setOrigin(0.5);
    void this.loadEntries();
  }

  private async loadEntries(): Promise<void> {
    try {
      const entries = await fetchLeaderboard(this.period);
      if (this.sys.isActive()) this.showEntries(entries);
    } catch {
      if (this.sys.isActive()) this.status.setText("Couldn't load the leaderboard");
    }
  }

  private showEntries(entries: readonly LeaderboardEntry[]): void {
    if (entries.length === 0) {
      this.status.setText("No winners yet - be the first!");
      return;
    }
    this.status.setText("");
    const me = getSession().userId;
    entries.slice(0, SHOWN).forEach((entry, i) => {
      const mine = entry.userId === me;
      const color = mine ? COLOR.goldText : COLOR.white;
      const parts: Phaser.GameObjects.GameObject[] = [];
      if (mine) parts.push(panel(this, 0, 0, 620, 78, "card"));
      const medal = MEDALS[i];
      if (medal !== undefined) {
        const disc = this.add.graphics();
        disc.fillStyle(medal, 1).fillCircle(-262, 0, 24);
        parts.push(disc);
      }
      parts.push(
        this.add
          .text(-262, 0, String(i + 1), {
            ...TEXT.heading,
            color: medal === undefined ? COLOR.white : "#3b2a05",
          })
          .setOrigin(0.5),
        avatar(this, -190, 0, entry.nickname, entry.userId, 56),
        this.add
          .text(-146, 0, shortName(entry.nickname, 14), { ...TEXT.body, color })
          .setOrigin(0, 0.5),
        this.add.image(212, 0, "icon-trophy").setDisplaySize(36, 36),
        this.add
          .text(290, 0, String(entry.winPoints), { ...TEXT.heading, color })
          .setOrigin(1, 0.5),
      );
      this.add.container(GAME_WIDTH / 2, FIRST_ROW_Y + i * ROW_HEIGHT, parts);
    });
  }
}
