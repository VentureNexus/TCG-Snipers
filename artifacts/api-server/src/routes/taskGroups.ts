import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, taskGroupsTable, tasksTable } from "@workspace/db";
import { CreateTaskGroupBody, UpdateTaskGroupParams, UpdateTaskGroupBody, DeleteTaskGroupParams } from "@workspace/api-zod";
import { startTask, stopTasks } from "../lib/taskWorker";

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
    .where(
      and(
        eq(tasksTable.groupId, id),
        inArray(tasksTable.status, ["idle", "stopped", "failed"]),
      ),
    );
  let started = 0;
  let queued = 0;
  for (const task of groupTasks) {
    const result = startTask(task);
    if (result.queued) queued++;
    else started++;
  }
  res.json({
    started,
    queued,
    affected: groupTasks.length,
    message: `Started ${started}, queued ${queued} tasks in group "${group.name}"`,
  });
});

router.post("/task-groups/:id/stop", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [group] = await db.select().from(taskGroupsTable).where(eq(taskGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Task group not found" }); return; }
  // Select running tasks for this specific group using SQL AND filter
  const groupRunning = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.groupId, id),
        inArray(tasksTable.status, ["monitoring", "adding_to_cart", "checking_out"]),
      ),
    );
  // stopTasks only cancels the provided IDs — does NOT sweep the global token map
  const stoppedIds = await stopTasks(groupRunning.map((t) => t.id));
  res.json({
    affected: stoppedIds.length,
    message: `Stopped ${stoppedIds.length} tasks in group "${group.name}"`,
  });
});

export default router;
