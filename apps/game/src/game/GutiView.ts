import { GUTI_RADIUS } from "@char-guty/game-core";
import Phaser from "phaser";
import { FIELD_SCALE } from "./field.js";

export type Side = "F" | "R";
export type Highlight = "none" | "candidate" | "active";

const RX = GUTI_RADIUS * FIELD_SCALE;
const RY = Math.round(RX * 0.7);
const BODY = 0xa8825a;
const FLAT_TOP = 0xf1e7d3;
const ROUND_TOP = 0x6b4a2a;
const OUTLINE = 0x3b2a18;

function halfEllipse(rx: number, ry: number): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (Math.PI * i) / 24;
    points.push(new Phaser.Math.Vector2(rx * Math.cos(a), ry * Math.sin(a)));
  }
  return points;
}

/** A guti drawn as an ellipse whose top half is the face-up side: flat = light, round = dark. */
export class GutiView {
  readonly container: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Graphics;
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
    this.body = scene.add.graphics();
    this.container = scene.add.container(x, y, [this.ring, this.body]).setDepth(5);
    this.container.setSize(RX * 2, RY * 2);
    this.container.setInteractive(
      new Phaser.Geom.Circle(0, 0, RX + 8),
      Phaser.Geom.Circle.Contains,
    );
    this.draw();
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
    this.draw();
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

  private draw(): void {
    const g = this.body;
    g.clear();
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(3, 4, RX * 2, RY * 2);
    g.fillStyle(BODY, 1);
    g.fillEllipse(0, 0, RX * 2, RY * 2);
    g.fillStyle(this.side === "F" ? FLAT_TOP : ROUND_TOP, 1);
    g.fillPoints(halfEllipse(RX, RY), true);
    if (this.side === "R") {
      g.fillStyle(0xffffff, 0.3);
      g.fillEllipse(-RX * 0.35, -RY * 0.45, RX * 0.5, RY * 0.35);
    }
    g.lineStyle(2, OUTLINE, 0.9);
    g.strokeEllipse(0, 0, RX * 2, RY * 2);
  }
}
