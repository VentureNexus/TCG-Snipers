import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, checkoutResultsTable } from "@workspace/db";
import { ListCheckoutResultsQueryParams, CreateCheckoutResultBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/checkout-results", async (req, res): Promise<void> => {
  const query = ListCheckoutResultsQueryParams.safeParse(req.query);
  let results = await db.select().from(checkoutResultsTable).orderBy(desc(checkoutResultsTable.createdAt));
  if (query.success) {
    if (query.data.success !== undefined && query.data.success !== null) {
      results = results.filter((r) => r.success === query.data.success);
    }
    if (query.data.limit) results = results.slice(0, query.data.limit);
  }
  res.json(results);
});

router.post("/checkout-results", async (req, res): Promise<void> => {
  const parsed = CreateCheckoutResultBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [result] = await db.insert(checkoutResultsTable).values(parsed.data).returning();
  res.status(201).json(result);
});

export default router;
