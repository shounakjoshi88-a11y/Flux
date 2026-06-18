import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const BACKEND_PORT = 3001;
const STATIC_PORT = 3000;
const ROOT = join(__dirname, "..");
const DIST_DIR = join(ROOT, "frontend", "dist");
const BACKEND_DIR = join(ROOT, "backend");
const BACKEND_EXE = join(ROOT, "dist-electron", "backend", "flux-backend.exe");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

let backendProcess: ReturnType<typeof spawn> | null = null;
let mainWindow: BrowserWindow | null = null;

function startBackend(): Promise<void> {
  return new Promise((resolve) => {
    const useExe = existsSync(BACKEND_EXE);
    const bin = useExe ? BACKEND_EXE : "bun";
    const args = useExe ? [] : ["index.ts"];

    console.log(`[electron] Starting backend (${useExe ? "binary" : "bun index.ts"})...`);

    backendProcess = spawn(bin, args, {
      cwd: BACKEND_DIR,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PORT: String(BACKEND_PORT) },
    });

    backendProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) console.log(`[backend] ${text}`);
      if (/listening|Listening|server running|started/i.test(text)) {
        resolve();
      }
    });

    backendProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) console.error(`[backend] ${text}`);
    });

    backendProcess.on("error", (err) => {
      console.error("[electron] Backend failed to start:", err.message);
      resolve();
    });

    backendProcess.on("exit", (code) => {
      console.log(`[electron] Backend exited with code ${code}`);
    });

    setTimeout(() => resolve(), 4000);
  });
}

function startStaticServer(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let filePath = join(DIST_DIR, req.url === "/" ? "index.html" : req.url!);

      if (!existsSync(filePath)) {
        filePath = join(DIST_DIR, "index.html");
      }

      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(STATIC_PORT, () => {
      console.log(`[electron] Serving frontend on http://localhost:${STATIC_PORT}`);
      resolve(STATIC_PORT);
    });
  });
}

async function createWindow() {
  await startBackend();
  await startStaticServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${STATIC_PORT}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
