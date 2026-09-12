import { defineConfig, loadEnv } from "vite";
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

/**
 * Only the browser build is installable: the manifest and service worker are what let
 * Chrome offer "Add to Home screen", and they would be dead weight (or interfere) inside
 * Facebook's iframe and Capacitor's file:// shell.
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const fbinstant = mode === "fbinstant";
  const android = mode === "android";
  const web = mode === "web";
  return {
    // Relative URLs: Facebook serves the bundle from its own path, Android from a file
    // path, and GitHub Pages from a /<repo>/ subpath.
    base: "./",
    plugins: fbinstant
      ? [instantGamesSdk()]
      : web
        ? [webAppManifest(env.VITE_SITE_URL ?? "/")]
        : [],
    server: { port: 5173 },
    build: {
      outDir: fbinstant
        ? "build/fbinstant"
        : android
          ? "build/android"
          : web
            ? "build/web"
            : "dist",
      sourcemap: !fbinstant && !android && !web,
    },
  };
});
