const pngToIco = require("png-to-ico");
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "frontend", "src", "icon-512.png");
const out = path.join(__dirname, "..", "build", "icon.ico");

// png-to-ico ESM default export workaround
const convert = pngToIco.default ?? pngToIco.imagesToIco ?? pngToIco;

(async () => {
  try {
    const buf = await convert(src);
    fs.writeFileSync(out, buf);
    console.log("✅ build/icon.ico created —", buf.length, "bytes");
  } catch (e) {
    console.error("❌ Failed:", e.message);
    process.exit(1);
  }
})();
