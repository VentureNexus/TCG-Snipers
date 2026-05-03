import { app, BrowserWindow, shell } from "electron";

const LICENSE_API_URL = (process.env.LICENSE_API_URL ?? "https://tcgsnipers.replit.app").replace(/\/$/, "");
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export interface UpdateInfo {
  current: string;
  latest: string;
  minSupported: string;
  updateAvailable: boolean;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotesUrl: string;
  checkedAt: string;
}

let lastResult: UpdateInfo | null = null;

// Compare two semver-ish version strings. Returns -1 / 0 / 1.
function cmp(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

interface Manifest {
  latest: string;
  minSupported: string;
  downloadUrl: string;
  releaseNotesUrl: string;
}

const SEMVER_RE = /^\d+(\.\d+){0,3}$/;

function isValidManifest(m: unknown): m is Manifest {
  if (!m || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  return (
    typeof r.latest === "string" && SEMVER_RE.test(r.latest) &&
    typeof r.minSupported === "string" && SEMVER_RE.test(r.minSupported) &&
    typeof r.downloadUrl === "string" && /^https:\/\//.test(r.downloadUrl) &&
    typeof r.releaseNotesUrl === "string" && /^https:\/\//.test(r.releaseNotesUrl)
  );
}

async function fetchManifest(): Promise<Manifest | null> {
  try {
    const res = await fetch(`${LICENSE_API_URL}/license/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return isValidManifest(json) ? json : null;
  } catch {
    return null;
  }
}

export async function checkForUpdate(notifyWindow?: BrowserWindow | null): Promise<UpdateInfo | null> {
  const manifest = await fetchManifest();
  if (!manifest) return lastResult;

  const current = app.getVersion();
  const info: UpdateInfo = {
    current,
    latest: manifest.latest,
    minSupported: manifest.minSupported,
    updateAvailable: cmp(current, manifest.latest) < 0,
    forceUpdate: cmp(current, manifest.minSupported) < 0,
    downloadUrl: manifest.downloadUrl,
    releaseNotesUrl: manifest.releaseNotesUrl,
    checkedAt: new Date().toISOString(),
  };
  lastResult = info;

  if (info.updateAvailable && notifyWindow && !notifyWindow.isDestroyed()) {
    notifyWindow.webContents.send("update:available", info);
  }
  return info;
}

export function getLastResult(): UpdateInfo | null {
  return lastResult;
}

export function startUpdateChecker(getWindow: () => BrowserWindow | null): void {
  // Initial check shortly after launch (give the renderer time to register listener).
  setTimeout(() => void checkForUpdate(getWindow()), 5000);
  setInterval(() => void checkForUpdate(getWindow()), CHECK_INTERVAL_MS);
}

const ALLOWED_DOWNLOAD_HOSTS = new Set(["tcgsnipers.com", "www.tcgsnipers.com"]);

export function openDownloadPage(): Promise<void> {
  const fallback = "https://tcgsnipers.com/download";
  const candidate = lastResult?.downloadUrl ?? fallback;
  let safe = fallback;
  try {
    const u = new URL(candidate);
    if (u.protocol === "https:" && ALLOWED_DOWNLOAD_HOSTS.has(u.hostname)) {
      safe = u.toString();
    }
  } catch {
    // keep fallback
  }
  return shell.openExternal(safe);
}
