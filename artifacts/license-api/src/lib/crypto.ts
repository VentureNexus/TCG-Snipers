import crypto from "node:crypto";

export function generateLicenseKey(): string {
  // 32 url-safe chars, formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX
  const raw = crypto.randomBytes(24).toString("base64url").slice(0, 28).toUpperCase();
  return raw.match(/.{1,4}/g)!.join("-");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateMagicToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function last4(key: string): string {
  return key.replace(/-/g, "").slice(-4);
}

function deriveEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${Buffer.concat([ct, tag]).toString("base64")}`;
}

export function decryptSecret(payload: string): string | null {
  try {
    const [ivB64, ctB64] = payload.split(":");
    if (!ivB64 || !ctB64) return null;
    const iv = Buffer.from(ivB64, "base64");
    const ctAndTag = Buffer.from(ctB64, "base64");
    if (ctAndTag.length < 16) return null;
    const tag = ctAndTag.subarray(ctAndTag.length - 16);
    const ct = ctAndTag.subarray(0, ctAndTag.length - 16);
    const key = deriveEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}
