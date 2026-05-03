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
