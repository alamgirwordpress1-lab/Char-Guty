/**
 * Generates apps/game/public/assets/*: the gutis, the mat, the menu background, the 9-slice
 * button/panel/frame art, the icons and every sound effect. All of it is procedural - layered
 * value noise for material texture, signed distance fields for edges and bevels, and modal
 * synthesis for the wooden sounds - so the whole set rebuilds deterministically with no
 * licensed files to track. Re-run with
 * `pnpm -F @char-guty/game exec tsx scripts/generate-assets.ts`.
 *
 * The 9-slice pieces (buttons, panels, the board frame) are shaded by the distance to their
 * own outline rather than by screen position, so stretching a border never smears a highlight;
 * where a gradient has to run down the piece it is kept linear, which stretches seamlessly.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const outDir = fileURLToPath(new URL("../public/assets", import.meta.url));
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Colour, noise and distance helpers shared by every piece of art.
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];
/** Returns the straight-alpha colour of one pixel; alpha 0 leaves it transparent. */
type Shader = (x: number, y: number) => Rgba;

function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [
    (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * k,
    (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * k,
    (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * k,
  ];
}

/** Lightens for amount > 0 and darkens for amount < 0, staying inside the channel range. */
function shade(c: Rgb, amount: number): Rgb {
  return amount >= 0 ? mix(c, [255, 255, 255], amount) : mix(c, [0, 0, 0], -amount);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** A 0->1 ramp between two edges, flattened at both ends so lighting never bands. */
function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp01((v - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

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

/** Smoothed value noise on a unit grid, in 0..1. The seed picks one fixed pattern. */
function makeNoise(seed: number): (x: number, y: number) => number {
  const rand = mulberry32(seed);
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) table[i] = rand();
  const perm = new Uint8Array(512);
  const order = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = swap;
  }
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255] ?? 0;

  const at = (ix: number, iy: number): number => {
    const h = perm[((perm[ix & 255] ?? 0) + (iy & 255)) & 255] ?? 0;
    return table[h] ?? 0;
  };
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(0, 1, x - x0);
    const fy = smoothstep(0, 1, y - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

/** Octaves of the same noise at doubling frequency and halving weight: material grain. */
function makeFbm(seed: number, octaves = 4): (x: number, y: number) => number {
  const noise = makeNoise(seed);
  return (x, y) => {
    let sum = 0;
    let amp = 1;
    let total = 0;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i++) {
      sum += noise(fx, fy) * amp;
      total += amp;
      amp *= 0.5;
      fx *= 2;
      fy *= 2;
    }
    return sum / (total || 1);
  };
}

/**
 * Signed distance from (x, y) to a rounded rectangle: negative inside, positive outside, in
 * pixels. Shading from this is what keeps a stretched 9-slice border looking moulded.
 */
function roundedRect(
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
): number {
  const qx = Math.abs(x - (left + width / 2)) - (width / 2 - radius);
  const qy = Math.abs(y - (top + height / 2)) - (height / 2 - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Coverage of a shape whose edge sits at distance 0, antialiased across one pixel. */
function cover(distance: number): number {
  return clamp01(0.5 - distance);
}

/** Lays one straight-alpha colour over another and returns the result. */
function over(under: Rgba, top: Rgba): Rgba {
  const ta = top[3] ?? 0;
  if (ta <= 0) return under;
  const ua = under[3] ?? 0;
  const outA = ta + ua * (1 - ta);
  if (outA <= 0) return [0, 0, 0, 0];
  const blend = (i: 0 | 1 | 2): number =>
    ((top[i] ?? 0) * ta + (under[i] ?? 0) * ua * (1 - ta)) / outA;
  return [blend(0), blend(1), blend(2), outA];
}

function paint(colour: Rgb, alpha: number): Rgba {
  return [colour[0] ?? 0, colour[1] ?? 0, colour[2] ?? 0, clamp01(alpha)];
}

const CLEAR: Rgba = [0, 0, 0, 0];

async function writePng(name: string, width: number, height: number, shader: Shader) {
  const data = Buffer.alloc(width * height * 4);
  let o = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = shader(x, y);
      data[o++] = Math.max(0, Math.min(255, Math.round(r)));
      data[o++] = Math.max(0, Math.min(255, Math.round(g)));
      data[o++] = Math.max(0, Math.min(255, Math.round(b)));
      data[o++] = Math.max(0, Math.min(255, Math.round(a * 255)));
    }
  }
  const png = await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  writeFileSync(`${outDir}/${name}`, png);
  console.log(`wrote ${name}`);
}

async function writeSvgPng(name: string, svg: string): Promise<void> {
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(`${outDir}/${name}`, buffer);
  console.log(`wrote ${name}`);
}

// ---------------------------------------------------------------------------
// Gutis: a 2-inch round stick split lengthwise, seen from above - the flat cut face on one
// side, the rounded back on the other. The shape and the two palettes are the ones the owner
// settled on; only the material under them changed, from flat gradients to grain and light.
// ---------------------------------------------------------------------------

const GUTI_W = 256;
const GUTI_H = 128;
/** The stick itself, with room left around it for the contact shadow. */
const STICK = { left: 12, top: 14, width: 232, height: 96 };

const FLAT = {
  light: rgb("#fff6da"),
  mid: rgb("#f2c341"),
  edge: rgb("#c0810c"),
  rim: rgb("#6e4508"),
  outline: rgb("#3a2506"),
};
const ROUND = {
  light: rgb("#a47645"),
  mid: rgb("#5a381d"),
  edge: rgb("#1f130a"),
  rim: rgb("#160d05"),
  outline: rgb("#080502"),
};

const gutiGrain = makeFbm(0x6c71, 4);
const gutiSpeck = makeNoise(0x91f3);

/** Lengthwise fibres: the value barely moves along x, so the streaks run down the stick. */
function fibre(x: number, y: number): number {
  return gutiGrain(x * 0.013, y * 0.34) - 0.5;
}

/**
 * A guti is drawn about 54 px long in play, so the texture is read at a fifth of its size:
 * fine grain disappears and only silhouette, contrast and the cast shadow survive. Everything
 * below is tuned for that - deep rims, one tight highlight, and a shadow that lifts the piece
 * off the mat rather than a faithful close-up of varnished wood.
 */
function gutiShadow(x: number, y: number): Rgba {
  const d = roundedRect(x - 6, y - 9, STICK.left, STICK.top, STICK.width, STICK.height, 22);
  // Two shadows: a tight dark one under the piece and a wider soft one for the ambient light.
  const contact = smoothstep(5, -6, d) * 0.5;
  const spread = smoothstep(20, -4, d) * 0.28;
  return paint([12, 6, 0], clamp01(contact + spread));
}

function flatGuti(x: number, y: number): Rgba {
  const radius = 15;
  const d = roundedRect(x, y, STICK.left, STICK.top, STICK.width, STICK.height, radius);
  const inside = cover(d);
  if (inside <= 0) return gutiShadow(x, y);

  const across = (y - STICK.top) / STICK.height;
  // The polished cut face: gold almost everywhere, with the pale sheen kept to a narrow band
  // near the top and the edge colour taking over sharply below the middle.
  let colour = mix(FLAT.mid, FLAT.light, smoothstep(0.34, 0.06, across) * 0.85);
  colour = mix(colour, FLAT.edge, smoothstep(0.52, 0.95, across));
  colour = shade(colour, fibre(x, y) * 0.14);
  // Saw marks left by splitting the stick, a shade darker than the face around them.
  const saw = Math.sin((y + fibre(x, y) * 26) * 0.55) * 0.5 + 0.5;
  colour = shade(colour, -smoothstep(0.7, 1, saw) * 0.12);
  // One tight diagonal glint, the kind a varnished face catches from a single light.
  const glint = smoothstep(0.22, 0, Math.abs((x - STICK.left) / STICK.width - across * 0.4 - 0.26));
  colour = shade(colour, glint * smoothstep(0.5, 0.12, across) * 0.55);
  // The cut edge: a deep rim inside the outline, so the shape still reads when shrunk.
  colour = mix(colour, FLAT.rim, smoothstep(-9, -2, d) * 0.92);
  colour = mix(colour, FLAT.outline, smoothstep(-3, -0.3, d));

  return over(gutiShadow(x, y), paint(colour, inside));
}

function roundGuti(x: number, y: number): Rgba {
  const radius = 30;
  const d = roundedRect(x, y, STICK.left, STICK.top, STICK.width, STICK.height, radius);
  const inside = cover(d);
  if (inside <= 0) return gutiShadow(x, y);

  const across = (y - STICK.top) / STICK.height;
  // Across the back it reads as a cylinder: dark at both lips, brightest a third of the way
  // down. Against the gold face this side has to stay clearly the darker of the two.
  const curve = Math.sin(Math.PI * clamp01(across));
  let colour = mix(ROUND.edge, ROUND.mid, smoothstep(0, 0.7, curve));
  colour = mix(colour, ROUND.light, smoothstep(0.26, 0.04, Math.abs(across - 0.3)) * 0.9);
  colour = shade(colour, fibre(x, y) * 0.26);
  colour = shade(colour, (gutiSpeck(x * 0.6, y * 0.6) - 0.5) * 0.07);
  // The long specular streak that tells the eye this side is round, not flat.
  const streak = smoothstep(0.1, 0, Math.abs(across - 0.25));
  const alongEnds =
    smoothstep(0.02, 0.15, (x - STICK.left) / STICK.width) *
    smoothstep(0.02, 0.15, (STICK.left + STICK.width - x) / STICK.width);
  colour = shade(colour, streak * alongEnds * 0.55);
  // The flat sawn ends stay in shadow, and the whole piece is outlined.
  colour = shade(colour, -(1 - alongEnds) * 0.4);
  colour = mix(colour, ROUND.rim, smoothstep(-6, -1.4, d) * 0.8);
  colour = mix(colour, ROUND.outline, smoothstep(-3, -0.3, d));

  return over(gutiShadow(x, y), paint(colour, inside));
}

// ---------------------------------------------------------------------------
// The mat the game is played on: a woven jute square, lit from above and worn at the edges.
// ---------------------------------------------------------------------------

const MAT_W = 1024;
const MAT_H = 768;
const matDye = makeFbm(0x2ad4, 5);
const matWear = makeFbm(0x7e11, 3);

// Deep enough that a gold guti reads against it from across the table: the pieces are only
// about fifty pixels long in play, so the mat has to give them their contrast.
const MAT_DARK = rgb("#4e3116");
const MAT_MID = rgb("#75501f");
const MAT_LIGHT = rgb("#96693a");
const MAT_EDGE = rgb("#33200d");

/** Over-and-under basket weave: alternating cells run their thread the other way. */
function weave(x: number, y: number): number {
  const pitch = 7;
  const cx = Math.floor(x / pitch);
  const cy = Math.floor(y / pitch);
  const alongX = (cx + cy) % 2 === 0;
  const t = alongX ? (y % pitch) / pitch : (x % pitch) / pitch;
  const strand = Math.sin(Math.PI * t);
  const gap = smoothstep(0, 0.12, t) * smoothstep(0, 0.12, 1 - t);
  return strand * gap;
}

/**
 * The playing surface: plain woven jute, no pattern on it. The owner asked for nothing running
 * round the edge, so everything here is material and light - the weave, the uneven dye, a
 * bound edge and a vignette. Nothing on the mat competes with the four pieces lying on it.
 */
function mat(x: number, y: number): Rgba {
  const nx = x / MAT_W;
  const ny = y / MAT_H;
  const fromCentre = Math.hypot(nx - 0.5, (ny - 0.5) * (MAT_H / MAT_W));
  // Dye never takes evenly on jute, so the base tone wanders before the weave goes on.
  let colour = mix(MAT_DARK, MAT_MID, matDye(x * 0.006, y * 0.006));
  // The weave is kept quiet: it has to say "cloth" from a distance without giving the eye
  // anything to mistake for a guti, because a tokka is judged by whether two pieces touch.
  colour = mix(colour, MAT_LIGHT, weave(x, y) * 0.28);
  colour = shade(colour, (matDye(x * 0.09, y * 0.09) - 0.5) * 0.07);

  // Daylight from the upper left, held back so the mat stays darker than a gold guti on it.
  colour = shade(colour, (1 - smoothstep(0, 1.5, nx + ny)) * 0.08);
  colour = shade(colour, smoothstep(0.45, 0, fromCentre) * 0.07);
  colour = shade(colour, matWear(x * 0.004, y * 0.004) * smoothstep(0.4, 0, fromCentre) * 0.06);
  // A bound edge, then the shadow the binding casts inwards.
  const edge = Math.min(x, y, MAT_W - 1 - x, MAT_H - 1 - y);
  colour = mix(colour, MAT_EDGE, smoothstep(22, 7, edge) * 0.9);
  colour = shade(colour, -smoothstep(34, 23, edge) * 0.25);
  // The vignette that makes the middle of the board feel like the middle of a room.
  colour = shade(colour, -smoothstep(0.34, 0.62, fromCentre) * 0.34);
  return paint(colour, 1);
}

// ---------------------------------------------------------------------------
// Menu background: a deep blue night with two soft lights and a faint lattice.
// ---------------------------------------------------------------------------

const UI_W = 720;
const UI_H = 1280;
const uiGrain = makeNoise(0x4411);

const SKY_TOP = rgb("#050b24");
const SKY_MID = rgb("#173f8f");
const SKY_LOW = rgb("#081438");

function menuBackground(x: number, y: number): Rgba {
  const nx = x / UI_W;
  const ny = y / UI_H;
  let colour = mix(SKY_TOP, SKY_MID, smoothstep(0, 0.42, ny));
  colour = mix(colour, SKY_LOW, smoothstep(0.45, 1, ny));
  // Two blooms: a wide one behind the logo, a cooler one low and to the side.
  const key = smoothstep(0.62, 0, Math.hypot((nx - 0.5) * 1.15, ny - 0.3));
  colour = mix(colour, rgb("#4b8ff0"), key * 0.42);
  const fill = smoothstep(0.45, 0, Math.hypot((nx - 0.16) * 1.2, ny - 0.82));
  colour = mix(colour, rgb("#1d5bb8"), fill * 0.3);
  // A lattice of diamonds, only just visible - enough to stop the gradient looking bare.
  const pitch = 80;
  const dx = Math.abs(((x + (Math.floor(y / pitch) % 2) * pitch * 0.5) % pitch) - pitch / 2);
  const dy = Math.abs((y % pitch) - pitch / 2);
  const ring = Math.abs(dx + dy - 17);
  colour = shade(colour, smoothstep(2.4, 0.4, ring) * 0.07);
  // Film grain, then a vignette to sit the menu inside the screen.
  colour = shade(colour, (uiGrain(x * 0.7, y * 0.7) - 0.5) * 0.045);
  colour = shade(colour, -smoothstep(0.42, 0.95, Math.hypot(nx - 0.5, (ny - 0.5) * 0.62)) * 0.45);
  return paint(colour, 1);
}

// ---------------------------------------------------------------------------
// 9-slice buttons: a glossy face sitting on a darker lip, shaded from its own outline.
// ---------------------------------------------------------------------------

const BUTTON_ART = {
  green: { top: "#9bf06a", bottom: "#249a2a", lip: "#12561a", edge: "#0d3d12" },
  orange: { top: "#ffd071", bottom: "#e9740c", lip: "#94430a", edge: "#6b2f05" },
  blue: { top: "#7fd2ff", bottom: "#1670d6", lip: "#0c4585", edge: "#07305e" },
  gray: { top: "#c3cdd9", bottom: "#5d6c80", lip: "#36404e", edge: "#242c37" },
} satisfies Record<string, { top: string; bottom: string; lip: string; edge: string }>;

type ButtonArt = (typeof BUTTON_ART)[keyof typeof BUTTON_ART];

const BTN = 120;
const BTN_FACE = { left: 3, top: 3, width: 114, height: 104, radius: 30 };
const BTN_LIP = { left: 3, top: 11, width: 114, height: 106, radius: 30 };
const btnGrain = makeNoise(0x1d3a);

function buttonShader(art: ButtonArt): Shader {
  const top = rgb(art.top);
  const bottom = rgb(art.bottom);
  const lip = rgb(art.lip);
  const edge = rgb(art.edge);
  return (x, y) => {
    const dLip = roundedRect(
      x,
      y,
      BTN_LIP.left,
      BTN_LIP.top,
      BTN_LIP.width,
      BTN_LIP.height,
      BTN_LIP.radius,
    );
    const dFace = roundedRect(
      x,
      y,
      BTN_FACE.left,
      BTN_FACE.top,
      BTN_FACE.width,
      BTN_FACE.height,
      BTN_FACE.radius,
    );
    let out: Rgba = CLEAR;
    // The lip shows only below the face, and darkens towards its own edge.
    out = over(out, paint(shade(lip, -smoothstep(-6, 0, dLip) * 0.35), cover(dLip)));
    if (cover(dFace) <= 0) return out;

    // A linear ramp down the face: the middle rows of a 9-slice stretch without banding.
    let colour = mix(top, bottom, clamp01((y - BTN_FACE.top) / BTN_FACE.height));
    colour = shade(colour, (btnGrain(x * 1.7, y * 1.7) - 0.5) * 0.05);
    // Gloss and rim light live inside the top border, so stretching never pulls them out.
    const gloss = smoothstep(40, 12, y) * smoothstep(-34, -12, dFace);
    colour = mix(colour, [255, 255, 255], gloss * 0.34);
    colour = mix(
      colour,
      [255, 255, 255],
      smoothstep(-3.5, -0.5, dFace) * smoothstep(26, 6, y) * 0.5,
    );
    // Inside the bottom border, light bounced back up off the lip.
    colour = shade(colour, smoothstep(-5, -1, dFace) * smoothstep(84, 104, y) * 0.22);
    colour = mix(colour, edge, smoothstep(-2.6, -0.3, dFace));
    return over(out, paint(colour, cover(dFace)));
  };
}

// ---------------------------------------------------------------------------
// 9-slice panels: translucent glass for bars and dialogs, a raised card for list rows.
// ---------------------------------------------------------------------------

const PANEL = 120;
const PANEL_BOX = { left: 2, top: 2, width: 116, height: 116, radius: 26 };

function glassPanel(x: number, y: number): Rgba {
  const d = roundedRect(
    x,
    y,
    PANEL_BOX.left,
    PANEL_BOX.top,
    PANEL_BOX.width,
    PANEL_BOX.height,
    PANEL_BOX.radius,
  );
  const inside = cover(d);
  if (inside <= 0) return CLEAR;
  let colour = mix(rgb("#0b1c46"), rgb("#050e2a"), clamp01(y / PANEL));
  // An inner shadow all the way round, so the glass reads as sunk into the screen.
  colour = shade(colour, -smoothstep(-14, -1, d) * 0.3);
  let out = paint(colour, 0.82 * inside);
  // A bright hairline along the outline, and a faint one a few pixels inside it.
  out = over(out, paint(rgb("#7fabf5"), smoothstep(-3, -0.6, d) * 0.85 * inside));
  const innerLine = smoothstep(-8, -6, d) * smoothstep(-4, -6, d);
  out = over(out, paint([255, 255, 255], innerLine * 0.2 * inside));
  return out;
}

const cardGrain = makeNoise(0x5b20);

function cardPanel(x: number, y: number): Rgba {
  const lipBox = { left: 2, top: 9, width: 116, height: 109, radius: 26 };
  const faceBox = { left: 2, top: 2, width: 116, height: 110, radius: 26 };
  const dLip = roundedRect(
    x,
    y,
    lipBox.left,
    lipBox.top,
    lipBox.width,
    lipBox.height,
    lipBox.radius,
  );
  const dFace = roundedRect(
    x,
    y,
    faceBox.left,
    faceBox.top,
    faceBox.width,
    faceBox.height,
    faceBox.radius,
  );
  const out: Rgba = paint(rgb("#071638"), cover(dLip));
  if (cover(dFace) <= 0) return out;
  let colour = mix(rgb("#3a76dd"), rgb("#16357e"), clamp01((y - faceBox.top) / faceBox.height));
  colour = shade(colour, (cardGrain(x * 1.5, y * 1.5) - 0.5) * 0.05);
  colour = mix(colour, [255, 255, 255], smoothstep(34, 10, y) * smoothstep(-26, -10, dFace) * 0.16);
  colour = mix(colour, rgb("#9cc2ff"), smoothstep(-3, -0.4, dFace) * 0.8);
  return over(out, paint(colour, cover(dFace)));
}

// ---------------------------------------------------------------------------
// The board frame: a turned wooden moulding. Its grain and bevel follow the outline, which is
// what lets a 9-slice stretch it to any board size without the light sliding off.
// ---------------------------------------------------------------------------

const FRAME = 160;
const frameGrain = makeFbm(0x3f90, 4);

// Walnut rather than pine: a dark frame sits the lit mat inside it instead of competing.
const WOOD_DARK = rgb("#2b1808");
const WOOD_MID = rgb("#68391a");
const WOOD_LIGHT = rgb("#ab7c45");

function boardFrame(x: number, y: number): Rgba {
  const d = roundedRect(x, y, 0, 0, FRAME, FRAME, 30);
  const inside = cover(d);
  if (inside <= 0) return CLEAR;
  const depth = -d; // pixels in from the outer edge

  // Growth rings that run parallel to the moulding, wandering a little as real grain does.
  const wander = (frameGrain(x * 0.035, y * 0.035) - 0.5) * 7;
  const ring = Math.sin((depth + wander) * 0.85) * 0.5 + 0.5;
  let colour = mix(WOOD_DARK, WOOD_MID, 0.35 + ring * 0.5);
  colour = shade(colour, (frameGrain(x * 0.22, y * 0.22) - 0.5) * 0.14);

  // The turned profile: a raised outer bead, a hollow, then the inner lip round the board.
  colour = shade(colour, smoothstep(14, 5, depth) * 0.3);
  colour = mix(colour, WOOD_LIGHT, smoothstep(12, 7, depth) * smoothstep(2, 6, depth) * 0.45);
  colour = shade(colour, -smoothstep(16, 27, depth) * smoothstep(40, 30, depth) * 0.22);
  colour = mix(colour, WOOD_LIGHT, smoothstep(40, 46, depth) * smoothstep(52, 46, depth) * 0.3);
  colour = shade(colour, -smoothstep(46, 53, depth) * 0.55);
  colour = shade(colour, -smoothstep(2.5, 0, depth) * 0.6);

  // Past the lip the frame is just the dark well the mat sits in.
  const well = smoothstep(53, 58, depth);
  colour = mix(colour, rgb("#150c05"), well);
  return paint(colour, inside);
}

// ---------------------------------------------------------------------------
// Avatar ring and the gold starburst behind VS badges and win banners.
// ---------------------------------------------------------------------------

function avatarRing(x: number, y: number): Rgba {
  const r = Math.hypot(x - 80, y - 80);
  const band = 1 - smoothstep(5.5, 7.5, Math.abs(r - 72));
  if (band <= 0) return CLEAR;
  const t = clamp01((r - 64.5) / 15);
  // Bevelled metal: bright along the top of the band, dark where it turns away.
  let colour = mix(rgb("#fff0b4"), rgb("#c07f06"), smoothstep(0.15, 0.95, t));
  colour = mix(colour, rgb("#fffbe6"), smoothstep(0.42, 0.2, t) * 0.7);
  // The light comes from above, so the lower arc of the ring sits in shadow.
  colour = shade(colour, -smoothstep(-0.2, 1, (y - 80) / 80) * 0.3);
  const outline = smoothstep(6.6, 7.4, Math.abs(r - 72));
  colour = mix(colour, rgb("#573400"), outline);
  return paint(colour, band);
}

const BURST = 240;

function burst(x: number, y: number): Rgba {
  const dx = x - BURST / 2;
  const dy = y - BURST / 2;
  const r = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  // Fourteen points, every other one a little shorter, so it reads as a sunburst not a gear.
  const wave = Math.cos(angle * 14);
  const reach = 78 + 38 * (wave * 0.5 + 0.5) * (0.82 + 0.18 * Math.cos(angle * 7));
  let out: Rgba = paint(rgb("#ffb52e"), smoothstep(reach + 26, reach - 6, r) * 0.28);
  const star = cover(r - reach);
  if (star > 0) {
    let colour = mix(rgb("#fff4b8"), rgb("#ffab1f"), smoothstep(0, 0.8, r / reach));
    colour = mix(colour, rgb("#e2610b"), smoothstep(0.78, 1, r / reach));
    colour = mix(colour, rgb("#8a3a00"), smoothstep(-2.4, -0.4, r - reach));
    out = over(out, paint(colour, star));
  }
  const disc = cover(r - 66);
  if (disc > 0) {
    let colour = mix(rgb("#e4560c"), rgb("#a8300a"), clamp01((y - 54) / 132));
    colour = mix(colour, rgb("#fde68a"), smoothstep(-6, -1.5, r - 66));
    out = over(out, paint(colour, disc));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Icons: crisp vector glyphs, white so the game can tint them.
// ---------------------------------------------------------------------------

function starPoints(cx: number, cy: number, points: number, outer: number, inner: number): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
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
// Sound. Everything is synthesized to 16-bit PCM WAV: the gutis are wooden, so their sounds
// are built by modal synthesis - a handful of inharmonic partials struck at once, the high
// ones dying away first - over a noise transient, then put in a small room.
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100;

function seconds(duration: number): number {
  return Math.max(1, Math.round(duration * SAMPLE_RATE));
}

function blank(duration: number): Float32Array {
  return new Float32Array(seconds(duration));
}

/** Mixes `src` into `into` starting at `at` seconds. Anything past the end is dropped. */
function addAt(into: Float32Array, src: Float32Array, at: number, gain = 1): void {
  const start = Math.round(at * SAMPLE_RATE);
  for (let i = 0; i < src.length; i++) {
    const j = start + i;
    if (j < 0 || j >= into.length) continue;
    into[j] = (into[j] ?? 0) + (src[i] ?? 0) * gain;
  }
}

function noiseSource(seed: number): () => number {
  const rand = mulberry32(seed);
  return () => rand() * 2 - 1;
}

/** One-pole low pass; `cutoff` in Hz. Used to take the hiss off raw noise. */
function lowPass(input: Float32Array, cutoff: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * cutoff) / SAMPLE_RATE);
  const out = new Float32Array(input.length);
  let last = 0;
  for (let i = 0; i < input.length; i++) {
    last = (input[i] ?? 0) * (1 - a) + last * a;
    out[i] = last;
  }
  return out;
}

/** A two-pole band pass, so a noise burst can be given a pitch without becoming a tone. */
function bandPass(input: Float32Array, centre: number, q: number): Float32Array {
  const w = (2 * Math.PI * centre) / SAMPLE_RATE;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = alpha;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w);
  const a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i] ?? 0;
    const y0 = (b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/**
 * A struck wooden body. The ratios are the ones a free bar of wood rings at, so the result is
 * a "tok" rather than a beep; each partial is given its own decay, shortest at the top.
 */
function woodenStrike(
  f0: number,
  duration: number,
  partials: readonly (readonly [ratio: number, amp: number, tau: number])[],
): Float32Array {
  const out = blank(duration);
  for (const [ratio, amp, tau] of partials) {
    const freq = f0 * ratio;
    if (freq >= SAMPLE_RATE / 2) continue;
    const w = (2 * Math.PI * freq) / SAMPLE_RATE;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      // A 1.5 ms swell keeps the attack from clicking, then it decays as a struck bar does.
      const rise = Math.min(1, t / 0.0015);
      out[i] = (out[i] ?? 0) + Math.sin(w * i) * amp * rise * Math.exp(-t / tau);
    }
  }
  return out;
}

/** The knock of the strike itself: a few milliseconds of noise with a pitch to it. */
function transient(duration: number, centre: number, tau: number, seed: number): Float32Array {
  const raw = blank(duration);
  const noise = noiseSource(seed);
  for (let i = 0; i < raw.length; i++) raw[i] = noise() * Math.exp(-i / SAMPLE_RATE / tau);
  return bandPass(raw, centre, 1.1);
}

/** A plucked string, Karplus-Strong: noise round a delay line the length of one period. */
function pluck(freq: number, duration: number, damping: number, seed: number): Float32Array {
  const period = Math.max(2, Math.round(SAMPLE_RATE / freq));
  const line = new Float32Array(period);
  const noise = noiseSource(seed);
  for (let i = 0; i < period; i++) line[i] = noise();
  const out = blank(duration);
  for (let i = 0; i < out.length; i++) {
    const head = i % period;
    const next = (i + 1) % period;
    const value = line[head] ?? 0;
    out[i] = value;
    line[head] = damping * 0.5 * (value + (line[next] ?? 0));
  }
  // Without this the string would start at full volume on sample zero and click.
  for (let i = 0; i < Math.min(out.length, seconds(0.004)); i++) {
    out[i] = (out[i] ?? 0) * (i / seconds(0.004));
  }
  return out;
}

function comb(input: Float32Array, delay: number, feedback: number, damp: number): Float32Array {
  const buffer = new Float32Array(delay);
  const out = new Float32Array(input.length);
  let store = 0;
  for (let i = 0; i < input.length; i++) {
    const head = i % delay;
    const value = buffer[head] ?? 0;
    out[i] = value;
    store = value * (1 - damp) + store * damp;
    buffer[head] = (input[i] ?? 0) + store * feedback;
  }
  return out;
}

function allPass(input: Float32Array, delay: number, gain: number): Float32Array {
  const buffer = new Float32Array(delay);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const head = i % delay;
    const stored = buffer[head] ?? 0;
    const value = input[i] ?? 0;
    out[i] = -value + stored;
    buffer[head] = value + stored * gain;
  }
  return out;
}

/**
 * A small room, the Schroeder way: parallel combs for the body of the tail, then all-passes to
 * smear it. `amount` is how much of the wet signal joins the dry one.
 */
function room(input: Float32Array, amount: number, size = 1): Float32Array {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round(d * size));
  let wet: Float32Array = new Float32Array(input.length);
  for (const delay of combs) {
    const tail = comb(input, delay, 0.78, 0.3);
    for (let i = 0; i < wet.length; i++) wet[i] = (wet[i] ?? 0) + (tail[i] ?? 0) * 0.25;
  }
  wet = allPass(allPass(wet, Math.round(556 * size), 0.5), Math.round(441 * size), 0.5);
  const out = new Float32Array(input.length);
  for (let i = 0; i < out.length; i++) out[i] = (input[i] ?? 0) + (wet[i] ?? 0) * amount;
  return out;
}

