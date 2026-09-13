import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";

const INSTANT_GAMES_SDK = "https://connect.facebook.net/en_US/fbinstant.8.0.js";
const CRAZYGAMES_SDK = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

/** Where each platform build goes; any other mode is a dev build in dist/, with sourcemaps. */
const OUT_DIRS: Record<string, string> = {
  fbinstant: "build/fbinstant",
  crazygames: "build/crazygames",
  android: "build/android",
  web: "build/web",
};

/** Inside Facebook or CrazyGames, the host's SDK must load before the game's own script. */
function platformSdk(src: string): Plugin {
  return {
    name: "char-guty:platform-sdk",
    transformIndexHtml: () => [{ tag: "script", attrs: { src }, injectTo: "head-prepend" }],
  };
}

/**
 * Only the browser build is installable: the manifest and service worker are what let
 * Chrome offer "Add to Home screen", and they would be dead weight (or interfere) inside
 * Facebook's or CrazyGames' frame and Capacitor's file:// shell.
 */
function webAppManifest(siteUrl: string): Plugin {
  const card = `${siteUrl}share-card.png`;
  return {
    name: "char-guty:web-app-manifest",
    transformIndexHtml: () => [
      // Absolute URLs: Facebook's scraper does not resolve relative ones.
      { tag: "meta", attrs: { property: "og:type", content: "website" }, injectTo: "head" },
      { tag: "meta", attrs: { property: "og:title", content: "Char Guty" }, injectTo: "head" },
      {
        tag: "meta",
        attrs: {
          property: "og:description",
          content: "The classic four-piece game - play free with your friends.",
        },
        injectTo: "head",
      },
      { tag: "meta", attrs: { property: "og:image", content: card }, injectTo: "head" },
      { tag: "meta", attrs: { property: "og:url", content: siteUrl }, injectTo: "head" },
      {
        tag: "meta",
        attrs: { name: "twitter:card", content: "summary_large_image" },
        injectTo: "head",
      },
      { tag: "link", attrs: { rel: "manifest", href: "manifest.webmanifest" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "theme-color", content: "#0a173f" }, injectTo: "head" },
      {
        tag: "link",
        attrs: { rel: "apple-touch-icon", href: "icon-180.png" },
        injectTo: "head",
      },
      {
        tag: "script",
        children:
          'if ("serviceWorker" in navigator) ' +
          'addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));',
        injectTo: "body",
      },
    ],
  };
}

function modePlugins(mode: string, siteUrl: string): Plugin[] {
  if (mode === "fbinstant") return [platformSdk(INSTANT_GAMES_SDK)];
  if (mode === "crazygames") return [platformSdk(CRAZYGAMES_SDK)];
  if (mode === "web") return [webAppManifest(siteUrl)];
  return [];
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    // Relative URLs: Facebook and CrazyGames serve the bundle from their own paths, Android
    // from a file path, and GitHub Pages from a /<repo>/ subpath.
    base: "./",
    plugins: modePlugins(mode, env.VITE_SITE_URL ?? "/"),
    server: { port: 5173 },
    build: {
      outDir: OUT_DIRS[mode] ?? "dist",
      sourcemap: !(mode in OUT_DIRS),
    },
  };
});
