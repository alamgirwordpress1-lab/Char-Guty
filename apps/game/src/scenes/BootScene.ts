import Phaser from "phaser";
import { GAME_WIDTH } from "../config.js";
import { getMockGame } from "../dev.js";
import { currentFirebaseSession, isFirebaseConfigured } from "../services/auth.js";
import { fetchWallet } from "../services/net.js";
import { reportLoadingProgress, startPlatformGame } from "../services/platform.js";
import { forgetSession, loadSession, saveSession } from "../services/sessionStore.js";
import { isSoundOn } from "../services/settings.js";
import { setSession } from "../state/session.js";
import { COLOR, FONT } from "../ui/theme.js";
import { glossyButton } from "../ui/widgets.js";

const ICONS = [
  "back",
  "close",
  "user",
  "users",
  "home",
  "share",
  "sound-on",
  "sound-off",
  "globe",
  "robot",
  "gear",
  "coin",
  "trophy",
  "gift",
  "crown",
];

const IMAGES = [
  "guti-flat",
  "guti-round",
  "courtyard-bg",
  "ui-bg",
  "btn-green",
  "btn-orange",
  "btn-blue",
  "btn-gray",
  "panel-glass",
  "panel-card",
  "board-frame",
  "avatar-ring",
  "burst",
  ...ICONS.map((icon) => `icon-${icon}`),
];

const SOUNDS: readonly (readonly [key: string, file: string])[] = [
  ["sfx-throw", "throw.wav"],
  ["sfx-land", "land.wav"],
  ["sfx-tokka-hit", "tokka-hit.wav"],
  ["sfx-die", "die.wav"],
  ["sfx-win", "win.wav"],
];

type Restored = "signed-in" | "signed-out" | "offline";

/**
 * The loading screen: loads every asset behind a progress bar, waits for the game font,
 * then signs the player straight back in if this device remembers them. Any image that
 * fails to load is replaced by a plain placeholder under the same key; a missing sound
 * is just skipped where it would play.
 */
export class BootScene extends Phaser.Scene {
  private readonly failedImages = new Set<string>();
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super("Boot");
  }

  preload(): void {
    const cx = GAME_WIDTH / 2;
    this.cameras.main.setBackgroundColor(COLOR.navy);
    this.add
      .text(cx, 520, "CHAR GUTY", { fontFamily: FONT, fontSize: "76px", fontStyle: "700" })
      .setOrigin(0.5);
    const barWidth = 480;
    this.add.rectangle(cx, 680, barWidth + 16, 44, COLOR.deepNavy).setStrokeStyle(4, 0x6b9cf0);
    const fill = this.add.rectangle(cx - barWidth / 2, 680, 0, 28, COLOR.gold).setOrigin(0, 0.5);
    this.status = this.add
      .text(cx, 750, "Loading 0%", { fontFamily: FONT, fontSize: "26px", color: COLOR.muted })
      .setOrigin(0.5);

    this.load.on("progress", (progress: number) => {
      fill.setSize(barWidth * progress, 28);
      this.status.setText(`Loading ${Math.round(progress * 100)}%`);
      reportLoadingProgress(progress);
    });
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      if (file.type === "image") this.failedImages.add(file.key);
    });
    // Relative, so the same build loads from a site root and from Facebook's hosting path.
    for (const key of IMAGES) this.load.image(key, `assets/${key}.png`);
    for (const [key, file] of SOUNDS) this.load.audio(key, [`assets/${file}`]);
  }

  create(): void {
    document.getElementById("boot-loader")?.remove();
    this.generatePlaceholders();
    this.sound.mute = !isSoundOn();
    void this.enterGame();
  }

  private async enterGame(): Promise<void> {
    await startPlatformGame();
    await waitForFont();
    const mock = getMockGame();
    if (mock !== null) {
      this.scene.start("Game", mock);
      return;
    }
    this.status.setText("Signing in...");
    const restored = await restoreSession();
    if (restored === "offline") {
      this.status.setText("Can't reach the game server").setColor(COLOR.lose);
      glossyButton(this, GAME_WIDTH / 2, 880, "TRY AGAIN", () => this.scene.restart(), {
        width: 340,
        height: 96,
      });
      return;
    }
    this.scene.start(restored === "signed-in" ? "Home" : "Login");
  }

  private generatePlaceholders(): void {
    const g = this.add.graphics();
    for (const key of this.failedImages) {
      const color = key === "guti-flat" ? 0xf2c341 : key === "guti-round" ? 0x55341b : 0x3067c9;
      g.fillStyle(color, 1).fillRoundedRect(0, 0, 128, 64, 16);
      g.generateTexture(key, 128, 64);
      g.clear();
    }
    g.destroy();
  }
}

/** Phaser renders each text once, so the web font has to be ready before any scene draws. */
async function waitForFont(): Promise<void> {
  const loads = Promise.all([
    document.fonts.load(`700 40px ${FONT}`),
    document.fonts.load(`500 24px ${FONT}`),
  ]);
  const giveUp = new Promise((resolve) => setTimeout(resolve, 4000));
  await Promise.race([loads, giveUp]).catch(() => undefined);
}

/** Signs back in with the account this device remembers; forgets it only if it's no longer valid. */
async function restoreSession(): Promise<Restored> {
  const stored = loadSession();
  if (stored === null) return "signed-out";
  try {
    let token = stored.token;
    if (!stored.isGuest) {
      const current = isFirebaseConfigured() ? await currentFirebaseSession() : null;
      if (current === null) {
        forgetSession();
        return "signed-out";
      }
      token = current.token;
    }
    const wallet = await fetchWallet(token);
    setSession({
      userId: wallet.userId,
      token,
      nickname: wallet.nickname,
      isGuest: stored.isGuest,
      coins: wallet.coins,
      winPoints: wallet.winPoints,
    });
    saveSession({ token, nickname: wallet.nickname, isGuest: stored.isGuest });
    return "signed-in";
  } catch (err) {
    if (err instanceof Error && /\(401\)/.test(err.message)) {
      forgetSession();
      return "signed-out";
    }
    return "offline";
  }
}
