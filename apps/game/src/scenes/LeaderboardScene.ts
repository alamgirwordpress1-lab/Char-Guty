import Phaser from "phaser";
import { GAME_WIDTH, LANDSCAPE } from "../config.js";
import { fetchLeaderboard } from "../services/net.js";
import type { LeaderboardEntry, LeaderboardPeriod } from "../services/net.js";
import { getSession } from "../state/session.js";
import { freeCoinsOffered, openFreeCoins } from "../ui/freeCoins.js";
import { COLOR, TEXT } from "../ui/theme.js";
import {
  avatar,
  glossyButton,
  menuBackground,
  panel,
  screenHeader,
  shortName,
} from "../ui/widgets.js";

const SHOWN = 10;
const MEDALS = [0xffd166, 0xd9e2ec, 0xe39b5a];
/** Portrait: one column of ten. Landscape: two columns of five, side by side. */
const LIST = LANDSCAPE
  ? {
      tabsY: 165,
      panel: { y: 450, width: 1220, height: 500 },
      rowWidth: 540,
      columns: [340, 940],
      firstRowY: 250,
      rowStep: 88,
      perColumn: 5,
    }
  : {
      tabsY: 214,
      panel: { y: 740, width: 660, height: 900 },
      rowWidth: 620,
      columns: [GAME_WIDTH / 2],
      firstRowY: 350,
      rowStep: 86,
      perColumn: SHOWN,
    };

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
      freeCoinsOffered
        ? () => openFreeCoins(this, (balance) => coins.setCoins(balance))
        : undefined,
    );

    const tabs: readonly (readonly [LeaderboardPeriod, string])[] = [
      ["all", "ALL TIME"],
      ["week", "THIS WEEK"],
    ];
    tabs.forEach(([period, label], i) => {
      glossyButton(
        this,
        GAME_WIDTH / 2 + (i === 0 ? -150 : 150),
        LIST.tabsY,
        label,
        () => this.scene.restart({ period }),
        { width: 280, height: 84, color: period === this.period ? "orange" : "gray", fontSize: 28 },
      );
    });

    panel(this, GAME_WIDTH / 2, LIST.panel.y, LIST.panel.width, LIST.panel.height, "glass");
    this.status = this.add
      .text(GAME_WIDTH / 2, LIST.panel.y, "Loading...", TEXT.body)
      .setOrigin(0.5);
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
    const half = LIST.rowWidth / 2;
    entries.slice(0, SHOWN).forEach((entry, i) => {
      const mine = entry.userId === me;
      const color = mine ? COLOR.goldText : COLOR.white;
      const parts: Phaser.GameObjects.GameObject[] = [];
      if (mine) parts.push(panel(this, 0, 0, LIST.rowWidth, 78, "card"));
      const medal = MEDALS[i];
      if (medal !== undefined) {
        const disc = this.add.graphics();
        disc.fillStyle(medal, 1).fillCircle(-half + 48, 0, 24);
        parts.push(disc);
      }
      parts.push(
        this.add
          .text(-half + 48, 0, String(i + 1), {
            ...TEXT.heading,
            color: medal === undefined ? COLOR.white : "#3b2a05",
          })
          .setOrigin(0.5),
        avatar(this, -half + 120, 0, entry.nickname, entry.userId, 56),
        this.add
          .text(-half + 164, 0, shortName(entry.nickname, 14), { ...TEXT.body, color })
          .setOrigin(0, 0.5),
        this.add.image(half - 98, 0, "icon-trophy").setDisplaySize(36, 36),
        this.add
          .text(half - 20, 0, String(entry.winPoints), { ...TEXT.heading, color })
          .setOrigin(1, 0.5),
      );
      const column = Math.floor(i / LIST.perColumn);
      const x = LIST.columns[column] ?? GAME_WIDTH / 2;
      const y = LIST.firstRowY + (i % LIST.perColumn) * LIST.rowStep;
      this.add.container(x, y, parts);
    });
  }
}
