/**
 * Generates apps/game/public/assets/share-*.png: the app badges on the invite sheet, each
 * app's own mark on a disc of its colour with a soft shadow, rasterized by sharp at 128px.
 * The marks are Simple Icons' (simpleicons.org, CC0). Kept apart from generate-assets.ts so
 * redrawing them leaves the rest of the art alone. Re-run with
 * `pnpm -F @char-guty/game exec tsx scripts/generate-share-icons.ts`.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SIZE = 128;
const CENTER = SIZE / 2;
const RADIUS = 56;
const outDir = fileURLToPath(new URL("../public/assets", import.meta.url));

/** The marks, drawn on a 24x24 grid. */
const MARK = {
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  messenger:
    "M12 0C5.24 0 0 4.952 0 11.64c0 3.499 1.434 6.521 3.769 8.61a.96.96 0 0 1 .323.683l.065 2.135a.96.96 0 0 0 1.347.85l2.381-1.053a.96.96 0 0 1 .641-.046A13 13 0 0 0 12 23.28c6.76 0 12-4.952 12-11.64S18.76 0 12 0m6.806 7.44c.522-.03.971.567.63 1.094l-4.178 6.457a.707.707 0 0 1-.977.208l-3.87-2.504a.44.44 0 0 0-.49.007l-4.363 3.01c-.637.438-1.415-.317-.995-.966l4.179-6.457a.706.706 0 0 1 .977-.21l3.87 2.505c.15.097.344.094.491-.007l4.362-3.008a.7.7 0 0 1 .364-.13",
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  telegram:
    "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  x: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
} as const;

/** A mark scaled to `size` px, centred on the badge. */
function mark(path: string, size: number, fill = "#ffffff"): string {
  const offset = CENTER - size / 2;
  return `<path d="${path}" fill="${fill}" transform="translate(${offset} ${offset}) scale(${size / 24})"/>`;
}

function disc(fill: string, radius = RADIUS): string {
  return `<circle cx="${CENTER}" cy="${CENTER}" r="${radius}" fill="${fill}"/>`;
}

const BADGES: Record<string, string> = {
  whatsapp: disc("#25d366") + mark(MARK.whatsapp, 66),
  messenger: disc("url(#messenger)") + mark(MARK.messenger, 62),
  // These two marks are discs already, with the letter or the plane cut out of them: a white
  // disc just inside shows through the cut.
  facebook: disc("#ffffff", RADIUS - 4) + mark(MARK.facebook, RADIUS * 2, "#1877f2"),
  telegram: disc("#ffffff", RADIUS - 4) + mark(MARK.telegram, RADIUS * 2, "#26a5e4"),
  x:
    disc("#000000") +
    `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS - 1.5}" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="3"/>` +
    mark(MARK.x, 50),
  email:
    disc("#64748b") +
    `<rect x="31" y="42" width="66" height="46" rx="8" fill="#ffffff"/>` +
    `<path d="M37 49 L64 69 L91 49" fill="none" stroke="#64748b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // A speech bubble with three dots.
  sms:
    disc("#f59e0b") +
    `<path d="M44 36 H84 A14 14 0 0 1 98 50 V70 A14 14 0 0 1 84 84 H56 L40 96 L43 84 A14 14 0 0 1 30 70 V50 A14 14 0 0 1 44 36 Z" fill="#ffffff"/>` +
    `<circle cx="50" cy="60" r="5" fill="#f59e0b"/><circle cx="64" cy="60" r="5" fill="#f59e0b"/><circle cx="78" cy="60" r="5" fill="#f59e0b"/>`,
  // The usual share mark: three dots joined by two lines.
  more:
    disc("#6366f1") +
    `<path d="M47 64 L81 44 M47 64 L81 84" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>` +
    `<circle cx="45" cy="64" r="11" fill="#ffffff"/><circle cx="83" cy="43" r="11" fill="#ffffff"/><circle cx="83" cy="85" r="11" fill="#ffffff"/>`,
};

const DEFS = `<defs>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.35"/>
  </filter>
  <radialGradient id="messenger" cx="0.19" cy="0.99" r="1.09">
    <stop offset="0" stop-color="#0099ff"/>
    <stop offset="0.61" stop-color="#a033ff"/>
    <stop offset="0.93" stop-color="#ff5280"/>
    <stop offset="1" stop-color="#ff7061"/>
  </radialGradient>
</defs>`;

for (const [name, body] of Object.entries(BADGES)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${DEFS}<g filter="url(#shadow)">${body}</g></svg>`;
  const file = `share-${name}.png`;
  writeFileSync(`${outDir}/${file}`, await sharp(Buffer.from(svg)).png().toBuffer());
  console.log(`wrote ${file}`);
}
