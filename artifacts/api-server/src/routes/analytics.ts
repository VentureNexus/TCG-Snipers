import { Router, type IRouter } from "express";
import { eq, sql, inArray, gte } from "drizzle-orm";
import { db, checkoutResultsTable, tasksTable, profilesTable, proxiesTable } from "@workspace/db";
import { GetCheckoutsOverTimeQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const [successCount] = await db.select({ count: sql<number>`count(*)::int` }).from(checkoutResultsTable).where(eq(checkoutResultsTable.success, true));
  const [failureCount] = await db.select({ count: sql<number>`count(*)::int` }).from(checkoutResultsTable).where(eq(checkoutResultsTable.success, false));
  const [spentResult] = await db.select({ total: sql<string>`coalesce(sum(price), 0)::text` }).from(checkoutResultsTable).where(eq(checkoutResultsTable.success, true));
  const [activeTasksResult] = await db.select({ count: sql<number>`count(*)::int` }).from(tasksTable).where(eq(tasksTable.status, "monitoring"));
  const [profilesResult] = await db.select({ count: sql<number>`count(*)::int` }).from(profilesTable);
  const [proxiesResult] = await db.select({ count: sql<number>`count(*)::int` }).from(proxiesTable);

  const totalCheckouts = successCount?.count ?? 0;
  const totalFailures = failureCount?.count ?? 0;
  const total = totalCheckouts + totalFailures;
  const successRate = total > 0 ? Math.round((totalCheckouts / total) * 10000) / 10000 : 0;

  res.json({
    totalCheckouts,
    totalFailures,
    totalSpent: spentResult?.total ?? "0",
    totalSaved: "0.00",
    successRate,
    activeTasks: activeTasksResult?.count ?? 0,
    totalProfiles: profilesResult?.count ?? 0,
    totalProxies: proxiesResult?.count ?? 0,
  });
});

router.get("/analytics/checkouts-over-time", async (req, res): Promise<void> => {
  const query = GetCheckoutsOverTimeQueryParams.safeParse(req.query);
  const period = query.success ? (query.data.period ?? "week") : "week";

  let truncUnit: string;
  let sinceDate: Date;
  const now = new Date();

  switch (period) {
    case "day":   truncUnit = "hour"; sinceDate = new Date(now.getTime() - 24 * 3600000); break;
    case "month": truncUnit = "day";  sinceDate = new Date(now.getTime() - 30 * 24 * 3600000); break;
    case "year":  truncUnit = "month"; sinceDate = new Date(now.getTime() - 365 * 24 * 3600000); break;
    default:      truncUnit = "day";  sinceDate = new Date(now.getTime() - 7 * 24 * 3600000);
  }

  const rows = await db
    .select({ date: sql<string>`date_trunc('${sql.raw(truncUnit)}', created_at)::text`, success: checkoutResultsTable.success, count: sql<number>`count(*)::int` })
    .from(checkoutResultsTable)
    .where(gte(checkoutResultsTable.createdAt, sinceDate))
    .groupBy(sql`date_trunc('${sql.raw(truncUnit)}', created_at)`, checkoutResultsTable.success);

  const byDate = new Map<string, { checkouts: number; failures: number }>();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, { checkouts: 0, failures: 0 });
    const entry = byDate.get(row.date)!;
    if (row.success) entry.checkouts += row.count;
    else entry.failures += row.count;
  }

  const points = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, { checkouts, failures }]) => ({ date, checkouts, failures }));
  res.json(points);
});

export default router;
