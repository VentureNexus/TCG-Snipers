import { app, BrowserWindow, shell, ipcMain, dialog, safeStorage } from "electron";
import http from "http";
import crypto from "crypto";
import os from "os";
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
  triggerDownload,
} from "./autoUpdater.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// electron/dist/main.js lives at:  artifacts/sniper-bot/electron/dist/main.js
// so __dirname                  =  artifacts/sniper-bot/electron/dist
// artifacts/sniper-bot root     =  __dirname/../..
const APP_ROOT = path.resolve(__dirname, "..", "..");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// In dev the Vite dev-server listens on whatever PORT the platform assigns.
const RENDERER_PORT = Number(process.env.PORT ?? 5173);

// ── CPU usage polling ─────────────────────────────────────────────────────────
let cpuPercent = 0;
let prevCpuSnapshot: { idle: number; total: number } | null = null;

function takeCpuSnapshot(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const val of Object.values(cpu.times)) total += val;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

const cpuPoller = setInterval(() => {
  const curr = takeCpuSnapshot();
  if (prevCpuSnapshot) {
    const idleDelta = curr.idle - prevCpuSnapshot.idle;
    const totalDelta = curr.total - prevCpuSnapshot.total;
    cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
  }
  prevCpuSnapshot = curr;
}, 1000);
cpuPoller.unref();

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

// ── Per-installation encryption key ──────────────────────────────────────────
// The api-server needs ENCRYPTION_KEY to AES-encrypt card numbers at rest.
// In the packaged app there are no Replit secrets, so we generate a random
// 32-byte key on first launch, persist it to userData encrypted with the OS
// secure storage (same mechanism as the license token), and inject it into
// process.env before the api-server module is imported.
function getOrCreateEncryptionKey(): string {
  const keyFile = path.join(app.getPath("userData"), "enc.bin");

  // Attempt to read an existing key.
  if (fs.existsSync(keyFile)) {
    try {
      const buf = fs.readFileSync(keyFile);
      if (safeStorage.isEncryptionAvailable()) {
        const hex = safeStorage.decryptString(buf);
        if (hex && hex.length >= 32) {
          writeLog("INFO", "Encryption key loaded from secure store");
          return hex;
        }
      } else {
        // Fallback: stored as plain text (rare — safeStorage unavailable).
        const hex = buf.toString("utf8").trim();
        if (hex && hex.length >= 32) {
          writeLog("INFO", "Encryption key loaded (plain fallback)");
          return hex;
        }
      }
    } catch (err) {
      writeLog("WARN", `Could not read encryption key file, regenerating: ${err}`);
    }
  }

  // Generate a fresh key.
  const hex = crypto.randomBytes(32).toString("hex"); // 64 hex chars = 256 bits
  try {
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(keyFile, safeStorage.encryptString(hex));
      writeLog("INFO", "Encryption key generated and stored securely");
    } else {
      // Plain fallback — userData is user-private on all supported OSes.
      fs.writeFileSync(keyFile, hex, { mode: 0o600 });
      writeLog("WARN", "safeStorage unavailable — encryption key stored as plain file (mode 600)");
    }
  } catch (err) {
    writeLog("WARN", `Could not persist encryption key: ${err} — using in-memory key (cards won't survive restart)`);
  }
  return hex;
}

