import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, retailerAccountsTable } from "@workspace/db";
import { encrypt, decrypt } from "../lib/crypto";
import { loadSession } from "../lib/retailers/sessionCache";
import { loginRetailer } from "../lib/retailers/loginOnly";

const router: IRouter = Router();

router.get("/retailer-accounts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(retailerAccountsTable).orderBy(retailerAccountsTable.retailer);
  res.json(
    rows.map((r) => ({
      ...r,
      encryptedPassword: undefined,
      sessionActive: loadSession(r.retailer, r.email) !== null,
    })),
  );
});

router.post("/retailer-accounts", async (req, res): Promise<void> => {
  const { retailer, profileId, email, password } = req.body as {
    retailer?: string;
    profileId?: number;
    email?: string;
    password?: string;
  };
  if (!retailer || !profileId || !email || !password) {
    res.status(400).json({ error: "retailer, profileId, email, and password are required" });
    return;
  }
  const encryptedPassword = encrypt(password);
  const [row] = await db
    .insert(retailerAccountsTable)
    .values({ retailer, profileId, email, encryptedPassword })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    const [updated] = await db
      .update(retailerAccountsTable)
      .set({ email, encryptedPassword })
      .where(
        and(
          eq(retailerAccountsTable.retailer, retailer),
          eq(retailerAccountsTable.profileId, profileId),
        ),
      )
      .returning();
    res.status(200).json({ ...updated, encryptedPassword: undefined, sessionActive: loadSession(retailer, email) !== null });
    return;
  }
  res.status(201).json({ ...row, encryptedPassword: undefined, sessionActive: false });
});

router.patch("/retailer-accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { retailer, profileId, email, password } = req.body as {
    retailer?: string;
    profileId?: number;
    email?: string;
    password?: string;
  };
  const updateData: Record<string, unknown> = {};
  if (retailer) updateData.retailer = retailer;
  if (profileId) updateData.profileId = profileId;
  if (email) updateData.email = email;
  if (password) updateData.encryptedPassword = encrypt(password);
  const [row] = await db
    .update(retailerAccountsTable)
    .set(updateData)
    .where(eq(retailerAccountsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, encryptedPassword: undefined, sessionActive: loadSession(row.retailer, row.email) !== null });
});

router.delete("/retailer-accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(retailerAccountsTable).where(eq(retailerAccountsTable.id, id));
  res.sendStatus(204);
});

/** Trigger headless browser sign-in for a specific account and cache the session. */
router.post("/retailer-accounts/:id/login", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select()
    .from(retailerAccountsTable)
    .where(eq(retailerAccountsTable.id, id));
  if (!row) { res.status(404).json({ error: "Account not found" }); return; }

  let password: string;
  try {
    password = decrypt(row.encryptedPassword);
  } catch {
    res.status(500).json({ success: false, message: "Could not decrypt stored password" });
    return;
  }

  const result = await loginRetailer(row.retailer, row.email, password);
  res.json({ ...result, sessionActive: result.success });
});

/** Internal-only: returns decrypted password. Used by taskWorker only. */
export async function getDecryptedRetailerAccount(
  retailer: string,
  profileId: number,
): Promise<{ email: string; password: string } | null> {
  const [row] = await db
    .select()
    .from(retailerAccountsTable)
    .where(
      and(
        eq(retailerAccountsTable.retailer, retailer),
        eq(retailerAccountsTable.profileId, profileId),
      ),
    );
  if (!row) return null;
  try {
    return { email: row.email, password: decrypt(row.encryptedPassword) };
  } catch {
    return null;
  }
}

export default router;
