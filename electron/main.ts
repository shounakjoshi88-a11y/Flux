import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  ipcMain,
  nativeImage,
  session,
  dialog,
  type MessageBoxOptions,
} from "electron";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// ─── Paths ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const ICON_PATH = join(ROOT, "frontend", "src", "icon-512.png");
const SPLASH_HTML = join(__dirname, "splash.html");
const USER_DATA = app.getPath("userData");
const WIN_STATE_FILE = join(USER_DATA, "window-state.json");
const FLUX_URL = "https://flux-weld-rho.vercel.app";
const FLUX_PROTOCOL = "flux";

// ─── Types ────────────────────────────────────────────────────────────────────
interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

// ─── Globals ──────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// ─── Single Instance Lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", (_event, argv) => {
  // Someone tried to open a second instance — focus ours instead
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.show();
  }

  // Handle deep link from second instance (Windows)
  const url = argv.find((arg) => arg.startsWith(`${FLUX_PROTOCOL}://`));
  if (url) handleDeepLink(url);
});

// ─── Deep Link Registration ───────────────────────────────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(FLUX_PROTOCOL, process.execPath, [
      "--",
      process.argv[1],
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(FLUX_PROTOCOL);
}

function handleDeepLink(url: string) {
  if (!mainWindow) return;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname || "/";
    mainWindow.webContents.executeJavaScript(
      `window.history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate'));`
    );
  } catch {
    // ignore malformed URLs
  }
}

// ─── Window State Persistence ─────────────────────────────────────────────────
function loadWindowState(): WindowState {
  const defaults: WindowState = { width: 1380, height: 900, maximized: false };
  try {
    if (existsSync(WIN_STATE_FILE)) {
      const saved = JSON.parse(readFileSync(WIN_STATE_FILE, "utf-8"));
      return { ...defaults, ...saved };
    }
  } catch {
    /* use defaults */
  }
  return defaults;
}

