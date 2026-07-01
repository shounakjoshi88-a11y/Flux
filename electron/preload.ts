import { contextBridge, ipcRenderer } from "electron";

// Expose a safe, narrow API surface to the renderer (Flux web app)
contextBridge.exposeInMainWorld("electronAPI", {
  // Platform identifier
  platform: process.platform as "win32" | "darwin" | "linux",

  // App version
  getVersion: (): Promise<string> => ipcRenderer.invoke("get-version"),

  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window-is-maximized"),

  // Listen for maximize/restore events from main
  onMaximizeChange: (cb: (isMaximized: boolean) => void) => {
    ipcRenderer.on("window-maximize-change", (_event, value: boolean) => cb(value));
    // Return a cleanup function
    return () => {
      ipcRenderer.removeAllListeners("window-maximize-change");
    };
  },

  // Trigger update check
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),

  // Flag for the frontend to detect Electron environment
  isElectron: true,
});

// Also expose the backend URL (same as cloud — no local backend in this build)
// The frontend config.ts reads window.__BACKEND_URL__ as a fallback
contextBridge.exposeInMainWorld("__BACKEND_URL__", undefined);
