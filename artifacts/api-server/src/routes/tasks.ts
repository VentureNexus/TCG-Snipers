import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, tasksTable, profilesTable } from "@workspace/db";
import { ListTasksQueryParams, CreateTaskBody, GetTaskParams, UpdateTaskParams, UpdateTaskBody, DeleteTaskParams, StartTaskParams, StopTaskParams } from "@workspace/api-zod";
import { startTask, stopTask, stopAllRunning } from "../lib/taskWorker";
import { clearLogBuffer } from "../lib/websocket";

function isProfileShippingComplete(profile: { shipFirstName: string | null; shipLastName: string | null; shipAddress1: string | null; shipCity: string | null; shipState: string | null; shipZip: string | null }): boolean {
  return !!(profile.shipFirstName && profile.shipLastName && profile.shipAddress1 && profile.shipCity && profile.shipState && profile.shipZip);
}

const router: IRouter = Router();

router.get("/tasks", async (req, res): Promise<void> => {
  const query = ListTasksQueryParams.safeParse(req.query);
  let tasks;
  if (query.success && query.data.groupId) {
    tasks = await db.select().from(tasksTable).where(eq(tasksTable.groupId, query.data.groupId));
  } else {
    tasks = await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
  }
  res.json(tasks);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const effectiveMin = parsed.data.monitorDelay ?? 200;
  const effectiveMax = parsed.data.monitorDelayMax;
  if (effectiveMax !== null && effectiveMax !== undefined && effectiveMax <= effectiveMin) {
    res.status(400).json({ error: "Min Delay must be less than Max Delay" });
    return;
  }
  const [task] = await db.insert(tasksTable).values(parsed.data).returning();
  res.status(201).json(task);
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  const effectiveMin = parsed.data.monitorDelay ?? existing.monitorDelay;
  const effectiveMax = parsed.data.monitorDelayMax !== undefined
    ? parsed.data.monitorDelayMax
    : existing.monitorDelayMax;
  if (effectiveMax !== null && effectiveMax !== undefined && effectiveMax <= effectiveMin) {
    res.status(400).json({ error: "Min Delay must be less than Max Delay" });
    return;
  }
  const [task] = await db.update(tasksTable).set(parsed.data).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  clearLogBuffer(params.data.id);
  res.sendStatus(204);
});

router.post("/tasks/start-all", async (_req, res): Promise<void> => {
  const idleTasks = await db
    .select()
    .from(tasksTable)
    .where(inArray(tasksTable.status, ["idle", "stopped", "failed"]));
  let started = 0;
  let queued = 0;
  let skipped = 0;
  for (const task of idleTasks) {
    if (task.profileId) {
      const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, task.profileId));
      if (!profile || !isProfileShippingComplete(profile)) {
        skipped++;
        continue;
      }
    }
    const result = startTask(task);
    if (result.queued) queued++;
    else started++;
  }
  res.json({ started, queued, skipped, affected: idleTasks.length, message: `Started ${started}, queued ${queued}, skipped ${skipped} (incomplete profile) tasks` });
});

router.post("/tasks/stop-all", async (_req, res): Promise<void> => {
  const dbRunning = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(inArray(tasksTable.status, ["monitoring", "adding_to_cart", "checking_out"]));
  const stoppedIds = await stopAllRunning(dbRunning.map((t) => t.id));
  res.json({ affected: stoppedIds.length, message: `Stopped ${stoppedIds.length} tasks` });
});

router.post("/tasks/:id/start", async (req, res): Promise<void> => {
  const params = StartTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.profileId) {
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, task.profileId));
    if (!profile || !isProfileShippingComplete(profile)) {
      res.status(422).json({ error: "Profile is missing required shipping fields (name, address, city, state, ZIP). Edit the profile to fill in shipping details before starting." });
      return;
    }
  }
  startTask(task);
  const [updated] = await db.select().from(tasksTable).where(eq(tasksTable.id, task.id));
  res.json(updated);
});

router.post("/tasks/:id/stop", async (req, res): Promise<void> => {
  const params = StopTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await stopTask(params.data.id);
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

export default router;
