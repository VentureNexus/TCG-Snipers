import fs from "fs";
import path from "path";
import os from "os";

const CACHE_DIR = path.join(
  process.env.SESSION_CACHE_DIR ?? path.join(os.homedir(), ".tcg-snipers"),
  "sessions",
);

function sessionPath(retailer: string, email: string): string {
  const safe = `${retailer}_${email}`.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

export type StorageState = import("playwright-core").BrowserContextOptions["storageState"] & object;

export function saveSession(retailer: string, email: string, state: StorageState): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(sessionPath(retailer, email), JSON.stringify(state), "utf-8");
  } catch (_) {}
}

export function loadSession(retailer: string, email: string): StorageState | null {
  try {
    const data = fs.readFileSync(sessionPath(retailer, email), "utf-8");
    return JSON.parse(data) as StorageState;
  } catch (_) {
    return null;
  }
}

export function clearSession(retailer: string, email: string): void {
  try {
    fs.unlinkSync(sessionPath(retailer, email));
  } catch (_) {}
}
