import Phaser from "phaser";

export const COLORS = {
  background: 0x101820,
  panel: 0x1b2a38,
  panelBorder: 0x2f4356,
  primary: 0x2e8b57,
  primaryHover: 0x3aa76d,
  secondary: 0x35506b,
  secondaryHover: 0x44647f,
  danger: 0xb33a3a,
  chip: 0x24384a,
  chipSelected: 0x2e8b57,
  textLight: "#f4f4f4",
  textMuted: "#a8b3bd",
} as const;

const FONT = "'Noto Sans Bengali', 'Segoe UI', sans-serif";

export const TEXT_STYLES = {
  title: {
    fontFamily: FONT,
    fontSize: "48px",
    color: COLORS.textLight,
    fontStyle: "bold",
  },
  heading: {
    fontFamily: FONT,
    fontSize: "30px",
    color: COLORS.textLight,
    fontStyle: "bold",
  },
  body: {
    fontFamily: FONT,
    fontSize: "22px",
    color: COLORS.textLight,
  },
  muted: {
    fontFamily: FONT,
    fontSize: "18px",
    color: COLORS.textMuted,
  },
  button: {
    fontFamily: FONT,
    fontSize: "24px",
    color: "#ffffff",
  },
  chip: {
    fontFamily: FONT,
    fontSize: "20px",
    color: "#ffffff",
  },
} as const satisfies Record<string, Phaser.Types.GameObjects.Text.TextStyle>;

export interface ButtonHandle {
  readonly container: Phaser.GameObjects.Container;
  setEnabled(enabled: boolean): void;
}

export interface ButtonOptions {
  readonly width?: number;
  readonly height?: number;
  readonly color?: number;
  readonly hoverColor?: number;
  readonly textStyle?: Phaser.Types.GameObjects.Text.TextStyle;
}

/** A simple rectangle+label button. No external assets - drawn as vector shapes. */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: ButtonOptions = {},
): ButtonHandle {
  const width = options.width ?? 520;
  const height = options.height ?? 92;
  const color = options.color ?? COLORS.primary;
  const hoverColor = options.hoverColor ?? COLORS.primaryHover;

  const bg = scene.add.rectangle(0, 0, width, height, color).setStrokeStyle(2, 0xffffff, 0.15);
  const text = scene.add.text(0, 0, label, options.textStyle ?? TEXT_STYLES.button).setOrigin(0.5);
  const container = scene.add.container(x, y, [bg, text]);
  container.setSize(width, height);

  let enabled = true;
  container.setInteractive({ useHandCursor: true });
  container.on("pointerover", () => enabled && bg.setFillStyle(hoverColor));
  container.on("pointerout", () => enabled && bg.setFillStyle(color));
  container.on("pointerdown", () => enabled && bg.setFillStyle(hoverColor));
  container.on("pointerup", () => {
    if (!enabled) return;
    bg.setFillStyle(color);
    onClick();
  });

  return {
    container,
    setEnabled(next: boolean): void {
      enabled = next;
      container.setAlpha(next ? 1 : 0.5);
      bg.setFillStyle(color);
    },
  };
}

/** A small toggle-style chip, e.g. for player-count or pot selection. */
export function createChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: { width?: number; height?: number; selected?: boolean } = {},
): ButtonHandle {
  const width = options.width ?? 140;
  const height = options.height ?? 64;
  const selected = options.selected ?? false;

  const bg = scene.add
    .rectangle(0, 0, width, height, selected ? COLORS.chipSelected : COLORS.chip)
    .setStrokeStyle(2, COLORS.panelBorder);
  const text = scene.add.text(0, 0, label, TEXT_STYLES.chip).setOrigin(0.5);
  const container = scene.add.container(x, y, [bg, text]);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });
  container.on("pointerup", onClick);

  return {
    container,
    setEnabled(next: boolean): void {
      bg.setFillStyle(next ? COLORS.chipSelected : COLORS.chip);
    },
  };
}

export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(x, y, width, height, COLORS.panel, 0.96)
    .setStrokeStyle(2, COLORS.panelBorder);
}
