import { Router } from "express";
import { z } from "zod";
import { db, customersTable, licensesTable, devicesTable, magicLinkTokensTable } from "@workspace/db";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { generateMagicToken, hashToken, decryptSecret, encryptSecret, generateLicenseKey, last4 } from "../lib/crypto";
import { sendEmail, magicLinkEmail, licenseIssuedEmail } from "../lib/email";
import { signPortalSession, verifyPortalSession } from "../lib/jwt";
import { stripe } from "../lib/stripe";
import { logger } from "../lib/logger";

const router: Router = Router();

const MARKETING_URL = process.env.MARKETING_SITE_URL ?? "https://tcgsnipers.com";

const requestLinkSchema = z.object({
  email: z.string().email(),
});

router.post("/portal/request-magic-link", async (req, res) => {
  const parsed = requestLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const customer = (await db.select().from(customersTable).where(eq(customersTable.email, email)).limit(1))[0];

  // Always respond OK to prevent email enumeration.
  if (!customer) {
    res.json({ ok: true });
    return;
  }

  // Rate limit: max 3 magic-link requests per hour, regardless of whether
  // they were consumed (otherwise an attacker can spam by consuming tokens).
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(magicLinkTokensTable)
    .where(
      and(
        eq(magicLinkTokensTable.customerId, customer.id),
        gt(magicLinkTokensTable.createdAt, oneHourAgo),
      ),
    );
  if ((recent[0]?.count ?? 0) >= 3) {
    res.json({ ok: true });
    return;
  }

  const raw = generateMagicToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(magicLinkTokensTable).values({
    customerId: customer.id,
    tokenHash: hashToken(raw),
    expiresAt,
  });
  const url = `${MARKETING_URL}/manage/session?token=${raw}`;
  const { subject, html } = magicLinkEmail(url);
  await sendEmail({ to: email, subject, html });
  res.json({ ok: true });
});

router.get("/portal/verify", async (req, res) => {
  const token = String(req.query.token ?? "");
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }
  const tokenHash = hashToken(token);
  const row = (await db
    .select()
    .from(magicLinkTokensTable)
    .where(eq(magicLinkTokensTable.tokenHash, tokenHash))
    .limit(1))[0];
  if (!row || row.consumedAt || row.expiresAt < new Date()) {
    res.status(401).json({ error: "Link is invalid or expired." });
    return;
  }
  await db.update(magicLinkTokensTable).set({ consumedAt: new Date() }).where(eq(magicLinkTokensTable.id, row.id));
  const customer = (await db.select().from(customersTable).where(eq(customersTable.id, row.customerId)).limit(1))[0];
  if (!customer) {
    res.status(404).json({ error: "Customer not found." });
    return;
  }
  const session = signPortalSession({ customerId: customer.id, email: customer.email });
  res.json({ session, email: customer.email });
});

function authPortal(req: import("express").Request, res: import("express").Response): { customerId: number; email: string } | null {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = verifyPortalSession(token);
  if (!session) {
    res.status(401).json({ error: "Session expired. Request a new magic link." });
    return null;
  }
  return session;
}

router.get("/portal/me", async (req, res) => {
  const session = authPortal(req, res);
  if (!session) return;
  const license = (await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.customerId, session.customerId))
    .orderBy(desc(licensesTable.createdAt))
    .limit(1))[0];
  let device = null;
  if (license) {
    device = (await db.select().from(devicesTable).where(eq(devicesTable.licenseId, license.id)).limit(1))[0] ?? null;
  }
  res.json({
    email: session.email,
    license: license
      ? {
          id: license.id,
          status: license.status,
          keyLast4: license.keyLast4,
          currentPeriodEnd: license.currentPeriodEnd,
        }
      : null,
    device: device
      ? {
          id: device.id,
          osPlatform: device.osPlatform,
          label: device.label,
          activatedAt: device.activatedAt,
          lastSeenAt: device.lastSeenAt,
        }
      : null,
  });
});

router.post("/portal/deactivate-device", async (req, res) => {
  const session = authPortal(req, res);
  if (!session) return;
  const license = (await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.customerId, session.customerId))
    .orderBy(desc(licensesTable.createdAt))
    .limit(1))[0];
  if (!license) {
    res.status(404).json({ error: "No license found" });
    return;
  }
  await db.delete(devicesTable).where(eq(devicesTable.licenseId, license.id));
  logger.info({ customerId: session.customerId, licenseId: license.id }, "Device deactivated by user");
  res.json({ ok: true });
});

router.post("/portal/stripe-portal", async (req, res) => {
  const session = authPortal(req, res);
  if (!session) return;
  if (!stripe) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }
  const customer = (await db.select().from(customersTable).where(eq(customersTable.id, session.customerId)).limit(1))[0];
  if (!customer || !customer.stripeCustomerId) {
    res.status(404).json({ error: "No Stripe customer linked" });
    return;
  }
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${MARKETING_URL}/manage`,
    });
    res.json({ url: portal.url });
  } catch (err) {
    logger.error({ err }, "Failed to create Stripe billing portal");
    res.status(500).json({ error: "Could not open billing portal" });
  }
});

// In-memory rate limit for key reveals: max 10 per hour per customer.
const revealBuckets = new Map<number, number[]>();
function checkRevealRate(customerId: number): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const arr = (revealBuckets.get(customerId) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= 10) {
    revealBuckets.set(customerId, arr);
    return false;
  }
  arr.push(now);
  revealBuckets.set(customerId, arr);
  return true;
}

router.get("/portal/license/key", async (req, res) => {
  const session = authPortal(req, res);
  if (!session) return;
  const license = (await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.customerId, session.customerId))
    .orderBy(desc(licensesTable.createdAt))
    .limit(1))[0];
  if (!license) {
    res.status(403).json({ error: "No license on file" });
    return;
  }
  if (!checkRevealRate(session.customerId)) {
    res.status(429).json({ error: "Too many reveal attempts. Try again later." });
    return;
  }
  if (!license.keyEncrypted) {
    res.json({ key: null, reason: "not_recoverable" });
    return;
  }
  const plaintext = decryptSecret(license.keyEncrypted);
  if (!plaintext) {
    logger.warn({ licenseId: license.id }, "License key failed to decrypt");
    res.json({ key: null, reason: "decrypt_failed" });
    return;
  }
  res.json({ key: plaintext });
});

router.post("/portal/license/rotate", async (req, res) => {
  const session = authPortal(req, res);
  if (!session) return;
  const license = (await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.customerId, session.customerId))
    .orderBy(desc(licensesTable.createdAt))
    .limit(1))[0];
  if (!license) {
    res.status(403).json({ error: "No license on file" });
    return;
  }
  const rawKey = generateLicenseKey();
  await db
    .update(licensesTable)
    .set({
      keyHash: hashToken(rawKey),
      keyLast4: last4(rawKey),
      keyEncrypted: encryptSecret(rawKey),
    })
    .where(eq(licensesTable.id, license.id));
  // Deactivate any bound device so the desktop app is forced to re-auth.
  await db.delete(devicesTable).where(eq(devicesTable.licenseId, license.id));
  try {
    const { subject, html } = licenseIssuedEmail(rawKey, MARKETING_URL);
    await sendEmail({ to: session.email, subject, html });
  } catch (err) {
    logger.warn({ err, licenseId: license.id }, "Failed to email rotated license key");
  }
  logger.info({ customerId: session.customerId, licenseId: license.id }, "License key rotated");
  res.json({ ok: true });
});

export default router;
