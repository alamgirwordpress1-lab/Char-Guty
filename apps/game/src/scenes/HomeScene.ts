import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, LANDSCAPE } from "../config.js";
import { STARTER_ARENA } from "../game/arenas.js";
import { createTutorialGame, hasSeenTutorial } from "../game/tutorial.js";
import { fetchWallet } from "../services/net.js";
import {
  isCrazyGamesBuild,
  takeInstantMultiplayer,
  takeInvitedRoomCode,
} from "../services/platform.js";
import { getSession, updateBalance } from "../state/session.js";
import { freeCoinsOffered, openFreeCoins } from "../ui/freeCoins.js";
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

/**
 * Portrait: the logo, the three modes stacked under it, the nav along the bottom.
 * Landscape: the logo with the nav under it on the left, the modes stacked on the right.
 */
const LAYOUT = LANDSCAPE
  ? {
      logo: { x: 330, y: 266 },
      tiles: { x: 950, y: 258, step: 162, width: 600, height: 150, icon: 90, font: 34 },
      nav: { x: 330, y: 600, width: 580, step: 140 },
    }
  : {
      logo: { x: GAME_WIDTH / 2, y: 228 },
      tiles: { x: GAME_WIDTH / 2, y: 560, step: 196, width: 640, height: 176, icon: 100, font: 36 },
      nav: { x: GAME_WIDTH / 2, y: GAME_HEIGHT - 80, width: GAME_WIDTH - 24, step: 170 },
    };

export class HomeScene extends Phaser.Scene {
  private coins!: CoinPill;
  private winPoints!: Phaser.GameObjects.Text;

  constructor() {
    super("Home");
  }

  create(): void {
    // An invite (Facebook's, a CrazyGames link, a ?room= link) opens the inviter's room, once.
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
    // Launched from CrazyGames' own multiplayer button: straight into a new private room.
    if (takeInstantMultiplayer()) {
      this.scene.start("Matchmaking", {
        mode: "friends",
        playerCount: 2,
        pot: STARTER_ARENA.pot,
      } satisfies MatchmakingSceneData);
      return;
    }
    // A first visit starts with the tutorial: playing straight away, rules learnt on the mat.
    if (!hasSeenTutorial()) {
      this.scene.start("Game", createTutorialGame());
      return;
    }

    menuBackground(this);
    this.buildTopBar();
    this.buildLogo();
    const { tiles } = LAYOUT;
    MODES.forEach((tile, i) => this.buildModeTile(tiles.x, tiles.y + i * tiles.step, tile));
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
    const onPlus = freeCoinsOffered ? () => this.openFreeCoins() : undefined;
    this.coins = coinPill(this, GAME_WIDTH - 242, 76, session.coins, onPlus);
    iconButton(this, GAME_WIDTH - 72, 76, "icon-gear", () => openSettings(this), { size: 76 });
  }

  private buildLogo(): void {
    const { x, y } = LAYOUT.logo;
    this.add
      .image(x - 215, y + 34, "guti-flat")
      .setDisplaySize(130, 65)
      .setAngle(-28);
    this.add
      .image(x + 215, y + 34, "guti-round")
      .setDisplaySize(130, 65)
      .setAngle(24);
    this.add.text(x, y, "CHAR", TEXT.hero).setOrigin(0.5);
    this.add.text(x, y + 82, "GUTY", { ...TEXT.hero, color: COLOR.goldText }).setOrigin(0.5);
    this.add.text(x, y + 156, "The village game of throws and tokkas", TEXT.small).setOrigin(0.5);
  }

  private buildModeTile(x: number, y: number, tile: ModeTile): void {
    const { width, height, icon: iconSize, font } = LAYOUT.tiles;
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
    const icon = this.add.image(-width / 2 + 96, -6, tile.icon).setDisplaySize(iconSize, iconSize);
    const title = this.add
      .text(-width / 2 + 180, -height * 0.17, tile.title, { ...TEXT.button, fontSize: `${font}px` })
      .setOrigin(0, 0.5);
    const subtitle = this.add
      .text(-width / 2 + 182, height * 0.14, tile.subtitle, { ...TEXT.body, fontSize: "22px" })
      .setOrigin(0, 0.5);
    const container = this.add.container(x, y, [bg, icon, title, subtitle]).setSize(width, height);
    pressable(container, () => this.open(tile.mode));
  }

  private open(mode: PlayMode): void {
    if (mode === "friends") {
      this.scene.start("Friends");
      return;
    }
    // CrazyGames wants play one tap away, so there the first table starts straight away -
    // unless its entry is more than the player has, and the tables show why.
    const affordable = mode === "computer" || getSession().coins >= STARTER_ARENA.pot / 2;
    if (isCrazyGamesBuild && affordable) {
      this.scene.start("Matchmaking", {
        mode,
        playerCount: 2,
        pot: STARTER_ARENA.pot,
      } satisfies MatchmakingSceneData);
      return;
    }
    this.scene.start("Arena", { mode } satisfies ArenaSceneData);
  }

  private buildBottomNav(): void {
    const { x, y, width, step } = LAYOUT.nav;
    panel(this, x, y, width, 136, "glass");
    const items = [
      { label: "Leaderboard", icon: "icon-trophy", open: () => this.scene.start("Leaderboard") },
      ...(freeCoinsOffered
        ? [{ label: "Free Coins", icon: "icon-gift", open: () => this.openFreeCoins() }]
        : []),
      {
        label: "How to Play",
        icon: "guti-flat",
        open: () => this.scene.start("Game", createTutorialGame()),
      },
      { label: "Profile", icon: "icon-user", open: () => this.scene.start("Profile") },
    ];
    items.forEach((item, i) => {
      const image = this.add.image(0, -18, item.icon);
      // The guti art is twice as wide as it is tall; the icons are square.
      if (item.icon === "guti-flat") image.setDisplaySize(80, 40).setAngle(-20);
      else image.setDisplaySize(64, 64);
      const label = this.add.text(0, 34, item.label, TEXT.small).setOrigin(0.5);
      const button = this.add
        .container(x + (i - (items.length - 1) / 2) * step, y, [image, label])
        .setSize(step - 10, 124);
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
