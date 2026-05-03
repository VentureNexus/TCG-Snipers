import { Router } from "express";
import { z } from "zod";
import { stripe } from "../lib/stripe";
import { logger } from "../lib/logger";

const router: Router = Router();

const bodySchema = z.object({
  email: z.string().email().optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY ?? "";
const PRICE_ID_SETUP_FEE = process.env.STRIPE_PRICE_ID_SETUP_FEE ?? "";

router.post("/checkout", async (req, res) => {
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured on the server." });
    return;
  }
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!PRICE_ID_MONTHLY || !PRICE_ID_SETUP_FEE) {
    res.status(503).json({
      error:
        "Stripe products are not configured. Set STRIPE_PRICE_ID_MONTHLY and STRIPE_PRICE_ID_SETUP_FEE.",
    });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        { price: PRICE_ID_MONTHLY, quantity: 1 },
        { price: PRICE_ID_SETUP_FEE, quantity: 1 },
      ],
      customer_email: parsed.data.email,
      success_url: parsed.data.successUrl,
      cancel_url: parsed.data.cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { product: "tcg-snipers" },
      },
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logger.error({ err }, "Stripe checkout creation failed");
    res.status(500).json({ error: "Could not create checkout session." });
  }
});

export default router;
