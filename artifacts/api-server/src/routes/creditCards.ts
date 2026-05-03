import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, creditCardsTable } from "@workspace/db";
import {
  ListCreditCardsQueryParams,
  CreateCreditCardBody,
  UpdateCreditCardParams,
  UpdateCreditCardBody,
  DeleteCreditCardParams,
} from "@workspace/api-zod";
import { encrypt, getLastFour, detectCardType } from "../lib/crypto";

const router: IRouter = Router();

router.get("/credit-cards", async (req, res): Promise<void> => {
  const query = ListCreditCardsQueryParams.safeParse(req.query);
  let cards;
  if (query.success && query.data.profileId) {
    cards = await db.select().from(creditCardsTable).where(eq(creditCardsTable.profileId, query.data.profileId));
  } else {
    cards = await db.select().from(creditCardsTable);
  }
  res.json(cards.map(({ encryptedNumber: _n, encryptedCvv: _c, ...rest }) => rest));
});

router.post("/credit-cards", async (req, res): Promise<void> => {
  const parsed = CreateCreditCardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { cardNumber, cvv, ...rest } = parsed.data;
  const [card] = await db.insert(creditCardsTable).values({
    ...rest,
    encryptedNumber: encrypt(cardNumber),
    encryptedCvv: encrypt(cvv),
    lastFour: getLastFour(cardNumber),
    cardType: detectCardType(cardNumber),
  }).returning();
  const { encryptedNumber: _n, encryptedCvv: _c, ...safe } = card;
  res.status(201).json(safe);
});

router.get("/credit-cards/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [card] = await db.select().from(creditCardsTable).where(eq(creditCardsTable.id, id));
  if (!card) { res.status(404).json({ error: "Credit card not found" }); return; }
  const { encryptedNumber: _n, encryptedCvv: _c, ...safe } = card;
  res.json(safe);
});

router.patch("/credit-cards/:id", async (req, res): Promise<void> => {
  const params = UpdateCreditCardParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCreditCardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { cardNumber, cvv, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (cardNumber) { updates.encryptedNumber = encrypt(cardNumber); updates.lastFour = getLastFour(cardNumber); updates.cardType = detectCardType(cardNumber); }
  if (cvv) updates.encryptedCvv = encrypt(cvv);
  const [card] = await db.update(creditCardsTable).set(updates).where(eq(creditCardsTable.id, params.data.id)).returning();
  if (!card) { res.status(404).json({ error: "Credit card not found" }); return; }
  const { encryptedNumber: _n, encryptedCvv: _c, ...safe } = card;
  res.json(safe);
});

router.delete("/credit-cards/:id", async (req, res): Promise<void> => {
  const params = DeleteCreditCardParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [card] = await db.delete(creditCardsTable).where(eq(creditCardsTable.id, params.data.id)).returning();
  if (!card) { res.status(404).json({ error: "Credit card not found" }); return; }
  res.sendStatus(204);
});

export default router;
