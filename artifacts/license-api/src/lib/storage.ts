import { Storage } from "@google-cloud/storage";

let cached: Storage | null = null;

function client(): Storage {
  if (cached) return cached;
  cached = new Storage({
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
  return cached;
}

export function getInstallerObjectKey(os: "win" | "mac" | "linux"): string | null {
  const map: Record<string, string | undefined> = {
    win: process.env.INSTALLER_OBJECT_KEY_WIN,
    mac: process.env.INSTALLER_OBJECT_KEY_MAC,
    linux: process.env.INSTALLER_OBJECT_KEY_LINUX,
  };
  return map[os] ?? null;
}

export function getInstallerFile(objectKey: string) {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  return client().bucket(bucketId).file(objectKey);
}
