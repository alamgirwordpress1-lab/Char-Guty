import Phaser from "phaser";
import { COLOR, TEXT } from "./theme.js";
import { avatar, panel, shortName } from "./widgets.js";

const HEIGHT = 124;
const AVATAR = 84;

export interface PanelSeat {
  readonly name: string;
  readonly id: string;
  readonly isMe: boolean;
}

/** A seat at the table: avatar, name and score, with a ring that runs down during their turn. */
export class PlayerPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly score: Phaser.GameObjects.Text;
  private readonly avatarX: number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, seat: PanelSeat) {
    const left = -width / 2;
    this.avatarX = left + 64;
    this.highlight = scene.add.graphics();
    this.highlight
      .lineStyle(5, COLOR.gold, 1)
      .strokeRoundedRect(left + 2, -HEIGHT / 2 + 2, width - 4, HEIGHT - 4, 24)
      .setVisible(false);
    this.ring = scene.add.graphics();
    const label = seat.isMe ? "You" : shortName(seat.name, width >= 320 ? 12 : 7);
    const name = scene.add
      .text(left + 122, -22, label, { ...TEXT.heading, fontSize: "26px" })
      .setOrigin(0, 0.5);
    this.score = scene.add
      .text(left + 122, 22, "", { ...TEXT.body, color: COLOR.goldText })
      .setOrigin(0, 0.5);
    this.container = scene.add.container(x, y, [
      panel(scene, 0, 0, width, HEIGHT, "glass"),
      this.highlight,
      avatar(scene, this.avatarX, 0, seat.name, seat.id, AVATAR),
      this.ring,
      name,
      this.score,
    ]);
  }

  setScore(score: number, pot: number): void {
    this.score.setText(`${score} / ${pot}`);
  }

  setActive(active: boolean): void {
    this.highlight.setVisible(active);
    this.container.setAlpha(active ? 1 : 0.8);
  }

  /** Draws the share of the turn still left as a ring around the avatar; null clears it. */
  setTimer(fraction: number | null): void {
    this.ring.clear();
    if (fraction === null) return;
    const left = Phaser.Math.Clamp(fraction, 0, 1);
    const color = left > 0.5 ? 0x4ade80 : left > 0.2 ? 0xfacc15 : 0xef4444;
    const start = -Math.PI / 2;
    this.ring.lineStyle(8, color, 1);
    this.ring.beginPath();
    this.ring.arc(this.avatarX, 0, AVATAR / 2 + 14, start, start + Math.PI * 2 * left, false);
    this.ring.strokePath();
  }
}
