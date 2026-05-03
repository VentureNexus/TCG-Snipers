import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, profilesTable, creditCardsTable } from "@workspace/db";
import type { InsertProfile } from "@workspace/db";
import { CreateProfileBody, GetProfileParams, UpdateProfileParams, UpdateProfileBody, DeleteProfileParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/profiles", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(profilesTable).orderBy(profilesTable.createdAt);
  res.json(profiles);
});

router.post("/profiles", async (req, res): Promise<void> => {
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [profile] = await db.insert(profilesTable).values(parsed.data).returning();
  res.status(201).json(profile);
});

/**
 * Export all profiles with their encrypted card blobs for backup/migration.
 * The encrypted blobs are safe to export — they cannot be reversed without the server's ENCRYPTION_KEY.
 */
router.get("/profiles/export", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(profilesTable).orderBy(profilesTable.createdAt);
  const cards = await db.select().from(creditCardsTable);
  res.json({ profiles, cards });
});

/**
 * Import profiles (upsert by email) and restore encrypted card blobs.
 * Profiles with a matching email are updated; new emails are inserted.
 * Cards are re-linked to the (possibly new) profile IDs.
 */
router.post("/profiles/import", async (req, res): Promise<void> => {
  const { profiles = [], cards = [] } = req.body as {
    profiles: Array<Record<string, unknown>>;
    cards: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(profiles)) {
    res.status(400).json({ error: "profiles must be an array" });
    return;
  }

  let upserted = 0;
  let cardsImported = 0;
  const errors: string[] = [];

  for (const rawProfile of profiles) {
    try {
      const email = rawProfile.email as string;
      if (!email) continue;

      // Strip auto-generated fields
      const { id: oldId, createdAt: _ca, updatedAt: _ua, ...profileData } = rawProfile as Record<string, unknown>;

      const [existing] = await db.select({ id: profilesTable.id }).from(profilesTable).where(eq(profilesTable.email, email));

      let newProfileId: number;

      if (existing) {
        // Upsert: update existing profile
        const [updated] = await db.update(profilesTable)
          .set(profileData as Partial<InsertProfile>)
          .where(eq(profilesTable.email, email))
          .returning({ id: profilesTable.id });
        newProfileId = updated.id;
      } else {
        // Insert new profile
        const [inserted] = await db.insert(profilesTable)
          .values(profileData as InsertProfile)
          .returning({ id: profilesTable.id });
        newProfileId = inserted.id;
      }

      upserted++;

      // Import associated cards using the old profile ID to correlate
      const profileCards = cards.filter((c) => c.profileId === oldId);
      for (const card of profileCards) {
        if (!card.encryptedNumber || !card.encryptedCvv) continue;
        const lastFour = (card.lastFour as string) || "";
        const expiryMonth = (card.expiryMonth as string) || "";
        const expiryYear = (card.expiryYear as string) || "";
        try {
          // Deduplicate: skip if a card with the same lastFour + expiry already exists for this profile
          const [existing] = await db
            .select({ id: creditCardsTable.id })
            .from(creditCardsTable)
            .where(
              and(
                eq(creditCardsTable.profileId, newProfileId),
                eq(creditCardsTable.lastFour, lastFour),
                eq(creditCardsTable.expiryMonth, expiryMonth),
                eq(creditCardsTable.expiryYear, expiryYear),
              )
            );
          if (existing) continue;

          await db.insert(creditCardsTable).values({
            profileId: newProfileId,
            cardNickname: (card.cardNickname as string) || "",
            cardholderName: (card.cardholderName as string) || "",
            encryptedNumber: card.encryptedNumber as string,
            encryptedCvv: card.encryptedCvv as string,
            expiryMonth,
            expiryYear,
            lastFour,
            cardType: (card.cardType as string) || "",
          });
          cardsImported++;
        } catch {
          // Invalid data — skip silently
        }
      }
    } catch (err: unknown) {
      errors.push(String(err));
    }
  }

  res.json({ upserted, cardsImported, errors });
});

router.get("/profiles/:id", async (req, res): Promise<void> => {
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, params.data.id));
  if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }
  res.json(profile);
});

router.patch("/profiles/:id", async (req, res): Promise<void> => {
  const params = UpdateProfileParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [profile] = await db.update(profilesTable).set(parsed.data).where(eq(profilesTable.id, params.data.id)).returning();
  if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }
  res.json(profile);
});

router.delete("/profiles/:id", async (req, res): Promise<void> => {
  const params = DeleteProfileParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [profile] = await db.delete(profilesTable).where(eq(profilesTable.id, params.data.id)).returning();
  if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }
  res.sendStatus(204);
});

export default router;
