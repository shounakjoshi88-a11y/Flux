const CACHE_NAME = "flux-shell-v3";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(STATIC_ASSETS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isStatic = event.request.destination === "script"
    || event.request.destination === "style"
    || event.request.destination === "font"
    || event.request.destination === "image"
    || url.pathname === "/"
    || url.pathname === "/index.html"
    || url.pathname.startsWith("/icon-")
    || url.pathname === "/logo.svg"
    || url.pathname === "/manifest.json";

  const isApi = url.pathname.startsWith("/flux_ask")
    || url.pathname.startsWith("/conversation")
    || url.pathname.startsWith("/conversations")
    || url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/skills/")
    || url.pathname.startsWith("/whoami")
    || url.pathname.startsWith("/ping")
    || url.pathname.startsWith("/health");

  if (isApi) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ error: "You are offline. Some features may be unavailable." }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      )),
    );
    return;
  }

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      }),
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});
