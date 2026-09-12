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

/**
 * Only the browser build is installable: the manifest and service worker are what let
 * Chrome offer "Add to Home screen", and they would be dead weight (or interfere) inside
 * Facebook's iframe and Capacitor's file:// shell.
 */
function webAppManifest(): Plugin {
  return {
    name: "char-guty:web-app-manifest",
    transformIndexHtml: () => [
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
  const fbinstant = mode === "fbinstant";
  const android = mode === "android";
  const web = mode === "web";
  return {
    // Relative URLs: Facebook serves the bundle from its own path, Android from a file
    // path, and GitHub Pages from a /<repo>/ subpath.
    base: "./",
    plugins: fbinstant ? [instantGamesSdk()] : web ? [webAppManifest()] : [],
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
