import crypto from "node:crypto";
import os from "node:os";

/**
 * Compute a stable per-machine fingerprint.
 *
 * We deliberately avoid native dependencies (node-machine-id) — Electron's
 * supported API surface gives us enough entropy via hostname + first MAC
 * address + platform + arch + cpu model.
 */
export function computeFingerprint(): string {
  const ifaces = os.networkInterfaces();
  const macs: string[] = [];
  for (const name of Object.keys(ifaces)) {
    const list = ifaces[name];
    if (!list) continue;
    for (const i of list) {
      if (i.mac && i.mac !== "00:00:00:00:00:00" && !i.internal) macs.push(i.mac);
    }
  }
  const seed = [
    os.platform(),
    os.arch(),
    os.hostname(),
    os.cpus()[0]?.model ?? "cpu",
    macs.sort()[0] ?? "no-mac",
  ].join("|");
  return crypto.createHash("sha256").update(seed).digest("hex");
}

export function osLabel(): string {
  return `${os.platform()}-${os.arch()}`;
}
