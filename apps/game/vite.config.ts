import { defineConfig } from "vite";
import type { Plugin } from "vite";

/** Inside Facebook the Instant Games SDK must load before the game's own script. */
function instantGamesSdk(): Plugin {
  return {
    name: "char-guty:instant-games-sdk",
    transformIndexHtml: () => [
      {
        tag: "script",
        attrs: { src: "https://connect.facebook.net/en_US/fbinstant.8.0.js" },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const fbinstant = mode === "fbinstant";
  return {
    // Relative URLs: Facebook serves the bundle from its own path, not a site root.
    base: "./",
    plugins: fbinstant ? [instantGamesSdk()] : [],
    server: { port: 5173 },
    build: { outDir: fbinstant ? "build/fbinstant" : "dist", sourcemap: !fbinstant },
  };
});
