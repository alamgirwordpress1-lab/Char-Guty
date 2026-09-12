// Chrome only offers "Add to Home screen" for a page whose service worker listens for
// fetch, so this exists to make the game installable - nothing more. The listener
// deliberately does nothing: taking over requests (respondWith, or claiming clients
// mid-load) stalls Phaser's asset loading, and caching would pin players to an old
// build against a live server.
self.addEventListener("fetch", () => {});
