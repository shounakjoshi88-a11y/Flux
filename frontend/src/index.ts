import { serve, file } from "bun";
import index from "./index.html";

const SRC = import.meta.dir;

const CACHE_10Y = "public, max-age=31536000, immutable";
const CACHE_1H = "public, max-age=3600";

const STATIC_ROUTES: Record<string, any> = {
  "/manifest.json": new Response(await Bun.file(SRC + "/manifest.json").bytes(), {
    headers: { "Content-Type": "application/json", "Cache-Control": CACHE_1H },
  }),
  "/sw.js": new Response(await Bun.file(SRC + "/sw.js").bytes(), {
    headers: { "Content-Type": "application/javascript", "Cache-Control": CACHE_1H },
  }),
  "/logo.svg": new Response(await Bun.file(SRC + "/logo.svg").bytes(), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": CACHE_10Y },
  }),
  "/icon-192.svg": new Response(await Bun.file(SRC + "/icon-192.svg").bytes(), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": CACHE_10Y },
  }),
  "/icon-512.svg": new Response(await Bun.file(SRC + "/icon-512.svg").bytes(), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": CACHE_10Y },
  }),
  "/icon-192.png": new Response(await Bun.file(SRC + "/icon-192.png").bytes(), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE_10Y },
  }),
  "/icon-512.png": new Response(await Bun.file(SRC + "/icon-512.png").bytes(), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE_10Y },
  }),
  "/icon-192-maskable.png": new Response(await Bun.file(SRC + "/icon-192-maskable.png").bytes(), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE_10Y },
  }),
  "/icon-512-maskable.png": new Response(await Bun.file(SRC + "/icon-512-maskable.png").bytes(), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE_10Y },
  }),
  "/apple-touch-icon.png": new Response(await Bun.file(SRC + "/apple-touch-icon.png").bytes(), {
    headers: { "Content-Type": "image/png", "Cache-Control": CACHE_10Y },
  }),
};

const certPath = import.meta.dir + "/../../certs";
const certFile = Bun.file(certPath + "/cert.pem");
const keyFile = Bun.file(certPath + "/key.pem");

const [certExists, keyExists] = await Promise.all([certFile.exists(), keyFile.exists()]);
const tls = certExists && keyExists ? { cert: certFile, key: keyFile } : undefined;

const server = serve({
  routes: {
    ...STATIC_ROUTES,
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },

  ...(tls ? { tls } : {}),
});

console.log(`Server running at ${server.url}`);
