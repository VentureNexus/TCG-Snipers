import { Router, type IRouter } from "express";
import { eq, sql, gte } from "drizzle-orm";
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
  // Return as 0–100 percentage rounded to 1 decimal place
  const successRate = total > 0 ? Math.round((totalCheckouts / total) * 1000) / 10 : 0;

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

// Helper: return a safe date_trunc SQL fragment using explicit branches instead
// of sql.raw() to eliminate any residual injection risk.
function dateTruncSql(unit: "hour" | "day" | "month") {
  switch (unit) {
    case "hour":  return sql<string>`date_trunc('hour',  created_at)::text`;
    case "month": return sql<string>`date_trunc('month', created_at)::text`;
    default:      return sql<string>`date_trunc('day',   created_at)::text`;
  }
}

function dateTruncGroupSql(unit: "hour" | "day" | "month") {
  switch (unit) {
    case "hour":  return sql`date_trunc('hour',  created_at)`;
    case "month": return sql`date_trunc('month', created_at)`;
    default:      return sql`date_trunc('day',   created_at)`;
  }
}

router.get("/analytics/checkouts-over-time", async (req, res): Promise<void> => {
  const query = GetCheckoutsOverTimeQueryParams.safeParse(req.query);
  const period = query.success ? (query.data.period ?? "week") : "week";

  let truncUnit: "hour" | "day" | "month";
  let sinceDate: Date;
  const now = new Date();

  switch (period) {
    case "day":
      truncUnit = "hour";
      sinceDate = new Date(now.getTime() - 24 * 3600_000);
      break;
    case "month":
      truncUnit = "day";
      sinceDate = new Date(now.getTime() - 30 * 24 * 3600_000);
      break;
    case "year":
      truncUnit = "month";
      sinceDate = new Date(now.getTime() - 365 * 24 * 3600_000);
      break;
    default: // "week"
      truncUnit = "day";
      sinceDate = new Date(now.getTime() - 7 * 24 * 3600_000);
  }

  const rows = await db
    .select({
      date: dateTruncSql(truncUnit),
      success: checkoutResultsTable.success,
      count: sql<number>`count(*)::int`,
    })
    .from(checkoutResultsTable)
    .where(gte(checkoutResultsTable.createdAt, sinceDate))
    .groupBy(dateTruncGroupSql(truncUnit), checkoutResultsTable.success);

  const byDate = new Map<string, { checkouts: number; failures: number }>();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, { checkouts: 0, failures: 0 });
    const entry = byDate.get(row.date)!;
    if (row.success) entry.checkouts += row.count;
    else entry.failures += row.count;
  }

  const points = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { checkouts, failures }]) => ({ date, checkouts, failures }));

  res.json(points);
});

export default router;
