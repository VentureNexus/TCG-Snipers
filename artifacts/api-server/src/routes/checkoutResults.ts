import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, checkoutResultsTable, tasksTable } from "@workspace/db";
import { ListCheckoutResultsQueryParams, CreateCheckoutResultBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/checkout-results", async (req, res): Promise<void> => {
  const query = ListCheckoutResultsQueryParams.safeParse(req.query);
  const rows = await db
    .select({
      id: checkoutResultsTable.id,
      taskId: checkoutResultsTable.taskId,
      success: checkoutResultsTable.success,
      productName: checkoutResultsTable.productName,
      productImage: checkoutResultsTable.productImage,
      price: checkoutResultsTable.price,
      retailer: checkoutResultsTable.retailer,
      orderNumber: checkoutResultsTable.orderNumber,
      errorMessage: checkoutResultsTable.errorMessage,
      profileId: checkoutResultsTable.profileId,
      visualAssist: checkoutResultsTable.visualAssist,
      createdAt: checkoutResultsTable.createdAt,
      productUrl: tasksTable.productUrl,
    })
    .from(checkoutResultsTable)
    .leftJoin(tasksTable, eq(checkoutResultsTable.taskId, tasksTable.id))
    .orderBy(desc(checkoutResultsTable.createdAt));

  let results = rows.map((r) => ({ ...r, productUrl: r.productUrl ?? "" }));

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

router.get("/checkout-results/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [result] = await db.select().from(checkoutResultsTable).where(eq(checkoutResultsTable.id, id));
  if (!result) { res.status(404).json({ error: "Checkout result not found" }); return; }
  res.json(result);
});

router.patch("/checkout-results/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { success, productName, productImage, price, retailer, orderNumber } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (success !== undefined) updates.success = success;
  if (productName !== undefined) updates.productName = productName;
  if (productImage !== undefined) updates.productImage = productImage;
  if (price !== undefined) updates.price = price;
  if (retailer !== undefined) updates.retailer = retailer;
  if (orderNumber !== undefined) updates.orderNumber = orderNumber;
  const [result] = await db.update(checkoutResultsTable).set(updates).where(eq(checkoutResultsTable.id, id)).returning();
  if (!result) { res.status(404).json({ error: "Checkout result not found" }); return; }
  res.json(result);
});

router.delete("/checkout-results", async (_req, res): Promise<void> => {
  await db.delete(checkoutResultsTable);
  res.sendStatus(204);
});

router.delete("/checkout-results/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [result] = await db.delete(checkoutResultsTable).where(eq(checkoutResultsTable.id, id)).returning();
  if (!result) { res.status(404).json({ error: "Checkout result not found" }); return; }
  res.sendStatus(204);
});

export default router;
