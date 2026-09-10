import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import { t } from "../i18n/index.js";
import { fetchLeaderboard } from "../services/net.js";
import type { LeaderboardEntry, LeaderboardPeriod } from "../services/net.js";
import { getSession } from "../state/session.js";
import { COLORS, createButton, createChip, createPanel, TEXT_STYLES } from "../ui/kit.js";
import type { ButtonHandle } from "../ui/kit.js";

const LIST_TOP = 300;
const ROW_H = 52;
const MAX_ROWS = 15;

export class LeaderboardScene extends Phaser.Scene {
  private period: LeaderboardPeriod = "all";
  private periodChips: ButtonHandle[] = [];
  private listContainer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("Leaderboard");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.periodChips = [];

    this.add.text(GAME_WIDTH / 2, 90, t("leaderboardTitle"), TEXT_STYLES.title).setOrigin(0.5);

    const chipY = 190;
    const options: { period: LeaderboardPeriod; label: string }[] = [
      { period: "all", label: t("periodAll") },
      { period: "week", label: t("periodWeek") },
    ];
    options.forEach((opt, i) => {
      const chip = createChip(
        this,
        GAME_WIDTH / 2 + (i === 0 ? -110 : 110),
        chipY,
        opt.label,
        () => {
          this.period = opt.period;
          this.syncPeriodChips();
          void this.loadEntries();
        },
        { width: 200 },
      );
      chip.setEnabled(opt.period === this.period);
      this.periodChips.push(chip);
    });

    createPanel(
      this,
      GAME_WIDTH / 2,
      LIST_TOP + (MAX_ROWS * ROW_H) / 2,
      660,
      MAX_ROWS * ROW_H + 20,
    );
    this.listContainer = this.add.container(0, 0);
    this.statusText = this.add
      .text(GAME_WIDTH / 2, LIST_TOP + 20, t("loading"), TEXT_STYLES.muted)
      .setOrigin(0.5, 0);

    createButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 90,
      t("back"),
      () => this.scene.start("Lobby"),
      {
        width: 220,
        height: 56,
        color: COLORS.secondary,
        hoverColor: COLORS.secondaryHover,
      },
    );

    void this.loadEntries();
  }

  private syncPeriodChips(): void {
    this.periodChips[0]?.setEnabled(this.period === "all");
    this.periodChips[1]?.setEnabled(this.period === "week");
  }

  private async loadEntries(): Promise<void> {
    this.statusText.setText(t("loading"));
    this.listContainer.removeAll(true);
    try {
      const entries = await fetchLeaderboard(this.period);
      this.render(entries);
    } catch (err) {
      this.statusText.setText(err instanceof Error ? err.message : String(err));
    }
  }

  private render(entries: readonly LeaderboardEntry[]): void {
    if (entries.length === 0) {
      this.statusText.setText(t("noEntries"));
      return;
    }
    this.statusText.setText("");

    const myId = getSession().userId;
    const rows = entries.slice(0, MAX_ROWS);
    rows.forEach((entry, i) => {
      const y = LIST_TOP + 30 + i * ROW_H;
      const mine = entry.userId === myId;
      const color = mine ? "#ffd166" : COLORS.textLight;
      const rank = this.add
        .text(96, y, `#${i + 1}`, { ...TEXT_STYLES.body, color })
        .setOrigin(0, 0.5);
      const name = this.add
        .text(180, y, entry.nickname, { ...TEXT_STYLES.body, color })
        .setOrigin(0, 0.5);
      const points = this.add
        .text(GAME_WIDTH - 96, y, String(entry.winPoints), { ...TEXT_STYLES.body, color })
        .setOrigin(1, 0.5);
      this.listContainer.add([rank, name, points]);
    });
  }
}
