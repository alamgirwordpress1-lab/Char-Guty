import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import { getSession } from "../state/session.js";
import { COLOR, TEXT } from "./theme.js";

export type ButtonColor = "green" | "orange" | "blue" | "gray";

export interface GameButton {
  readonly container: Phaser.GameObjects.Container;
  setEnabled(enabled: boolean): void;
  setLabel(label: string): void;
}

export interface ButtonOptions {
  readonly width?: number;
  readonly height?: number;
  readonly color?: ButtonColor;
  /** Texture key of an icon drawn to the left of the label. */
  readonly icon?: string;
  readonly fontSize?: number;
}

/** The art's rounded corners span 40px; smaller pieces borrow half their short side. */
function sliceBorder(width: number, height: number, max: number): number {
  return Math.min(max, Math.floor(Math.min(width, height) / 2));
}

/**
 * Makes a sized container tappable with a small squash on press. onClick fires only for a
 * press that also ends on it, and only while isEnabled says so.
 */
export function pressable(
  container: Phaser.GameObjects.Container,
  onClick: () => void,
  isEnabled: () => boolean = () => true,
): void {
  let pressed = false;
  container.setInteractive({ useHandCursor: true });
  container.on("pointerdown", () => {
    if (!isEnabled()) return;
    pressed = true;
    container.setScale(0.95);
  });
  container.on("pointerout", () => {
    pressed = false;
    container.setScale(1);
  });
  container.on("pointerup", () => {
    container.setScale(1);
    const wasPressed = pressed;
    pressed = false;
    if (wasPressed && isEnabled()) onClick();
  });
}

function nineSlice(
  scene: Phaser.Scene,
  x: number,
  y: number,
  texture: string,
  width: number,
  height: number,
  maxBorder: number,
): Phaser.GameObjects.NineSlice {
  const border = sliceBorder(width, height, maxBorder);
  return scene.add.nineslice(
    x,
    y,
    texture,
    undefined,
    width,
    height,
    border,
    border,
    border,
    border,
  );
}

/** A glossy 9-slice button, optionally with an icon beside its label. */
export function glossyButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: ButtonOptions = {},
): GameButton {
  const width = options.width ?? 460;
  const height = options.height ?? 104;
  const bg = nineSlice(scene, 0, 0, `btn-${options.color ?? "green"}`, width, height, 40);
  const text = scene.add
    .text(0, -4, label, {
      ...TEXT.button,
      fontSize: `${options.fontSize ?? Math.round(height * 0.34)}px`,
    })
    .setOrigin(0.5);
  const children: Phaser.GameObjects.GameObject[] = [bg, text];
  let icon: Phaser.GameObjects.Image | undefined;
  if (options.icon !== undefined) {
    const size = height * 0.5;
    icon = scene.add.image(0, -4, options.icon).setDisplaySize(size, size);
    children.push(icon);
  }
  const layout = (): void => {
    if (icon === undefined) return;
    const gap = 12;
    const total = icon.displayWidth + gap + text.width;
    icon.setX(-total / 2 + icon.displayWidth / 2);
    text.setX(-total / 2 + icon.displayWidth + gap + text.width / 2);
  };
  layout();

  const container = scene.add.container(x, y, children).setSize(width, height);
  let enabled = true;
  pressable(container, onClick, () => enabled);
  return {
    container,
    setEnabled(next: boolean): void {
      enabled = next;
      container.setAlpha(next ? 1 : 0.55);
    },
    setLabel(next: string): void {
      text.setText(next);
      layout();
    },
  };
}

/** A square glossy button holding just an icon, e.g. back, settings or close. */
export function iconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  icon: string,
  onClick: () => void,
  options: { size?: number; color?: ButtonColor } = {},
): GameButton {
  const size = options.size ?? 84;
  const bg = nineSlice(scene, 0, 0, `btn-${options.color ?? "blue"}`, size, size, 40);
  const image = scene.add.image(0, -3, icon).setDisplaySize(size * 0.52, size * 0.52);
  const container = scene.add.container(x, y, [bg, image]).setSize(size, size);
  let enabled = true;
  pressable(container, onClick, () => enabled);
  return {
    container,
    setEnabled(next: boolean): void {
      enabled = next;
      container.setAlpha(next ? 1 : 0.55);
    },
    setLabel(): void {},
  };
}

export type PanelKind = "glass" | "card";

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  kind: PanelKind = "glass",
): Phaser.GameObjects.NineSlice {
  return nineSlice(scene, x, y, `panel-${kind}`, width, height, 36);
}

/** The menu background, stretched over the whole game. */
export function menuBackground(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return scene.add
    .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "ui-bg")
    .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
}

