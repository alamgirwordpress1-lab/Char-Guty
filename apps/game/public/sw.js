// Chrome only offers "Add to Home screen" for a page with a service worker that handles
// fetch, so this exists to make the game installable - nothing more. It deliberately
// caches nothing: a stale cache would pin players to an old build against a live server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => event.respondWith(fetch(event.request)));
