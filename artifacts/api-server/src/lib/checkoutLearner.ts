/**
 * Adaptive checkout learner — persists selector success/failure stats to the
 * DB so the bot tries the historically best selector first on every run.
 *
 * Additionally, a module-level session cache provides instant cross-task
 * signal sharing within the same process: when Task A (Walmart) proves a
 * selector is broken, Task B (Walmart, running concurrently) skips it
 * immediately — no DB round-trip required.
 *
 * Cache TTL:  failures expire after FAILURE_TTL_MS (5 min) so transient
 *             site states don't permanently suppress a valid selector.
 *             Winners are held until a new winner is observed.
 *
 * All DB operations are fire-and-forget so a DB error never crashes a checkout.
 */

import { db, checkoutSelectorStatsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { ElementHandle, Page } from "playwright-core";

// ---------------------------------------------------------------------------
// In-process session cache — shared across all concurrent task workers
// ---------------------------------------------------------------------------

const FAILURE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface SessionEntry {
  /** selector → timestamp of most recent failure recorded this session */
  recentFailures: Map<string, number>;
  /** the selector that last succeeded for this retailer+step, or null */
  winner: string | null;
  winnerAt: number;
}

/** key = `${retailer}:${step}` */
const sessionCache = new Map<string, SessionEntry>();

function getEntry(retailer: string, step: string): SessionEntry {
  const key = `${retailer}:${step}`;
  let entry = sessionCache.get(key);
  if (!entry) {
    entry = { recentFailures: new Map(), winner: null, winnerAt: 0 };
    sessionCache.set(key, entry);
  }
  return entry;
}

/** Mark a selector as having just failed — visible to all concurrent tasks immediately. */
function cacheFailure(retailer: string, step: string, selector: string): void {
  const entry = getEntry(retailer, step);
  entry.recentFailures.set(selector, Date.now());
}

/** Mark a selector as the current winner — concurrent tasks will try it first. */
function cacheWinner(retailer: string, step: string, selector: string): void {
  const entry = getEntry(retailer, step);
  entry.winner = selector;
  entry.winnerAt = Date.now();
  // A winner supersedes prior failure entries for itself
  entry.recentFailures.delete(selector);
}

/** Is this selector known to have failed very recently (within TTL)? */
function isRecentlyFailed(retailer: string, step: string, selector: string): boolean {
  const entry = sessionCache.get(`${retailer}:${step}`);
  if (!entry) return false;
  const ts = entry.recentFailures.get(selector);
  if (!ts) return false;
  if (Date.now() - ts > FAILURE_TTL_MS) {
    entry.recentFailures.delete(selector); // expired — clean up
    return false;
  }
  return true;
}

/** Current winner for this retailer+step, if known. */
function cachedWinner(retailer: string, step: string): string | null {
  return sessionCache.get(`${retailer}:${step}`)?.winner ?? null;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Ranking: combine DB history + live session signals
// ---------------------------------------------------------------------------

function rank(
  selectors: string[],
  stats: Map<string, Stats>,
  retailer: string,
  step: string,
): string[] {
  const winner = cachedWinner(retailer, step);

  return [...selectors].sort((a, b) => {
    // 1. Promote the live session winner to the very top
    if (a === winner) return -1;
    if (b === winner) return 1;

    // 2. Demote selectors that are known-failed this session
    const aFailed = isRecentlyFailed(retailer, step, a);
    const bFailed = isRecentlyFailed(retailer, step, b);
    if (aFailed && !bFailed) return 1;
    if (!aFailed && bFailed) return -1;

    // 3. Sort survivors by Laplace-smoothed historical success rate
    const sa = stats.get(a) ?? { successes: 0, failures: 0, avgDurationMs: 0 };
    const sb = stats.get(b) ?? { successes: 0, failures: 0, avgDurationMs: 0 };
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Try each selector in learned-priority order.
 *
 * Priority:
 *   1. Live session winner (another concurrent task already found this works)
 *   2. Selectors with no recent failures, ranked by DB success rate
 *   3. Recently-failed selectors (tried last as a fallback)
 *
 * Outcomes are recorded to the session cache immediately (synchronous) and
 * to the DB asynchronously (fire-and-forget).
 */
export async function smartFind(
  page: Page,
  retailer: string,
  step: string,
  selectors: string[],
): Promise<ElementHandle | null> {
  const stats = await loadStats(retailer, step, selectors);
  const ranked = rank(selectors, stats, retailer, step);
  const start = Date.now();

  for (const sel of ranked) {
    try {
      const el = await page.$(sel);
      if (el) {
        const duration = Date.now() - start;

        // Broadcast success to all concurrent tasks immediately
        cacheWinner(retailer, step, sel);

        // Persist winner and demote all tried-before selectors
        void persist(retailer, step, sel, true, duration, stats.get(sel));
        const idx = ranked.indexOf(sel);
        for (let i = 0; i < idx; i++) {
          cacheFailure(retailer, step, ranked[i]); // instant cross-task signal
          void persist(retailer, step, ranked[i], false, 0, stats.get(ranked[i]));
        }
        return el;
      } else {
        // Not found — tell other tasks right away so they skip it
        cacheFailure(retailer, step, sel);
        void persist(retailer, step, sel, false, 0, stats.get(sel));
      }
    } catch (_) {
      cacheFailure(retailer, step, sel);
    }
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