const AVATAR_COLORS = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0x8b5cf6, 0xec4899, 0x14b8a6];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A round avatar: the name's initial on a colour picked from its id, in a gold ring. */
export function avatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: string,
  id: string,
  size = 96,
): Phaser.GameObjects.Container {
  const disc = scene.add.graphics();
  disc.fillStyle(AVATAR_COLORS[hash(id) % AVATAR_COLORS.length] ?? 0x3b82f6, 1);
  disc.fillCircle(0, 0, size / 2);
  const initial = scene.add
    .text(0, 0, (name.trim()[0] ?? "?").toUpperCase(), {
      ...TEXT.title,
      fontSize: `${Math.round(size * 0.5)}px`,
      strokeThickness: Math.max(4, Math.round(size * 0.06)),
    })
    .setOrigin(0.5);
  const ring = scene.add.image(0, 0, "avatar-ring").setDisplaySize(size * 1.18, size * 1.18);
  return scene.add.container(x, y, [disc, initial, ring]).setSize(size, size);
}

/** Shortens a name that would crowd a header or a seat. */
export function shortName(name: string, max = 12): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export interface CoinPill {
  readonly container: Phaser.GameObjects.Container;
  setCoins(coins: number): void;
}

/** A coin balance chip, with a green "+" for free coins when onPlus is given. */
export function coinPill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  coins: number,
  onPlus?: () => void,
): CoinPill {
  const width = 210;
  const height = 64;
  const bg = panel(scene, 0, 0, width, height, "glass");
  const icon = scene.add.image(-width / 2 + 30, 0, "icon-coin").setDisplaySize(52, 52);
  const amount = scene.add
    .text(-width / 2 + 64, 0, String(coins), { ...TEXT.heading, color: COLOR.goldText })
    .setOrigin(0, 0.5);
  const children: Phaser.GameObjects.GameObject[] = [bg, icon, amount];
  if (onPlus !== undefined) {
    const plus = glossyButton(scene, width / 2 - 28, -2, "+", onPlus, {
      width: 50,
      height: 50,
      color: "green",
      fontSize: 34,
    });
    children.push(plus.container);
  }
  return {
    container: scene.add.container(x, y, children),
    setCoins(next: number): void {
      amount.setText(String(next));
    },
  };
}

/** The strip across the top of a sub-screen: back button, title and coin balance. */
export function screenHeader(
  scene: Phaser.Scene,
  title: string,
  onBack: () => void,
  onFreeCoins?: () => void,
): CoinPill {
  panel(scene, GAME_WIDTH / 2, 70, GAME_WIDTH - 24, 120, "glass");
  iconButton(scene, 70, 70, "icon-back", onBack, { size: 80, color: "blue" });
  scene.add.text(128, 70, title, { ...TEXT.title, fontSize: "36px" }).setOrigin(0, 0.5);
  return coinPill(scene, GAME_WIDTH - 125, 70, getSession().coins, onFreeCoins);
}

export interface Dialog {
  readonly container: Phaser.GameObjects.Container;
  /** Content is positioned relative to the dialog's centre. */
  add(...objects: Phaser.GameObjects.GameObject[]): void;
  close(): void;
}

/** A centred modal: dims and blocks the screen behind it, with a title and a close button. */
export function dialog(
  scene: Phaser.Scene,
  title: string,
  width: number,
  height: number,
  onClose?: () => void,
): Dialog {
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const dim = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLOR.deepNavy, 0.72)
    .setOrigin(0)
    .setInteractive();
  const body = panel(scene, cx, cy, width, height, "card");
  const heading = scene.add.text(cx, cy - height / 2 + 60, title, TEXT.title).setOrigin(0.5);
  const inner = scene.add.container(cx, cy);
  const container = scene.add.container(0, 0, [dim, body, heading, inner]).setDepth(200);
  const close = (): void => {
    container.destroy();
    onClose?.();
  };
  const closeButton = iconButton(
    scene,
    cx + width / 2 - 28,
    cy - height / 2 + 28,
    "icon-close",
    close,
    { size: 72, color: "orange" },
  );
  container.add(closeButton.container);
  return {
    container,
    add(...objects: Phaser.GameObjects.GameObject[]): void {
      inner.add(objects);
    },
    close,
  };
}

/** A short message that fades in near the bottom of the screen, then drifts up and away. */
export function notify(scene: Phaser.Scene, message: string): void {
  const text = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT - 240, message, {
      ...TEXT.body,
      backgroundColor: "rgba(6,16,46,0.9)",
      padding: { x: 26, y: 16 },
      align: "center",
      wordWrap: { width: GAME_WIDTH - 140 },
    })
    .setOrigin(0.5)
    .setDepth(300);
  scene.tweens.add({
    targets: text,
    y: text.y - 40,
    alpha: 0,
    delay: 2000,
    duration: 500,
    onComplete: () => text.destroy(),
  });
}
