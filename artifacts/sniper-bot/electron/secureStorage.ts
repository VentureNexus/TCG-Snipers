import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

const FILE = () => path.join(app.getPath("userData"), "license.bin");

export function readLicense(): { token: string; email: string } | null {
  try {
    const file = FILE();
    if (!fs.existsSync(file)) return null;
    const buf = fs.readFileSync(file);
    if (!safeStorage.isEncryptionAvailable()) return null;
    const json = safeStorage.decryptString(buf);
    return JSON.parse(json) as { token: string; email: string };
  } catch {
    return null;
  }
}

export function writeLicense(value: { token: string; email: string }): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-level secure storage is not available on this system.");
  }
  const enc = safeStorage.encryptString(JSON.stringify(value));
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), enc);
}

export function clearLicense(): void {
  try {
    const file = FILE();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* noop */
  }
}
