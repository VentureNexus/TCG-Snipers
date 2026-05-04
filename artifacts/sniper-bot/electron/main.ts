import { app, BrowserWindow, shell, ipcMain } from "electron";
import http from "http";
import path from "path";
import fs from "fs";
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

// In dev the Vite dev-server listens on whatever PORT the platform assigns.
const RENDERER_PORT = Number(process.env.PORT ?? 5173);

let mainWindow: BrowserWindow | null = null;
let apiServer: http.Server | null = null;
let apiPort = 8080;

/** Set to true once the API server successfully starts listening. */
let apiStartOk = false;
/** Human-readable failure reason when startup fails. */
let apiStartFailReason = "";

// ── File-based logger ─────────────────────────────────────────────────────────
// Writes a persistent log file to userData so users can share it for support.
let logFilePath = "";
let logStream: fs.WriteStream | null = null;

function initLogger() {
  try {
    const logDir = app.getPath("userData");
    logFilePath = path.join(logDir, "tcg-snipers.log");
    // Rotate: keep last 200 KB, otherwise truncate
    try {
      const stat = fs.statSync(logFilePath);
      if (stat.size > 200_000) {
        fs.writeFileSync(logFilePath, "");
      }
    } catch (_) {}
    logStream = fs.createWriteStream(logFilePath, { flags: "a" });
    logStream.write(`\n\n=== TCG Snipers v${app.getVersion()} started ${new Date().toISOString()} ===\n`);
  } catch (err) {
    console.error("[logger] Failed to create log file:", err);
  }
}

function writeLog(level: "INFO" | "WARN" | "ERROR", ...args: unknown[]) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(String).join(" ")}`;
  console.log(line);
  try {
    logStream?.write(line + "\n");
  } catch (_) {}
}

// ── Server-side request metrics buffer ───────────────────────────────────────
const APP_START_MS = Date.now();
const REQUEST_BUF_SIZE = 200;

interface ServerRequestEntry {
  id: number;
  ts: number;
  method: string;
  path: string;
  status: number | null;
  durationMs: number | null;
  error: string | null;
}

const serverRequestLog: ServerRequestEntry[] = [];
let serverRequestCounter = 0;

function recordServerRequest(entry: ServerRequestEntry) {
  serverRequestLog.push(entry);
  if (serverRequestLog.length > REQUEST_BUF_SIZE) serverRequestLog.shift();
}

// ── Start Express API server in-process ────────────────────────────────────
async function startApiServer(): Promise<void> {
  // Try ports 8080 → 8081 → 8082 in case one is occupied
  const CANDIDATE_PORTS = [8080, 8081, 8082, 8083];

  try {
    const electronDbPath = path.join(app.getPath("userData"), "pgdata");
    writeLog("INFO", `DB path: ${electronDbPath}`);
    process.env.ELECTRON_DB_PATH = electronDbPath;
    process.env.NODE_ENV = isDev ? "development" : "production";

    writeLog("INFO", "Importing API server module…");
    // @ts-expect-error – cross-package import resolved by esbuild at build time
    const { default: expressApp } = await import("../../api-server/src/app.js");
    writeLog("INFO", "API server module imported successfully");

    apiServer = http.createServer(expressApp);

    apiServer.on("request", (req, res) => {
      const id = ++serverRequestCounter;
      const ts = Date.now();
      const method = req.method ?? "GET";
      const reqPath = req.url ?? "/";
      res.on("finish", () => {
        recordServerRequest({ id, ts, method, path: reqPath, status: res.statusCode, durationMs: Date.now() - ts, error: null });
      });
      res.on("error", (err: Error) => {
        recordServerRequest({ id, ts, method, path: reqPath, status: null, durationMs: Date.now() - ts, error: err.message });
      });
    });

    for (const port of CANDIDATE_PORTS) {
      const bound = await tryListen(apiServer, port);
      if (bound) {
        apiPort = port;
        apiStartOk = true;
        writeLog("INFO", `API server listening on port ${port}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("api:recovered");
        }
        return;
      }
    }

    // All candidate ports failed
    apiStartFailReason = `API server could not bind to any port (tried ${CANDIDATE_PORTS.join(", ")}). Another process may be using these ports.`;
    writeLog("ERROR", apiStartFailReason);

  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    apiStartFailReason = `Failed to initialize API: ${err instanceof Error ? err.message : String(err)}`;
    writeLog("ERROR", "API in-process startup failed:", msg);
  }
}

function tryListen(server: http.Server, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener("error", onError);
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        writeLog("WARN", `Port ${port} in use, trying next…`);
        resolve(false);
      } else {
        writeLog("ERROR", `Port ${port} error: ${err.message}`);
        resolve(false);
      }
    };
    server.once("error", onError);
    server.listen(port, () => {
      server.removeListener("error", onError);
      resolve(true);
    });
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${RENDERER_PORT}`);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:platform", () => process.platform);
ipcMain.handle("app:apiBaseUrl", () => `http://localhost:${apiPort}`);

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
ipcMain.handle("api:getLogs", () => {
  try {
    if (!logFilePath) return [];
    const content = fs.readFileSync(logFilePath, "utf-8");
    return content.split("\n").filter(Boolean).slice(-200);
  } catch (_) {
    return [];
  }
});
ipcMain.handle("api:getLogFilePath", () => logFilePath);
ipcMain.handle("api:openLogFile", () => {
  if (logFilePath) shell.openPath(logFilePath);
});
ipcMain.handle("api:getHealth", () => ({
  alive: apiServer?.listening ?? false,
  port: apiPort,
}));
ipcMain.handle("api:getStartStatus", () => ({
  ok: apiStartOk,
  reason: apiStartFailReason,
}));
ipcMain.handle("api:getMetrics", () => ({
  requests: [...serverRequestLog],
  uptimeMs: Date.now() - APP_START_MS,
  alive: apiServer?.listening ?? false,
  port: apiPort,
  startOk: apiStartOk,
  startFailReason: apiStartFailReason,
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
  initLogger();
  writeLog("INFO", `Platform: ${process.platform}, packaged: ${app.isPackaged}`);

  try {
    await startApiServer();
  } catch (err) {
    writeLog("ERROR", "startApiServer threw:", err);
  }
  createWindow();
  try {
    startUpdateChecker(() => mainWindow);
  } catch (err) {
    writeLog("ERROR", "startUpdateChecker threw:", err);
  }
  try {
    startAutoUpdater(() => mainWindow);
  } catch (err) {
    writeLog("ERROR", "startAutoUpdater threw:", err);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error("[startup] whenReady chain failed:", err);
});

process.on("uncaughtException", (err) => {
  writeLog("ERROR", "[uncaughtException]", err.message, err.stack ?? "");
});
process.on("unhandledRejection", (reason) => {
  writeLog("ERROR", "[unhandledRejection]", String(reason));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (apiServer) {
    apiServer.close();
    apiServer = null;
  }
  logStream?.end();
});
