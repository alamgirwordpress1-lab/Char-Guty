import type Phaser from "phaser";
import { applyMute } from "../services/audio.js";
import { isSoundOn, setSoundOn } from "../services/settings.js";
import { TEXT } from "./theme.js";
import { dialog, glossyButton } from "./widgets.js";

export function openSettings(scene: Phaser.Scene): void {
  const box = dialog(scene, "Settings", 580, 420);
  const icon = scene.add
    .image(-190, -10, isSoundOn() ? "icon-sound-on" : "icon-sound-off")
    .setDisplaySize(64, 64);
  const label = scene.add.text(-140, -10, "Sound", TEXT.heading).setOrigin(0, 0.5);
  const toggle = glossyButton(
    scene,
    160,
    -10,
    isSoundOn() ? "ON" : "OFF",
    () => {
      const on = !isSoundOn();
      setSoundOn(on);
      applyMute();
      toggle.setLabel(on ? "ON" : "OFF");
      icon.setTexture(on ? "icon-sound-on" : "icon-sound-off");
    },
    { width: 150, height: 80, color: "blue", fontSize: 30 },
  );
  const version = scene.add.text(0, 140, "Char Guty v0.1", TEXT.small).setOrigin(0.5);
  box.add(icon, label, toggle.container, version);
}
