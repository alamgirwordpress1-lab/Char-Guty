import type Phaser from "phaser";
import { isSoundOn } from "./settings.js";

let manager: Phaser.Scene["sound"] | null = null;
let adPlaying = false;
let platformMuted = false;

/**
 * The game is silent when the player turned sound off, while an ad plays, or when the
 * site hosting it asks for silence - CrazyGames' mute setting outranks the game's own.
 */
export function bindSound(sound: Phaser.Scene["sound"]): void {
  manager = sound;
  applyMute();
}

export function setAdPlaying(playing: boolean): void {
  adPlaying = playing;
  applyMute();
}

export function setPlatformMuted(muted: boolean): void {
  platformMuted = muted;
  applyMute();
}

/** Re-applies the rule above; call it after the player's own sound setting changes. */
export function applyMute(): void {
  if (manager !== null) manager.mute = adPlaying || platformMuted || !isSoundOn();
}
