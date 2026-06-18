import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("__BACKEND_URL__", "http://localhost:3001");
