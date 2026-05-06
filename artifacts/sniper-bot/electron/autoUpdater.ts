import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import pkg from "electron-updater";
const { autoUpdater } = pkg;

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface DownloadedInfo {
  version: string;
  releaseNotes?: string | null;
  releaseName?: string | null;
  releaseDate?: string;
}

let downloaded: DownloadedInfo | null = null;
let started = false;

function canAutoUpdate(): boolean {
  // Auto-update only runs in packaged builds.
  if (!app.isPackaged) return false;
  return true;
}

// macOS staged updates require the .app to be code-signed + notarized — the
// OS will silently reject the swap-in otherwise. We still wire the updater
// up on darwin so signed builds (task #21) "just work" the moment they ship;
// unsigned dev/preview builds will surface a clear error in the log via the
// `error` listener and the existing manifest-based banner remains as a
// fallback "Download update" CTA. See:
//   https://www.electron.build/auto-update#auto-updatable-targets

export function startAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (started) return;
  started = true;

  if (!canAutoUpdate()) {
    console.log("[autoUpdater] disabled (unpackaged dev build)");
    return;
  }

  // electron-updater handles the manifest URL itself via the `publish` config
  // baked in by electron-builder at build time (we set provider: github).
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  // electron-updater accepts any logger that implements the four common
  // levels — typed here as a structural interface to avoid casting through
  // `unknown` (which would silently swallow signature drift in future
  // electron-updater releases).
  interface UpdaterLogger {
    info(message: unknown): void;
    warn(message: unknown): void;
    error(message: unknown): void;
    debug(message: unknown): void;
  }
  const updaterLogger: UpdaterLogger = {
    info: (m) => console.log("[autoUpdater]", m),
    warn: (m) => console.warn("[autoUpdater]", m),
    error: (m) => console.error("[autoUpdater]", m),
    debug: () => undefined,
  };
  autoUpdater.logger = updaterLogger;

  autoUpdater.on("checking-for-update", () => {
    console.log("[autoUpdater] checking for update");
  });
  autoUpdater.on("update-available", (info) => {
    console.log("[autoUpdater] update available", info?.version);
    // We deliberately do NOT broadcast our own `update:available` payload
    // here. The manifest-based checker in updateChecker.ts is the single
    // source of truth for `forceUpdate` / `minSupported` semantics — fabricating
    // a synthesized payload from electron-updater (which doesn't know about
    // those fields) would transiently weaken the forced-update UX if the two
    // events raced. The renderer learns about the staged update via
    // `update:downloaded` once the background download finishes.
  });
  autoUpdater.on("update-not-available", () => {
    console.log("[autoUpdater] up to date");
  });
  autoUpdater.on("download-progress", (progress) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("update:progress", {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      } satisfies UpdateProgress);
    }
  });
  autoUpdater.on("update-downloaded", (info) => {
    downloaded = {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : null,
      releaseName: info.releaseName ?? null,
      releaseDate: info.releaseDate,
    };
    console.log("[autoUpdater] update downloaded", downloaded.version);

    // Persist release notes so the app can show a "What's New" dialog after restart
    try {
      const pendingPath = path.join(app.getPath("userData"), "pending-whats-new.json");
      fs.writeFileSync(pendingPath, JSON.stringify({ version: downloaded.version, releaseNotes: downloaded.releaseNotes ?? null }), "utf-8");
    } catch (e) {
      console.warn("[autoUpdater] Could not save pending-whats-new.json:", e);
    }

    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("update:downloaded", downloaded);
    }
  });
  autoUpdater.on("error", (err) => {
    console.error("[autoUpdater error]", err?.message ?? err);
  });

  // Initial check shortly after launch, then every 6 hours.
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => console.error("[autoUpdater check]", e));
  }, 10_000);
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((e) => console.error("[autoUpdater check]", e));
  }, SIX_HOURS_MS);
}

export function getDownloadedUpdate(): DownloadedInfo | null {
  return downloaded;
}

export function quitAndInstallUpdate(): boolean {
  if (!downloaded) return false;
  // isSilent=true (Windows): run the installer without UI.
  // isForceRunAfter=true: relaunch the app after install.
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (err) {
      console.error("[autoUpdater quitAndInstall]", err);
    }
  });
  return true;
}

export function checkForUpdatesNow(): Promise<unknown> {
  if (!canAutoUpdate()) return Promise.resolve(null);
  return autoUpdater.checkForUpdates().catch((e) => {
    console.error("[autoUpdater check]", e);
    return null;
  });
}

// Called when the user explicitly clicks "Update Now".
// Returns true if the in-app download was started, false if caller should
// fall back to opening the download page (unsigned build, dev mode, etc.).
export async function triggerDownload(): Promise<boolean> {
  if (!canAutoUpdate()) return false;
  try {
    await autoUpdater.downloadUpdate();
    return true;
  } catch (err) {
    console.error("[autoUpdater triggerDownload]", err);
    return false;
  }
}
