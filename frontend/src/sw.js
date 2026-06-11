// Minimal service worker — enables PWA installability without aggressive caching
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", (event) => {
  // Network-first: always fetch fresh, fall back to cache only if offline
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
