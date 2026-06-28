import tailwind from "bun-plugin-tailwind";
import { rm, cp } from "node:fs/promises";
import path from "node:path";

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

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}
