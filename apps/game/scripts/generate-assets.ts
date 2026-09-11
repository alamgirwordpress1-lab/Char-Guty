/**
 * Generates apps/game/public/assets/*: guti sprites, courtyard background, and the
 * menu UI (background, buttons, panels, board frame, icons) as SVG rasterized to PNG
 * (via sharp), plus SFX synthesized directly to PCM WAV. No external art/audio - deterministic placeholder-quality
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
// Guti sprites: a 2-inch round stick split lengthwise, seen from above - the flat cut
// face on one side, the rounded back on the other. GutiView draws them rotated.
// ---------------------------------------------------------------------------

interface GutiArt {
  /** Which side faces up: the flat cut face, or the rounded back. */
  readonly face: "flat" | "round";
  readonly light: string;
  readonly mid: string;
  readonly edge: string;
  readonly rim: string;
  readonly outline: string;
}

// Polished gold cut face.
const FLAT_PALETTE: GutiArt = {
  face: "flat",
  light: "#fff6da",
  mid: "#f2c341",
  edge: "#c0810c",
  rim: "#6e4508",
  outline: "#3a2506",
};
// Dark lacquered hardwood back, for contrast against the gold.
const ROUND_PALETTE: GutiArt = {
  face: "round",
  light: "#a47645",
  mid: "#5a381d",
  edge: "#1f130a",
  rim: "#160d05",
  outline: "#080502",
};

/** 256x128, the stick lying along x with room around it for a soft contact shadow. */
function gutiSvg(p: GutiArt): string {
  const flat = p.face === "flat";
  return `<svg width="256" height="128" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="5"/>
      </filter>
      <filter id="glow" x="-20%" y="-100%" width="140%" height="300%">
        <feGaussianBlur stdDeviation="2"/>
      </filter>
    </defs>
    <rect x="18" y="26" width="226" height="90" rx="${flat ? 14 : 30}" fill="#000000" opacity="0.38" filter="url(#shadow)"/>
    ${flat ? flatFace(p) : roundBack(p)}
  </svg>`;
}

/** Split side up: a flat gold face with grain along the split and the rim showing below it. */
function flatFace(p: GutiArt): string {
  return `<defs>
      <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.light}"/>
        <stop offset="45%" stop-color="${p.mid}"/>
        <stop offset="100%" stop-color="${p.edge}"/>
      </linearGradient>
      <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="35%" stop-color="#ffffff" stop-opacity="0.45"/>
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="10" y="16" width="236" height="96" rx="14" fill="${p.rim}"/>
    <rect x="12" y="12" width="232" height="90" rx="12" fill="url(#face)" stroke="${p.outline}" stroke-width="3"/>
    <path d="M30 36 C 84 30, 152 42, 226 34" fill="none" stroke="${p.edge}" stroke-width="3" opacity="0.5"/>
    <path d="M30 57 C 98 63, 160 51, 226 59" fill="none" stroke="${p.edge}" stroke-width="3" opacity="0.45"/>
    <path d="M30 80 C 92 74, 168 86, 226 78" fill="none" stroke="${p.edge}" stroke-width="3" opacity="0.4"/>
    <rect x="12" y="12" width="232" height="90" rx="12" fill="url(#sheen)"/>`;
}

