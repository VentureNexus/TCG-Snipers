/**
 * Screenshot utility — takes a JPEG snapshot of the current Playwright page
 * and broadcasts it to all WebSocket subscribers for that task.
 *
 * Keeps the last-sent hash so we only send frames that actually changed,
 * saving bandwidth when the page is idle.
 */
import type { Page } from "playwright-core";
import { broadcastScreenshot } from "../websocket";
import crypto from "crypto";

const lastHashMap = new Map<number, string>();

export async function emitScreenshot(taskId: number, page: Page): Promise<void> {
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 55 });
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    if (lastHashMap.get(taskId) === hash) return; // unchanged — skip
    lastHashMap.set(taskId, hash);
    const dataUrl = "data:image/jpeg;base64," + buf.toString("base64");
    broadcastScreenshot(taskId, dataUrl);
  } catch {
    // page may have closed — ignore
  }
}

export function clearScreenshotHash(taskId: number): void {
  lastHashMap.delete(taskId);
}
