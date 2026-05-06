import fs from "fs";
import path from "path";
import os from "os";
import type { Page } from "playwright-core";

const LEARN_DIR = path.join(
  process.env.SESSION_CACHE_DIR ?? path.join(os.homedir(), ".tcg-snipers"),
  "captcha-learns",
);

export interface ClickRecord {
  nx: number;
  ny: number;
}

export interface AssistResult {
  outcome: "done" | "giveup" | "timeout";
  clicks: ClickRecord[];
}

interface AssistSession {
  page: Page;
  resolve: (result: AssistResult) => void;
  retailer: string;
  captchaType: string;
  clicks: ClickRecord[];
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const sessions = new Map<number, AssistSession>();

export function registerSession(
  taskId: number,
  page: Page,
  retailer: string,
  captchaType: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<AssistResult> {
  return new Promise((resolve) => {
    const timeoutHandle = setTimeout(() => {
      if (sessions.has(taskId)) {
        sessions.delete(taskId);
        resolve({ outcome: "timeout", clicks: [] });
      }
    }, timeoutMs);

    sessions.set(taskId, {
      page,
      resolve,
      retailer,
      captchaType,
      clicks: [],
      timeoutHandle,
    });
  });
}

export async function relayClick(
  taskId: number,
  normalizedX: number,
  normalizedY: number,
): Promise<boolean> {
  const session = sessions.get(taskId);
  if (!session) return false;
  try {
    const viewport = session.page.viewportSize();
    const vw = viewport?.width ?? 1280;
    const vh = viewport?.height ?? 720;
    const x = Math.round(normalizedX * vw);
    const y = Math.round(normalizedY * vh);
    await session.page.mouse.click(x, y);
    session.clicks.push({ nx: normalizedX, ny: normalizedY });
    return true;
  } catch {
    return false;
  }
}

export async function getScreenshot(taskId: number): Promise<Buffer | null> {
  const session = sessions.get(taskId);
  if (!session) return null;
  try {
    return await session.page.screenshot({ type: "jpeg", quality: 75 });
  } catch {
    return null;
  }
}

export function signalDone(taskId: number): boolean {
  const session = sessions.get(taskId);
  if (!session) return false;
  clearTimeout(session.timeoutHandle);
  const clicks = [...session.clicks];
  sessions.delete(taskId);
  session.resolve({ outcome: "done", clicks });
  return true;
}

export function signalGiveUp(taskId: number): boolean {
  const session = sessions.get(taskId);
  if (!session) return false;
  clearTimeout(session.timeoutHandle);
  sessions.delete(taskId);
  session.resolve({ outcome: "giveup", clicks: [] });
  return true;
}

export function abortSession(taskId: number): boolean {
  const session = sessions.get(taskId);
  if (!session) return false;
  clearTimeout(session.timeoutHandle);
  sessions.delete(taskId);
  session.resolve({ outcome: "giveup", clicks: [] });
  return true;
}

export function hasSession(taskId: number): boolean {
  return sessions.has(taskId);
}

export function saveLearning(
  retailer: string,
  captchaType: string,
  clicks: ClickRecord[],
  success: boolean,
): void {
  try {
    fs.mkdirSync(LEARN_DIR, { recursive: true });
    const filename = `${retailer}-${captchaType}-${Date.now()}.json`;
    const data = {
      retailer,
      captchaType,
      clicks,
      success,
      recordedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(LEARN_DIR, filename), JSON.stringify(data, null, 2));
  } catch {
    // non-fatal
  }
}
