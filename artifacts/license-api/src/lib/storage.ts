import { Storage } from "@google-cloud/storage";

let replitStorage: Storage | null = null;
let saStorage: Storage | null = null;

// Replit-managed GCS client (external_account auth — works for reads/writes
// but does NOT support getSignedUrl which requires iam.signBlob).
function replitClient(): Storage {
  if (replitStorage) return replitStorage;
  replitStorage = new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: "http://127.0.0.1:1106/token",
      type: "external_account",
      credential_source: {
        url: "http://127.0.0.1:1106/credential",
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    } as never,
    projectId: "",
  });
  return replitStorage;
}

// Service-account GCS client (supports getSignedUrl).
// Only constructed when GCS_SA_KEY is present.
function saClient(): Storage | null {
  const key = process.env.GCS_SA_KEY;
  if (!key) return null;
  if (saStorage) return saStorage;
  try {
    const credentials = JSON.parse(key) as Record<string, unknown>;
    saStorage = new Storage({ credentials } as never);
    return saStorage;
  } catch {
    console.error("[storage] Failed to parse GCS_SA_KEY — signed URLs disabled");
    return null;
  }
}

/**
 * Canonical GCS object keys written by the CI release pipeline.
 *
 * CI convention (upload-cloud-storage action):
 *   installers/latest-win.exe           — Windows NSIS installer (always current)
 *   installers/latest-mac-arm64.dmg     — macOS arm64 DMG installer (Apple Silicon)
 *   installers/latest-mac-x64.dmg       — macOS x64 DMG installer (Intel)
 *   installers/latest.yml               — electron-updater Windows manifest
 *   installers/latest-mac.yml           — electron-updater macOS manifest
 *
 * `arch` is only used for macOS; Windows always produces a single x64 installer.
 *
 * Operator override env vars:
 *   INSTALLER_OBJECT_KEY_WIN        — pin a specific Windows object key
 *   INSTALLER_OBJECT_KEY_MAC_ARM64  — pin arm64 macOS object key
 *   INSTALLER_OBJECT_KEY_MAC_X64    — pin x64 macOS object key
 *   INSTALLER_OBJECT_KEY_MAC        — pin macOS key regardless of arch (fallback)
 *   INSTALLER_OBJECT_KEY_LINUX      — pin Linux object key
 */
export function getInstallerObjectKey(
  os: "win" | "mac" | "linux",
  arch: "arm64" | "x64" = "arm64",
): string | null {
  if (os === "win") {
    return process.env.INSTALLER_OBJECT_KEY_WIN ?? "installers/latest-win.exe";
  }
  if (os === "mac") {
    if (arch === "x64") {
      return (
        process.env.INSTALLER_OBJECT_KEY_MAC_X64 ??
        process.env.INSTALLER_OBJECT_KEY_MAC ??
        "installers/latest-mac-x64.dmg"
      );
    }
    // arm64 (Apple Silicon) — the default; arm64 builds also run on Intel via Rosetta 2
    return (
      process.env.INSTALLER_OBJECT_KEY_MAC_ARM64 ??
      process.env.INSTALLER_OBJECT_KEY_MAC ??
      "installers/latest-mac-arm64.dmg"
    );
  }
  // Linux is out-of-scope for this task.
  return process.env.INSTALLER_OBJECT_KEY_LINUX ?? null;
}

export function getInstallerFile(objectKey: string) {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  return replitClient().bucket(bucketId).file(objectKey);
}

/**
 * Whether the GCS bucket is configured at all.
 * If not, the license API has no cloud storage to serve from.
 */
export function hasBucket(): boolean {
  return Boolean(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID);
}

/**
 * Generate a V4 signed GCS URL (requires GCS_SA_KEY service account JSON).
 * Returns null if the SA client is unavailable; callers should fall back to
 * the /download/file/:os streaming proxy in that case.
 *
 * Expiry defaults to 15 minutes — enough time for the browser to start the
 * download without being excessively permissive.
 */
export async function getSignedInstallerUrl(
  objectKey: string,
  expiresSeconds = 900,
): Promise<string | null> {
  const sa = saClient();
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!sa || !bucketId) return null;
  try {
    const [url] = await sa.bucket(bucketId).file(objectKey).getSignedUrl({
      action: "read",
      expires: Date.now() + expiresSeconds * 1000,
      version: "v4",
    });
    return url;
  } catch (err) {
    console.error("[storage] getSignedUrl failed:", err);
    return null;
  }
}