/** Rounded back up: shaded across its width like a cylinder, with a long highlight. */
function roundBack(p: GutiArt): string {
  return `<defs>
      <linearGradient id="back" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.edge}"/>
        <stop offset="20%" stop-color="${p.light}"/>
        <stop offset="45%" stop-color="${p.mid}"/>
        <stop offset="85%" stop-color="${p.edge}"/>
        <stop offset="100%" stop-color="${p.rim}"/>
      </linearGradient>
      <linearGradient id="ends" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.5"/>
        <stop offset="10%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="90%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.5"/>
      </linearGradient>
    </defs>
    <rect x="12" y="12" width="232" height="96" rx="28" fill="url(#back)" stroke="${p.outline}" stroke-width="3"/>
    <rect x="12" y="12" width="232" height="96" rx="28" fill="url(#ends)"/>
    <rect x="44" y="26" width="168" height="14" rx="7" fill="#ffffff" opacity="0.35" filter="url(#glow)"/>
    <rect x="60" y="29" width="136" height="6" rx="3" fill="#fff3dc" opacity="0.7"/>`;
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
// Menu UI: background, glossy 9-slice buttons and panels, the board frame, avatar ring
// and icons. Glyph icons are white so the game can tint them; the rest are in colour.
// ---------------------------------------------------------------------------

function menuBackgroundSvg(): string {
  const width = 720;
  const height = 1280;
  const step = 80;
  const diamonds: string[] = [];
  for (let row = 0; row * step < height + step; row++) {
    for (let col = 0; col * step < width + step; col++) {
      const x = col * step + (row % 2) * (step / 2);
      const y = row * step;
      diamonds.push(`<path d="M${x} ${y - 16}L${x + 16} ${y}L${x} ${y + 16}L${x - 16} ${y}Z"/>`);
    }
  }
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="50%" cy="36%" r="78%">
        <stop offset="0%" stop-color="#3a7be0"/>
        <stop offset="50%" stop-color="#1a3f94"/>
        <stop offset="100%" stop-color="#0a173f"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
    <g fill="none" stroke="#ffffff" stroke-width="2" opacity="0.06">${diamonds.join("")}</g>
  </svg>`;
}

interface ButtonArt {
  readonly top: string;
  readonly bottom: string;
  readonly lip: string;
}

const BUTTON_ART = {
  green: { top: "#86e45f", bottom: "#2e9a2b", lip: "#18601a" },
  orange: { top: "#ffc760", bottom: "#ec7c12", lip: "#9c4c04" },
  blue: { top: "#6fc9ff", bottom: "#1d78da", lip: "#0f4c93" },
  gray: { top: "#aeb9c7", bottom: "#65748a", lip: "#3b4656" },
} satisfies Record<string, ButtonArt>;

/** 120x120 9-slice with 40px borders: a glossy face over a darker lip that reads as depth. */
function buttonSvg(p: ButtonArt): string {
  return `<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.top}"/>
        <stop offset="100%" stop-color="${p.bottom}"/>
      </linearGradient>
    </defs>
    <rect x="3" y="10" width="114" height="107" rx="30" fill="${p.lip}"/>
    <rect x="3" y="3" width="114" height="104" rx="30" fill="url(#face)" stroke="${p.lip}" stroke-width="3"/>
    <rect x="16" y="11" width="88" height="24" rx="12" fill="#ffffff" opacity="0.3"/>
  </svg>`;
}

/** 120x120 9-slice with 36px borders: translucent navy glass for bars and dialogs. */
function glassPanelSvg(): string {
  return `<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="116" height="116" rx="26" fill="#07143a" fill-opacity="0.8" stroke="#6b9cf0" stroke-width="3"/>
    <rect x="8" y="8" width="104" height="104" rx="20" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
  </svg>`;
}

/** 120x120 9-slice with 36px borders: a raised blue card for modes, arenas and list rows. */
function cardSvg(): string {
  return `<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3067c9"/>
        <stop offset="100%" stop-color="#1b3f8f"/>
      </linearGradient>
    </defs>
    <rect x="2" y="8" width="116" height="110" rx="26" fill="#0a1d4d"/>
    <rect x="2" y="2" width="116" height="110" rx="26" fill="url(#card)" stroke="#8fb8ff" stroke-width="2.5"/>
  </svg>`;
}

/** 160x160 9-slice with 52px borders: the carved wooden frame the game board sits in. */
function boardFrameSvg(): string {
  const grain = [20, 36, 124, 140]
    .map(
      (y) =>
        `<path d="M8 ${y} C 50 ${y - 5}, 110 ${y + 5}, 152 ${y}" stroke="#3b2210" stroke-width="2" opacity="0.35" fill="none"/>`,
    )
    .join("");
  return `<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#c0823f"/>
        <stop offset="50%" stop-color="#8a5226"/>
        <stop offset="100%" stop-color="#5e3314"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="30" fill="url(#wood)"/>
    ${grain}
    <rect x="4" y="4" width="152" height="152" rx="26" fill="none" stroke="#e8b782" stroke-opacity="0.5" stroke-width="3"/>
    <rect x="40" y="40" width="80" height="80" rx="10" fill="#2a170a"/>
    <rect x="42" y="42" width="76" height="76" rx="9" fill="none" stroke="#000000" stroke-opacity="0.45" stroke-width="4"/>
  </svg>`;
}

function avatarRingSvg(): string {
  return `<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffe89a"/>
        <stop offset="100%" stop-color="#d8920d"/>
      </linearGradient>
    </defs>
    <circle cx="80" cy="80" r="72" fill="none" stroke="#6b4300" stroke-width="13"/>
    <circle cx="80" cy="80" r="72" fill="none" stroke="url(#ring)" stroke-width="8"/>
  </svg>`;
}

function starPoints(cx: number, cy: number, points: number, outer: number, inner: number): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/** A gold starburst behind the VS badge and win banners. */
function burstSvg(): string {
  return `<svg width="240" height="240" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="burst" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff3b0"/>
        <stop offset="60%" stop-color="#ffb52e"/>
        <stop offset="100%" stop-color="#e2610b"/>
      </radialGradient>
    </defs>
    <polygon points="${starPoints(120, 120, 14, 116, 78)}" fill="url(#burst)" stroke="#8a3a00" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="120" cy="120" r="66" fill="#c2410c" stroke="#fde68a" stroke-width="6"/>
  </svg>`;
}

const GOLD_GRADIENT = `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#ffe680"/>
  <stop offset="100%" stop-color="#e09412"/>
</linearGradient>`;

const ICONS: Record<string, string> = {
  back: `<path d="M60 16 L28 48 L60 80" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
  close: `<path d="M24 24 L72 72 M72 24 L24 72" stroke="#fff" stroke-width="13" stroke-linecap="round"/>`,
  user: `<circle cx="48" cy="32" r="19" fill="#fff"/><path d="M12 90 C12 64 29 54 48 54 C67 54 84 64 84 90 Z" fill="#fff"/>`,
  users: `<g fill="#fff"><circle cx="64" cy="30" r="15" opacity="0.7"/><path d="M40 84 C40 62 52 52 64 52 C80 52 92 62 92 84 Z" opacity="0.7"/><circle cx="36" cy="36" r="17"/><path d="M4 90 C4 66 20 57 36 57 C52 57 68 66 68 90 Z"/></g>`,
  home: `<path d="M48 10 L88 44 H76 V86 H57 V62 H39 V86 H20 V44 H8 Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`,
  share: `<path d="M68 24 L28 48 L68 72" stroke="#fff" stroke-width="8" fill="none"/><g fill="#fff"><circle cx="70" cy="22" r="13"/><circle cx="26" cy="48" r="13"/><circle cx="70" cy="74" r="13"/></g>`,
  "sound-on": `<path d="M12 36 H30 L52 16 V80 L30 60 H12 Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M62 34 Q72 48 62 62 M72 22 Q90 48 72 74" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
  "sound-off": `<path d="M12 36 H30 L52 16 V80 L30 60 H12 Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M64 36 L86 60 M86 36 L64 60" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
  globe: `<g fill="none" stroke="#fff" stroke-width="6"><circle cx="48" cy="48" r="36"/><ellipse cx="48" cy="48" rx="15" ry="36"/><path d="M14 36 H82 M14 60 H82"/></g>`,
  robot: `<defs><mask id="face"><rect width="96" height="96" fill="#fff"/><circle cx="36" cy="50" r="8" fill="#000"/><circle cx="60" cy="50" r="8" fill="#000"/><rect x="34" y="64" width="28" height="7" rx="3" fill="#000"/></mask></defs>
    <g fill="#fff"><circle cx="48" cy="10" r="6"/><rect x="45" y="12" width="6" height="14"/><rect x="5" y="42" width="11" height="24" rx="4"/><rect x="80" y="42" width="11" height="24" rx="4"/><rect x="16" y="24" width="64" height="60" rx="16" mask="url(#face)"/></g>`,
  gear: `<defs><mask id="hole"><rect width="96" height="96" fill="#fff"/><circle cx="48" cy="48" r="13" fill="#000"/></mask></defs>
    <g fill="#fff" mask="url(#hole)">${[0, 45, 90, 135]
      .map(
        (a) => `<rect x="40" y="6" width="16" height="84" rx="6" transform="rotate(${a} 48 48)"/>`,
      )
      .join("")}<circle cx="48" cy="48" r="30"/></g>`,
  coin: `<defs><radialGradient id="c" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#fff2a8"/><stop offset="55%" stop-color="#ffc629"/><stop offset="100%" stop-color="#d98a00"/></radialGradient></defs>
    <circle cx="48" cy="51" r="41" fill="#a86400"/>
    <circle cx="48" cy="46" r="41" fill="url(#c)" stroke="#a86400" stroke-width="3"/>
    <circle cx="48" cy="46" r="30" fill="none" stroke="#b87400" stroke-width="3" opacity="0.6"/>
    <polygon points="${starPoints(48, 47, 5, 19, 8)}" fill="#f0a500" stroke="#b87400" stroke-width="2" stroke-linejoin="round"/>`,
  trophy: `<defs>${GOLD_GRADIENT}</defs>
    <path d="M26 20 H14 C14 42 22 48 32 48 M70 20 H82 C82 42 74 48 64 48" fill="none" stroke="#e0a21a" stroke-width="7" stroke-linecap="round"/>
    <path d="M24 12 H72 V34 C72 54 62 64 48 64 C34 64 24 54 24 34 Z" fill="url(#gold)" stroke="#8a5a00" stroke-width="3"/>
    <rect x="42" y="62" width="12" height="12" fill="#e0a21a"/>
    <rect x="28" y="72" width="40" height="14" rx="4" fill="url(#gold)" stroke="#8a5a00" stroke-width="3"/>`,
  gift: `<rect x="12" y="44" width="72" height="44" rx="6" fill="#e5484d" stroke="#8f1d22" stroke-width="3"/>
    <rect x="8" y="30" width="80" height="18" rx="5" fill="#ff6b6b" stroke="#8f1d22" stroke-width="3"/>
    <rect x="42" y="30" width="12" height="58" fill="#ffd23f"/>
    <path d="M48 30 C36 6 14 14 26 30 Z M48 30 C60 6 82 14 70 30 Z" fill="#ffd23f" stroke="#b58900" stroke-width="3"/>`,
  crown: `<defs>${GOLD_GRADIENT}</defs>
    <path d="M10 76 L14 26 L34 46 L48 14 L62 46 L82 26 L86 76 Z" fill="url(#gold)" stroke="#8a5a00" stroke-width="4" stroke-linejoin="round"/>
    <rect x="10" y="72" width="76" height="12" rx="4" fill="#e0a21a" stroke="#8a5a00" stroke-width="3"/>`,
};

function iconSvg(body: string): string {
  return `<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
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
  await writePng("ui-bg.png", menuBackgroundSvg());
  for (const [name, art] of Object.entries(BUTTON_ART)) {
    await writePng(`btn-${name}.png`, buttonSvg(art));
  }
  await writePng("panel-glass.png", glassPanelSvg());
  await writePng("panel-card.png", cardSvg());
  await writePng("board-frame.png", boardFrameSvg());
  await writePng("avatar-ring.png", avatarRingSvg());
  await writePng("burst.png", burstSvg());
  for (const [name, body] of Object.entries(ICONS)) {
    await writePng(`icon-${name}.png`, iconSvg(body));
  }

  writeWav("throw.wav", synthThrow());
  writeWav("land.wav", synthLand());
  writeWav("tokka-hit.wav", synthTokkaHit());
  writeWav("die.wav", synthDie());
  writeWav("win.wav", synthWin());
}

await main();
