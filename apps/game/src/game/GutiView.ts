import { GUTI_RADIUS } from "@char-guty/game-core";
import Phaser from "phaser";
import { FIELD_SCALE } from "./field.js";

export type Side = "F" | "R";
export type Highlight = "none" | "candidate" | "active";

const RX = GUTI_RADIUS * FIELD_SCALE;
const RY = Math.round(RX * 0.7);

function textureFor(side: Side): string {
  return side === "F" ? "guti-flat" : "guti-round";
}

/**
 * A guti sprite (real art from public/assets, or BootScene's vector fallback under the
 * same texture key - this class doesn't know or care which it got). Side flips the
 * texture between the flat-up and round-up art.
 */
export class GutiView {
  readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Graphics;
  private side: Side;

  constructor(
    scene: Phaser.Scene,
    readonly id: number,
    side: Side,
    x: number,
    y: number,
  ) {
    this.side = side;
    this.ring = scene.add.graphics();
    this.sprite = scene.add.image(0, 0, textureFor(side)).setDisplaySize(RX * 2, RY * 2);
    this.container = scene.add.container(x, y, [this.sprite, this.ring]).setDepth(5);
    this.container.setSize(RX * 2, RY * 2);
    this.container.setInteractive(
      new Phaser.Geom.Circle(0, 0, RX + 8),
      Phaser.Geom.Circle.Contains,
    );
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setSide(side: Side): void {
    if (side === this.side) return;
    this.side = side;
    this.sprite.setTexture(textureFor(side)).setDisplaySize(RX * 2, RY * 2);
  }

  setHighlight(highlight: Highlight): void {
    this.ring.clear();
    if (highlight === "none") return;
    this.ring.lineStyle(4, highlight === "active" ? 0xffffff : 0xffd166, 0.95);
    this.ring.strokeEllipse(0, 0, RX * 2 + 14, RY * 2 + 14);
  }

  destroy(): void {
    this.container.destroy();
  }
}
