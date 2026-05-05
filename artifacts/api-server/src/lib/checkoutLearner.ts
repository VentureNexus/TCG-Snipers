/**
 * Adaptive checkout learner — persists selector success/failure stats to the
 * DB so the bot tries the historically best selector first on every run.
 *
 * smartFind(page, retailer, step, selectors):
 *   - Ranks `selectors` by past success rate (Laplace smoothed)
 *   - Tries each in order, records outcome to DB
 *   - Returns the first matching ElementHandle (or null)
 *
 * All DB operations are fire-and-forget so a DB error never crashes a checkout.
 */

import { db, checkoutSelectorStatsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { ElementHandle, Page } from "playwright-core";

type Stats = { successes: number; failures: number; avgDurationMs: number };

async function loadStats(
  retailer: string,
  step: string,
  selectors: string[],
): Promise<Map<string, Stats>> {
  try {
    const rows = await db
      .select()
      .from(checkoutSelectorStatsTable)
      .where(
        and(
          eq(checkoutSelectorStatsTable.retailer, retailer),
          eq(checkoutSelectorStatsTable.step, step),
          inArray(checkoutSelectorStatsTable.selector, selectors),
        ),
      );
    return new Map(
      rows.map((r) => [
        r.selector,
        { successes: r.successes, failures: r.failures, avgDurationMs: r.avgDurationMs },
      ]),
    );
  } catch (_) {
    return new Map();
  }
}

function rank(selectors: string[], stats: Map<string, Stats>): string[] {
  return [...selectors].sort((a, b) => {
    const sa = stats.get(a) ?? { successes: 0, failures: 0, avgDurationMs: 0 };
    const sb = stats.get(b) ?? { successes: 0, failures: 0, avgDurationMs: 0 };
    // Laplace-smoothed success rate so unseen selectors aren't penalised too harshly
    const rateA = sa.successes / (sa.successes + sa.failures + 1);
    const rateB = sb.successes / (sb.successes + sb.failures + 1);
    return rateB - rateA;
  });
}

async function persist(
  retailer: string,
  step: string,
  selector: string,
  success: boolean,
  durationMs: number,
  existing: Stats | undefined,
): Promise<void> {
  try {
    if (existing) {
      const newSuccesses = existing.successes + (success ? 1 : 0);
      const newFailures = existing.failures + (success ? 0 : 1);
      const newAvg = success
        ? (existing.avgDurationMs * existing.successes + durationMs) / (newSuccesses || 1)
        : existing.avgDurationMs;
      await db
        .update(checkoutSelectorStatsTable)
        .set({
          successes: newSuccesses,
          failures: newFailures,
          avgDurationMs: newAvg,
          ...(success ? { lastSuccessAt: new Date() } : {}),
        })
        .where(
          and(
            eq(checkoutSelectorStatsTable.retailer, retailer),
            eq(checkoutSelectorStatsTable.step, step),
            eq(checkoutSelectorStatsTable.selector, selector),
          ),
        );
    } else {
      await db.insert(checkoutSelectorStatsTable).values({
        retailer,
        step,
        selector,
        successes: success ? 1 : 0,
        failures: success ? 0 : 1,
        avgDurationMs: success ? durationMs : 0,
        ...(success ? { lastSuccessAt: new Date() } : {}),
      });
    }
  } catch (_) {
    // Non-critical — never crash a checkout over a learning write failure
  }
}

/**
 * Try each selector in learned-priority order. Records outcome to DB and
 * returns the first matching element, or null if none match.
 */
export async function smartFind(
  page: Page,
  retailer: string,
  step: string,
  selectors: string[],
): Promise<ElementHandle | null> {
  const stats = await loadStats(retailer, step, selectors);
  const ranked = rank(selectors, stats);
  const start = Date.now();

  for (const sel of ranked) {
    try {
      const el = await page.$(sel);
      if (el) {
        const duration = Date.now() - start;
        void persist(retailer, step, sel, true, duration, stats.get(sel));
        // Mark all selectors tried before this one as failures for this run
        const idx = ranked.indexOf(sel);
        for (let i = 0; i < idx; i++) {
          void persist(retailer, step, ranked[i], false, 0, stats.get(ranked[i]));
        }
        return el;
      }
    } catch (_) {}
  }

  // All failed
  for (const sel of ranked) {
    void persist(retailer, step, sel, false, 0, stats.get(sel));
  }
  return null;
}

/**
 * Utility: smartClick scrolls the found element into view then JS-clicks it.
 * Returns false if no element matched.
 */
export async function smartClick(
  page: Page,
  retailer: string,
  step: string,
  selectors: string[],
): Promise<boolean> {
  const el = await smartFind(page, retailer, step, selectors);
  if (!el) return false;
  await el.scrollIntoViewIfNeeded();
  await page.evaluate((e) => (e as unknown as { click(): void }).click(), el);
  return true;
}
