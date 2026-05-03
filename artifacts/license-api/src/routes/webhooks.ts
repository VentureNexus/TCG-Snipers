import { Router, raw } from "express";
import type Stripe from "stripe";
import { db, customersTable, licensesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { stripe } from "../lib/stripe";
import { generateLicenseKey, hashToken, last4, encryptSecret } from "../lib/crypto";
import { sendEmail, licenseIssuedEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: Router = Router();

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const MARKETING_URL = process.env.MARKETING_SITE_URL ?? "https://tcgsnipers.com";

async function upsertCustomer(email: string, stripeCustomerId: string): Promise<number> {
  const existing = await db.select().from(customersTable).where(eq(customersTable.email, email)).limit(1);
  if (existing.length > 0) {
    if (stripeCustomerId && existing[0].stripeCustomerId !== stripeCustomerId) {
      await db.update(customersTable).set({ stripeCustomerId }).where(eq(customersTable.id, existing[0].id));
    }
    return existing[0].id;
  }
  const inserted = await db
    .insert(customersTable)
    .values({ email, stripeCustomerId })
    .returning({ id: customersTable.id });
  return inserted[0].id;
}

async function handleSubscriptionEvent(sub: Stripe.Subscription): Promise<void> {
  if (!stripe) return;
  const customerObj = typeof sub.customer === "string"
    ? await stripe.customers.retrieve(sub.customer)
    : sub.customer;
  if (!customerObj || customerObj.deleted) return;
  const email = (customerObj as Stripe.Customer).email;
  if (!email) {
    logger.warn({ subId: sub.id }, "Subscription has no customer email");
    return;
  }
  const stripeCustomerId = (customerObj as Stripe.Customer).id;
  const customerId = await upsertCustomer(email, stripeCustomerId);

  const existing = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.stripeSubscriptionId, sub.id))
    .limit(1);

  // Map Stripe status to our simplified status set
  const status =
    sub.status === "active" || sub.status === "trialing"
      ? "active"
      : sub.status === "past_due" || sub.status === "unpaid"
        ? "past_due"
        : sub.status === "canceled" || sub.status === "incomplete_expired"
          ? "canceled"
          : "incomplete";

  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;

  if (existing.length === 0) {
    // Create new license + email it (only if active)
    const rawKey = generateLicenseKey();
    await db.insert(licensesTable).values({
      customerId,
      keyHash: hashToken(rawKey),
      keyLast4: last4(rawKey),
      keyEncrypted: encryptSecret(rawKey),
      stripeSubscriptionId: sub.id,
      status,
      currentPeriodEnd,
    });
    if (status === "active") {
      const { subject, html } = licenseIssuedEmail(rawKey, MARKETING_URL);
      await sendEmail({ to: email, subject, html });
      logger.info({ customerId, last4: last4(rawKey) }, "License issued and emailed");
    }
  } else {
    await db
      .update(licensesTable)
      .set({ status, currentPeriodEnd })
      .where(eq(licensesTable.id, existing[0].id));
    logger.info({ licenseId: existing[0].id, status }, "License status updated from Stripe");
  }
}

// Use raw body parser for signature verification — mounted before app.use(json())
router.post("/webhooks/stripe", raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) {
    res.status(503).json({ error: "Stripe webhooks not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        break;
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await handleSubscriptionEvent(sub);
        }
        break;
      }
      default:
        logger.debug({ type: event.type }, "Stripe event ignored");
    }
    res.json({ received: true });
  } catch (err) {
    logger.error({ err, type: event.type }, "Webhook handler failed");
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

export default router;