// ── Browser path detection ────────────────────────────────────────────────
// Runs before the API server module is imported so PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
// is already set by the time any retailer automation tries to launch a browser.
function resolveSystemBrowserPath(): string | undefined {
  // 1. Bundled Playwright Chromium — installed into extraResources during CI build.
  //    process.resourcesPath is only set in a packaged app; in dev it's undefined.
  if (app.isPackaged && process.resourcesPath) {
    const playwrightDir = path.join(process.resourcesPath, "playwright-chromium");
    if (fs.existsSync(playwrightDir)) {
      const entries = fs.readdirSync(playwrightDir);
      for (const entry of entries) {
        if (!entry.startsWith("chromium")) continue;
        let bin: string | undefined;
        if (process.platform === "win32") {
          // Playwright 1.40+ downloads to chrome-win64; older used chrome-win
          const win64 = path.join(playwrightDir, entry, "chrome-win64", "chrome.exe");
          const win32 = path.join(playwrightDir, entry, "chrome-win", "chrome.exe");
          bin = fs.existsSync(win64) ? win64 : win32;
        } else if (process.platform === "darwin") {
          // arm64 runner uses chrome-mac-arm64, x64 uses chrome-mac
          const arm = path.join(playwrightDir, entry, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium");
          const x64 = path.join(playwrightDir, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium");
          bin = fs.existsSync(arm) ? arm : x64;
        } else {
          bin = path.join(playwrightDir, entry, "chrome-linux64", "chrome");
        }
        if (bin && fs.existsSync(bin)) {
          writeLog("INFO", `Using bundled Playwright Chromium: ${bin}`);
          return bin;
        }
      }
      writeLog("WARN", `playwright-chromium dir exists but no binary found inside: ${playwrightDir}`);
    }
  }

  // 2. Well-known system Chrome / Edge paths (no `which` needed — works on Windows)
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    candidates.push(
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    );
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }

  return undefined;
}

// ── Start Express API server in-process ────────────────────────────────────
async function startApiServer(): Promise<void> {
  const CANDIDATE_PORTS = [8080, 8081, 8082, 8083];

  try {
    writeLog("INFO", `Node version: ${process.version}`);
    writeLog("INFO", `Platform: ${process.platform} arch: ${process.arch}`);
    writeLog("INFO", `isPackaged: ${app.isPackaged}`);

    const electronDbPath = path.join(app.getPath("userData"), "pgdata");
    writeLog("INFO", `DB path: ${electronDbPath}`);
    process.env.ELECTRON_DB_PATH = electronDbPath;
    process.env.NODE_ENV = isDev ? "development" : "production";
    writeLog("INFO", `NODE_ENV set to: ${process.env.NODE_ENV}`);

    // Inject the per-installation encryption key so the api-server can
    // encrypt/decrypt card numbers. Must be set before app.js is imported.
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = getOrCreateEncryptionKey();
    }

    // ── Detect and inject browser executable path ─────────────────────────
    // The API server's browser.ts checks PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    // first. We resolve it here (before the module is imported) so the correct
    // path is available from the very first createBrowser() call.
    if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      const browserPath = resolveSystemBrowserPath();
      if (browserPath) {
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = browserPath;
        writeLog("INFO", `Browser found: ${browserPath}`);
      } else {
        writeLog("WARN", "No system Chrome/Edge found. Tasks requiring a browser will fail. Install Google Chrome and restart.");
      }
    } else {
      writeLog("INFO", `Browser path from env: ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}`);
    }

    // Verify that the electron/dist directory exists and list chunk files
    try {
      const distFiles = fs.readdirSync(__dirname);
      writeLog("INFO", `electron/dist contents (${distFiles.length} files): ${distFiles.slice(0, 20).join(", ")}`);
    } catch (e) {
      writeLog("WARN", `Could not list electron/dist: ${e}`);
    }

    writeLog("INFO", "Step 1: importing API server module…");
    const apiModule = await import("../../api-server/src/app.js");
    writeLog("INFO", "Step 1 OK: module imported");

    const expressApp = apiModule.default;
    if (!expressApp || typeof expressApp !== "function") {
      throw new Error(`API module default export is not a function: ${typeof expressApp}`);
    }
    writeLog("INFO", "Step 2: creating HTTP server…");
    apiServer = http.createServer(expressApp);
    writeLog("INFO", "Step 2 OK");

    // ── Initialize WebSocket server ────────────────────────────────────────
    // CRITICAL: createWebSocketServer must be called before the HTTP server
    // starts listening so the 'upgrade' event is wired up. Without this every
    // WS connection hits Express and gets a 404, meaning task logs never appear.
    try {
      const { createWebSocketServer, initStatusCacheFromDb, setMaxConcurrency, setTtlHours, getOrCreateSettings } = apiModule;
      if (typeof createWebSocketServer === "function") {
        createWebSocketServer(apiServer);
        writeLog("INFO", "WebSocket server initialized on HTTP server");
      } else {
        writeLog("WARN", "createWebSocketServer not exported from app module — logs will not stream");
      }
      // Apply persisted concurrency and session TTL settings
      if (typeof getOrCreateSettings === "function") {
        try {
          const settings = await getOrCreateSettings();
          if (typeof setMaxConcurrency === "function") {
            setMaxConcurrency(settings.concurrency);
          }
          if (typeof setTtlHours === "function") {
            setTtlHours(settings.sessionTtlHours ?? null);
          }
          writeLog("INFO", `Settings loaded — concurrency: ${settings.concurrency}, sessionTtlHours: ${settings.sessionTtlHours ?? "default"}`);
        } catch (settingsErr) {
          writeLog("WARN", `Could not load settings: ${settingsErr}`);
        }
      }
      // Pre-populate task status cache from DB so badges are correct after restart
      if (typeof initStatusCacheFromDb === "function") {
        initStatusCacheFromDb().catch((err: unknown) =>
          writeLog("WARN", `Could not pre-populate status cache: ${err}`)
        );
      }
    } catch (wsErr) {
      writeLog("WARN", `WebSocket server init failed: ${wsErr}`);
    }

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

    writeLog("INFO", "Step 3: binding to port…");
    for (const port of CANDIDATE_PORTS) {
      writeLog("INFO", `  trying port ${port}…`);
      const bound = await tryListen(apiServer, port);
      if (bound) {
        apiPort = port;
        apiStartOk = true;
        writeLog("INFO", `Step 3 OK: listening on port ${port}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("api:recovered");
        }
        return;
      }
    }

    apiStartFailReason = `API server could not bind to any port (tried ${CANDIDATE_PORTS.join(", ")}). Another process may be using these ports.`;
    writeLog("ERROR", apiStartFailReason);

  } catch (err) {
    const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
    apiStartFailReason = `Failed to initialize API: ${err instanceof Error ? err.message : String(err)}`;
    writeLog("ERROR", "=== API STARTUP FAILED ===");
    writeLog("ERROR", stack);
    writeLog("ERROR", "=== END STARTUP FAILURE ===");
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
      preload: path.join(__dirname, "preload.cjs"),
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

// ── Discord OAuth IPC ─────────────────────────────────────────────────────────
let _discordCancelFn: (() => void) | null = null;

ipcMain.handle("discord:cancelConnect", () => {
  if (_discordCancelFn) {
    _discordCancelFn();
    _discordCancelFn = null;
  }
});

ipcMain.handle("discord:oauthConnect", async (): Promise<{
  webhookUrl: string;
  guildName: string;
  channelName: string;
}> => {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Discord OAuth is not configured. Please contact support.");
  }

  // Discord requires an exact redirect URI match, so we use a fixed high port
  // so the URI registered in the Discord Developer Portal can be a stable,
  // predictable value: http://127.0.0.1:47842/oauth/callback
  const DISCORD_CALLBACK_PORT = 47842;
  const DISCORD_REDIRECT_URI = `http://127.0.0.1:${DISCORD_CALLBACK_PORT}/oauth/callback`;

  const oauthState = crypto.randomBytes(16).toString("hex");

  const { authCode, redirectUri } = await new Promise<{ authCode: string; redirectUri: string }>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        _discordCancelFn = null;
        fn();
      }
    };

    let timeoutId: ReturnType<typeof setTimeout>;
    let cbServer: ReturnType<typeof http.createServer>;

    _discordCancelFn = () => {
      clearTimeout(timeoutId);
      cbServer?.close();
      settle(() => reject(new Error("cancelled")));
    };

    timeoutId = setTimeout(() => {
      cbServer.close();
      settle(() => reject(new Error("Discord connection timed out — please try again")));
    }, 300_000);

    cbServer = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://127.0.0.1:${DISCORD_CALLBACK_PORT}`);
      if (reqUrl.pathname !== "/oauth/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = reqUrl.searchParams.get("code");
      const error = reqUrl.searchParams.get("error");
      const returnedState = reqUrl.searchParams.get("state");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:80px;background:#313338;color:#dbdee1">` +
        `<h2 style="color:#23a55a">&#x2705; Discord connected! You can close this tab and return to TCG Snipers.</h2></body></html>`,
      );
      clearTimeout(timeoutId);
      cbServer.close();
      if (error) {
        settle(() => reject(new Error(`Discord connection was denied: ${error}`)));
      } else if (returnedState !== oauthState) {
        settle(() => reject(new Error("OAuth state mismatch — possible CSRF. Please try again.")));
      } else if (code) {
        settle(() => resolve({ authCode: code, redirectUri: DISCORD_REDIRECT_URI }));
      } else {
        settle(() => reject(new Error("No authorization code received from Discord")));
      }
    });

    cbServer.listen(DISCORD_CALLBACK_PORT, "127.0.0.1", () => {
      const authUrl = new URL("https://discord.com/api/oauth2/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "webhook.incoming");
      authUrl.searchParams.set("state", oauthState);
      shell.openExternal(authUrl.toString());
      writeLog("INFO", `[discord:oauthConnect] OAuth callback server listening on port ${DISCORD_CALLBACK_PORT}`);
    });

    cbServer.on("error", (err) => {
      clearTimeout(timeoutId);
      settle(() => reject(new Error(
        err.message.includes("EADDRINUSE")
          ? `Port ${DISCORD_CALLBACK_PORT} is already in use. Close other apps and try again.`
          : err.message
      )));
    });
  });

  writeLog("INFO", "[discord:oauthConnect] Auth code received, exchanging for tokens…");

  const tokenParams = new URLSearchParams({
    code: authCode,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  const tokenData = await tokenRes.json() as {
    access_token?: string;
    webhook?: {
      url?: string;
      id?: string;
      name?: string;
      channel_id?: string;
      guild_id?: string;
      guild?: { id?: string; name?: string };
      channel?: { id?: string; name?: string };
    };
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      `Discord token exchange failed: ${tokenData.error_description ?? tokenData.error ?? "unknown error"}`,
    );
  }

  const webhookUrl = tokenData.webhook?.url ?? "";
  const guildName = tokenData.webhook?.guild?.name ?? "";
  const channelName = tokenData.webhook?.channel?.name ?? "";

  if (!webhookUrl) {
    throw new Error("Discord did not return a webhook URL. Make sure you selected a channel.");
  }

  writeLog("INFO", `[discord:oauthConnect] Webhook obtained for guild="${guildName}" channel="${channelName}"`);

  return { webhookUrl, guildName, channelName };
});

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
ipcMain.handle("api:getHealth", async () => {
  if (!apiServer?.listening) {
    return { alive: false, port: apiPort, latencyMs: null };
  }
  const start = Date.now();
  try {
    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.get(
        `http://localhost:${apiPort}/healthz`,
        { timeout: 10_000 },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout"));
      });
    });
    const alive = statusCode >= 200 && statusCode < 300;
    return { alive, port: apiPort, latencyMs: Date.now() - start };
  } catch {
    return { alive: false, port: apiPort, latencyMs: null };
  }
});
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

