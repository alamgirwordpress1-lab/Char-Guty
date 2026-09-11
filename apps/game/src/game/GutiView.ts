import { GUTI_RADIUS } from "@char-guty/game-core";
import Phaser from "phaser";
import { FIELD_SCALE } from "./field.js";

export type Side = "F" | "R";
export type Highlight = "none" | "active";

const R = GUTI_RADIUS * FIELD_SCALE;
/** A round stick split lengthwise, seen from above: about twice as long as it is wide. */
const LENGTH = R * 2.3;
const WIDTH = R * 1.15;
const RING_RADIUS = R * 1.25 + 7;
const HIT_SIZE = (R + 10) * 2;

function textureFor(side: Side): string {
  return side === "F" ? "guti-flat" : "guti-round";
}

/**
 * The angle a guti lies at, hashed from its landing spot in server coordinates so every
 * client draws the same scatter. Integer-only, since float trig can differ across engines.
 * A split stick looks the same turned 180 degrees, so -90..90 covers every orientation.
 */
export function restingAngle(x: number, y: number): number {
  let h = Math.imul(Math.round(x * 100), 0x9e3779b1) ^ Math.imul(Math.round(y * 100), 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 180 - 90;
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
    angle: number,
  ) {
    this.side = side;
    this.ring = scene.add.graphics();
    this.sprite = scene.add.image(0, 0, textureFor(side)).setDisplaySize(LENGTH, WIDTH);
    this.container = scene.add
      .container(x, y, [this.sprite, this.ring])
      .setDepth(5)
      .setAngle(angle);
    this.container.setSize(HIT_SIZE, HIT_SIZE);
    // A container's hit area is measured from the top-left of its size box, not its centre.
    this.container.setInteractive(
      new Phaser.Geom.Circle(HIT_SIZE / 2, HIT_SIZE / 2, HIT_SIZE / 2),
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
    this.sprite.setTexture(textureFor(side)).setDisplaySize(LENGTH, WIDTH);
  }

  setHighlight(highlight: Highlight): void {
    this.ring.clear();
    if (highlight === "none") return;
    this.ring.lineStyle(4, 0xffd166, 0.95);
    this.ring.strokeCircle(0, 0, RING_RADIUS);
  }

  destroy(): void {
    this.container.destroy();
  }
}
