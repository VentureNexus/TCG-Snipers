import { db, tasksTable, checkoutResultsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { broadcastLog, broadcastStatus } from "./websocket";

interface TaskRow {
  id: number;
  retailer: string;
  productUrl: string;
  productKeywords: string;
  profileId: number | null;
  monitorDelay: number;
  retryCount: number;
  quantity: number;
}

// ── Concurrency control ───────────────────────────────────────────────────────
let maxConcurrency = 5;
let activeConcurrency = 0;
const pendingQueue: TaskRow[] = [];

export function setMaxConcurrency(n: number): void {
  maxConcurrency = Math.max(1, n);
}

export function getActiveConcurrency(): number {
  return activeConcurrency;
}

// ── Cancellation tokens (authoritative for "is this task running?") ──────────
const cancellationTokens = new Map<number, { cancelled: boolean }>();

export function isTaskRunning(taskId: number): boolean {
  return cancellationTokens.has(taskId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateOrderNumber(): string {
  return "ORD-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

const RETAILER_PRODUCTS: Record<
  string,
  { name: string; price: string; image: string }[]
> = {
  Target: [
    {
      name: "PlayStation 5 Console",
      price: "499.99",
      image: "https://placehold.co/80x80/e11d48/white?text=PS5",
    },
    {
      name: "Nintendo Switch OLED",
      price: "349.99",
      image: "https://placehold.co/80x80/e11d48/white?text=NSW",
    },
  ],
  Amazon: [
    {
      name: "Xbox Series X",
      price: "499.99",
      image: "https://placehold.co/80x80/f97316/white?text=XSX",
    },
    {
      name: "Pokémon Trading Cards Booster Box",
      price: "139.99",
      image: "https://placehold.co/80x80/f97316/white?text=PKM",
    },
  ],
  "Best Buy": [
    {
      name: "NVIDIA GeForce RTX 4090",
      price: "1599.99",
      image: "https://placehold.co/80x80/3b82f6/white?text=GPU",
    },
    {
      name: "Apple AirPods Pro",
      price: "249.99",
      image: "https://placehold.co/80x80/3b82f6/white?text=APD",
    },
  ],
  Costco: [
    {
      name: "Samsung 65-inch QLED TV",
      price: "899.99",
      image: "https://placehold.co/80x80/0ea5e9/white?text=TV",
    },
  ],
  "Pokemon Center": [
    {
      name: "Pokémon 151 Elite Trainer Box",
      price: "59.99",
      image: "https://placehold.co/80x80/eab308/white?text=ETB",
    },
    {
      name: "Charizard ex Premium Collection",
      price: "49.99",
      image: "https://placehold.co/80x80/eab308/white?text=CHR",
    },
  ],
};

// ── Internal: launch task immediately (caller guarantees a slot is available) ─
function launchTask(task: TaskRow): void {
  const existing = cancellationTokens.get(task.id);
  if (existing) {
    existing.cancelled = true;
  }
  const token = { cancelled: false };
  cancellationTokens.set(task.id, token);
  activeConcurrency++;
  runTaskAutomation(task, token).catch(() => {
    // handled inside finally
  });
}

// ── Drain one item from the pending queue (called when a slot frees up) ───────
function drainQueue(): void {
  if (pendingQueue.length === 0) return;
  if (activeConcurrency >= maxConcurrency) return;
  const next = pendingQueue.shift();
  if (next) {
    broadcastLog(next.id, "INFO", `[Scheduler] Slot available — starting queued task #${next.id}.`);
    launchTask(next);
  }
}

// ── Core automation loop ──────────────────────────────────────────────────────
async function runTaskAutomation(task: TaskRow, token: { cancelled: boolean }) {
  const log = (
    level: "INFO" | "SUCCESS" | "WARN" | "ERROR",
    message: string,
  ) => broadcastLog(task.id, level, message);

  const setStatus = async (status: string) => {
    await db
      .update(tasksTable)
      .set({ status })
      .where(eq(tasksTable.id, task.id));
    broadcastStatus(task.id, status);
  };

  const monitorDelayMs = Math.max(task.monitorDelay, 500);
  const retailerKey = task.retailer;
  const products = RETAILER_PRODUCTS[retailerKey] ?? RETAILER_PRODUCTS["Amazon"];
  const product = products[Math.floor(Math.random() * products.length)];

  try {
    // ── MONITORING ──────────────────────────────────────────────────────────
    await setStatus("monitoring");
    log("INFO", `[${retailerKey}] Starting monitor for: ${task.productUrl || task.productKeywords || "unknown product"}`);
    await delay(randomBetween(300, 700));
    if (token.cancelled) return;

    log("INFO", `[${retailerKey}] Sending stock request (delay: ${monitorDelayMs}ms)...`);
    await delay(monitorDelayMs * 0.3);
    if (token.cancelled) return;

    const failMonitor = Math.random() < 0.15;
    if (failMonitor) {
      log("WARN", `[${retailerKey}] Rate limited — backing off 2000ms...`);
      await delay(2000);
      if (token.cancelled) return;
      log("WARN", `[${retailerKey}] Retrying request...`);
      await delay(randomBetween(500, 1000));
      if (token.cancelled) return;
    }

    log("INFO", `[${retailerKey}] Response received — checking availability...`);
    await delay(randomBetween(200, 500));
    if (token.cancelled) return;

    log("SUCCESS", `[${retailerKey}] Stock detected! Product: ${product.name}`);
    await delay(randomBetween(100, 300));
    if (token.cancelled) return;

    // ── ADDING TO CART ───────────────────────────────────────────────────────
    await setStatus("adding_to_cart");
    log("INFO", `[${retailerKey}] Adding ${task.quantity}x to cart...`);
    await delay(randomBetween(500, 1000));
    if (token.cancelled) return;

    log("INFO", `[${retailerKey}] Verifying cart contents...`);
    await delay(randomBetween(300, 600));
    if (token.cancelled) return;
    log("SUCCESS", `[${retailerKey}] Added to cart successfully.`);
    await delay(randomBetween(200, 400));
    if (token.cancelled) return;

    // ── CHECKING OUT ─────────────────────────────────────────────────────────
    await setStatus("checking_out");
    log("INFO", `[${retailerKey}] Navigating to checkout...`);
    await delay(randomBetween(400, 800));
    if (token.cancelled) return;

    log("INFO", `[${retailerKey}] Applying shipping address...`);
    await delay(randomBetween(300, 600));
    if (token.cancelled) return;

    log("INFO", `[${retailerKey}] Entering payment details (masked)...`);
    await delay(randomBetween(400, 800));
    if (token.cancelled) return;

    log("INFO", `[${retailerKey}] Submitting order...`);
    await delay(randomBetween(500, 1200));
    if (token.cancelled) return;

    // ── OUTCOME ──────────────────────────────────────────────────────────────
    const succeeded = Math.random() < 0.8;
    if (succeeded) {
      const orderNumber = generateOrderNumber();
      log("SUCCESS", `[${retailerKey}] Order placed! ✓ Order #${orderNumber} — ${product.name} @ $${product.price}`);
      await setStatus("success");
      await db.insert(checkoutResultsTable).values({
        taskId: task.id,
        success: true,
        productName: product.name,
        productImage: product.image,
        price: product.price,
        retailer: task.retailer,
        orderNumber,
        errorMessage: "",
        profileId: task.profileId,
      });
    } else {
      log("ERROR", `[${retailerKey}] Checkout failed — payment declined or session expired.`);
      await setStatus("failed");
      await db.insert(checkoutResultsTable).values({
        taskId: task.id,
        success: false,
        productName: product.name,
        productImage: product.image,
        price: null,
        retailer: task.retailer,
        orderNumber: "",
        errorMessage: "Payment declined or session expired",
        profileId: task.profileId,
      });
    }
  } catch (err) {
    log("ERROR", `[${retailerKey}] Unexpected error: ${String(err)}`);
    await db
      .update(tasksTable)
      .set({ status: "failed" })
      .where(eq(tasksTable.id, task.id));
    broadcastStatus(task.id, "failed");
  } finally {
    activeConcurrency--;
    // Only delete from the map if this run's token is still the current one.
    // If the task was restarted, launchTask already placed a new token in the
    // map — deleting unconditionally would evict the new run's token and make
    // subsequent stop calls miss the active run.
    if (cancellationTokens.get(task.id) === token) {
      cancellationTokens.delete(task.id);
    }
    // Drain the next pending task now that a slot freed up
    drainQueue();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start a task respecting the configured max concurrency.
 * If all slots are full, the task is added to the FIFO pending queue and will
 * start automatically when a running task finishes.
 * Returns `{ started: true }` if launched immediately, `{ queued: true }` if queued.
 */
export function startTask(task: TaskRow): { started: boolean; queued: boolean } {
  // Cancel any existing run for this task
  const existing = cancellationTokens.get(task.id);
  if (existing) {
    existing.cancelled = true;
  }

  if (activeConcurrency < maxConcurrency) {
    launchTask(task);
    return { started: true, queued: false };
  }

  // Remove any stale queue entry for this task before re-adding
  const queueIdx = pendingQueue.findIndex((t) => t.id === task.id);
  if (queueIdx !== -1) {
    pendingQueue.splice(queueIdx, 1);
  }
  pendingQueue.push(task);
  broadcastLog(task.id, "WARN", `[Scheduler] Max concurrency (${maxConcurrency}) reached — task queued (position ${pendingQueue.length}).`);
  return { started: false, queued: true };
}

/**
 * Stop a single task by ID.
 * Cancels the token if the task is running; no-op if not in the token map.
 * Also removes any pending-queue entry for this task.
 */
export function stopTask(taskId: number): void {
  const token = cancellationTokens.get(taskId);
  if (token) {
    token.cancelled = true;
    cancellationTokens.delete(taskId);
  }
  // Remove from queue if it was waiting
  const queueIdx = pendingQueue.findIndex((t) => t.id === taskId);
  if (queueIdx !== -1) {
    pendingQueue.splice(queueIdx, 1);
  }
}

/**
 * Stop a specific set of task IDs.
 * Only affects tasks in the provided list — does NOT sweep the global token map.
 * Use this for group-scoped stops.
 */
export async function stopTasks(taskIds: number[]): Promise<number[]> {
  if (taskIds.length === 0) return [];
  for (const id of taskIds) {
    stopTask(id);
  }
  await db
    .update(tasksTable)
    .set({ status: "stopped" })
    .where(inArray(tasksTable.id, taskIds));
  for (const id of taskIds) {
    broadcastStatus(id, "stopped");
  }
  return taskIds;
}

/**
 * Stop ALL currently running tasks (global stop-all).
 * Uses the token map as the authoritative source, unioned with any extra IDs
 * supplied by the caller (to handle the narrow race between DB read and token creation).
 */
export async function stopAllRunning(extraIds: number[] = []): Promise<number[]> {
  const runningIds = Array.from(cancellationTokens.keys());
  const allIds = Array.from(new Set([...runningIds, ...extraIds]));
  // Also flush the pending queue
  pendingQueue.splice(0);
  for (const id of allIds) {
    stopTask(id);
  }
  if (allIds.length > 0) {
    await db
      .update(tasksTable)
      .set({ status: "stopped" })
      .where(inArray(tasksTable.id, allIds));
    for (const id of allIds) {
      broadcastStatus(id, "stopped");
    }
  }
  return allIds;
}
