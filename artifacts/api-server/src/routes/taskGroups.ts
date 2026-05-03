import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, taskGroupsTable, tasksTable } from "@workspace/db";
import { CreateTaskGroupBody, UpdateTaskGroupParams, UpdateTaskGroupBody, DeleteTaskGroupParams } from "@workspace/api-zod";
import { startTask, stopTask, stopAllRunning } from "../lib/taskWorker";

const router: IRouter = Router();

router.get("/task-groups", async (_req, res): Promise<void> => {
  const groups = await db.select().from(taskGroupsTable).orderBy(taskGroupsTable.createdAt);
  res.json(groups);
});

router.post("/task-groups", async (req, res): Promise<void> => {
  const parsed = CreateTaskGroupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [group] = await db.insert(taskGroupsTable).values(parsed.data).returning();
  res.status(201).json(group);
});

router.get("/task-groups/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [group] = await db.select().from(taskGroupsTable).where(eq(taskGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Task group not found" }); return; }
  res.json(group);
});

router.patch("/task-groups/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskGroupParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTaskGroupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [group] = await db.update(taskGroupsTable).set(parsed.data).where(eq(taskGroupsTable.id, params.data.id)).returning();
  if (!group) { res.status(404).json({ error: "Task group not found" }); return; }
  res.json(group);
});

router.delete("/task-groups/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskGroupParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [group] = await db.delete(taskGroupsTable).where(eq(taskGroupsTable.id, params.data.id)).returning();
  if (!group) { res.status(404).json({ error: "Task group not found" }); return; }
  res.sendStatus(204);
});

router.post("/task-groups/:id/start", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [group] = await db.select().from(taskGroupsTable).where(eq(taskGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Task group not found" }); return; }
  const groupTasks = await db
    .select()
    .from(tasksTable)
    .where(inArray(tasksTable.status, ["idle", "stopped", "failed"]))
    .then((rows) => rows.filter((t) => t.groupId === id));
  for (const task of groupTasks) {
    await startTask(task);
  }
  res.json({ affected: groupTasks.length, message: `Started ${groupTasks.length} tasks in group ${group.name}` });
});

router.post("/task-groups/:id/stop", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [group] = await db.select().from(taskGroupsTable).where(eq(taskGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Task group not found" }); return; }
  // Query DB tasks in running statuses for this group to catch any that may
  // not yet be in the token map (race window), then union with token map.
  const dbRunning = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(inArray(tasksTable.status, ["monitoring", "adding_to_cart", "checking_out"]))
    .then((rows) => rows.filter((t) => t.groupId === id));
  const stoppedIds = await stopAllRunning(dbRunning.map((t) => t.id));
  res.json({ affected: stoppedIds.length, message: `Stopped ${stoppedIds.length} tasks in group ${group.name}` });
});

export default router;
