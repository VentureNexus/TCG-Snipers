import { app, BrowserWindow, shell, ipcMain } from "electron";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const API_PORT = 8080;
const RENDERER_PORT = 5173;

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;

// ── Start Express API server ────────────────────────────────────────────────
function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const apiServerPath = isDev
      ? path.resolve(__dirname, "../../api-server/dist/index.mjs")
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
    // Fallback: resolve after 3 s if the startup log never fires
    setTimeout(resolve, 3000);
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
      // In production the renderer is a local file — web security can stay on.
      webSecurity: true,
    },
  });

  if (isDev) {
    // Development: Vite dev server handles HMR; proxy forwards /api to Express
    mainWindow.loadURL(`http://localhost:${RENDERER_PORT}`);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: load the compiled renderer bundle directly from disk.
    // API calls go to http://localhost:<API_PORT> — the renderer calls
    // window.electronAPI.getApiBaseUrl() on startup and passes it to setBaseUrl().
    const indexHtml = path.join(
      __dirname,
      "..",    // electron/dist  → renderer root
      "..",    // renderer root
      "dist",  // Vite output directory
      "index.html",
    );
    mainWindow.loadFile(indexHtml);
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Intercept _blank links — open in the OS browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:platform", () => process.platform);
// Renderer calls this to discover where the local API is running
ipcMain.handle("app:apiBaseUrl", () => `http://localhost:${API_PORT}`);

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await startApiServer();
  createWindow();

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
