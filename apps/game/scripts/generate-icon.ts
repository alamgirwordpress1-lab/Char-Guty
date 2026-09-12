/**
 * Generates apps/game/branding/app-icon.png - the 1024x1024 store icon Facebook, Meta
 * and Google all ask for. Same art language as scripts/generate-assets.ts: four gutis
 * (two gold cut faces, two dark rounded backs) on the menu's blue glow.
 * Re-run with `pnpm -F @char-guty/game exec tsx scripts/generate-icon.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SIZE = 1024;
const outDir = fileURLToPath(new URL("../branding", import.meta.url));

/** One guti seen from above: `flat` is the gold cut face, `round` the lacquered back. */
function guti(face: "flat" | "round", cx: number, cy: number, rotate: number): string {
  const w = 424;
  const h = 142;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const at = `transform="rotate(${rotate} ${cx} ${cy})"`;
  if (face === "flat") {
    return `<g ${at}>
      <rect x="${x}" y="${y + 12}" width="${w}" height="${h}" rx="26" fill="#6e4508"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="url(#face)" stroke="#3a2506" stroke-width="7"/>
      <path d="M${x + 34} ${y + 52} C ${x + 140} ${y + 42}, ${x + 280} ${y + 62}, ${x + w - 34} ${y + 48}" fill="none" stroke="#c0810c" stroke-width="6" opacity="0.5"/>
      <path d="M${x + 34} ${y + 116} C ${x + 150} ${y + 126}, ${x + 290} ${y + 104}, ${x + w - 34} ${y + 118}" fill="none" stroke="#c0810c" stroke-width="6" opacity="0.45"/>
      <rect x="${x + 30}" y="${y + 20}" width="${w - 60}" height="30" rx="15" fill="#ffffff" opacity="0.35"/>
    </g>`;
  }
  return `<g ${at}>
    <rect x="${x}" y="${y + 12}" width="${w}" height="${h}" rx="80" fill="#160d05"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="80" fill="url(#back)" stroke="#080502" stroke-width="7"/>
    <rect x="${x + 60}" y="${y + 30}" width="${w - 120}" height="20" rx="10" fill="#fff3dc" opacity="0.45"/>
  </g>`;
}

function iconSvg(): string {
  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="78%">
        <stop offset="0%" stop-color="#3a7be0"/>
        <stop offset="52%" stop-color="#1a3f94"/>
        <stop offset="100%" stop-color="#0a173f"/>
      </radialGradient>
      <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff6da"/>
        <stop offset="45%" stop-color="#f2c341"/>
        <stop offset="100%" stop-color="#c0810c"/>
      </linearGradient>
      <linearGradient id="back" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1f130a"/>
        <stop offset="22%" stop-color="#a47645"/>
        <stop offset="55%" stop-color="#5a381d"/>
        <stop offset="100%" stop-color="#1f130a"/>
      </linearGradient>
      <filter id="drop" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
      </filter>
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
    <circle cx="512" cy="500" r="392" fill="#0a173f" opacity="0.35"/>
    <circle cx="512" cy="500" r="392" fill="none" stroke="#ffd166" stroke-width="14" opacity="0.55"/>
    <g filter="url(#drop)">
      <g transform="rotate(-12 512 500)">
        ${guti("flat", 512, 300, 0)}
        ${guti("round", 712, 500, 90)}
        ${guti("flat", 512, 700, 180)}
        ${guti("round", 312, 500, 270)}
      </g>
    </g>
  </svg>`;
}

mkdirSync(outDir, { recursive: true });
const png = await sharp(Buffer.from(iconSvg())).png().toBuffer();
writeFileSync(`${outDir}/app-icon.png`, png);
console.log(`wrote branding/app-icon.png (${SIZE}x${SIZE}, ${png.length} bytes)`);
