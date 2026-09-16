import Phaser from "phaser";
import { LANDSCAPE } from "../config.js";
import { signOutFirebase } from "../services/auth.js";
import { deleteAccount, fetchWallet } from "../services/net.js";
import { isCrazyGamesBuild } from "../services/platform.js";
import { forgetSession } from "../services/sessionStore.js";
import { clearSession, getSession, updateBalance } from "../state/session.js";
import { freeCoinsOffered, openFreeCoins } from "../ui/freeCoins.js";
import { COLOR, TEXT } from "../ui/theme.js";
import {
  avatar,
  dialog,
  glossyButton,
  menuBackground,
  notify,
  panel,
  screenHeader,
} from "../ui/widgets.js";
import type { CoinPill, GameButton } from "../ui/widgets.js";

type Point = readonly [x: number, y: number];
type Spot =
  "avatar" | "name" | "account" | "coins" | "points" | "leaderboard" | "signOut" | "deleteAccount";

/** Portrait: everything down the middle. Landscape: who you are on the left, your numbers on the right. */
const LAYOUT: Record<Spot, Point> = LANDSCAPE
  ? {
      avatar: [330, 300],
      name: [330, 460],
      account: [330, 515],
      coins: [780, 290],
      points: [1110, 290],
      leaderboard: [945, 480],
      signOut: [945, 610],
      deleteAccount: [945, 692],
    }
  : {
      avatar: [360, 330],
      name: [360, 492],
      account: [360, 548],
      coins: [195, 720],
      points: [525, 720],
      leaderboard: [360, 920],
      signOut: [360, 1050],
      deleteAccount: [360, 1170],
    };

export class ProfileScene extends Phaser.Scene {
  private pill!: CoinPill;
  private coinsValue!: Phaser.GameObjects.Text;
  private pointsValue!: Phaser.GameObjects.Text;

  constructor() {
    super("Profile");
  }

  create(): void {
    const session = getSession();
    menuBackground(this);
    this.pill = screenHeader(
      this,
      "Profile",
      () => this.scene.start("Home"),
      freeCoinsOffered
        ? () => openFreeCoins(this, (coins) => this.showBalance(coins, getSession().winPoints))
        : undefined,
    );

    avatar(this, ...LAYOUT.avatar, session.nickname, session.userId, 190);
    this.add.text(...LAYOUT.name, session.nickname, TEXT.title).setOrigin(0.5);
    this.add
      .text(
        ...LAYOUT.account,
        session.isGuest
          ? "Guest account on this device"
          : isCrazyGamesBuild
            ? "Signed in with CrazyGames"
            : "Signed in with Google or Facebook",
        TEXT.small,
      )
      .setOrigin(0.5);

    this.coinsValue = this.statCard(...LAYOUT.coins, "icon-coin", "Coins", session.coins);
    this.pointsValue = this.statCard(
      ...LAYOUT.points,
      "icon-trophy",
      "Win Points",
      session.winPoints,
    );

    glossyButton(
      this,
      ...LAYOUT.leaderboard,
      "LEADERBOARD",
      () => this.scene.start("Leaderboard"),
      { width: 460, height: 100, color: "blue", icon: "icon-trophy" },
    );
    // On CrazyGames, signing in and out is CrazyGames' business, not the game's.
    if (!isCrazyGamesBuild) {
      glossyButton(this, ...LAYOUT.signOut, "SIGN OUT", () => this.confirmSignOut(), {
        width: 460,
        height: 100,
        color: "gray",
      });
      // The stores require that an account made in the game can be deleted from it too.
      this.add
        .text(...LAYOUT.deleteAccount, "Delete account", { ...TEXT.small, color: COLOR.lose })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.confirmDeleteAccount());
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

  private confirmDeleteAccount(): void {
    const box = dialog(this, "Delete Account?", 600, 500);
    const warning = this.add
      .text(
        0,
        -40,
        "Your player, coins and win points\nare deleted for good.\nThis can't be undone.",
        { ...TEXT.body, align: "center" },
      )
      .setOrigin(0.5);
    const confirm = glossyButton(this, 0, 150, "DELETE", () => void this.deleteAccount(confirm), {
      width: 360,
      height: 92,
      color: "orange",
    });
    box.add(warning, confirm.container);
  }

  private async deleteAccount(button: GameButton): Promise<void> {
    button.setEnabled(false);
    try {
      await deleteAccount(getSession().token);
    } catch {
      button.setEnabled(true);
      if (this.sys.isActive()) {
        notify(this, "Couldn't delete the account - check your connection and try again");
      }
      return;
    }
    await this.signOut();
  }

  private async signOut(): Promise<void> {
    forgetSession();
    clearSession();
    await signOutFirebase().catch(() => undefined);
    this.scene.start("Login");
  }
}
