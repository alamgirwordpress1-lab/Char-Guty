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

/**
 * Plays one effect from anywhere, not just inside a scene - the UI widgets are shared, so the
 * taps and whooshes come through here. `detune` is in cents. Silent until BootScene has bound
 * the sound manager, and silent for a key whose file failed to load, which is the same
 * fallback BootScene takes for missing art.
 */
export function playSfx(key: string, detune = 0): void {
  const sound = manager;
  if (sound === null || !sound.game.cache.audio.exists(key)) return;
  sound.play(key, { detune });
}
