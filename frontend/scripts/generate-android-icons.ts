// Generates Android mipmap PNG icons from the Flux logo
// Run: bun scripts/generate-android-icons.ts
import sharp from "sharp";

const OUT_DIR = import.meta.dir + "/../android/app/src/main/res";

// Full logo: white rounded square + coral squiggly path
function createIconSVG(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">
    <rect width="108" height="108" rx="13.5" fill="#ffffff" />
    <path d="M9,72 C22.5,27 36,81 49.5,45 S76.5,27 99,54" fill="none" stroke="#cc785c" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

function createAdaptiveForegroundSVG(size: number): string {
  // API 26+ adaptive icon foreground — transparent background, coral squiggly path only
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">
    <path d="M9,72 C22.5,27 36,81 49.5,45 S76.5,27 99,54" fill="none" stroke="#cc785c" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

const MIPMAP_SIZES: Record<string, number> = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

async function main() {
  console.log("Generating Android launcher icons...\n");

  // Generate standard launcher icons (with white background)
  for (const [dir, size] of Object.entries(MIPMAP_SIZES)) {
    const svg = createIconSVG(size);
    const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    await sharp(png).toFile(`${OUT_DIR}/${dir}/ic_launcher.png`);
    await sharp(png).toFile(`${OUT_DIR}/${dir}/ic_launcher_round.png`);
    console.log(`  ${dir}/ic_launcher.png  ${size}x${size}`);
  }

  // Generate adaptive icon foregrounds (transparent background, for API 26+)
  for (const [dir, size] of Object.entries(MIPMAP_SIZES)) {
    const svg = createAdaptiveForegroundSVG(size);
    const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    await sharp(png).toFile(`${OUT_DIR}/${dir}/ic_launcher_foreground.png`);
    console.log(`  ${dir}/ic_launcher_foreground.png  ${size}x${size}`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
