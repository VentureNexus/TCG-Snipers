import jwt from "jsonwebtoken";

function requireSecret(name: string): string {
  const v = process.env[name];
  if (!v || v.length < 32) {
    throw new Error(
      `${name} environment variable is required and must be at least 32 chars. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  return v;
}

// Read once at startup so we crash fast if misconfigured.
const LICENSE_SECRET = requireSecret("LICENSE_JWT_SECRET");
const PORTAL_SECRET = process.env.PORTAL_JWT_SECRET
  ? requireSecret("PORTAL_JWT_SECRET")
  : LICENSE_SECRET;

export interface LicenseTokenPayload {
  licenseId: number;
  customerId: number;
  deviceId: number;
}

export interface PortalSessionPayload {
  customerId: number;
  email: string;
}

export function signLicenseToken(payload: LicenseTokenPayload): string {
  return jwt.sign(payload, LICENSE_SECRET, { expiresIn: "30d" });
}

export function verifyLicenseToken(token: string): LicenseTokenPayload | null {
  try {
    return jwt.verify(token, LICENSE_SECRET) as LicenseTokenPayload;
  } catch {
    return null;
  }
}

export function signPortalSession(payload: PortalSessionPayload): string {
  return jwt.sign(payload, PORTAL_SECRET, { expiresIn: "1h" });
}

export function verifyPortalSession(token: string): PortalSessionPayload | null {
  try {
    return jwt.verify(token, PORTAL_SECRET) as PortalSessionPayload;
  } catch {
    return null;
  }
}

export interface DownloadTokenPayload {
  customerId: number;
  os: "win" | "mac" | "linux";
  arch?: "arm64" | "x64";
}

export function signDownloadToken(payload: DownloadTokenPayload): string {
  // Short-lived: just enough for the browser to redirect and start streaming
  return jwt.sign(payload, PORTAL_SECRET, { expiresIn: "5m" });
}

export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  try {
    return jwt.verify(token, PORTAL_SECRET) as DownloadTokenPayload;
  } catch {
    return null;
  }
}
