import fs from "fs";
import path from "path";
import os from "os";

const CACHE_DIR = path.join(
  process.env.SESSION_CACHE_DIR ?? path.join(os.homedir(), ".tcg-snipers"),
  "sessions",
);

/** Default max age before a session is considered stale and triggers a re-login (12 hours). */
const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function sessionPath(retailer: string, email: string): string {
  const safe = `${retailer}_${email}`.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

export type StorageState = import("playwright-core").BrowserContextOptions["storageState"] & object;

/** Internal on-disk format — wraps state with a timestamp for TTL checks. */
interface SessionFile {
  savedAt: number;
  state: StorageState;
}

export function saveSession(retailer: string, email: string, state: StorageState): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file: SessionFile = { savedAt: Date.now(), state };
    fs.writeFileSync(sessionPath(retailer, email), JSON.stringify(file), "utf-8");
  } catch (_) {}
}

export function loadSession(retailer: string, email: string): StorageState | null {
  try {
    const raw = fs.readFileSync(sessionPath(retailer, email), "utf-8");
    const parsed = JSON.parse(raw);
    // New format: { savedAt, state }
    if (parsed && typeof parsed === "object" && "state" in parsed) {
      return (parsed as SessionFile).state as StorageState;
    }
    // Legacy format: plain Playwright storage state object
    return parsed as StorageState;
  } catch (_) {
    return null;
  }
}

/**
 * Returns true if a session file exists AND was saved within `maxAgeMs`.
 * Use this at task start to decide whether to skip pre-login.
 */
export function isSessionFresh(
  retailer: string,
  email: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): boolean {
  try {
    const raw = fs.readFileSync(sessionPath(retailer, email), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "savedAt" in parsed) {
      return Date.now() - (parsed as SessionFile).savedAt < maxAgeMs;
    }
    // Legacy file without timestamp — treat as stale so it gets refreshed
    return false;
  } catch (_) {
    return false;
  }
}

export function clearSession(retailer: string, email: string): void {
  try {
    fs.unlinkSync(sessionPath(retailer, email));
  } catch (_) {}
}
