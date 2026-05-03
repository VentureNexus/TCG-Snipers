import { Router } from "express";
import { z } from "zod";
import { db, customersTable, licensesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateLicenseKey, hashToken, last4 } from "../lib/crypto";
import { sendEmail, licenseIssuedEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: Router = Router();

const ADMIN_TOKEN = process.env.LICENSE_ADMIN_TOKEN ?? "";
const MARKETING_URL = (process.env.MARKETING_SITE_URL ?? "https://tcgsnipers.com").replace(/\/$/, "");

function adminAuth(req: { headers: { authorization?: string } }): boolean {
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 16) return false;
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === ADMIN_TOKEN;
}

const issueSchema = z.object({
  email: z.string().email(),
  count: z.number().int().min(1).max(10).optional().default(1),
  sendEmail: z.boolean().optional().default(true),
  note: z.string().max(200).optional(),
});

/**
 * POST /admin/issue-license
 *
 * Manually issue one or more comp licenses, bypassing Stripe entirely. Useful
 * for testing, refund replacements, influencer comps, etc.
 *
 * Auth: `Authorization: Bearer $LICENSE_ADMIN_TOKEN`
 *
 * Body:
 *   email:     customer email (required)
 *   count:     number of licenses to issue (default 1, max 10)
 *   sendEmail: whether to email the keys to the customer (default true)
 *   note:      free-form note logged for audit (optional)
 *
 * Response: { customerId, licenses: [{ id, key, last4 }] }
 *   Plaintext keys are returned ONCE — store them somewhere safe.
 */
router.post("/admin/issue-license", async (req, res) => {
  if (!adminAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.format() });
    return;
  }
  const { email, count, sendEmail: shouldEmail, note } = parsed.data;

  // Upsert customer (no Stripe customer id since this bypasses Stripe)
  const existing = await db.select().from(customersTable).where(eq(customersTable.email, email)).limit(1);
  const customerId =
    existing.length > 0
      ? existing[0].id
      : (
          await db
            .insert(customersTable)
            .values({ email, stripeCustomerId: "" })
            .returning({ id: customersTable.id })
        )[0].id;

  const issued: { id: number; key: string; last4: string }[] = [];
  for (let i = 0; i < count; i++) {
    const rawKey = generateLicenseKey();
    const inserted = await db
      .insert(licensesTable)
      .values({
        customerId,
        keyHash: hashToken(rawKey),
        keyLast4: last4(rawKey),
        stripeSubscriptionId: `comp_${Date.now()}_${i}`,
        status: "active",
        currentPeriodEnd: null, // perpetual until manually revoked
      })
      .returning({ id: licensesTable.id });
    issued.push({ id: inserted[0].id, key: rawKey, last4: last4(rawKey) });
  }

  logger.info({ customerId, count, note }, "Admin issued comp licenses");

  if (shouldEmail) {
    // Send one email per key so customer can copy/paste them individually.
    for (const lic of issued) {
      const { subject, html } = licenseIssuedEmail(lic.key, MARKETING_URL);
      try {
        await sendEmail({ to: email, subject, html });
      } catch (err) {
        logger.warn({ err, licenseId: lic.id }, "Failed to email comp license");
      }
    }
  }

  res.json({ customerId, licenses: issued });
});

export default router;
