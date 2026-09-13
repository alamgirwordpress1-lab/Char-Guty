import Phaser from "phaser";
import { GAME_WIDTH } from "../config.js";
import { signOutFirebase } from "../services/auth.js";
import { fetchWallet } from "../services/net.js";
import { isCrazyGamesBuild } from "../services/platform.js";
import { forgetSession } from "../services/sessionStore.js";
import { clearSession, getSession, updateBalance } from "../state/session.js";
import { openFreeCoins } from "../ui/freeCoins.js";
import { COLOR, TEXT } from "../ui/theme.js";
import {
  avatar,
  dialog,
  glossyButton,
  menuBackground,
  panel,
  screenHeader,
} from "../ui/widgets.js";
import type { CoinPill } from "../ui/widgets.js";

export class ProfileScene extends Phaser.Scene {
  private pill!: CoinPill;
  private coinsValue!: Phaser.GameObjects.Text;
  private pointsValue!: Phaser.GameObjects.Text;

  constructor() {
    super("Profile");
  }

  create(): void {
    const session = getSession();
    const cx = GAME_WIDTH / 2;
    menuBackground(this);
    this.pill = screenHeader(
      this,
      "Profile",
      () => this.scene.start("Home"),
      () => openFreeCoins(this, (coins) => this.showBalance(coins, getSession().winPoints)),
    );

    avatar(this, cx, 330, session.nickname, session.userId, 190);
    this.add.text(cx, 492, session.nickname, TEXT.title).setOrigin(0.5);
    this.add
      .text(
        cx,
        548,
        session.isGuest
          ? "Guest account on this device"
          : isCrazyGamesBuild
            ? "Signed in with CrazyGames"
            : "Signed in with Google or Facebook",
        TEXT.small,
      )
      .setOrigin(0.5);

    this.coinsValue = this.statCard(cx - 165, 720, "icon-coin", "Coins", session.coins);
    this.pointsValue = this.statCard(cx + 165, 720, "icon-trophy", "Win Points", session.winPoints);

    glossyButton(this, cx, 920, "LEADERBOARD", () => this.scene.start("Leaderboard"), {
      width: 460,
      height: 100,
      color: "blue",
      icon: "icon-trophy",
    });
    // On CrazyGames, signing in and out is CrazyGames' business, not the game's.
    if (!isCrazyGamesBuild) {
      glossyButton(this, cx, 1050, "SIGN OUT", () => this.confirmSignOut(), {
        width: 460,
        height: 100,
        color: "gray",
      });
    }
    void this.refreshWallet();
  }

  private statCard(
    x: number,
    y: number,
    icon: string,
    label: string,
    value: number,
  ): Phaser.GameObjects.Text {
    panel(this, x, y, 300, 200, "card");
    this.add.image(x, y - 48, icon).setDisplaySize(72, 72);
    const text = this.add
      .text(x, y + 22, String(value), { ...TEXT.title, fontSize: "40px", color: COLOR.goldText })
      .setOrigin(0.5);
    this.add.text(x, y + 70, label, TEXT.small).setOrigin(0.5);
    return text;
  }

  private showBalance(coins: number, winPoints: number): void {
    this.pill.setCoins(coins);
    this.coinsValue.setText(String(coins));
    this.pointsValue.setText(String(winPoints));
  }

  private async refreshWallet(): Promise<void> {
    try {
      const wallet = await fetchWallet(getSession().token);
      updateBalance(wallet.coins, wallet.winPoints);
      if (this.sys.isActive()) this.showBalance(wallet.coins, wallet.winPoints);
    } catch {
      // Keep the balance the session already has.
    }
  }

  /** A guest account lives only on this device, so signing out of one loses it for good. */
  private confirmSignOut(): void {
    if (!getSession().isGuest) {
      void this.signOut();
      return;
    }
    const box = dialog(this, "Sign Out?", 600, 480);
    const warning = this.add
      .text(
        0,
        -30,
        "A guest account can't be\nrecovered after signing out,\nand its coins are lost.",
        {
          ...TEXT.body,
          align: "center",
        },
      )
      .setOrigin(0.5);
    const confirm = glossyButton(this, 0, 140, "SIGN OUT", () => void this.signOut(), {
      width: 360,
      height: 92,
      color: "orange",
    });
    box.add(warning, confirm.container);
  }

  private async signOut(): Promise<void> {
    forgetSession();
    clearSession();
    await signOutFirebase().catch(() => undefined);
    this.scene.start("Login");
  }
}
