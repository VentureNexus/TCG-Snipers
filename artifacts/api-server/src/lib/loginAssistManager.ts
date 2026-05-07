import type { Page } from "playwright-core";

export interface LoginAssistSession {
  id: string;
  page: Page;
  retailer: string;
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
): { id: string; promise: Promise<"done" | "giveup" | "timeout"> } {
  const id = `${retailer.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const promise = new Promise<"done" | "giveup" | "timeout">((resolve) => {
    const timeoutHandle = setTimeout(() => {
      if (sessions.has(id)) {
        const s = sessions.get(id)!;
        clearInterval(s.captureInterval);
        sessions.delete(id);
        resolve("timeout");
      }
    }, timeoutMs);

    const session: LoginAssistSession = {
      id,
      page,
      retailer,
      resolve,
      timeoutHandle,
      screenshotCache: null,
      captureInterval: setInterval(() => {}, 999999), // placeholder, replaced below
    };

    // Background capture loop — always-fresh frames served instantly on request
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

export function getActiveSession(): { id: string; retailer: string } | null {
  const first = sessions.values().next().value as LoginAssistSession | undefined;
  if (!first) return null;
  return { id: first.id, retailer: first.retailer };
}

function getXY(s: LoginAssistSession, nx: number, ny: number): { x: number; y: number } {
  const vp = s.page.viewportSize();
  return {
    x: Math.round(nx * (vp?.width ?? 1280)),
    y: Math.round(ny * (vp?.height ?? 720)),
  };
}

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
  } catch {
    return false;
  }
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
  } catch {
    return false;
  }
}

export async function relayLoginMouseUp(id: string, nx: number, ny: number): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    const { x, y } = getXY(s, nx, ny);
    await s.page.mouse.move(x, y);
    await s.page.mouse.up();
    return true;
  } catch {
    return false;
  }
}

export async function relayLoginScroll(
  id: string,
  nx: number,
  ny: number,
  deltaX: number,
  deltaY: number,
): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    const { x, y } = getXY(s, nx, ny);
    await s.page.mouse.move(x, y);
    await s.page.mouse.wheel(deltaX, deltaY);
    return true;
  } catch {
    return false;
  }
}

export async function relayLoginKey(id: string, text: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    await s.page.keyboard.type(text);
    return true;
  } catch {
    return false;
  }
}

export async function relayLoginSpecialKey(id: string, key: string): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    await s.page.keyboard.press(key);
    return true;
  } catch {
    return false;
  }
}

export function getLoginScreenshot(id: string): Buffer | null {
  const s = sessions.get(id);
  if (!s) return null;
  return s.screenshotCache;
}

export function signalLoginDone(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  clearTimeout(s.timeoutHandle);
  clearInterval(s.captureInterval);
  sessions.delete(id);
  s.resolve("done");
  return true;
}

export function signalLoginGiveUp(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  clearTimeout(s.timeoutHandle);
  clearInterval(s.captureInterval);
  sessions.delete(id);
  s.resolve("giveup");
  return true;
}

export function abortLoginSession(id: string): void {
  const s = sessions.get(id);
  if (s) {
    clearTimeout(s.timeoutHandle);
    clearInterval(s.captureInterval);
    sessions.delete(id);
    s.resolve("giveup");
  }
}
