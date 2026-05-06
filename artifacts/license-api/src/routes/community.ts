import { Router, type Request } from "express";
import { z } from "zod";
import { db, communityEventsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { verifyLicenseToken } from "../lib/jwt";
import { logger } from "../lib/logger";

const router: Router = Router();

const rateLimitMap = new Map<number, { count: number; resetAt: number }>();

function checkRateLimit(deviceId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(deviceId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(deviceId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 100) return false;
  entry.count++;
  return true;
}

const PII_KEYS = new Set([
  "email", "password", "address", "address1", "address2", "phone", "phonenumber",
  "firstname", "lastname", "name", "fullname", "creditcard", "cardnumber", "cvv",
  "zip", "zipcode", "postalcode", "ssn", "dob", "birthdate", "proxyurl", "proxy",
  "username", "token", "apikey",
]);

function containsPii(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (PII_KEYS.has(key.toLowerCase())) return true;
    if (containsPii((obj as Record<string, unknown>)[key])) return true;
  }
  return false;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

const submitSchema = z.object({
  retailer: z.string().min(1).max(64),
  eventType: z.enum(["nav_path", "captcha_solve", "checkout_success"]),
  data: z.record(z.unknown()),
});

router.post("/community/events", async (req, res) => {
  const rawToken = getBearerToken(req);
  if (!rawToken) { res.status(401).json({ error: "Missing token" }); return; }
  const payload = verifyLicenseToken(rawToken);
  if (!payload) { res.status(401).json({ error: "Invalid or expired token" }); return; }

  if (!checkRateLimit(payload.deviceId)) {
    res.status(429).json({ error: "Rate limit: max 100 events per hour per device" });
    return;
  }

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { retailer, eventType, data } = parsed.data;

  if (containsPii(data)) {
    res.status(400).json({ error: "Submission contains potentially private data and was rejected." });
    return;
  }

  await db.insert(communityEventsTable).values({ retailer, eventType, data });
  logger.info({ retailer, eventType }, "Community event submitted");
  res.json({ ok: true });
});

router.get("/community/events", async (req, res) => {
  const rawToken = getBearerToken(req);
  if (!rawToken) { res.status(401).json({ error: "Missing token" }); return; }
  const payload = verifyLicenseToken(rawToken);
  if (!payload) { res.status(401).json({ error: "Invalid or expired token" }); return; }

  const { retailer, eventType, stage, limit: limitStr } = req.query as Record<string, string>;
  if (!retailer || !eventType) {
    res.status(400).json({ error: "retailer and eventType are required" });
    return;
  }

  const limit = Math.min(parseInt(limitStr ?? "50", 10) || 50, 200);

  const rows = await db
    .select()
    .from(communityEventsTable)
    .where(and(
      eq(communityEventsTable.retailer, retailer),
      eq(communityEventsTable.eventType, eventType),
    ))
    .orderBy(desc(communityEventsTable.createdAt))
    .limit(limit * 3);

  const events = stage
    ? rows.filter(e => (e.data as Record<string, unknown>)?.stage === stage).slice(0, limit)
    : rows.slice(0, limit);

  res.json({ events });
});

export default router;
