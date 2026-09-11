import type Phaser from "phaser";

export const FONT = "Fredoka, 'Segoe UI', Arial, sans-serif";

export const COLOR = {
  navy: 0x0a173f,
  deepNavy: 0x06102e,
  gold: 0xffd166,
  white: "#ffffff",
  goldText: "#ffd166",
  muted: "#b9c6e4",
  win: "#7ee2a8",
  lose: "#ff8a80",
  outline: "#0b1f52",
} as const;

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

const shadow = (offsetY: number): TextStyle["shadow"] => ({
  offsetX: 0,
  offsetY,
  color: "#06102e",
  blur: 0,
  fill: true,
  stroke: true,
});

export const TEXT = {
  hero: {
    fontFamily: FONT,
    fontSize: "72px",
    fontStyle: "700",
    color: COLOR.white,
    stroke: COLOR.outline,
    strokeThickness: 12,
    shadow: shadow(6),
  },
  title: {
    fontFamily: FONT,
    fontSize: "44px",
    fontStyle: "700",
    color: COLOR.white,
    stroke: COLOR.outline,
    strokeThickness: 8,
    shadow: shadow(4),
  },
  heading: { fontFamily: FONT, fontSize: "30px", fontStyle: "700", color: COLOR.white },
  button: {
    fontFamily: FONT,
    fontSize: "32px",
    fontStyle: "700",
    color: COLOR.white,
    stroke: "rgba(0,0,0,0.35)",
    strokeThickness: 4,
  },
  body: { fontFamily: FONT, fontSize: "24px", fontStyle: "500", color: COLOR.white },
  small: { fontFamily: FONT, fontSize: "20px", fontStyle: "500", color: COLOR.muted },
} satisfies Record<string, TextStyle>;
