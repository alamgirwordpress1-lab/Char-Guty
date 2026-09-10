import Phaser from "phaser";
import { getMockGame } from "../dev.js";

const IMAGE_ASSETS: readonly { key: string; url: string }[] = [
  { key: "guti-flat", url: "/assets/guti-flat.png" },
  { key: "guti-round", url: "/assets/guti-round.png" },
  { key: "courtyard-bg", url: "/assets/courtyard-bg.png" },
  { key: "panel-9slice", url: "/assets/panel-9slice.png" },
];

const AUDIO_ASSETS: readonly { key: string; url: string }[] = [
  { key: "sfx-throw", url: "/assets/throw.wav" },
  { key: "sfx-land", url: "/assets/land.wav" },
  { key: "sfx-tokka-hit", url: "/assets/tokka-hit.wav" },
  { key: "sfx-die", url: "/assets/die.wav" },
  { key: "sfx-win", url: "/assets/win.wav" },
];

/**
 * Loads the real art/audio from public/assets. Anything that fails to load (missing
 * file, 404) falls back to a plain vector-drawn placeholder generated under the same
 * key, so the rest of the game never needs to know which one it got. Audio has no
 * synthesized fallback - a missing sound is just silently skipped where it's played.
 */
export class BootScene extends Phaser.Scene {
  private readonly failedImages = new Set<string>();

  constructor() {
    super("Boot");
  }

  preload(): void {
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      if (file.type === "image") this.failedImages.add(file.key);
    });
    for (const asset of IMAGE_ASSETS) this.load.image(asset.key, asset.url);
    for (const asset of AUDIO_ASSETS) this.load.audio(asset.key, [asset.url]);
  }

  create(): void {
    this.generateFallbackTextures();

    const mock = getMockGame();
    if (mock !== null) this.scene.start("Game", mock);
    else this.scene.start("Login");
  }

  private generateFallbackTextures(): void {
    const g = this.add.graphics();

    if (this.failedImages.has("guti-flat")) {
      g.fillStyle(0xf4f4f4, 1);
      g.fillCircle(32, 32, 32);
      g.generateTexture("guti-flat", 64, 64);
      g.clear();
    }

    if (this.failedImages.has("guti-round")) {
      g.fillStyle(0xc8a24a, 1);
      g.fillCircle(28, 28, 28);
      g.generateTexture("guti-round", 56, 56);
      g.clear();
    }

    if (this.failedImages.has("courtyard-bg")) {
      g.fillStyle(0x9a7443, 1);
      g.fillRect(0, 0, 256, 192);
      g.lineStyle(6, 0x4a2f16, 1);
      g.strokeRect(3, 3, 250, 186);
      g.generateTexture("courtyard-bg", 256, 192);
      g.clear();
    }

    if (this.failedImages.has("panel-9slice")) {
      g.fillStyle(0x1b2a38, 1);
      g.fillRoundedRect(0, 0, 96, 96, 14);
      g.lineStyle(2, 0x2f4356, 1);
      g.strokeRoundedRect(1, 1, 94, 94, 13);
      g.generateTexture("panel-9slice", 96, 96);
      g.clear();
    }

    g.destroy();
  }
}
