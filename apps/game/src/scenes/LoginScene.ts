import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import { isFirebaseConfigured, signInWithFacebook, signInWithGoogle } from "../services/auth.js";
import { fetchGuestToken, fetchWallet } from "../services/net.js";
import { saveSession } from "../services/sessionStore.js";
import { setSession } from "../state/session.js";
import { COLOR, TEXT } from "../ui/theme.js";
import { glossyButton, menuBackground } from "../ui/widgets.js";
import type { GameButton } from "../ui/widgets.js";

interface SignIn {
  readonly token: string;
  readonly nickname: string;
}

export class LoginScene extends Phaser.Scene {
  private buttons: GameButton[] = [];
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super("Login");
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.buttons = [];
    menuBackground(this);

    this.add
      .image(cx - 160, 320, "guti-flat")
      .setDisplaySize(210, 105)
      .setAngle(-20);
    this.add
      .image(cx + 160, 345, "guti-round")
      .setDisplaySize(210, 105)
      .setAngle(16);
    this.add.text(cx, 470, "CHAR", { ...TEXT.hero, fontSize: "100px" }).setOrigin(0.5);
    this.add
      .text(cx, 580, "GUTY", { ...TEXT.hero, fontSize: "100px", color: COLOR.goldText })
      .setOrigin(0.5);
    this.add.text(cx, 668, "The village game of throws and tokkas", TEXT.body).setOrigin(0.5);

    this.buttons.push(
      glossyButton(this, cx, 830, "PLAY AS GUEST", () => void this.signIn(guestSignIn(), true), {
        width: 540,
        height: 112,
        color: "green",
        icon: "icon-user",
      }),
    );
    // Only offered once the Firebase web config is set - without it these always fail.
    if (isFirebaseConfigured()) {
      this.buttons.push(
        glossyButton(
          this,
          cx,
          965,
          "SIGN IN WITH GOOGLE",
          () => void this.signIn(signInWithGoogle(), false),
          { width: 540, height: 100, color: "blue", fontSize: 32 },
        ),
        glossyButton(
          this,
          cx,
          1085,
          "SIGN IN WITH FACEBOOK",
          () => void this.signIn(signInWithFacebook(), false),
          { width: 540, height: 100, color: "blue", fontSize: 32 },
        ),
      );
    }

    this.status = this.add
      .text(cx, GAME_HEIGHT - 120, "", { ...TEXT.body, align: "center", wordWrap: { width: 600 } })
      .setOrigin(0.5);
    this.add
      .text(cx, GAME_HEIGHT - 50, "Free to play · no purchases, ever", TEXT.small)
      .setOrigin(0.5);
  }

  private async signIn(attempt: Promise<SignIn>, isGuest: boolean): Promise<void> {
    this.setBusy(true);
    this.status.setText("Signing in...").setColor(COLOR.muted);
    try {
      const { token, nickname } = await attempt;
      const wallet = await fetchWallet(token, nickname);
      setSession({
        userId: wallet.userId,
        token,
        nickname: wallet.nickname,
        isGuest,
        coins: wallet.coins,
        winPoints: wallet.winPoints,
      });
      saveSession({ token, nickname: wallet.nickname, isGuest });
      this.scene.start("Home");
    } catch (err) {
      console.error(err);
      this.status.setText(describeSignInError(err)).setColor(COLOR.lose);
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean): void {
    for (const button of this.buttons) button.setEnabled(!busy);
  }
}

/** A new guest gets a numbered handle, so the leaderboard isn't a wall of identical names. */
function guestSignIn(): Promise<SignIn> {
  return fetchGuestToken(`Guest${Math.floor(1000 + Math.random() * 9000)}`);
}

function describeSignInError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/popup-closed|cancelled-popup/i.test(message)) return "Sign-in was cancelled";
  if (/failed to fetch|networkerror/i.test(message)) {
    return "Can't reach the game server. Check your connection and try again.";
  }
  return "Sign-in didn't work. Please try again.";
}
