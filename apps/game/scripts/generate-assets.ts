/**
 * Generates apps/game/public/assets/*: guti sprites, courtyard background, and the
 * UI panel 9-slice as SVG rasterized to PNG (via sharp), plus SFX synthesized
 * directly to PCM WAV. No external art/audio - deterministic placeholder-quality
 * assets that exercise the real loading/fallback pipeline. Re-run any time with
 * `pnpm -F game exec tsx scripts/generate-assets.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const outDir = fileURLToPath(new URL("../public/assets", import.meta.url));
mkdirSync(outDir, { recursive: true });

async function writePng(name: string, svg: string): Promise<void> {
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(`${outDir}/${name}`, buffer);
  console.log(`wrote ${name}`);
}

function writeWav(name: string, samples: Float32Array): void {
  writeFileSync(`${outDir}/${name}`, encodeWav(samples));
  console.log(`wrote ${name}`);
}

// ---------------------------------------------------------------------------
// Guti sprites: a glossy disc viewed at an angle, matching GutiView's ellipse.
// ---------------------------------------------------------------------------

interface GutiPalette {
  readonly light: string;
  readonly mid: string;
  readonly edge: string;
  readonly outline: string;
}

const FLAT_PALETTE: GutiPalette = {
  light: "#f8efdc",
  mid: "#e6cf9e",
  edge: "#b8945a",
  outline: "#5c3f22",
};
const ROUND_PALETTE: GutiPalette = {
  light: "#8f6f4c",
  mid: "#6b4a2a",
  edge: "#3d2817",
  outline: "#20120a",
};

function gutiSvg(p: GutiPalette): string {
  const gradId = `g-${p.outline.slice(1)}`;
  return `<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="${gradId}" cx="38%" cy="32%" r="75%">
        <stop offset="0%" stop-color="${p.light}"/>
        <stop offset="65%" stop-color="${p.mid}"/>
        <stop offset="100%" stop-color="${p.edge}"/>
      </radialGradient>
    </defs>
    <ellipse cx="66" cy="76" rx="46" ry="30" fill="#000000" opacity="0.28"/>
    <ellipse cx="64" cy="62" rx="50" ry="34" fill="url(#${gradId})" stroke="${p.outline}" stroke-width="3"/>
    <ellipse cx="48" cy="46" rx="16" ry="8" fill="#ffffff" opacity="0.35"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Courtyard background: warm packed-earth tone with subtle grain and a border.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function courtyardSvg(): string {
  const rand = mulberry32(20260905);
  const width = 1024;
  const height = 768;
  const grains: string[] = [];
  for (let i = 0; i < 70; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const rx = 30 + rand() * 90;
    const ry = 4 + rand() * 8;
    const rotate = rand() * 180;
    const shade = rand() > 0.5 ? "#000000" : "#ffffff";
    const opacity = (0.03 + rand() * 0.05).toFixed(2);
    grains.push(
      `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${shade}" opacity="${opacity}" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`,
    );
  }
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#caa26c"/>
        <stop offset="100%" stop-color="#9a7443"/>
      </linearGradient>
      <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
        <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.38"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    ${grains.join("\n    ")}
    <rect width="${width}" height="${height}" fill="url(#vignette)"/>
    <rect x="14" y="14" width="${width - 28}" height="${height - 28}" fill="none" stroke="#4a2f16" stroke-width="10" rx="10"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// UI panel 9-slice: raised wood-panel bevel. 24px border-safe inset per side.
// ---------------------------------------------------------------------------

function panelSvg(): string {
  return `<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#6b4a2a"/>
        <stop offset="100%" stop-color="#3d2817"/>
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="88" height="88" rx="14" fill="url(#panel)" stroke="#20120a" stroke-width="3"/>
    <rect x="9" y="9" width="78" height="78" rx="11" fill="none" stroke="#a9855c" stroke-width="2" opacity="0.45"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// SFX: synthesized directly to 16-bit PCM mono WAV, no audio library needed.
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100;

function samplesFor(durationSeconds: number): number {
  return Math.round(durationSeconds * SAMPLE_RATE);
}

function sine(freq: number, t: number): number {
  return Math.sin(2 * Math.PI * freq * t);
}

/** 0->1 ramp over `attack`, holds at 1, then ramps to 0 over the last `release`. */
function envelope(t: number, duration: number, attack: number, release: number): number {
  if (t < attack) return t / attack;
  const releaseStart = duration - release;
  if (t > releaseStart) return Math.max(0, (duration - t) / release);
  return 1;
}

function makeNoise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state / 0x7fffffff) * 2 - 1;
  };
}

function synthThrow(): Float32Array {
  const duration = 0.4;
  const n = samplesFor(duration);
  const out = new Float32Array(n);
  const noise = makeNoise(1);
  let smoothed = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    smoothed = smoothed * 0.85 + noise() * 0.15; // soften white noise into a "whoosh"
    out[i] = smoothed * envelope(t, duration, 0.02, 0.32) * 0.5;
  }
  return out;
}

function synthLand(): Float32Array {
  const duration = 0.22;
  const n = samplesFor(duration);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, duration, 0.004, 0.18);
    out[i] = (sine(95, t) * 0.75 + sine(150, t) * 0.25) * env * 0.6;
  }
  return out;
}

function synthTokkaHit(): Float32Array {
  const duration = 0.12;
  const n = samplesFor(duration);
  const out = new Float32Array(n);
  const noise = makeNoise(7);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, duration, 0.001, 0.1);
    out[i] = (sine(340, t) * 0.55 + noise() * 0.3) * env * 0.7;
  }
  return out;
}

function synthDie(): Float32Array {
  const duration = 0.5;
  const n = samplesFor(duration);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 380 - 220 * (t / duration);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    out[i] = Math.sin(phase) * envelope(t, duration, 0.01, 0.35) * 0.5;
  }
  return out;
}

function synthWin(): Float32Array {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  const noteDur = 0.18;
  const gap = 0.02;
  const totalDur = notes.length * (noteDur + gap);
  const n = samplesFor(totalDur);
  const out = new Float32Array(n);
  notes.forEach((freq, idx) => {
    const start = samplesFor(idx * (noteDur + gap));
    const noteSamples = samplesFor(noteDur);
    for (let i = 0; i < noteSamples && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env = envelope(t, noteDur, 0.01, 0.12);
      const blip = (sine(freq, t) + 0.5 * sine(freq * 2, t)) * env * 0.32;
      out[start + i] = (out[start + i] ?? 0) + blip;
    }
  });
  return out;
}

function encodeWav(samples: Float32Array): Buffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

async function main(): Promise<void> {
  await writePng("guti-flat.png", gutiSvg(FLAT_PALETTE));
  await writePng("guti-round.png", gutiSvg(ROUND_PALETTE));
  await writePng("courtyard-bg.png", courtyardSvg());
  await writePng("panel-9slice.png", panelSvg());

  writeWav("throw.wav", synthThrow());
  writeWav("land.wav", synthLand());
  writeWav("tokka-hit.wav", synthTokkaHit());
  writeWav("die.wav", synthDie());
  writeWav("win.wav", synthWin());
}

await main();
