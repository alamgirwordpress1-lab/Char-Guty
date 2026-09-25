/**
 * Generates the game's icon: branding/app-icon.png (1024x1024 - the store icon Facebook,
 * Meta and Google all ask for) plus the public/icon-*.png sizes the web app manifest
 * points at for "Add to Home screen", the link-preview card, and the three covers
 * CrazyGames asks for (branding/crazygames/). Same art language as
 * scripts/generate-assets.ts: four gutis (two gold cut faces, two dark rounded backs) on
 * the menu's blue glow.
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

/** The menu's blue glow, brightest at (cx, cy). */
function glow(cx: string, cy: string, r: string): string {
  return `<radialGradient id="bg" cx="${cx}" cy="${cy}" r="${r}">
        <stop offset="0%" stop-color="#3a7be0"/>
        <stop offset="52%" stop-color="#1a3f94"/>
        <stop offset="100%" stop-color="#0a173f"/>
      </radialGradient>`;
}

/** The gold cut face and the lacquered back that guti() paints with. */
const GUTI_PAINTS = `<linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff6da"/>
        <stop offset="45%" stop-color="#f2c341"/>
        <stop offset="100%" stop-color="#c0810c"/>
      </linearGradient>
      <linearGradient id="back" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1f130a"/>
        <stop offset="22%" stop-color="#a47645"/>
        <stop offset="55%" stop-color="#5a381d"/>
        <stop offset="100%" stop-color="#1f130a"/>
      </linearGradient>`;

function dropShadow(dy: number, blur: number): string {
  return `<filter id="drop" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="#000000" flood-opacity="0.45"/>
      </filter>`;
}

/** The game's mark: four gutis around (512, 500), tilted a little. */
const FOUR_GUTIS = `<g transform="rotate(-12 512 500)">
        ${guti("flat", 512, 300, 0)}
        ${guti("round", 712, 500, 90)}
        ${guti("flat", 512, 700, 180)}
        ${guti("round", 312, 500, 270)}
      </g>`;

