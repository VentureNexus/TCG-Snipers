// Browser-friendly license client. In Electron we round-trip through window.electronAPI.license.
// In the browser-only dev preview we fall back to localStorage (no fingerprinting), so the UI is
// still usable while the desktop bundle is the production target.

const LS_TOKEN_KEY = "tcgsnipers_license_token";
const LS_EMAIL_KEY = "tcgsnipers_license_email";

const LICENSE_API_URL = (import.meta.env.VITE_LICENSE_API_URL as string | undefined)?.replace(/\/$/, "")
  ?? "http://localhost:8082";

function inElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.license;
}

export interface StoredLicense {
  token: string;
  email: string;
}

export async function loadStoredLicense(): Promise<StoredLicense | null> {
  if (inElectron()) {
    return (await window.electronAPI!.license.read()) ?? null;
  }
  const t = localStorage.getItem(LS_TOKEN_KEY);
  const e = localStorage.getItem(LS_EMAIL_KEY);
  return t && e ? { token: t, email: e } : null;
}

export async function saveStoredLicense(value: StoredLicense): Promise<void> {
  if (inElectron()) {
    await window.electronAPI!.license.write(value);
    return;
  }
  localStorage.setItem(LS_TOKEN_KEY, value.token);
  localStorage.setItem(LS_EMAIL_KEY, value.email);
}

export async function clearStoredLicense(): Promise<void> {
  if (inElectron()) {
    await window.electronAPI!.license.clear();
    return;
  }
  localStorage.removeItem(LS_TOKEN_KEY);
  localStorage.removeItem(LS_EMAIL_KEY);
}

export async function getFingerprint(): Promise<{ fingerprint: string; osPlatform: string }> {
  if (inElectron()) {
    return window.electronAPI!.license.fingerprint();
  }
  // Browser fallback — stable per-browser, NOT per-machine. Only used for dev preview.
  let fp = localStorage.getItem("tcgsnipers_browser_fp");
  if (!fp) {
    fp = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem("tcgsnipers_browser_fp", fp);
  }
  return { fingerprint: fp, osPlatform: `browser-${navigator.platform || "unknown"}` };
}

interface ApiOpts extends RequestInit {
  body?: string;
}

async function apiCall<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  const res = await fetch(`${LICENSE_API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* noop */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    const err = new Error(msg) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = body;
    throw err;
  }
  return body as T;
}

export const licenseApi = {
  activate(args: {
    email: string;
    licenseKey: string;
    fingerprint: string;
    osPlatform: string;
  }): Promise<{ token: string; status: string; currentPeriodEnd: string | null }> {
    return apiCall("/license/activate", { method: "POST", body: JSON.stringify(args) });
  },
  heartbeat(args: { token: string; fingerprint: string }): Promise<{ status: string; currentPeriodEnd: string | null }> {
    return apiCall("/license/heartbeat", { method: "POST", body: JSON.stringify(args) });
  },
};
