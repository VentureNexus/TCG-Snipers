import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { updateSettingsSchema } from "@workspace/db";
import { setMaxConcurrency } from "../lib/taskWorker";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(settings);
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
  res.json(updated);
});

export { getOrCreateSettings };
export default router;
