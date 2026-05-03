import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, proxiesTable } from "@workspace/db";
import { CreateProxyBody, UpdateProxyParams, UpdateProxyBody, DeleteProxyParams, TestProxyParams } from "@workspace/api-zod";
import https from "https";

const router: IRouter = Router();

router.get("/proxies", async (_req, res): Promise<void> => {
  const proxies = await db.select().from(proxiesTable).orderBy(proxiesTable.createdAt);
  res.json(proxies.map(({ password: _p, ...rest }) => rest));
});

router.post("/proxies", async (req, res): Promise<void> => {
  const parsed = CreateProxyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [proxy] = await db.insert(proxiesTable).values(parsed.data).returning();
  const { password: _p, ...safe } = proxy;
  res.status(201).json(safe);
});

router.patch("/proxies/:id", async (req, res): Promise<void> => {
  const params = UpdateProxyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProxyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [proxy] = await db.update(proxiesTable).set(parsed.data).where(eq(proxiesTable.id, params.data.id)).returning();
  if (!proxy) { res.status(404).json({ error: "Proxy not found" }); return; }
  const { password: _p, ...safe } = proxy;
  res.json(safe);
});

router.delete("/proxies/:id", async (req, res): Promise<void> => {
  const params = DeleteProxyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [proxy] = await db.delete(proxiesTable).where(eq(proxiesTable.id, params.data.id)).returning();
  if (!proxy) { res.status(404).json({ error: "Proxy not found" }); return; }
  res.sendStatus(204);
});

router.post("/proxies/:id/test", async (req, res): Promise<void> => {
  const params = TestProxyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [proxy] = await db.select().from(proxiesTable).where(eq(proxiesTable.id, params.data.id));
  if (!proxy) { res.status(404).json({ error: "Proxy not found" }); return; }

  const start = Date.now();
  let testSuccess = false;
  let message = "";

  try {
    await new Promise<void>((resolve, reject) => {
      const r = https.request({ host: proxy.host, port: parseInt(proxy.port, 10), method: "CONNECT", path: "api.ipify.org:443", timeout: 8000 }, () => { testSuccess = true; resolve(); });
      r.on("error", reject);
      r.on("timeout", () => reject(new Error("timeout")));
      r.end();
    });
  } catch (err) {
    message = err instanceof Error ? err.message : "Connection failed";
  }

  const latency = `${Date.now() - start}ms`;
  await db.update(proxiesTable).set({ lastTestStatus: testSuccess ? "pass" : "fail", lastTestLatency: latency }).where(eq(proxiesTable.id, params.data.id));
  res.json({ success: testSuccess, latency, ip: proxy.host, message: message || (testSuccess ? "Connected" : "Failed") });
});

export default router;