function iconSvg(): string {
  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${glow("50%", "38%", "78%")}
      ${GUTI_PAINTS}
      ${dropShadow(14, 16)}
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
    <circle cx="512" cy="500" r="392" fill="#0a173f" opacity="0.35"/>
    <circle cx="512" cy="500" r="392" fill="none" stroke="#ffd166" stroke-width="14" opacity="0.55"/>
    <g filter="url(#drop)">
      ${FOUR_GUTIS}
    </g>
  </svg>`;
}

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

/**
 * 1200x630 is what Facebook, Messenger and WhatsApp crop link previews to, so the
 * shared link shows the game rather than a blank card.
 */
function shareSvg(): string {
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${glow("28%", "38%", "86%")}
      ${GUTI_PAINTS}
      ${dropShadow(12, 14)}
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <g transform="translate(-192 -185) scale(0.66)" filter="url(#drop)">
      ${FOUR_GUTIS}
    </g>
    <text x="560" y="286" font-family="Segoe UI, Arial, sans-serif" font-size="96" font-weight="700" fill="#ffd166">Char Guty</text>
    <text x="562" y="352" font-family="Segoe UI, Arial, sans-serif" font-size="36" fill="#dce7ff">The classic four-piece game</text>
    <text x="562" y="404" font-family="Segoe UI, Arial, sans-serif" font-size="36" fill="#dce7ff">Play free with your friends</text>
    <rect x="560" y="452" width="290" height="72" rx="36" fill="#2e9a2b" stroke="#18601a" stroke-width="4"/>
    <text x="705" y="500" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">PLAY NOW</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// The three CrazyGames covers. They are built from the game's own art - the same board
// frame, mat and guti sprites the player sees - rather than from a drawn logo, because a
// cover that shows the real game is the one CrazyGames asks for and the one that does not
// mislead anyone who clicks it.
// ---------------------------------------------------------------------------

const assetsDir = fileURLToPath(new URL("../public/assets", import.meta.url));

/** Nine-slices a square source to width x height, the way Phaser draws the board frame. */
async function nineSlice(file: string, width: number, height: number): Promise<Buffer> {
  const path = `${assetsDir}/${file}`;
  const meta = await sharp(path).metadata();
  const size = meta.width ?? 160;
  // The frame art carries a 52px border in a 160px square; keep that ratio at any size.
  const border = Math.max(1, Math.min(Math.floor(Math.min(width, height) / 2), 52));
  const srcBorder = 52;
  const srcMid = size - srcBorder * 2;
  const midW = Math.max(1, width - border * 2);
  const midH = Math.max(1, height - border * 2);
  const piece = (
    left: number,
    top: number,
    w: number,
    h: number,
    tw: number,
    th: number,
  ): Promise<Buffer> =>
    sharp(path)
      .extract({ left, top, width: w, height: h })
      .resize(Math.max(1, tw), Math.max(1, th), { fit: "fill" })
      .toBuffer();
  const b = srcBorder;
  const parts = await Promise.all([
    piece(0, 0, b, b, border, border),
    piece(b, 0, srcMid, b, midW, border),
    piece(size - b, 0, b, b, border, border),
    piece(0, b, b, srcMid, border, midH),
    piece(b, b, srcMid, srcMid, midW, midH),
    piece(size - b, b, b, srcMid, border, midH),
    piece(0, size - b, b, b, border, border),
    piece(b, size - b, srcMid, b, midW, border),
    piece(size - b, size - b, b, b, border, border),
  ]);
  const at: readonly (readonly [number, number])[] = [
    [0, 0],
    [border, 0],
    [width - border, 0],
    [0, border],
    [border, border],
    [width - border, border],
    [0, height - border],
    [border, height - border],
    [width - border, height - border],
  ];
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(parts.map((input, i) => ({ input, left: at[i]?.[0] ?? 0, top: at[i]?.[1] ?? 0 })))
    .png()
    .toBuffer();
}

/**
 * Where the four pieces lie on the cover's mat, as fractions of the mat, and their angles.
 * Drawn larger than they are in play and grouped tighter: a cover is read as a thumbnail a
 * few hundred pixels wide, where four pieces at their real size vanish into the mat.
 */
const COVER_GUTIS: readonly { face: "flat" | "round"; x: number; y: number; angle: number }[] = [
  { face: "flat", x: 0.34, y: 0.33, angle: -16 },
  { face: "round", x: 0.63, y: 0.3, angle: 22 },
  { face: "flat", x: 0.38, y: 0.66, angle: 10 },
  { face: "flat", x: 0.66, y: 0.66, angle: -34 },
];

/** Tilts the board a little and lays a soft shadow under it, so it sits in the cover. */
async function tiltWithShadow(board: Buffer, angle: number): Promise<Buffer> {
  const tilted = await sharp(board)
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(tilted).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const drop = 22;
  // The shadow is the board's own silhouette, blurred and dimmed.
  const mask = await sharp(tilted).extractChannel(3).blur(20).linear(0.5, 0).toBuffer();
  const shadow = await sharp({
    create: { width, height, channels: 3, background: { r: 3, g: 8, b: 26 } },
  })
    .joinChannel(mask)
    .png()
    .toBuffer();
  return sharp({
    create: {
      width,
      height: height + drop,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow, left: 0, top: drop },
      { input: tilted, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** The board as it is played on: the framed mat with four gutis scattered across it. */
async function boardImage(
  matWidth: number,
): Promise<{ image: Buffer; width: number; height: number }> {
  const matHeight = Math.round(matWidth * 0.75); // the sim field is 400x300
  const frame = Math.round(matWidth * 0.055);
  const width = matWidth + frame * 2;
  const height = matHeight + frame * 2;
  const gutiLength = Math.round(matWidth * 0.2);
  const gutiWidth = Math.round(gutiLength * 0.5);

  const layers: { input: Buffer; left: number; top: number }[] = [
    { input: await nineSlice("board-frame.png", width, height), left: 0, top: 0 },
    {
      input: await sharp(`${assetsDir}/courtyard-bg.png`)
        .resize(matWidth, matHeight, { fit: "fill" })
        .toBuffer(),
      left: frame,
      top: frame,
    },
  ];
  for (const g of COVER_GUTIS) {
    const piece = await sharp(`${assetsDir}/guti-${g.face}.png`)
      .resize(gutiLength, gutiWidth, { fit: "fill" })
      .rotate(g.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    const size = await sharp(piece).metadata();
    layers.push({
      input: piece,
      left: Math.round(frame + matWidth * g.x - (size.width ?? 0) / 2),
      top: Math.round(frame + matHeight * g.y - (size.height ?? 0) / 2),
    });
  }
  const image = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png()
    .toBuffer();
  return { image, width, height };
}

interface Cover {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  /** Width of the mat inside the board, and where the board's centre sits on the cover. */
  readonly mat: number;
  readonly boardX: number;
  readonly boardY: number;
  /** Centre line, baseline and size of the title. */
  readonly title: { readonly x: number; readonly y: number; readonly size: number };
}

/**
 * CrazyGames wants three covers with one look, and the game's title as the only words on
 * them - no "Play now", no badges, no store logos.
 */
const COVERS: readonly Cover[] = [
  {
    file: "cover-1920x1080.png",
    width: 1920,
    height: 1080,
    mat: 880,
    boardX: 610,
    boardY: 540,
    title: { x: 1420, y: 600, size: 150 },
  },
  {
    file: "cover-800x1200.png",
    width: 800,
    height: 1200,
    mat: 640,
    boardX: 400,
    boardY: 470,
    title: { x: 400, y: 1010, size: 112 },
  },
  {
    file: "cover-800x800.png",
    width: 800,
    height: 800,
    mat: 610,
    boardX: 400,
    boardY: 330,
    title: { x: 400, y: 720, size: 104 },
  },
];

function coverBackgroundSvg({ width, height, boardX, boardY }: Cover): string {
  const glowX = `${Math.round((boardX / width) * 100)}%`;
  const glowY = `${Math.round((boardY / height) * 100)}%`;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>${glow(glowX, glowY, "82%")}</defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
  </svg>`;
}