// ── System metrics IPC ───────────────────────────────────────────────────────
ipcMain.handle("system:getMetrics", () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    cpuPercent,
    ramUsedBytes: usedMem,
    ramTotalBytes: totalMem,
    ramPercent: Math.round((usedMem / totalMem) * 100),
  };
});

// ── Update IPC ───────────────────────────────────────────────────────────────
ipcMain.handle("update:check", async () => {
  void checkForUpdatesNow();
  return checkForUpdate(mainWindow);
});
ipcMain.handle("update:latest", () => getLastResult());
ipcMain.handle("update:openDownload", () => openDownloadPage());
ipcMain.handle("update:downloaded", () => getDownloadedUpdate());
ipcMain.handle("update:install", () => {
  // Save the last-installed marker so the "What's New" dialog won't re-appear
  // on the next non-update launch.
  quitAndInstallUpdate();
});

// Triggered when the user explicitly clicks "Update Now" in the banner.
// Starts the electron-updater background download; falls back to opening
// the browser download page for unsigned / dev builds.
ipcMain.handle("update:startDownload", async () => {
  const started = await triggerDownload();
  if (!started) openDownloadPage();
  return started;
});

// Called by the renderer on mount to check if a "What's New" payload is
// waiting (written by the autoUpdater when the previous download finished).
// Reads the file, deletes it, and returns the content — shown only once.
ipcMain.handle("update:getPendingWhatsNew", () => {
  const filePath = path.join(app.getPath("userData"), "pending-whats-new.json");
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
        version: string;
        releaseNotes: string | null;
      };
      fs.unlinkSync(filePath);
      // Only show if the installed version matches what was downloaded
      if (data.version === app.getVersion()) return data;
    }
  } catch (e) {
    writeLog("WARN", "[update:getPendingWhatsNew] error reading pending notes:", String(e));
  }
  return null;
});

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  initLogger();
  writeLog("INFO", `Platform: ${process.platform}, packaged: ${app.isPackaged}`);

  try {
    await startApiServer();
  } catch (err) {
    writeLog("ERROR", "startApiServer threw:", err);
  }

  // Show a native dialog immediately if the API didn't start — impossible to miss.
  if (!apiStartOk) {
    const logHint = logFilePath
      ? `\n\nFull details in log file:\n${logFilePath}`
      : "";
    dialog.showErrorBox(
      "TCG Snipers — API failed to start",
      `${apiStartFailReason || "Unknown error"}${logHint}`,
    );
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