/** Scales the whole sound so its loudest sample sits at `peak`, then softens any overshoot. */
function normalize(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i] ?? 0));
  const gain = max > 0 ? peak / max : 0;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh((samples[i] ?? 0) * gain * 1.1) * 0.94;
  return out;
}

/** Fades the last 8 ms out, so nothing ends on a step the speaker turns into a click. */
function fadeOut(samples: Float32Array): Float32Array {
  const tail = Math.min(samples.length, seconds(0.008));
  for (let i = 0; i < tail; i++) {
    const j = samples.length - tail + i;
    samples[j] = (samples[j] ?? 0) * (1 - i / tail);
  }
  return samples;
}

/** Wood on cloth: the guti lands on the mat, so it thuds far more than it rings. */
function matLanding(pitch: number, seed: number): Float32Array {
  const out = blank(0.3);
  addAt(
    out,
    woodenStrike(pitch, 0.22, [
      [1, 0.5, 0.045],
      [2.76, 0.2, 0.026],
      [5.4, 0.08, 0.014],
    ]),
    0,
  );
  // The low body of the thump, which is what carries through a phone speaker.
  const body = blank(0.2);
  for (let i = 0; i < body.length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 128 - 46 * Math.min(1, t / 0.09);
    body[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / 0.055) * Math.min(1, t / 0.002);
  }
  addAt(out, body, 0, 0.9);
  addAt(out, lowPass(transient(0.06, 900, 0.012, seed), 3200), 0, 0.6);
  return out;
}

