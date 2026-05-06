import type { Page } from "playwright-core";

export interface LoginAssistSession {
  id: string;
  page: Page;
  retailer: string;
  resolve: (outcome: "done" | "giveup" | "timeout") => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
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
        sessions.delete(id);
        resolve("timeout");
      }
    }, timeoutMs);
    sessions.set(id, { id, page, retailer, resolve, timeoutHandle });
  });
  return { id, promise };
}

export function getActiveSession(): { id: string; retailer: string } | null {
  const first = sessions.values().next().value as LoginAssistSession | undefined;
  if (!first) return null;
  return { id: first.id, retailer: first.retailer };
}

export async function relayLoginClick(
  id: string,
  nx: number,
  ny: number,
): Promise<boolean> {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    const vp = s.page.viewportSize();
    const x = Math.round(nx * (vp?.width ?? 1280));
    const y = Math.round(ny * (vp?.height ?? 720));
    await s.page.mouse.click(x, y);
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

export async function getLoginScreenshot(id: string): Promise<Buffer | null> {
  const s = sessions.get(id);
  if (!s) return null;
  try {
    return await s.page.screenshot({ type: "jpeg", quality: 75 });
  } catch {
    return null;
  }
}

export function signalLoginDone(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  clearTimeout(s.timeoutHandle);
  sessions.delete(id);
  s.resolve("done");
  return true;
}

export function signalLoginGiveUp(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  clearTimeout(s.timeoutHandle);
  sessions.delete(id);
  s.resolve("giveup");
  return true;
}

export function abortLoginSession(id: string): void {
  const s = sessions.get(id);
  if (s) {
    clearTimeout(s.timeoutHandle);
    sessions.delete(id);
    s.resolve("giveup");
  }
}
