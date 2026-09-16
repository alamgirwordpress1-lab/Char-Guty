import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, LANDSCAPE } from "../config.js";
import { isFirebaseConfigured, signInWithFacebook, signInWithGoogle } from "../services/auth.js";
import { completeSignIn, guestSignIn } from "../services/signIn.js";
import type { SignIn } from "../services/signIn.js";
import { COLOR, TEXT } from "../ui/theme.js";
import { glossyButton, menuBackground } from "../ui/widgets.js";
import type { GameButton } from "../ui/widgets.js";

/** Portrait: the logo above the buttons. Landscape: the logo on the left, the buttons on the right. */
const LAYOUT = LANDSCAPE
  ? {
      logoX: 380,
      gutisY: 190,
      charY: 330,
      gutyY: 440,
      taglineY: 528,
      buttonsX: 930,
      guestY: 330,
      guestAboveSocialY: 250,
      googleY: 370,
      facebookY: 490,
      statusY: 610,
      statusWrap: 560,
      footerY: 690,
    }
  : {
      logoX: GAME_WIDTH / 2,
      gutisY: 320,
      charY: 470,
      gutyY: 580,
      taglineY: 668,
      buttonsX: GAME_WIDTH / 2,
      guestY: 830,
      guestAboveSocialY: 830,
      googleY: 965,
      facebookY: 1085,
      statusY: GAME_HEIGHT - 120,
      statusWrap: 600,
      footerY: GAME_HEIGHT - 50,
    };

export class LoginScene extends Phaser.Scene {
  private buttons: GameButton[] = [];
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super("Login");
  }

  create(): void {
    const x = LAYOUT.logoX;
    this.buttons = [];
    menuBackground(this);

    this.add
      .image(x - 160, LAYOUT.gutisY, "guti-flat")
      .setDisplaySize(210, 105)
      .setAngle(-20);
    this.add
      .image(x + 160, LAYOUT.gutisY + 25, "guti-round")
      .setDisplaySize(210, 105)
      .setAngle(16);
    this.add.text(x, LAYOUT.charY, "CHAR", { ...TEXT.hero, fontSize: "100px" }).setOrigin(0.5);
    this.add
      .text(x, LAYOUT.gutyY, "GUTY", { ...TEXT.hero, fontSize: "100px", color: COLOR.goldText })
      .setOrigin(0.5);
    this.add
      .text(x, LAYOUT.taglineY, "The village game of throws and tokkas", TEXT.body)
      .setOrigin(0.5);

    // Only offered once the Firebase web config is set - without it these always fail.
    const social = isFirebaseConfigured();
    const bx = LAYOUT.buttonsX;
    this.buttons.push(
      glossyButton(
        this,
        bx,
        social ? LAYOUT.guestAboveSocialY : LAYOUT.guestY,
        "PLAY AS GUEST",
        () => void this.signIn(guestSignIn(), true),
        { width: 540, height: 112, color: "green", icon: "icon-user" },
      ),
    );
    if (social) {
      this.buttons.push(
        glossyButton(
          this,
          bx,
          LAYOUT.googleY,
          "SIGN IN WITH GOOGLE",
          () => void this.signIn(signInWithGoogle(), false),
          { width: 540, height: 100, color: "blue", fontSize: 32 },
        ),
        glossyButton(
          this,
          bx,
          LAYOUT.facebookY,
          "SIGN IN WITH FACEBOOK",
          () => void this.signIn(signInWithFacebook(), false),
          { width: 540, height: 100, color: "blue", fontSize: 32 },
        ),
      );
    }

    this.status = this.add
      .text(bx, LAYOUT.statusY, "", {
        ...TEXT.body,
        align: "center",
        wordWrap: { width: LAYOUT.statusWrap },
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, LAYOUT.footerY, "Free to play · no purchases, ever", TEXT.small)
      .setOrigin(0.5);
  }

  private async signIn(attempt: Promise<SignIn>, isGuest: boolean): Promise<void> {
    this.setBusy(true);
    this.status.setText("Signing in...").setColor(COLOR.muted);
    try {
      await completeSignIn(attempt, isGuest);
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

function describeSignInError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/popup-closed|cancelled-popup/i.test(message)) return "Sign-in was cancelled";
  if (/failed to fetch|networkerror/i.test(message)) {
    return "Can't reach the game server. Check your connection and try again.";
  }
  return "Sign-in didn't work. Please try again.";
}