/**
 * The throw itself, and only that: the gutis are in the air for THROW_MS, and each one's
 * landing is played by GameScene as that guti arrives, so this must not land them too.
 */
function synthThrow(): Float32Array {
  const out = blank(0.95);
  // The hand letting go - a scrape of wood against wood as the four of them part.
  addAt(out, transient(0.09, 1500, 0.02, 11), 0, 0.8);
  addAt(
    out,
    woodenStrike(760, 0.12, [
      [1, 0.3, 0.022],
      [2.76, 0.14, 0.013],
    ]),
    0.004,
    0.6,
  );

  // Then the air they turn over in, swelling and thinning out as they fall away.
  const air = blank(0.86);
  const noise = noiseSource(19);
  for (let i = 0; i < air.length; i++) air[i] = noise();
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const flight = blank(0.86);
  for (let i = 0; i < flight.length; i++) {
    const t = i / SAMPLE_RATE;
    // The band rises as they climb and falls back as they come down.
    const centre = 520 + 900 * Math.sin(Math.PI * Math.min(1, t / 0.8));
    const w = (2 * Math.PI * centre) / SAMPLE_RATE;
    const alpha = Math.sin(w) / (2 * 1.4);
    const a0 = 1 + alpha;
    const x0 = air[i] ?? 0;
    const y0 = (alpha * x0 - alpha * x2 + 2 * Math.cos(w) * y1 - (1 - alpha) * y2) / a0;
    flight[i] = y0 * smoothstep(0, 0.1, t) * (1 - smoothstep(0.5, 0.88, t));
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  addAt(out, flight, 0.03, 0.55);
  // Two of them clipping each other mid-flight, which is what four sticks actually do.
  addAt(out, woodenStrike(1240, 0.1, [[1, 0.25, 0.016]]), 0.3, 0.45);
  addAt(out, woodenStrike(1020, 0.1, [[1, 0.22, 0.014]]), 0.52, 0.4);
  return fadeOut(normalize(room(out, 0.08), 0.5));
}

function synthLand(): Float32Array {
  return fadeOut(normalize(room(matLanding(455, 5), 0.1), 0.6));
}

function synthTokkaHit(): Float32Array {
  const out = blank(0.42);
  // Guti striking guti: hard, bright and quick, the sound the whole game turns on.
  addAt(
    out,
    woodenStrike(1150, 0.34, [
      [1, 1, 0.09],
      [2.76, 0.6, 0.052],
      [5.4, 0.34, 0.03],
      [8.93, 0.17, 0.017],
      [13.34, 0.08, 0.01],
    ]),
    0,
  );
  addAt(out, transient(0.05, 3100, 0.0055, 3), 0, 0.85);
  // A trace of the mat under the strike, so it is not floating in mid-air.
  addAt(out, lowPass(transient(0.08, 420, 0.02, 9), 1400), 0.001, 0.35);
  return fadeOut(normalize(room(out, 0.16), 0.9));
}

function synthDie(): Float32Array {
  const out = blank(0.72);
  // Two woodblock notes falling away - a shrug, not a buzzer.
  addAt(
    out,
    woodenStrike(620, 0.3, [
      [1, 0.8, 0.07],
      [2.76, 0.3, 0.035],
    ]),
    0,
  );
  addAt(
    out,
    woodenStrike(466, 0.4, [
      [1, 0.8, 0.1],
      [2.76, 0.28, 0.045],
    ]),
    0.13,
  );
  // A low pad underneath that sinks as the notes land.
  const pad = blank(0.6);
  for (let i = 0; i < pad.length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 168 - 42 * Math.min(1, t / 0.4);
    pad[i] =
      (Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(4 * Math.PI * freq * t)) *
      Math.min(1, t / 0.02) *
      Math.exp(-t / 0.22);
  }
  addAt(out, pad, 0.02, 0.5);
  return fadeOut(normalize(room(out, 0.2), 0.62));
}

function synthWin(): Float32Array {
  const out = blank(2);
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const at = i * 0.14;
    // Two plucks a hair apart in tuning: one string sounds thin, two sound like an instrument.
    addAt(out, pluck(freq, 1.5, 0.996, 100 + i), at, 0.5);
    addAt(out, pluck(freq * 1.004, 1.4, 0.995, 200 + i), at + 0.006, 0.34);
    // The bell that tops each note off.
    addAt(
      out,
      woodenStrike(freq * 2, 0.5, [
        [1, 0.2, 0.16],
        [2.4, 0.08, 0.09],
      ]),
      at,
      0.5,
    );
  });
  // The last chord held under the arpeggio, so the fanfare has somewhere to land.
  notes.forEach((freq, i) => {
    addAt(out, pluck(freq, 1.2, 0.997, 300 + i), 0.58, 0.3);
  });
  return fadeOut(normalize(room(out, 0.3, 1.25), 0.85));
}

