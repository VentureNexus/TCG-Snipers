import { db, tasksTable, checkoutResultsTable, profilesTable, proxiesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { broadcastLog, broadcastStatus, broadcastRetryProgress } from "./websocket";
import { dispatchRetailer } from "./retailers";
import { notifySuccess, notifyFailure } from "./discord";
import { getOrCreateSettings } from "../routes/settings";
import { getFreshGoogleAccessToken } from "./googleTokenManager";
import type { ImapConfig } from "./imap";

interface TaskRow {
  id: number;
  retailer: string;
  productUrl: string;
  productKeywords: string;
  size: string;
  profileId: number | null;
  proxyId: number | null;
  monitorDelay: number;
  monitorDelayMax: number | null;
  retryCount: number;
  quantity: number;
  maxPrice: number | null;
  stopAfterMs: number | null;
  stopAtTime: string | null;
  startedAt?: Date | null;
}

let maxConcurrency = 5;
let activeConcurrency = 0;
const pendingQueue: TaskRow[] = [];

export function setMaxConcurrency(n: number): void {
  maxConcurrency = Math.max(1, n);
}

export function getActiveConcurrency(): number {
  return activeConcurrency;
}

const cancellationTokens = new Map<number, { cancelled: boolean }>();

export function isTaskRunning(taskId: number): boolean {
  return cancellationTokens.has(taskId);
}

function resolveStopAfterMs(task: TaskRow): number | null {
  if (task.stopAtTime) {
    const [hours, minutes] = task.stopAtTime.split(":").map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime() - now.getTime();
  }
  return task.stopAfterMs;
}

function launchTask(task: TaskRow): void {
  const existing = cancellationTokens.get(task.id);
  if (existing) existing.cancelled = true;
  const token = { cancelled: false };
  cancellationTokens.set(task.id, token);
  activeConcurrency++;
  const startedAt = new Date();
  runTaskAutomation({ ...task, stopAfterMs: resolveStopAfterMs(task), startedAt }, token).catch(() => {});
}

function drainQueue(): void {
  if (pendingQueue.length === 0 || activeConcurrency >= maxConcurrency) return;
  const next = pendingQueue.shift();
  if (next) {
    broadcastLog(next.id, "INFO", `[Scheduler] Slot available — starting queued task #${next.id}.`);
    launchTask(next);
  }
}

async function runTaskAutomation(task: TaskRow, token: { cancelled: boolean }) {
  const log = (level: "INFO" | "SUCCESS" | "WARN" | "ERROR", message: string) =>
    broadcastLog(task.id, level, message);

  await db.update(tasksTable).set({ startedAt: task.startedAt ?? new Date() }).where(eq(tasksTable.id, task.id)).catch(() => {});

  const setStatus = async (status: string) => {
    const isTerminal = ["success", "failed", "stopped"].includes(status);
    await db.update(tasksTable)
      .set(isTerminal ? { status, startedAt: null } : { status })
      .where(eq(tasksTable.id, task.id));
    broadcastStatus(task.id, status);
  };

  const setRetryProgress = (attempt: number, total: number | null) => {
    broadcastRetryProgress(task.id, attempt, total);
  };

  try {
    const profile = task.profileId
      ? (await db.select().from(profilesTable).where(eq(profilesTable.id, task.profileId)))[0] ?? null
      : null;

    const proxyRow = task.proxyId
      ? (await db.select().from(proxiesTable).where(eq(proxiesTable.id, task.proxyId)))[0] ?? null
      : null;

    const proxy = proxyRow
      ? {
          host: proxyRow.host,
          port: proxyRow.port,
          username: proxyRow.username || undefined,
          password: proxyRow.password || undefined,
        }
      : null;

    const settings = await getOrCreateSettings();

    // Build global IMAP config from app Settings, refreshing Google token if needed.
    let globalImapConfig: ImapConfig | null = null;
    if (settings.googleEmail && settings.googleAccessToken) {
      const accessToken = await getFreshGoogleAccessToken(settings.id);
      if (accessToken) {
        globalImapConfig = {
          host: "imap.gmail.com",
          port: 993,
          user: settings.googleEmail,
          accessToken,
        };
      }
    } else if (settings.imapHost && settings.imapEmail) {
      globalImapConfig = {
        host: settings.imapHost,
        port: parseInt(settings.imapPort, 10) || 993,
        user: settings.imapEmail,
        password: settings.imapPassword,
      };
    }

    const result = await dispatchRetailer({
      task: {
        id: task.id,
        retailer: task.retailer,
        productUrl: task.productUrl,
        productKeywords: task.productKeywords,
        size: task.size,
        quantity: task.quantity,
        monitorDelay: Math.max(task.monitorDelay, 100),
        monitorDelayMax: task.monitorDelayMax ?? null,
        retryCount: task.retryCount,
        maxPrice: task.maxPrice ?? null,
        stopAfterMs: task.stopAfterMs ?? null,
      },
      profile: profile ?? null,
      proxy,
      token,
      log,
      setStatus,
      setRetryProgress,
      globalImapConfig,
    });

    if (token.cancelled) return;

    const profileNickname = profile?.name ?? "No Profile";

    if (result.success) {
      await setStatus("success");
      await db.insert(checkoutResultsTable).values({
        taskId: task.id,
        success: true,
        productName: result.productName,
        productImage: result.productImage,
        price: result.price,
        retailer: task.retailer,
        orderNumber: result.orderNumber,
        errorMessage: "",
        profileId: task.profileId,
      });
      if (settings.webhookUrl) {
        try {
          await notifySuccess({
            retailer: task.retailer,
            productName: result.productName,
            price: result.price != null ? result.price : "N/A",
            orderNumber: result.orderNumber,
            profileNickname,
            webhookUrl: settings.webhookUrl,
          });
        } catch (webhookErr) {
          log("WARN", `[Discord] Webhook notification failed: ${String(webhookErr)}`);
        }
      }
    } else {
      log("ERROR", `[${task.retailer}] Task failed: ${result.errorMessage}`);
      await setStatus("failed");
      await db.insert(checkoutResultsTable).values({
        taskId: task.id,
        success: false,
        productName: result.productName,
        productImage: result.productImage,
        price: null,
        retailer: task.retailer,
        orderNumber: "",
        errorMessage: result.errorMessage,
        profileId: task.profileId,
      });
      if (settings.webhookUrl) {
        try {
          await notifyFailure({
            retailer: task.retailer,
            productName: result.productName,
            errorMessage: result.errorMessage,
            retryCount: task.retryCount,
            profileNickname,
            webhookUrl: settings.webhookUrl,
          });
        } catch (webhookErr) {
          log("WARN", `[Discord] Webhook notification failed: ${String(webhookErr)}`);
        }
      }
    }
  } catch (err) {
    log("ERROR", `[${task.retailer}] Unexpected error: ${String(err)}`);
    await db.update(tasksTable).set({ status: "failed", startedAt: null }).where(eq(tasksTable.id, task.id));
    broadcastStatus(task.id, "failed");
  } finally {
    activeConcurrency--;
    if (cancellationTokens.get(task.id) === token) {
      cancellationTokens.delete(task.id);
    }
    drainQueue();
  }
}

export function startTask(task: TaskRow): { started: boolean; queued: boolean } {
  const existing = cancellationTokens.get(task.id);
  if (existing) existing.cancelled = true;

  if (activeConcurrency < maxConcurrency) {
    launchTask(task);
    return { started: true, queued: false };
  }

  const queueIdx = pendingQueue.findIndex((t) => t.id === task.id);
  if (queueIdx !== -1) pendingQueue.splice(queueIdx, 1);
  pendingQueue.push(task);
  broadcastLog(task.id, "WARN", `[Scheduler] Max concurrency (${maxConcurrency}) reached — task queued (position ${pendingQueue.length}).`);
  return { started: false, queued: true };
}

export async function stopTask(taskId: number): Promise<void> {
  const token = cancellationTokens.get(taskId);
  if (token) {
    token.cancelled = true;
    cancellationTokens.delete(taskId);
  }
  const queueIdx = pendingQueue.findIndex((t) => t.id === taskId);
  if (queueIdx !== -1) pendingQueue.splice(queueIdx, 1);
  await db.update(tasksTable).set({ status: "stopped", startedAt: null }).where(eq(tasksTable.id, taskId));
  broadcastStatus(taskId, "stopped");
}

export async function stopTasks(taskIds: number[]): Promise<number[]> {
  if (taskIds.length === 0) return [];
  await Promise.all(taskIds.map((id) => stopTask(id)));
  return taskIds;
}

export async function stopAllRunning(extraIds: number[] = []): Promise<number[]> {
  const runningIds = Array.from(cancellationTokens.keys());
  const allIds = Array.from(new Set([...runningIds, ...extraIds]));
  pendingQueue.splice(0);
  await Promise.all(allIds.map((id) => stopTask(id)));
  return allIds;
}
