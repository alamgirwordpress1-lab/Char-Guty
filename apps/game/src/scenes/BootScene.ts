import Phaser from "phaser";

/** No external assets: every texture used later is generated here from vector shapes. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const g = this.add.graphics();

    g.fillStyle(0xf4f4f4, 1);
    g.fillCircle(32, 32, 32);
    g.generateTexture("guti-flat", 64, 64);

    g.clear();
    g.fillStyle(0xc8a24a, 1);
    g.fillCircle(28, 28, 28);
    g.generateTexture("guti-round", 56, 56);

    g.clear();
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(0, 0, 64, 64, 12);
    g.generateTexture("tile", 64, 64);

    g.destroy();

    this.scene.start("Login");
  }
}
