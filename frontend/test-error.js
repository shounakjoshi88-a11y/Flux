import { chromium } from "playwright";

async function main() {
  console.log("Starting...");
  
  // Check if browser exists
  const fs = await import("fs");
  const browserPath = "C:\\Users\\shoun\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
  console.log("Browser exists:", fs.existsSync(browserPath));
  
  if (!fs.existsSync(browserPath)) {
    console.log("Browser not found, listing directory:");
    const dir = "C:\\Users\\shoun\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64";
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        console.log("  -", f);
      }
    }
    return;
  }
  
  console.log("Launching browser...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath,
    args: ["--no-sandbox", "--disable-gpu", "--single-process"],
  });
  console.log("Browser launched");
  
  const page = await browser.newPage();
  console.log("Page created");
  
  const errors = [];
  page.on("pageerror", err => {
    console.log("PAGE ERROR:", err.message);
    errors.push(err.message);
  });
  page.on("console", msg => {
    console.log(`[${msg.type()}]`, msg.text().substring(0, 200));
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  
  console.log("Navigating...");
  await page.goto("http://localhost:3001", { waitUntil: "load", timeout: 15000 });
  console.log("Page loaded");
  
  await page.waitForTimeout(5000);
  console.log("Waited 5s");
  
  const body = await page.evaluate(() => document.body.innerText.substring(0, 300));
  console.log("BODY:", body);
  
  const rootHtml = await page.evaluate(() => {
    const r = document.getElementById("root");
    return r ? r.innerHTML.substring(0, 500) : "(no root)";
  });
  console.log("ROOT HTML:", rootHtml);
  
  console.log("ERRORS:", JSON.stringify(errors));
  
  await browser.close();
  console.log("Done");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