function synthCoin(): Float32Array {
  const out = blank(0.75);
  // The two-note chime every game uses for money, because it reads instantly.
  [
    [988, 0],
    [1319, 0.085],
  ].forEach(([freq, at], i) => {
    addAt(
      out,
      woodenStrike(freq ?? 988, 0.6, [
        [1, 0.7, 0.2],
        [2, 0.3, 0.13],
        [3.01, 0.12, 0.07],
      ]),
      at ?? 0,
      0.8,
    );
    addAt(out, transient(0.02, 5200, 0.003, 40 + i), at ?? 0, 0.3);
  });
  return fadeOut(normalize(room(out, 0.22), 0.7));
}

function synthUiTap(): Float32Array {
  const out = blank(0.12);
  addAt(out, transient(0.035, 2400, 0.007, 77), 0, 1);
  addAt(out, woodenStrike(1500, 0.08, [[1, 0.35, 0.018]]), 0, 0.7);
  return fadeOut(normalize(out, 0.38));
}

function synthUiOpen(): Float32Array {
  const raw = blank(0.3);
  const noise = noiseSource(55);
  for (let i = 0; i < raw.length; i++) raw[i] = noise();
  // A band sweeping upwards: the whoosh of a panel sliding in.
  const out = blank(0.3);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const centre = 380 + 2100 * smoothstep(0, 0.22, t);
    const w = (2 * Math.PI * centre) / SAMPLE_RATE;
    const alpha = Math.sin(w) / (2 * 2.2);
    const a0 = 1 + alpha;
    const x0 = raw[i] ?? 0;
    const y0 = (alpha * x0 - alpha * x2 + 2 * Math.cos(w) * y1 - (1 - alpha) * y2) / a0;
    out[i] = y0 * Math.sin(Math.PI * Math.min(1, t / 0.3)) ** 1.5;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return fadeOut(normalize(out, 0.4));
}