function coverTitleSvg({ width, height, title }: Cover): string {
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>${dropShadow(10, 12)}</defs>
    <text x="${title.x}" y="${title.y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${title.size}" font-weight="700" fill="#ffd166" stroke="#0a173f" stroke-width="${Math.round(title.size * 0.06)}" paint-order="stroke" filter="url(#drop)">Char Guty</text>
  </svg>`;
}

mkdirSync(outDir, { recursive: true });
const svg = Buffer.from(iconSvg());
const png = await sharp(svg).png().toBuffer();
writeFileSync(`${outDir}/app-icon.png`, png);
console.log(`wrote branding/app-icon.png (${SIZE}x${SIZE}, ${png.length} bytes)`);

// 180 is what iOS uses for apple-touch-icon; 192 and 512 are the manifest's two sizes.
for (const size of [180, 192, 512]) {
  const resized = await sharp(svg).resize(size, size).png().toBuffer();
  writeFileSync(`${publicDir}/icon-${size}.png`, resized);
  console.log(`wrote public/icon-${size}.png (${resized.length} bytes)`);
}

const feature = await sharp(Buffer.from(shareSvg())).resize(1024, 500).png().toBuffer();
writeFileSync(`${outDir}/feature-graphic.png`, feature);
console.log(`wrote branding/feature-graphic.png (1024x500, ${feature.length} bytes)`);

const share = await sharp(Buffer.from(shareSvg())).png().toBuffer();
writeFileSync(`${publicDir}/share-card.png`, share);
console.log(`wrote public/share-card.png (1200x630, ${share.length} bytes)`);

mkdirSync(`${outDir}/crazygames`, { recursive: true });
for (const cover of COVERS) {
  const board = await boardImage(cover.mat);
  const tilted = await tiltWithShadow(board.image, -7);
  const size = await sharp(tilted).metadata();
  const image = await sharp(Buffer.from(coverBackgroundSvg(cover)))
    .composite([
      {
        input: tilted,
        left: Math.round(cover.boardX - (size.width ?? 0) / 2),
        top: Math.round(cover.boardY - (size.height ?? 0) / 2),
      },
      { input: Buffer.from(coverTitleSvg(cover)), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  writeFileSync(`${outDir}/crazygames/${cover.file}`, image);
  console.log(`wrote branding/crazygames/${cover.file} (${image.length} bytes)`);
}
