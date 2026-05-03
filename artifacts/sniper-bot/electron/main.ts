import { app, BrowserWindow, shell, ipcMain } from "electron";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { computeFingerprint, osLabel } from "./fingerprint.js";
import { readLicense, writeLicense, clearLicense } from "./secureStorage.js";
import {
  startUpdateChecker,
  checkForUpdate,
  getLastResult,
  openDownloadPage,
} from "./updateChecker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// electron/dist/main.js lives at:  artifacts/sniper-bot/electron/dist/main.js
// so __dirname                  =  artifacts/sniper-bot/electron/dist
// artifacts/sniper-bot root     =  __dirname/../..
const APP_ROOT = path.resolve(__dirname, "..", "..");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const API_PORT = 8080;

// In dev the Vite dev-server listens on whatever PORT the platform assigns.
// Electron reads the same env var so it always connects to the right port.
// Fallback to 5173 only when running Electron outside the Replit environment.
const RENDERER_PORT = Number(process.env.PORT ?? 5173);

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;

// ── Start Express API server ────────────────────────────────────────────────
function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Dev:  sibling artifact built output  (artifacts/api-server/dist/index.mjs)
    // Prod: bundled into app resources     (resources/api-server/index.mjs)
    const apiServerPath = isDev
      ? path.resolve(APP_ROOT, "..", "api-server", "dist", "index.mjs")
      : path.join(process.resourcesPath, "api-server", "index.mjs");

    apiProcess = spawn("node", ["--enable-source-maps", apiServerPath], {
      env: {
        ...process.env,
        PORT: String(API_PORT),
        NODE_ENV: isDev ? "development" : "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    apiProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      console.log("[API]", text.trim());
      if (text.includes("Server listening")) resolve();
    });

    apiProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[API ERR]", data.toString().trim());
    });

    apiProcess.on("error", reject);
    // Fallback: resolve after 4 s if the startup log never fires
    setTimeout(resolve, 4000);
  });
}

// ── BrowserWindow factory ────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0d1117",
    show: false,
    webPreferences: {
      // preload lives at electron/dist/preload.js — same folder as main.js
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    // Development: load from Vite dev-server (HMR enabled)
    mainWindow.loadURL(`http://localhost:${RENDERER_PORT}`);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: Vite outputs to dist/public/index.html
    // APP_ROOT = artifacts/sniper-bot, build outDir = dist/public
    const indexHtml = path.join(APP_ROOT, "dist", "public", "index.html");
    mainWindow.loadFile(indexHtml);
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open _blank links in the OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:platform", () => process.platform);
// Renderer calls this to discover the local API origin
ipcMain.handle("app:apiBaseUrl", () => `http://localhost:${API_PORT}`);

// ── License IPC ─────────────────────────────────────────────────────────────
ipcMain.handle("license:fingerprint", () => ({
  fingerprint: computeFingerprint(),
  osPlatform: osLabel(),
}));
ipcMain.handle("license:read", () => readLicense());
ipcMain.handle("license:write", (_e, value: { token: string; email: string }) => {
  writeLicense(value);
  return { ok: true };
});
ipcMain.handle("license:clear", () => {
  clearLicense();
  return { ok: true };
});
ipcMain.handle("app:openExternal", (_e, url: string) => shell.openExternal(url));

// ── Update IPC ───────────────────────────────────────────────────────────────
ipcMain.handle("update:check", () => checkForUpdate(mainWindow));
ipcMain.handle("update:latest", () => getLastResult());
ipcMain.handle("update:openDownload", () => openDownloadPage());

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await startApiServer();
  createWindow();
  startUpdateChecker(() => mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (apiProcess) {
    apiProcess.kill("SIGTERM");
    apiProcess = null;
  }
});
