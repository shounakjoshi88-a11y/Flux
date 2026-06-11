import { serve, file } from "bun";
import index from "./index.html";

const SRC = import.meta.dir;

// Static files must come BEFORE the catch-all or Bun routes everything to index.html
const STATIC_ROUTES: Record<string, any> = {
  "/manifest.json": file(SRC + "/manifest.json"),
  "/sw.js": file(SRC + "/sw.js"),
  "/logo.svg": file(SRC + "/logo.svg"),
  "/icon-192.svg": file(SRC + "/icon-192.svg"),
  "/icon-512.svg": file(SRC + "/icon-512.svg"),
  "/icon-192.png": file(SRC + "/icon-192.png"),
  "/icon-512.png": file(SRC + "/icon-512.png"),
  "/icon-192-maskable.png": file(SRC + "/icon-192-maskable.png"),
  "/icon-512-maskable.png": file(SRC + "/icon-512-maskable.png"),
  "/apple-touch-icon.png": file(SRC + "/apple-touch-icon.png"),
};

const server = serve({
  routes: {
    ...STATIC_ROUTES,
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
