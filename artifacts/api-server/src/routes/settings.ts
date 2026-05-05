import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import os from "os";
import { db, settingsTable } from "@workspace/db";
import { updateSettingsSchema } from "@workspace/db";
import { setMaxConcurrency } from "../lib/taskWorker";

const CONCURRENCY_HARD_MAX = 50;

function getSystemConcurrencyHint() {
  const cores = os.cpus().length;
  const recommendedMin = Math.min(cores, CONCURRENCY_HARD_MAX);
  const recommendedMax = Math.min(cores * 2, CONCURRENCY_HARD_MAX);
  return { systemCores: cores, recommendedMin, recommendedMax };
}

const router: IRouter = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({ ...settings, ...getSystemConcurrencyHint() });
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const current = await getOrCreateSettings();
  const effectiveMin = parsed.data.monitorDelay ?? current.monitorDelay;
  const effectiveMax = parsed.data.monitorDelayMax !== undefined
    ? parsed.data.monitorDelayMax
    : current.monitorDelayMax;
  if (effectiveMax !== null && effectiveMax !== undefined && effectiveMax <= effectiveMin) {
    res.status(400).json({ error: "Min Delay must be less than Max Delay" });
    return;
  }
  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, current.id))
    .returning();
  if (updated.concurrency !== undefined) {
    setMaxConcurrency(updated.concurrency);
  }
  res.json({ ...updated, ...getSystemConcurrencyHint() });
});

export { getOrCreateSettings };
export default router;
