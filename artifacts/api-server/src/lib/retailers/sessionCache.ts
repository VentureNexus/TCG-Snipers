import fs from "fs";
import path from "path";
import os from "os";

const CACHE_DIR = path.join(
  process.env.SESSION_CACHE_DIR ?? path.join(os.homedir(), ".tcg-snipers"),
  "sessions",
);

/** Default max age before a session is considered stale and triggers a re-login (24 hours). */
const DEFAULT_TTL_HOURS = 24;

/** Runtime override set from the database settings (null = not yet loaded). */
let _ttlOverrideHours: number | null = null;

/**
 * Set the session TTL in hours from the database settings.
 * Pass null to clear the override and fall back to SESSION_TTL_HOURS or the default.
 */
export function setTtlHours(hours: number | null): void {
  _ttlOverrideHours = hours != null && Number.isFinite(hours) && hours > 0 ? hours : null;
}

function getTtlMs(): number {
  if (_ttlOverrideHours !== null) return _ttlOverrideHours * 60 * 60 * 1000;
  const envHours = parseFloat(process.env.SESSION_TTL_HOURS ?? "");
  const hours = Number.isFinite(envHours) && envHours > 0 ? envHours : DEFAULT_TTL_HOURS;
  return hours * 60 * 60 * 1000;
}

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
      const file = parsed as SessionFile;
      const savedAt = (file as unknown as Record<string, unknown>).savedAt;
      if (typeof savedAt !== "number" || !Number.isFinite(savedAt) || Date.now() - savedAt > getTtlMs()) {
        clearSession(retailer, email);
        return null;
      }
      return file.state as StorageState;
    }
    // Legacy format: plain Playwright storage state object — no timestamp, treat as stale
    clearSession(retailer, email);
    return null;
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
  maxAgeMs = getTtlMs(),
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
