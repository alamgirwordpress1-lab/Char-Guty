/**
 * Zips a platform build for upload: `tsx scripts/zip-build.ts fbinstant|crazygames`, run
 * after `vite build --mode` with the same name. index.html has to sit at the root of the
 * archive, and Facebook also wants fbapp-config.json there. The CrazyGames upload leaves out
 * what only the other targets use: the custom-domain CNAME, Facebook's config, and the web
 * app's install manifest, service worker, icons and link-preview card.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

interface Target {
  readonly required: readonly string[];
  readonly skip: readonly string[];
}

const TARGETS: Record<string, Target> = {
  fbinstant: { required: ["index.html", "fbapp-config.json"], skip: [] },
  crazygames: {
    required: ["index.html"],
    skip: [
      "CNAME",
      "fbapp-config.json",
      "manifest.webmanifest",
      "sw.js",
      "share-card.png",
      "icon-180.png",
      "icon-192.png",
      "icon-512.png",
    ],
  },
};

const targetName = process.argv[2] ?? "";
const target = TARGETS[targetName];
if (target === undefined) {
  throw new Error(`usage: tsx scripts/zip-build.ts ${Object.keys(TARGETS).join("|")}`);
}
const { required, skip } = target;

const gameDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(gameDir, "build", targetName);
const zipPath = join(gameDir, "build", `char-guty-${targetName}.zip`);

function collect(dir: string, files: Record<string, Uint8Array>): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const entry = relative(buildDir, path).split(sep).join("/");
    if (statSync(path).isDirectory()) collect(path, files);
    else if (!skip.includes(entry)) files[entry] = readFileSync(path);
  }
}

const files: Record<string, Uint8Array> = {};
collect(buildDir, files);
for (const file of required) {
  if (!(file in files)) throw new Error(`${file} is missing from build/${targetName}`);
}
mkdirSync(dirname(zipPath), { recursive: true });
writeFileSync(zipPath, zipSync(files, { level: 9 }));
console.log(`wrote ${relative(gameDir, zipPath)} (${Object.keys(files).length} files)`);
