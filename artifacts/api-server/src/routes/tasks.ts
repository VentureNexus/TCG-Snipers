import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import { ListTasksQueryParams, CreateTaskBody, GetTaskParams, UpdateTaskParams, UpdateTaskBody, DeleteTaskParams, StartTaskParams, StopTaskParams } from "@workspace/api-zod";
import { startTask, stopTask, stopAllRunning } from "../lib/taskWorker";

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
  const [task] = await db.update(tasksTable).set(parsed.data).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.sendStatus(204);
});

router.post("/tasks/start-all", async (_req, res): Promise<void> => {
  const idleTasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.status, "idle"));
  let started = 0;
  let queued = 0;
  for (const task of idleTasks) {
    const result = startTask(task);
    if (result.queued) queued++;
    else started++;
  }
  res.json({ started, queued, affected: idleTasks.length, message: `Started ${started}, queued ${queued} tasks` });
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
  startTask(task);
  const [updated] = await db.select().from(tasksTable).where(eq(tasksTable.id, task.id));
  res.json(updated);
});

router.post("/tasks/:id/stop", async (req, res): Promise<void> => {
  const params = StopTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  stopTask(params.data.id);
  const [task] = await db
    .update(tasksTable)
    .set({ status: "stopped" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(task);
});

export default router;
