import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, retailerAccountsTable } from "@workspace/db";
import { encrypt, decrypt } from "../lib/crypto";
import { loadSession, clearSession } from "../lib/retailers/sessionCache";
import { loginRetailer } from "../lib/retailers/loginOnly";
import { getOrCreateSettings } from "./settings";
import { getOxylabsProxy } from "../lib/browser";

const router: IRouter = Router();

/** Retailer homepage URLs — used as the starting point for manual login sessions. */
const RETAILER_HOMEPAGES: Record<string, string> = {
  "Amazon":         "https://www.amazon.com",
  "Walmart":        "https://www.walmart.com",
  "Best Buy":       "https://www.bestbuy.com",
  "Target":         "https://www.target.com",
  "Costco":         "https://www.costco.com",
  "Sam's Club":     "https://www.samsclub.com",
  "Pokemon Center": "https://www.pokemoncenter.com",
};

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
  const [row] = await db.select().from(retailerAccountsTable).where(eq(retailerAccountsTable.id, id));
  if (row) clearSession(row.retailer, row.email);
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

  const appSettings = await getOrCreateSettings();
  const loginProxy = appSettings.oxylabsEnabled
    ? getOxylabsProxy(appSettings.oxylabsUsername, appSettings.oxylabsPassword)
    : null;

  console.log(
    `[auto-login] retailer=${row.retailer} proxy=${loginProxy ? `${loginProxy.host}:${loginProxy.port} user=${loginProxy.username}` : "none (direct)"}`
  );

  const result = await loginRetailer(row.retailer, row.email, password, loginProxy ?? undefined);
  res.json({ ...result, sessionActive: result.success });
});

/**
 * Open a manual login session — starts a stealth browser, navigates to the
 * retailer's homepage, and registers a Login Assist session. The LoginAssist
 * popup will appear in the app immediately. When the user clicks "I'm Done",
 * the session cookies are automatically saved so future auto-logins can reuse
 * them. Returns immediately with the session ID; the browser stays alive.
 */
router.post("/retailer-accounts/:id/manual-login", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select()
    .from(retailerAccountsTable)
    .where(eq(retailerAccountsTable.id, id));
  if (!row) { res.status(404).json({ error: "Account not found" }); return; }

  const homepage = RETAILER_HOMEPAGES[row.retailer];
  if (!homepage) {
    res.status(400).json({ error: `Retailer not supported for manual login: ${row.retailer}` });
    return;
  }

  // Start the browser asynchronously so the HTTP response returns immediately
  // (the browser open + page navigation can take a few seconds)
  let sessionId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const { createBrowser, createStealthContext } = await import("../lib/browser");
    const { registerLoginAssist } = await import("../lib/loginAssistManager");

    // Apply Oxylabs proxy to manual login sessions when globally enabled.
    const appSettings = await getOrCreateSettings();
    const manualProxy = appSettings.oxylabsEnabled
      ? getOxylabsProxy(appSettings.oxylabsUsername, appSettings.oxylabsPassword)
      : null;

    console.log(
      `[manual-login] proxy=${manualProxy ? `${manualProxy.host}:${manualProxy.port} user=${manualProxy.username} pass=${manualProxy.password ? "set" : "MISSING"}` : "none (direct)"}`
    );

    const browser = await createBrowser(manualProxy);
    const context = await createStealthContext(browser);
    const page = await context.newPage();
    await page.setDefaultNavigationTimeout(30000);

    // Navigate to the retailer homepage. Log navigation errors (they don't
    // prevent the session from opening — the user sees whatever loaded).
    try {
      await page.goto(homepage, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch (navErr) {
      console.warn(`[manual-login] homepage navigation failed: ${String(navErr)}`);
    }

    // Register the assist session — isManual=true means:
    // 1. The LoginAssistModal shows "manual" mode instructions
    // 2. On done, cookies are extracted and saved automatically
    // 3. The browser is closed when the session ends
    const { id: sid } = registerLoginAssist(
      page,
      row.retailer,
      10 * 60 * 1000, // 10-minute timeout for manual sessions
      {
        isManual: true,
        manualSaveOnDone: { retailer: row.retailer, email: row.email },
      },
    );
    sessionId = sid;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  if (sessionId) {
    res.json({ ok: true, sessionId, retailer: row.retailer, email: row.email });
  } else {
    res.status(500).json({ ok: false, error: errorMessage ?? "Failed to start manual login" });
  }
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
