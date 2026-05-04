import { app, BrowserWindow, shell, ipcMain } from "electron";
import http from "http";
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
const RENDERER_PORT = Number(process.env.PORT ?? 5173);

let mainWindow: BrowserWindow | null = null;
let apiServer: http.Server | null = null;

/** Set to true once the API server successfully starts listening. */
let apiStartOk = false;
/** Human-readable failure reason when startup fails. */
let apiStartFailReason = "";

// ── Start Express API server in-process ────────────────────────────────────
// Runs the Express app directly inside the Electron main process rather than
// as a child process. This eliminates WASM path-resolution problems, startup
// timeouts, and cross-process module-loading complexity that affected the
// previous child-process approach.
//
// ORDERING IS CRITICAL: ELECTRON_DB_PATH must be written to process.env
// BEFORE the dynamic import so that lib/db's top-level await initialises
// PGlite with the correct data directory. esbuild (with splitting:true)
// places the Express app in a separate chunk, guaranteeing the env var is
// visible when the chunk — and therefore lib/db — is first evaluated.
async function startApiServer(): Promise<void> {
  try {
    // Use the same pgdata directory name as the old child-process build so
    // existing user data is preserved across the upgrade.
    const electronDbPath = path.join(app.getPath("userData"), "pgdata");
    process.env.ELECTRON_DB_PATH = electronDbPath;
    process.env.NODE_ENV = isDev ? "development" : "production";

    // @ts-expect-error – cross-package import resolved by esbuild at build time
    const { default: expressApp } = await import("../../api-server/src/app.js");

    apiServer = http.createServer(expressApp);

    await new Promise<void>((resolve) => {
      apiServer!.listen(API_PORT, () => {
        apiStartOk = true;
        console.log(`[API] Listening on port ${API_PORT}`);
        // If the window was already shown before startup completed (shouldn't
        // happen with current flow), send a recovery signal.
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("api:recovered");
        }
        resolve();
      });
      apiServer!.on("error", (err: NodeJS.ErrnoException) => {
        apiStartFailReason = `API server failed to start: ${err.message}`;
        console.error("[API]", err.message);
        resolve(); // non-fatal — app still launches, renderer shows error banner
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    apiStartFailReason = `Failed to initialize API: ${msg}`;
    console.error("[API in-process startup failed]", err);
  }
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
    const indexHtml = path.join(APP_ROOT, "dist", "public", "index.html");
    mainWindow.loadFile(indexHtml);
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (!apiStartOk && apiStartFailReason) {
      mainWindow?.webContents.send("api:startFailed", { reason: apiStartFailReason });
    }
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

// ── Diagnostics IPC ──────────────────────────────────────────────────────────
// The API now runs in-process; logs appear in the Electron console / DevTools.
ipcMain.handle("api:getLogs", () => []);
ipcMain.handle("api:getHealth", () => ({
  alive: apiServer?.listening ?? false,
  port: API_PORT,
}));
ipcMain.handle("api:getStartStatus", () => ({
  ok: apiStartOk,
  reason: apiStartFailReason,
}));

// ── Update IPC ───────────────────────────────────────────────────────────────
ipcMain.handle("update:check", async () => {
  void checkForUpdatesNow();
  return checkForUpdate(mainWindow);
});
ipcMain.handle("update:latest", () => getLastResult());
ipcMain.handle("update:openDownload", () => openDownloadPage());
ipcMain.handle("update:downloaded", () => getDownloadedUpdate());
ipcMain.handle("update:install", () => quitAndInstallUpdate());

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
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

// Last-resort safety net
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (apiServer) {
    apiServer.close();
    apiServer = null;
  }
});
