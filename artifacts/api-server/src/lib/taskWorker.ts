import { db, tasksTable, checkoutResultsTable, profilesTable, proxiesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { broadcastLog, broadcastStatus } from "./websocket";
import { dispatchRetailer } from "./retailers";
import { notifySuccess, notifyFailure } from "./discord";
import { getOrCreateSettings } from "../routes/settings";

interface TaskRow {
  id: number;
  retailer: string;
  productUrl: string;
  productKeywords: string;
  size: string;
  profileId: number | null;
  proxyId: number | null;
  monitorDelay: number;
  retryCount: number;
  quantity: number;
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

function launchTask(task: TaskRow): void {
  const existing = cancellationTokens.get(task.id);
  if (existing) existing.cancelled = true;
  const token = { cancelled: false };
  cancellationTokens.set(task.id, token);
  activeConcurrency++;
  runTaskAutomation(task, token).catch(() => {});
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

  const setStatus = async (status: string) => {
    await db.update(tasksTable).set({ status }).where(eq(tasksTable.id, task.id));
    broadcastStatus(task.id, status);
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

    const result = await dispatchRetailer({
      task: {
        id: task.id,
        retailer: task.retailer,
        productUrl: task.productUrl,
        productKeywords: task.productKeywords,
        size: task.size,
        quantity: task.quantity,
        monitorDelay: Math.max(task.monitorDelay, 500),
        retryCount: task.retryCount,
      },
      profile: profile ?? null,
      proxy,
      token,
      log,
      setStatus,
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
        await notifySuccess({
          retailer: task.retailer,
          productName: result.productName,
          price: result.price ?? "N/A",
          orderNumber: result.orderNumber,
          profileNickname,
          webhookUrl: settings.webhookUrl,
        });
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
        await notifyFailure({
          retailer: task.retailer,
          productName: result.productName,
          errorMessage: result.errorMessage,
          profileNickname,
          webhookUrl: settings.webhookUrl,
        });
      }
    }
  } catch (err) {
    log("ERROR", `[${task.retailer}] Unexpected error: ${String(err)}`);
    await db.update(tasksTable).set({ status: "failed" }).where(eq(tasksTable.id, task.id));
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

export function stopTask(taskId: number): void {
  const token = cancellationTokens.get(taskId);
  if (token) {
    token.cancelled = true;
    cancellationTokens.delete(taskId);
  }
  const queueIdx = pendingQueue.findIndex((t) => t.id === taskId);
  if (queueIdx !== -1) pendingQueue.splice(queueIdx, 1);
}

export async function stopTasks(taskIds: number[]): Promise<number[]> {
  if (taskIds.length === 0) return [];
  for (const id of taskIds) stopTask(id);
  await db.update(tasksTable).set({ status: "stopped" }).where(inArray(tasksTable.id, taskIds));
  for (const id of taskIds) broadcastStatus(id, "stopped");
  return taskIds;
}

export async function stopAllRunning(extraIds: number[] = []): Promise<number[]> {
  const runningIds = Array.from(cancellationTokens.keys());
  const allIds = Array.from(new Set([...runningIds, ...extraIds]));
  pendingQueue.splice(0);
  for (const id of allIds) stopTask(id);
  if (allIds.length > 0) {
    await db.update(tasksTable).set({ status: "stopped" }).where(inArray(tasksTable.id, allIds));
    for (const id of allIds) broadcastStatus(id, "stopped");
  }
  return allIds;
}
