import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, taskGroupsTable } from "@workspace/db";
import { CreateTaskGroupBody, UpdateTaskGroupParams, UpdateTaskGroupBody, DeleteTaskGroupParams } from "@workspace/api-zod";

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

export default router;
