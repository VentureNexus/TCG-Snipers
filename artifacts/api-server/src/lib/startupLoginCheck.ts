/**
 * startupLoginCheck — runs once after the server starts listening.
 * For every retailer account that lacks a fresh cached session (< 12 h),
 * it fires a headless pre-login in the background so the first task of
 * the day starts with a warm session and skips the mid-checkout login step.
 *
 * All logins run concurrently (capped at MAX_PARALLEL) so startup is fast
 * even when many accounts are configured.  Failures are logged as warnings
 * and never crash the server.
 */

import { db, retailerAccountsTable } from "@workspace/db";
import { decrypt } from "./crypto";
import { isSessionFresh } from "./retailers/sessionCache";
import { loginRetailer } from "./retailers/loginOnly";
import { logger } from "./logger";

const MAX_PARALLEL = 3;

export async function runStartupLoginCheck(): Promise<void> {
  let accounts: typeof retailerAccountsTable.$inferSelect[] = [];
  try {
    accounts = await db.select().from(retailerAccountsTable);
  } catch (err) {
    logger.warn({ err }, "[StartupLoginCheck] Could not query retailer accounts — skipping");
    return;
  }

  if (accounts.length === 0) {
    logger.info("[StartupLoginCheck] No retailer accounts configured — nothing to pre-login");
    return;
  }

  // Split into stale (need login) vs fresh (skip)
  const stale = accounts.filter((a) => !isSessionFresh(a.retailer, a.email));
  const freshCount = accounts.length - stale.length;

  logger.info(
    `[StartupLoginCheck] ${accounts.length} account(s) found — ${freshCount} fresh, ${stale.length} stale/missing`,
  );

  if (stale.length === 0) return;

  // Run logins in batches of MAX_PARALLEL
  for (let i = 0; i < stale.length; i += MAX_PARALLEL) {
    const batch = stale.slice(i, i + MAX_PARALLEL);
    await Promise.all(
      batch.map(async (account) => {
        let password: string;
        try {
          password = decrypt(account.encryptedPassword);
        } catch {
          logger.warn(
            `[StartupLoginCheck] Could not decrypt password for ${account.retailer} / ${account.email} — skipping`,
          );
          return;
        }

        try {
          logger.info(
            `[StartupLoginCheck] Pre-logging in ${account.retailer} as ${account.email}...`,
          );
          const result = await loginRetailer(account.retailer, account.email, password);
          if (result.success) {
            logger.info(
              `[StartupLoginCheck] ✓ ${account.retailer} / ${account.email} — session cached`,
            );
          } else {
            logger.warn(
              `[StartupLoginCheck] ✗ ${account.retailer} / ${account.email} — ${result.message}`,
            );
          }
        } catch (err) {
          logger.warn(
            { err },
            `[StartupLoginCheck] Error logging in ${account.retailer} / ${account.email}`,
          );
        }
      }),
    );
  }

  logger.info("[StartupLoginCheck] Pre-login sweep complete");
}
