import { serve } from "bun";

const SRC = import.meta.dir;
const DIST = import.meta.dir + "/../dist";

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  ".map": "application/json",
};

const certPath = import.meta.dir + "/../../certs";
const [certExists, keyExists] = await Promise.all([
  Bun.file(certPath + "/cert.pem").exists(),
  Bun.file(certPath + "/key.pem").exists(),
]);
const tls = certExists && keyExists
  ? { cert: Bun.file(certPath + "/cert.pem"), key: Bun.file(certPath + "/key.pem") }
  : undefined;

async function serveFile(filePath: string): Promise<Response> {
  const buf = await Bun.file(filePath).bytes();
  const ext = filePath.substring(filePath.lastIndexOf("."));
  return new Response(buf, {
    headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
  });
}

const server = serve({
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;

    // Try dist/
    const distPath = DIST + path;
    const distFile = Bun.file(distPath);
    if (await distFile.exists()) return serveFile(distPath);

    // Try src/
    const srcPath = SRC + path;
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) return serveFile(srcPath);

    // SPA fallback
    const distIndex = DIST + "/index.html";
    if (await Bun.file(distIndex).exists()) return serveFile(distIndex);
    return serveFile(SRC + "/index.html");
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },

  ...(tls ? { tls } : {}),
});

console.log(`Server running at ${server.url}`);
