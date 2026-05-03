import { Router } from "express";
import { z } from "zod";
import { db, customersTable, licensesTable, devicesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { hashToken } from "../lib/crypto";
import { signLicenseToken, verifyLicenseToken } from "../lib/jwt";
import { logger } from "../lib/logger";

const router: Router = Router();

const activateSchema = z.object({
  email: z.string().email(),
  licenseKey: z.string().min(8),
  fingerprint: z.string().min(16),
  osPlatform: z.string().max(64).optional().default(""),
  label: z.string().max(64).optional().default(""),
});

router.post("/activate", async (req, res) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { email, licenseKey, fingerprint, osPlatform, label } = parsed.data;

  const customer = (await db.select().from(customersTable).where(eq(customersTable.email, email)).limit(1))[0];
  if (!customer) {
    res.status(404).json({ error: "No account found for that email." });
    return;
  }

  const license = (await db
    .select()
    .from(licensesTable)
    .where(and(eq(licensesTable.customerId, customer.id), eq(licensesTable.keyHash, hashToken(licenseKey))))
    .limit(1))[0];
  if (!license) {
    res.status(401).json({ error: "Invalid email + license key combination." });
    return;
  }
  if (license.status !== "active") {
    res.status(403).json({ error: `Subscription is ${license.status}. Re-subscribe to activate.` });
    return;
  }

  const existingDevice = (await db.select().from(devicesTable).where(eq(devicesTable.licenseId, license.id)).limit(1))[0];
  if (existingDevice && existingDevice.fingerprint !== fingerprint) {
    res.status(409).json({
      error:
        "This license is already active on another device. Open the manage-license portal to release it before activating here.",
    });
    return;
  }

  let deviceId: number;
  if (existingDevice) {
    await db.update(devicesTable).set({ lastSeenAt: new Date(), label }).where(eq(devicesTable.id, existingDevice.id));
    deviceId = existingDevice.id;
  } else {
    const inserted = await db
      .insert(devicesTable)
      .values({ licenseId: license.id, fingerprint, osPlatform, label })
      .returning({ id: devicesTable.id });
    deviceId = inserted[0].id;
  }

  const token = signLicenseToken({ licenseId: license.id, customerId: customer.id, deviceId });
  logger.info({ customerId: customer.id, licenseId: license.id, deviceId }, "License activated");
  res.json({ token, status: license.status, currentPeriodEnd: license.currentPeriodEnd });
});

const heartbeatSchema = z.object({
  token: z.string(),
  fingerprint: z.string().min(16),
});

router.post("/heartbeat", async (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const payload = verifyLicenseToken(parsed.data.token);
  if (!payload) {
    res.status(401).json({ status: "invalid", error: "Token invalid or expired." });
    return;
  }
  const license = (await db.select().from(licensesTable).where(eq(licensesTable.id, payload.licenseId)).limit(1))[0];
  if (!license) {
    res.status(404).json({ status: "invalid", error: "License not found." });
    return;
  }
  const device = (await db.select().from(devicesTable).where(eq(devicesTable.id, payload.deviceId)).limit(1))[0];
  if (!device || device.fingerprint !== parsed.data.fingerprint) {
    res.status(409).json({ status: "device_changed", error: "Device fingerprint no longer matches." });
    return;
  }
  await db.update(devicesTable).set({ lastSeenAt: new Date() }).where(eq(devicesTable.id, device.id));
  res.json({ status: license.status, currentPeriodEnd: license.currentPeriodEnd });
});

export default router;
