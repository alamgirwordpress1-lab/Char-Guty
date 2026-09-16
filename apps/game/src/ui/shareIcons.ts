import type Phaser from "phaser";

const SIZE = 64;
const C = SIZE / 2;
const WHITE = 0xffffff;

type Paint = (g: Phaser.GameObjects.Graphics) => void;

/** A round badge in the network's colour, the mark drawn over it in white. */
function badge(color: number, mark: Paint): Paint {
  return (g) => {
    g.fillStyle(color, 1).fillCircle(C, C, C - 2);
    mark(g);
  };
}

const ICONS: Record<string, Paint> = {
  "share-whatsapp": badge(0x25d366, (g) => {
    g.lineStyle(5, WHITE, 1).strokeCircle(C, C - 1, 18);
    g.fillStyle(WHITE, 1).fillTriangle(C - 17, C + 8, C - 22, C + 22, C - 6, C + 16);
    g.lineStyle(7, WHITE, 1);
    g.beginPath();
    g.arc(C + 1, C - 1, 8, Math.PI * 0.6, Math.PI * 1.4, false);
    g.strokePath();
  }),
  "share-facebook": badge(0x1877f2, (g) => {
    g.fillStyle(WHITE, 1);
    g.fillRect(C - 3, C - 6, 9, 30);
    g.fillRect(C - 10, C + 1, 23, 7);
    g.fillRect(C + 9, C - 18, 7, 8);
    g.lineStyle(9, WHITE, 1);
    g.beginPath();
    g.arc(C + 10, C - 5, 9, Math.PI, Math.PI * 1.5, false);
    g.strokePath();
  }),
  "share-messenger": badge(0x0a7cff, (g) => {
    g.fillStyle(WHITE, 1).fillEllipse(C, C - 2, 42, 38);
    g.fillTriangle(C - 15, C + 9, C - 17, C + 23, C - 4, C + 15);
    g.lineStyle(5, 0x0a7cff, 1);
    g.beginPath();
    g.moveTo(C - 12, C + 4);
    g.lineTo(C - 4, C - 6);
    g.lineTo(C + 3, C + 1);
    g.lineTo(C + 12, C - 9);
    g.strokePath();
  }),
  "share-telegram": badge(0x29a9eb, (g) => {
    g.fillStyle(WHITE, 1);
    g.fillTriangle(C - 19, C, C + 17, C - 15, C - 8, C + 7);
    g.fillTriangle(C - 8, C + 7, C + 17, C - 15, C + 9, C + 17);
    g.fillStyle(0xc8daea, 1).fillTriangle(C - 8, C + 7, C - 3, C + 18, C + 1, C + 10);
  }),
  "share-x": badge(0x000000, (g) => {
    g.lineStyle(3, WHITE, 0.9).strokeCircle(C, C, C - 3);
    g.lineStyle(8, WHITE, 1).lineBetween(C - 12, C - 14, C + 12, C + 14);
    g.lineStyle(4, WHITE, 1).lineBetween(C + 12, C - 14, C - 12, C + 14);
  }),
  "share-link": badge(0xf59e0b, (g) => {
    g.lineStyle(6, WHITE, 1);
    g.strokeRoundedRect(C - 21, C - 9, 26, 18, 9);
    g.strokeRoundedRect(C - 5, C - 9, 26, 18, 9);
  }),
};

/** Brand badges for the share buttons, drawn once in code so no extra artwork has to ship. */
export function ensureShareIcons(scene: Phaser.Scene): void {
  for (const [key, paint] of Object.entries(ICONS)) {
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({}, false);
    paint(g);
    g.generateTexture(key, SIZE, SIZE);
    g.destroy();
  }
}
