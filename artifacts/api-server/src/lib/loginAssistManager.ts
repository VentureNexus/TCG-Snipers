import type { Page } from "playwright-core";

export interface LoginAssistSession {
  id: string;
  page: Page;
  retailer: string;
  isManual: boolean;
  manualSaveOnDone?: { retailer: string; email: string };
  resolve: (outcome: "done" | "giveup" | "timeout") => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  screenshotCache: Buffer | null;
  captureInterval: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, LoginAssistSession>();

export function registerLoginAssist(
  page: Page,
  retailer: string,
  timeoutMs = 5 * 60 * 1000,
  opts?: { isManual?: boolean; manualSaveOnDone?: { retailer: string; email: string } },
): { id: string; promise: Promise<"done" | "giveup" | "timeout"> } {
  const id = `${retailer.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const promise = new Promise<"done" | "giveup" | "timeout">((resolve) => {
    const timeoutHandle = setTimeout(() => {
      if (sessions.has(id)) {
        const s = sessions.get(id)!;
        clearInterval(s.captureInterval);
        sessions.delete(id);
        if (s.isManual) void closeBrowserSafe(s.page);
        resolve("timeout");
      }
    }, timeoutMs);

    const session: LoginAssistSession = {
      id,
      page,
      retailer,
      isManual: opts?.isManual ?? false,
      manualSaveOnDone: opts?.manualSaveOnDone,
      resolve,
      timeoutHandle,
      screenshotCache: null,
      captureInterval: setInterval(() => {}, 999999),
    };

    let capturing = false;
    session.captureInterval = setInterval(async () => {
      if (capturing) return;
      capturing = true;
      try {
        session.screenshotCache = await page.screenshot({ type: "jpeg", quality: 70 });
      } catch { /* page may be closing */ }
      capturing = false;
    }, 150);

    sessions.set(id, session);
  });
  return { id, promise };
}

export function getActiveSession(): { id: string; retailer: string; isManual: boolean } | null {
  const first = sessions.values().next().value as LoginAssistSession | undefined;
  if (!first) return null;
  return { id: first.id, retailer: first.retailer, isManual: first.isManual };
}

function getXY(s: LoginAssistSession, nx: number, ny: number): { x: number; y: number } {
  const vp = s.page.viewportSize();
  return {
    x: Math.round(nx * (vp?.width ?? 1280)),
    y: Math.round(ny * (vp?.height ?? 720)),
  };
}

async function closeBrowserSafe(page: Page): Promise<void> {
  try { await page.context().browser()?.close(); } catch { /* non-fatal */ }
}

// ── Navigation ─────────────────────────────────────────────────────────────

export function getCurrentUrl(id: string): string | null {
  const s = sessions.get(id);
  if (!s) return null;
  try { return s.page.url(); } catch { return null; }
}

export async function relayLoginNavigate(id: string, url: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    let target = url.trim();
    if (target && !/^https?:\/\//i.test(target)) target = `https://${target}`;
    await s.page.goto(target, { waitUntil: "domcontentloaded", timeout: 20000 });
    return true;
  } catch { return false; }
}

export async function relayLoginGoBack(id: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try { await s.page.goBack({ timeout: 10000 }); return true; } catch { return false; }
}

export async function relayLoginGoForward(id: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try { await s.page.goForward({ timeout: 10000 }); return true; } catch { return false; }
}

export async function relayLoginReload(id: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try { await s.page.reload({ timeout: 20000, waitUntil: "domcontentloaded" }); return true; } catch { return false; }
}

// ── Mouse / keyboard ───────────────────────────────────────────────────────

export async function relayLoginClick(id: string, nx: number, ny: number): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    const { x, y } = getXY(s, nx, ny);
    await s.page.bringToFront();
    await s.page.mouse.move(x, y);
    await s.page.mouse.down();
    await new Promise((r) => setTimeout(r, 60));
    await s.page.mouse.up();
    return true;
  } catch { return false; }
}

export async function relayLoginMouseDown(id: string, nx: number, ny: number): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    const { x, y } = getXY(s, nx, ny);
    await s.page.bringToFront();
    await s.page.mouse.move(x, y);
    await s.page.mouse.down();
    return true;
  } catch { return false; }
}

export async function relayLoginMouseUp(id: string, nx: number, ny: number): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    const { x, y } = getXY(s, nx, ny);
    await s.page.mouse.move(x, y);
    await s.page.mouse.up();
    return true;
  } catch { return false; }
}

export async function relayLoginScroll(
  id: string, nx: number, ny: number, deltaX: number, deltaY: number,
): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    const { x, y } = getXY(s, nx, ny);
    await s.page.mouse.move(x, y);
    await s.page.mouse.wheel(deltaX, deltaY);
    return true;
  } catch { return false; }
}

export async function relayLoginKey(id: string, text: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try { await s.page.keyboard.type(text); return true; } catch { return false; }
}

export async function relayLoginSpecialKey(id: string, key: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try { await s.page.keyboard.press(key); return true; } catch { return false; }
}

export function getLoginScreenshot(id: string): Buffer | null {
  const s = sessions.get(id);
  if (!s) return null;
  return s.screenshotCache;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

export async function signalLoginDone(id: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  clearTimeout(s.timeoutHandle);
  clearInterval(s.captureInterval);
  sessions.delete(id);

  // For manual sessions: extract and save session cookies so future auto-login
  // attempts can reuse them — the whole point of the manual sign-in flow.
  if (s.manualSaveOnDone) {
    try {
      const { retailer, email } = s.manualSaveOnDone;
      const storageState = await s.page.context().storageState();
      const { saveSession } = await import("./retailers/sessionCache");
      saveSession(retailer, email, storageState);
      console.log(`[manual-login] Session cookies saved for ${retailer} / ${email}`);
    } catch (e) {
      console.warn(`[manual-login] Failed to save session: ${e}`);
    }
  }

  s.resolve("done");
  if (s.isManual) void closeBrowserSafe(s.page);
  return true;
}

export function signalLoginGiveUp(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  clearTimeout(s.timeoutHandle);
  clearInterval(s.captureInterval);
  sessions.delete(id);
  s.resolve("giveup");
  if (s.isManual) void closeBrowserSafe(s.page);
  return true;
}

export function abortLoginSession(id: string): void {
  const s = sessions.get(id);
  if (s) {
    clearTimeout(s.timeoutHandle);
    clearInterval(s.captureInterval);
    sessions.delete(id);
    s.resolve("giveup");
    if (s.isManual) void closeBrowserSafe(s.page);
  }
}
