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

// ── Google OAuth IPC ──────────────────────────────────────────────────────────
ipcMain.handle("google:oauthSignIn", async (): Promise<{
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured. Please contact support.");
  }

  const codeVerifier = crypto.randomBytes(64).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const oauthState = crypto.randomBytes(16).toString("hex");

  let oauthPort = 0;

  const { authCode, redirectUri } = await new Promise<{ authCode: string; redirectUri: string }>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const timeoutId = setTimeout(() => {
      cbServer.close();
      settle(() => reject(new Error("Google sign-in timed out — please try again")));
    }, 300_000);

    const cbServer = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://127.0.0.1:${oauthPort}`);
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
        `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:80px">` +
        `<h2>&#x2705; Signed in! You can close this tab and return to TCG Snipers.</h2></body></html>`,
      );
      clearTimeout(timeoutId);
      cbServer.close();
      if (error) {
        settle(() => reject(new Error(`Google sign-in was denied: ${error}`)));
      } else if (returnedState !== oauthState) {
        settle(() => reject(new Error("OAuth state mismatch — possible CSRF. Please try again.")));
      } else if (code) {
        settle(() => resolve({ authCode: code, redirectUri: `http://127.0.0.1:${oauthPort}/oauth/callback` }));
      } else {
        settle(() => reject(new Error("No authorization code received from Google")));
      }
    });

    cbServer.listen(0, "127.0.0.1", () => {
      oauthPort = (cbServer.address() as { port: number }).port;
      const redir = `http://127.0.0.1:${oauthPort}/oauth/callback`;
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redir);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "email openid https://mail.google.com/");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", oauthState);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      shell.openExternal(authUrl.toString());
      writeLog("INFO", `[google:oauthSignIn] OAuth server listening on port ${oauthPort}`);
    });

    cbServer.on("error", (err) => {
      clearTimeout(timeoutId);
      settle(() => reject(err));
    });
  });

  writeLog("INFO", "[google:oauthSignIn] Auth code received, exchanging for tokens…");

  const tokenParams = new URLSearchParams({
    code: authCode,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  const tokenData = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      `Token exchange failed: ${tokenData.error_description ?? tokenData.error ?? "unknown error"}`,
    );
  }

  let email = "";
  if (tokenData.id_token) {
    try {
      const parts = tokenData.id_token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as { email?: string };
      email = payload.email ?? "";
    } catch (_) {}
  }

  // Fallback: call userinfo endpoint if id_token parsing didn't yield an email.
  if (!email && tokenData.access_token) {
    try {
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json() as { email?: string };
        email = userinfo.email ?? "";
      }
    } catch (_) {}
  }

  writeLog("INFO", `[google:oauthSignIn] Tokens obtained for ${email}`);

  return {
    email,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? "",
    expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  };
});

// ── Discord OAuth IPC ─────────────────────────────────────────────────────────
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

  // Discord requires an exact redirect URI match (no port wildcard like Google).
  // We use a fixed high port so the URI registered in the Discord Developer Portal
  // can be a stable, predictable value: http://127.0.0.1:47842/oauth/callback
  const DISCORD_CALLBACK_PORT = 47842;
  const DISCORD_REDIRECT_URI = `http://127.0.0.1:${DISCORD_CALLBACK_PORT}/oauth/callback`;

  const oauthState = crypto.randomBytes(16).toString("hex");

  const { authCode, redirectUri } = await new Promise<{ authCode: string; redirectUri: string }>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const timeoutId = setTimeout(() => {
      cbServer.close();
      settle(() => reject(new Error("Discord connection timed out — please try again")));
    }, 300_000);

    const cbServer = http.createServer((req, res) => {
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
