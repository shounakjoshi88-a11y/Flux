import sharp from "sharp";
import { cp } from "node:fs/promises";

const SRC = import.meta.dir + "/../src";
const OUT = SRC;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24" fill="none" stroke="#cc785c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 16C5 6 8 18 11 10S17 6 22 12" />
</svg>`;

async function generatePNG(size: number, name: string) {
  await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png()
    .toFile(`${OUT}/${name}`);
  console.log(`  ${name}  ${size}x${size}`);
}

const ROUNDED = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24">
  <defs>
    <clipPath id="r"><rect width="24" height="24" rx="4"/></clipPath>
  </defs>
  <rect width="24" height="24" rx="4" fill="#181715"/>
  <path d="M2 16C5 6 8 18 11 10S17 6 22 12" clip-path="url(#r)" fill="none" stroke="#cc785c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function generateMaskablePNG(size: number, name: string) {
  await sharp(Buffer.from(ROUNDED))
    .resize(size, size)
    .png()
    .toFile(`${OUT}/${name}`);
  console.log(`  ${name}  ${size}x${size} (maskable)`);
}

console.log("Generating PNG icons...");
await generatePNG(192, "icon-192.png");
await generatePNG(512, "icon-512.png");
await generateMaskablePNG(192, "icon-192-maskable.png");
await generateMaskablePNG(512, "icon-512-maskable.png");

// Copy as apple touch icon too
await cp(`${OUT}/icon-192.png`, `${OUT}/apple-touch-icon.png`);
console.log("  apple-touch-icon.png  192x192");

console.log("Done.");
