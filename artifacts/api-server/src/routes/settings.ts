import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import os from "os";
import { db, settingsTable } from "@workspace/db";
import { updateSettingsSchema } from "@workspace/db";
import { setMaxConcurrency } from "../lib/taskWorker";
import { setTtlHours } from "../lib/retailers/sessionCache";
import { getOxylabsProxy, createBrowser, createStealthContext } from "../lib/browser";

const CONCURRENCY_HARD_MAX = 50;

function getSystemConcurrencyHint() {
  const cores = os.cpus().length;
  const recommendedMin = Math.min(cores, CONCURRENCY_HARD_MAX);
  const recommendedMax = Math.min(cores * 2, CONCURRENCY_HARD_MAX);
  return { systemCores: cores, recommendedMin, recommendedMax };
}

const router: IRouter = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

function stripPrivateFields(settings: Record<string, unknown>) {
  const { licenseToken: _lt, ...safe } = settings;
  return safe;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({ ...stripPrivateFields(settings as unknown as Record<string, unknown>), ...getSystemConcurrencyHint() });
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const current = await getOrCreateSettings();
  const effectiveMin = parsed.data.monitorDelay ?? current.monitorDelay;
  const effectiveMax = parsed.data.monitorDelayMax !== undefined
    ? parsed.data.monitorDelayMax
    : current.monitorDelayMax;
  if (effectiveMax !== null && effectiveMax !== undefined && effectiveMax <= effectiveMin) {
    res.status(400).json({ error: "Min Delay must be less than Max Delay" });
    return;
  }
  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, current.id))
    .returning();
  if (updated.concurrency !== undefined) {
    setMaxConcurrency(updated.concurrency);
  }
  setTtlHours(updated.sessionTtlHours ?? null);
  res.json({ ...stripPrivateFields(updated as unknown as Record<string, unknown>), ...getSystemConcurrencyHint() });
});

/**
 * POST /settings/test-oxylabs
 * Launches a headless browser with the configured Oxylabs proxy, fetches
 * https://api.ipify.org/ to get the outbound IP, and returns the result.
 * This lets the user confirm that credentials are correct and traffic is
 * actually routing through Oxylabs before using it for real login sessions.
 */
router.post("/settings/test-oxylabs", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();

  if (!settings.oxylabsEnabled) {
    res.json({ ok: false, error: "Oxylabs Web Unblocker is not enabled in Settings." });
    return;
  }

  const proxy = getOxylabsProxy(settings.oxylabsUsername, settings.oxylabsPassword);
  if (!proxy) {
    res.json({ ok: false, error: "No credentials configured — enter your Oxylabs username and password in Settings and click Save." });
    return;
  }

  let browser: import("playwright-core").Browser | null = null;
  try {
    browser = await createBrowser(proxy);
    const context = await createStealthContext(browser);
    const page = await context.newPage();

    const response = await page.goto("https://api.ipify.org/?format=json", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    if (!response) {
      res.json({ ok: false, error: "No response from test URL — proxy may be timing out or blocking the connection." });
      return;
    }

    const status = response.status();
    const body = await page.textContent("body").catch(() => null);

    if (status === 407) {
      res.json({ ok: false, error: "Proxy returned 407 — credentials are incorrect or the account is not active." });
      return;
    }
    if (status !== 200) {
      res.json({ ok: false, error: `Unexpected response status ${status}: ${body ?? ""}` });
      return;
    }

    let ip = "unknown";
    try {
      ip = JSON.parse(body ?? "{}").ip ?? body ?? "unknown";
    } catch {
      ip = body ?? "unknown";
    }

    res.json({ ok: true, ip, message: `Traffic routed through Oxylabs. Outbound IP: ${ip}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, error: `Connection failed: ${msg}` });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

export { getOrCreateSettings };
export default router;
