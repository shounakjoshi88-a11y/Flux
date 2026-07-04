import tailwind from "bun-plugin-tailwind";
import { rm, cp, rename, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const outdir = path.join(process.cwd(), "dist");
const srcdir = path.join(process.cwd(), "src");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

// Auto-inject all BUN_PUBLIC_* environment variables into the browser bundle
const envDefine: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("BUN_PUBLIC_")) {
    envDefine[`process.env.${key}`] = JSON.stringify(value ?? "");
  }
}

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.browser": "true",
    "process.version": JSON.stringify(""),
    ...envDefine,
  },
});

// Content-hash output filenames for long-term caching
const hashMap: Record<string, string> = {};
for (const output of result.outputs) {
  if (!output.path.endsWith('.js')) continue;
  const content = await Bun.file(output.path).arrayBuffer();
  const hash = createHash('md5').update(Buffer.from(content)).digest('hex').slice(0, 10);
  const dir = path.dirname(output.path);
  const ext = path.extname(output.path);
  const base = path.basename(output.path, ext);
  const hashedName = `${base}.${hash}${ext}`;
  const hashedPath = path.join(dir, hashedName);
  await rename(output.path, hashedPath);
  hashMap[base + ext] = hashedName;
}

// Rewrite index.html to reference hashed filenames
const indexHtmlPath = path.join(outdir, 'index.html');
let html = await Bun.file(indexHtmlPath).text();
for (const [original, hashed] of Object.entries(hashMap)) {
  html = html.replace(new RegExp(`"\.\/${original}"`, 'g'), `"./${hashed}"`);
}
await Bun.write(indexHtmlPath, html);

// Copy PWA assets to dist
const PWA_FILES = [
  "manifest.json", "sw.js",
  "logo.svg", "icon-192.svg", "icon-512.svg",
  "icon-192.png", "icon-512.png",
  "icon-192-maskable.png", "icon-512-maskable.png",
  "apple-touch-icon.png",
];
for (const file of PWA_FILES) {
  await cp(path.join(srcdir, file), path.join(outdir, file));
}

// Strip crossorigin from HTML — it blocks module scripts on file:// in Android WebView
const htmlPath = path.join(outdir, "index.html");
const htmlContent = await readFile(htmlPath, "utf-8");
const cleaned = htmlContent.replace(/\s+crossorigin(=["']?(?:anonymous|use-credentials)["']?)?/gi, "");
await writeFile(htmlPath, cleaned);

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}