function saveWindowState(win: BrowserWindow) {
  try {
    mkdirSync(USER_DATA, { recursive: true });
    const bounds = win.getBounds();
    const state: WindowState = {
      ...bounds,
      maximized: win.isMaximized(),
    };
    writeFileSync(WIN_STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    /* ignore */
  }
}

// ─── Splash Window ─────────────────────────────────────────────────────────────
function createSplash(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  if (existsSync(SPLASH_HTML)) {
    splash.loadFile(SPLASH_HTML);
  } else {
    // Inline fallback splash
    splash.loadURL(
      `data:text/html,<body style="margin:0;background:#0f0f0f;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#fff"><div style="text-align:center"><div style="font-size:2rem;font-weight:700;letter-spacing:0.1em">Flux</div><div style="margin-top:12px;font-size:0.85rem;opacity:0.5">Loading...</div></div></body>`
    );
  }

  return splash;
}

// ─── Main Window ───────────────────────────────────────────────────────────────
async function createWindow() {
  const state = loadWindowState();

  // Show splash
  splashWindow = createSplash();

  const icon = existsSync(ICON_PATH)
    ? nativeImage.createFromPath(ICON_PATH)
    : undefined;

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 840,
    minHeight: 560,
    show: false,
    icon: existsSync(join(ROOT, "build", "icon.ico"))
      ? nativeImage.createFromPath(join(ROOT, "build", "icon.ico"))
      : (existsSync(ICON_PATH) ? nativeImage.createFromPath(ICON_PATH) : undefined),
    titleBarStyle: "hidden",
    titleBarOverlay:
      process.platform === "win32"
        ? { color: "#0c0c0e", symbolColor: "#e2e8f0", height: 36 }
        : undefined,
    trafficLightPosition:
      process.platform === "darwin" ? { x: 16, y: 12 } : undefined,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false,
    },
  });

  // Hide the menu bar completely on Windows/Linux (like Perplexity)
  mainWindow.setAutoHideMenuBar(true);
  mainWindow.setMenuBarVisibility(false);

  // ── Load the app ─────────────────────────────────────────────────────────
  mainWindow.loadURL(FLUX_URL);

  // ── Inject draggable title region & Electron flag once page is ready ──────
  mainWindow.webContents.on("did-finish-load", () => {
    const css = `
      /* Invisible draggable strip at the top for the frameless window */
      #flux-drag-region {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 36px;
        -webkit-app-region: drag;
        z-index: 999999;
        pointer-events: none;
      }
    `;
    mainWindow?.webContents.insertCSS(css);
    mainWindow?.webContents.executeJavaScript(`
      if (!document.getElementById('flux-drag-region')) {
        const el = document.createElement('div');
        el.id = 'flux-drag-region';
        document.body.appendChild(el);
      }
      window.__IS_ELECTRON__ = true;
    `);

    // Show main window, close splash
    setTimeout(() => {
      if (mainWindow) {
        if (state.maximized) mainWindow.maximize();
        mainWindow.show();
        mainWindow.focus();
      }
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
    }, 600);
  });

  // Handle failed loads (no internet etc.)
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow?.loadURL(`data:text/html,
        <body style="margin:0;background:#0f0f0f;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#fff;gap:16px">
          <div style="font-size:2rem;font-weight:700">Flux</div>
          <div style="font-size:1rem;opacity:0.6">Could not connect to Flux</div>
          <div style="font-size:0.75rem;opacity:0.35">${errorDescription} (${errorCode})</div>
          <button onclick="location.reload()" style="margin-top:8px;padding:10px 28px;background:#cc785c;color:#fff;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer">Retry</button>
        </body>`);
      mainWindow?.show();
    }
  );

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Intercept navigation away from Flux domain
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(FLUX_URL) && !url.startsWith("https://accounts.google.com") && !url.startsWith("https://leapsqstikvxtkyjrrcl.supabase.co")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ── Tray ─────────────────────────────────────────────────────────────────
  const trayIcon = existsSync(join(ROOT, "build", "icon.ico"))
    ? nativeImage.createFromPath(join(ROOT, "build", "icon.ico")).resize({ width: 16, height: 16 })
    : (icon ? icon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty());

  tray = new Tray(trayIcon);
  tray.setToolTip("Flux");
  updateTrayMenu();

  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ── Window events ─────────────────────────────────────────────────────────
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window-maximize-change", true);
    updateTrayMenu();
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window-maximize-change", false);
    updateTrayMenu();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      // Show balloon only on first hide (Windows)
      tray?.displayBalloon({
        iconType: "info",
        title: "Flux is still running",
        content: "Click the tray icon to bring Flux back.",
      });
    } else {
      if (mainWindow) saveWindowState(mainWindow);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Save state periodically
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const debounceSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) saveWindowState(mainWindow);
    }, 500);
  };

  mainWindow.on("resize", debounceSave);
  mainWindow.on("move", debounceSave);

  // ── Keyboard shortcuts via menu (kept for keybindings, but menu bar is hidden) ──
  const menu = Menu.buildFromTemplate([
    {
      label: "Flux",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Check for Updates",
          click: () => checkForUpdates(mainWindow!),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        {
          label: "Toggle Developer Tools",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}

// ─── Tray Menu ────────────────────────────────────────────────────────────────
function updateTrayMenu() {
  if (!tray) return;
  const isMax = mainWindow?.isMaximized() ?? false;
  const isVisible = mainWindow?.isVisible() ?? false;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? "Hide Flux" : "Show Flux",
      click: () => {
        if (!mainWindow) return;
        if (isVisible) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
        updateTrayMenu();
      },
    },
    {
      label: isMax ? "Restore" : "Maximize",
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isMaximized()) {
          mainWindow.restore();
        } else {
          mainWindow.maximize();
        }
      },
    },
    { type: "separator" },
    {
      label: "Open flux-weld-rho.vercel.app in Browser",
      click: () => shell.openExternal(FLUX_URL),
    },
    { type: "separator" },
    {
      label: "Quit Flux",
      click: () => {
        isQuitting = true;
        if (mainWindow && !mainWindow.isDestroyed()) saveWindowState(mainWindow);
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.restore();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window-close", () => mainWindow?.close());
ipcMain.handle("window-is-maximized", () => mainWindow?.isMaximized() ?? false);
ipcMain.handle("get-version", () => app.getVersion());
ipcMain.handle("get-platform", () => process.platform);
ipcMain.on("check-for-updates", () => {
  if (mainWindow) checkForUpdates(mainWindow);
});

// ─── Update Check (notify-only) ───────────────────────────────────────────────
async function checkForUpdates(win: BrowserWindow) {
  try {
    const res = await fetch(
      "https://api.github.com/repos/shounakjoshi88-a11y/Flux/releases/latest",
      { headers: { "User-Agent": "Flux-Desktop" } }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latest = data.tag_name?.replace(/^v/, "") ?? "";
    const current = app.getVersion();
    if (latest && latest !== current) {
      const opts: MessageBoxOptions = {
        type: "info",
        title: "Update Available",
        message: `Flux ${latest} is available`,
        detail: `You are running ${current}. Download the new version?`,
        buttons: ["Download", "Later"],
        defaultId: 0,
      };
      const { response } = await dialog.showMessageBox(win, opts);
      if (response === 0 && data.html_url) shell.openExternal(data.html_url);
    }
  } catch {
    /* silently ignore network errors */
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Restore default session partition (no custom storage)
  // Allow loading Flux and its connected auth domains
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
        ],
      },
    });
  });

  createWindow();

  // Handle deep links from protocol on macOS
  app.on("open-url", (_event, url) => {
    handleDeepLink(url);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // On non-mac, don't quit — live in tray
    // app.quit() is called explicitly from the tray menu
  }
});

app.on("activate", () => {
  // macOS: re-create window on dock click
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) saveWindowState(mainWindow);
});
