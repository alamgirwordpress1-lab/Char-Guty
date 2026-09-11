import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import { fetchWallet } from "../services/net.js";
import { takeInvitedRoomCode } from "../services/platform.js";
import { getSession, updateBalance } from "../state/session.js";
import { openFreeCoins } from "../ui/freeCoins.js";
import { openSettings } from "../ui/settingsDialog.js";
import { COLOR, TEXT } from "../ui/theme.js";
import {
  avatar,
  coinPill,
  iconButton,
  menuBackground,
  panel,
  pressable,
  shortName,
} from "../ui/widgets.js";
import type { ButtonColor, CoinPill } from "../ui/widgets.js";
import type { ArenaSceneData, MatchmakingSceneData, PlayMode } from "./flow.js";

interface ModeTile {
  readonly mode: PlayMode;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly color: ButtonColor;
}

const MODES: readonly ModeTile[] = [
  {
    mode: "online",
    title: "PLAY ONLINE",
    subtitle: "Win coins against other players",
    icon: "icon-globe",
    color: "green",
  },
  {
    mode: "friends",
    title: "PLAY WITH FRIENDS",
    subtitle: "A private room with a code",
    icon: "icon-users",
    color: "orange",
  },
  {
    mode: "computer",
    title: "PLAY VS COMPUTER",
    subtitle: "Practice - no coins at stake",
    icon: "icon-robot",
    color: "blue",
  },
];

export class HomeScene extends Phaser.Scene {
  private coins!: CoinPill;
  private winPoints!: Phaser.GameObjects.Text;

  constructor() {
    super("Home");
  }

  create(): void {
    // A Facebook invite launches the game straight into the inviter's room, the first time only.
    const invitedRoom = takeInvitedRoomCode();
    if (invitedRoom !== null) {
      this.scene.start("Matchmaking", {
        mode: "friends",
        playerCount: 2,
        pot: null,
        code: invitedRoom,
      } satisfies MatchmakingSceneData);
      return;
    }

    menuBackground(this);
    this.buildTopBar();
    this.buildLogo();
    MODES.forEach((tile, i) => this.buildModeTile(GAME_WIDTH / 2, 560 + i * 196, tile));
    this.buildBottomNav();
    void this.refreshWallet();
  }

  private openFreeCoins(): void {
    openFreeCoins(this, (coins) => this.coins.setCoins(coins));
  }

  private buildTopBar(): void {
    const session = getSession();
    panel(this, GAME_WIDTH / 2, 76, GAME_WIDTH - 24, 128, "glass");
    const face = avatar(this, 76, 76, session.nickname, session.userId, 84);
    pressable(face, () => this.scene.start("Profile"));
    this.add.text(136, 56, shortName(session.nickname), TEXT.heading).setOrigin(0, 0.5);
    this.winPoints = this.add
      .text(136, 96, `Win Points: ${session.winPoints}`, { ...TEXT.small, color: COLOR.goldText })
      .setOrigin(0, 0.5);
    this.coins = coinPill(this, 478, 76, session.coins, () => this.openFreeCoins());
    iconButton(this, 648, 76, "icon-gear", () => openSettings(this), { size: 76 });
  }

  private buildLogo(): void {
    const cx = GAME_WIDTH / 2;
    this.add
      .image(cx - 215, 262, "guti-flat")
      .setDisplaySize(130, 65)
      .setAngle(-28);
    this.add
      .image(cx + 215, 262, "guti-round")
      .setDisplaySize(130, 65)
      .setAngle(24);
    this.add.text(cx, 228, "CHAR", TEXT.hero).setOrigin(0.5);
    this.add.text(cx, 310, "GUTY", { ...TEXT.hero, color: COLOR.goldText }).setOrigin(0.5);
    this.add.text(cx, 384, "The village game of throws and tokkas", TEXT.small).setOrigin(0.5);
  }

  private buildModeTile(x: number, y: number, tile: ModeTile): void {
    const width = 640;
    const height = 176;
    const bg = this.add.nineslice(
      0,
      0,
      `btn-${tile.color}`,
      undefined,
      width,
      height,
      40,
      40,
      40,
      40,
    );
    const icon = this.add.image(-width / 2 + 96, -6, tile.icon).setDisplaySize(100, 100);
    const title = this.add
      .text(-width / 2 + 180, -30, tile.title, { ...TEXT.button, fontSize: "36px" })
      .setOrigin(0, 0.5);
    const subtitle = this.add
      .text(-width / 2 + 182, 24, tile.subtitle, { ...TEXT.body, fontSize: "22px" })
      .setOrigin(0, 0.5);
    const container = this.add.container(x, y, [bg, icon, title, subtitle]).setSize(width, height);
    pressable(container, () => this.open(tile.mode));
  }

  private open(mode: PlayMode): void {
    if (mode === "friends") this.scene.start("Friends");
    else this.scene.start("Arena", { mode } satisfies ArenaSceneData);
  }

  private buildBottomNav(): void {
    const y = GAME_HEIGHT - 80;
    panel(this, GAME_WIDTH / 2, y, GAME_WIDTH - 24, 136, "glass");
    const items = [
      { label: "Leaderboard", icon: "icon-trophy", open: () => this.scene.start("Leaderboard") },
      { label: "Free Coins", icon: "icon-gift", open: () => this.openFreeCoins() },
      { label: "Profile", icon: "icon-user", open: () => this.scene.start("Profile") },
    ];
    items.forEach((item, i) => {
      const icon = this.add.image(0, -18, item.icon).setDisplaySize(64, 64);
      const label = this.add.text(0, 34, item.label, TEXT.small).setOrigin(0.5);
      const button = this.add
        .container(GAME_WIDTH / 2 + (i - 1) * 226, y, [icon, label])
        .setSize(200, 124);
      pressable(button, item.open);
    });
  }

  private async refreshWallet(): Promise<void> {
    try {
      const wallet = await fetchWallet(getSession().token);
      updateBalance(wallet.coins, wallet.winPoints);
      if (!this.sys.isActive()) return;
      this.coins.setCoins(wallet.coins);
      this.winPoints.setText(`Win Points: ${wallet.winPoints}`);
    } catch {
      // Keep the balance the session already has.
    }
  }
}
