import { db, tasksTable, checkoutResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

const cancellationTokens = new Map<number, { cancelled: boolean }>();

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
        price: product.price as unknown as null,
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
    cancellationTokens.delete(task.id);
  }
}

export async function startTask(task: TaskRow): Promise<void> {
  const existing = cancellationTokens.get(task.id);
  if (existing) {
    existing.cancelled = true;
  }
  const token = { cancelled: false };
  cancellationTokens.set(task.id, token);
  // Run without awaiting so the HTTP response returns immediately
  runTaskAutomation(task, token).catch(() => {
    cancellationTokens.delete(task.id);
  });
}

export function stopTask(taskId: number): void {
  const token = cancellationTokens.get(taskId);
  if (token) {
    token.cancelled = true;
    cancellationTokens.delete(taskId);
  }
}

export function isTaskRunning(taskId: number): boolean {
  return cancellationTokens.has(taskId);
}