function synthTick(): Float32Array {
  const out = blank(0.08);
  addAt(out, transient(0.02, 4200, 0.0035, 91), 0, 1);
  addAt(out, woodenStrike(2100, 0.05, [[1, 0.3, 0.008]]), 0, 0.6);
  return fadeOut(normalize(out, 0.34));
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

function writeWav(name: string, samples: Float32Array): void {
  writeFileSync(`${outDir}/${name}`, encodeWav(samples));
  console.log(`wrote ${name}`);
}

async function main(): Promise<void> {
  await writePng("guti-flat.png", GUTI_W, GUTI_H, flatGuti);
  await writePng("guti-round.png", GUTI_W, GUTI_H, roundGuti);
  await writePng("courtyard-bg.png", MAT_W, MAT_H, mat);
  await writePng("ui-bg.png", UI_W, UI_H, menuBackground);
  for (const [name, art] of Object.entries(BUTTON_ART)) {
    await writePng(`btn-${name}.png`, BTN, BTN, buttonShader(art));
  }
  await writePng("panel-glass.png", PANEL, PANEL, glassPanel);
  await writePng("panel-card.png", PANEL, PANEL, cardPanel);
  await writePng("board-frame.png", FRAME, FRAME, boardFrame);
  await writePng("avatar-ring.png", 160, 160, avatarRing);
  await writePng("burst.png", BURST, BURST, burst);
  for (const [name, body] of Object.entries(ICONS)) {
    await writeSvgPng(`icon-${name}.png`, iconSvg(body));
  }

  writeWav("throw.wav", synthThrow());
  writeWav("land.wav", synthLand());
  writeWav("tokka-hit.wav", synthTokkaHit());
  writeWav("die.wav", synthDie());
  writeWav("win.wav", synthWin());
  writeWav("coin.wav", synthCoin());
  writeWav("ui-tap.wav", synthUiTap());
  writeWav("ui-open.wav", synthUiOpen());
  writeWav("tick.wav", synthTick());
}

await main();
