import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import { t } from "../i18n/index.js";
import { signInWithFacebook, signInWithGoogle } from "../services/auth.js";
import { fetchGuestToken, fetchWallet } from "../services/net.js";
import { setSession } from "../state/session.js";
import { COLORS, createButton, TEXT_STYLES } from "../ui/kit.js";
import type { ButtonHandle } from "../ui/kit.js";

export class LoginScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private buttons: ButtonHandle[] = [];

  constructor() {
    super("Login");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.buttons = [];

    this.add.text(GAME_WIDTH / 2, 240, t("loginTitle"), TEXT_STYLES.title).setOrigin(0.5);

    this.buttons.push(
      createButton(this, GAME_WIDTH / 2, 620, t("loginGoogle"), () => {
        void this.handle(signInWithGoogle(), false);
      }),
    );
    this.buttons.push(
      createButton(this, GAME_WIDTH / 2, 730, t("loginFacebook"), () => {
        void this.handle(signInWithFacebook(), false);
      }),
    );
    this.buttons.push(
      createButton(
        this,
        GAME_WIDTH / 2,
        840,
        t("loginGuest"),
        () => {
          void this.handle(fetchGuestToken("Guest"), true);
        },
        { color: COLORS.secondary, hoverColor: COLORS.secondaryHover },
      ),
    );

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 120, "", TEXT_STYLES.muted)
      .setOrigin(0.5);
  }

  private async handle(
    signIn: Promise<{ token: string; nickname: string }>,
    isGuest: boolean,
  ): Promise<void> {
    this.setButtonsEnabled(false);
    this.statusText.setText(t("signingIn"));
    try {
      const { token, nickname } = await signIn;
      const wallet = await fetchWallet(token, nickname);
      setSession({
        userId: wallet.userId,
        token,
        nickname: wallet.nickname,
        isGuest,
        coins: wallet.coins,
        winPoints: wallet.winPoints,
      });
      this.scene.start("Lobby");
    } catch (err) {
      this.statusText.setText(err instanceof Error ? err.message : String(err));
      this.setButtonsEnabled(true);
    }
  }

  private setButtonsEnabled(enabled: boolean): void {
    for (const button of this.buttons) button.setEnabled(enabled);
  }
}
