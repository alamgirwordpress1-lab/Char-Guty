/**
 * Zips the fbinstant build for Facebook's web hosting: index.html and fbapp-config.json
 * must sit at the root of the archive. Run after `vite build --mode fbinstant`.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const gameDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(gameDir, "build", "fbinstant");
const zipPath = join(gameDir, "build", "char-guty-fbinstant.zip");

function collect(dir: string, files: Record<string, Uint8Array>): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collect(path, files);
    else files[relative(buildDir, path).split(sep).join("/")] = readFileSync(path);
  }
}

const files: Record<string, Uint8Array> = {};
collect(buildDir, files);
for (const required of ["index.html", "fbapp-config.json"]) {
  if (!(required in files)) throw new Error(`${required} is missing from build/fbinstant`);
}
mkdirSync(dirname(zipPath), { recursive: true });
writeFileSync(zipPath, zipSync(files, { level: 9 }));
console.log(`wrote ${relative(gameDir, zipPath)} (${Object.keys(files).length} files)`);
