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
import {
  startAutoUpdater,
  getDownloadedUpdate,
  quitAndInstallUpdate,
  checkForUpdatesNow,
} from "./autoUpdater.js";

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
// We use Electron's bundled Node runtime (process.execPath + ELECTRON_RUN_AS_NODE=1)
// so we don't depend on the user having Node installed on their machine.
// Errors are caught so a failed API server start does NOT kill the desktop app —
// the renderer can still load and surface the error to the user.
function startApiServer(): Promise<void> {
  return new Promise((resolve) => {
    // Dev:  sibling artifact built output  (artifacts/api-server/dist/index.mjs)
    // Prod: bundled into app resources     (resources/api-server/index.mjs)
    const apiServerPath = isDev
      ? path.resolve(APP_ROOT, "..", "api-server", "dist", "index.mjs")
      : path.join(process.resourcesPath, "api-server", "index.mjs");

    try {
      // Provide the path to a local PGlite data directory so the API server
      // can run an embedded PostgreSQL instance without any DATABASE_URL.
      // This is only used when DATABASE_URL is absent (i.e. on end-user machines).
      const electronDbPath = path.join(app.getPath("userData"), "pgdata");

      apiProcess = spawn(process.execPath, ["--enable-source-maps", apiServerPath], {
        env: {
          ...process.env,
          // Tell Electron to behave as plain Node when launched this way.
          ELECTRON_RUN_AS_NODE: "1",
          PORT: String(API_PORT),
          NODE_ENV: isDev ? "development" : "production",
          // Only set ELECTRON_DB_PATH when DATABASE_URL is absent so the
          // Replit dev environment (which has DATABASE_URL) continues to use
          // the real PostgreSQL instance.
          ...(process.env.DATABASE_URL ? {} : { ELECTRON_DB_PATH: electronDbPath }),
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

      apiProcess.on("error", (err) => {
        console.error("[API spawn error]", err);
        // Don't reject — let the desktop app load anyway.
        resolve();
      });

      apiProcess.on("exit", (code, signal) => {
        console.error(`[API exited] code=${code} signal=${signal}`);
        apiProcess = null;
      });
    } catch (err) {
      console.error("[API failed to spawn]", err);
      resolve();
    }

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
ipcMain.handle("update:check", async () => {
  // Kick off both the manifest check (drives the "available" banner) and the
  // electron-updater check (drives the in-app silent download). They run
  // independently so a failure in one doesn't block the other.
  void checkForUpdatesNow();
  return checkForUpdate(mainWindow);
});
ipcMain.handle("update:latest", () => getLastResult());
ipcMain.handle("update:openDownload", () => openDownloadPage());
ipcMain.handle("update:downloaded", () => getDownloadedUpdate());
ipcMain.handle("update:install", () => quitAndInstallUpdate());

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Catch any unexpected error in startup so the app doesn't die silently.
  try {
    await startApiServer();
  } catch (err) {
    console.error("[startup] startApiServer threw:", err);
  }
  createWindow();
  try {
    startUpdateChecker(() => mainWindow);
  } catch (err) {
    console.error("[startup] startUpdateChecker threw:", err);
  }
  try {
    startAutoUpdater(() => mainWindow);
  } catch (err) {
    console.error("[startup] startAutoUpdater threw:", err);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error("[startup] whenReady chain failed:", err);
});

// Last-resort safety net: log unhandled errors instead of letting them
// crash the process before the window appears.
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (apiProcess) {
    apiProcess.kill("SIGTERM");
    apiProcess = null;
  }
});
