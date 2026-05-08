/**
 * browserHistory — reads recent browsing history from the user's default browser
 * on Windows (Chrome/Edge) and returns a de-duplicated list of URLs.
 *
 * Chrome and Edge both store history in a SQLite3 file at predictable paths.
 * We copy the file to a temp location to avoid locking issues while the
 * browser is running, then extract URLs using binary pattern matching
 * (no external SQLite package required — URLs are stored as plain UTF-8 text
 * in the SQLite data pages and are reliably extractable with a regex).
 *
 * The list is used to pre-warm the stealth browser's browsing context so it
 * appears to have real history rather than looking like a fresh bot session.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const CACHE_FILE = path.join(
  process.env.SESSION_CACHE_DIR ?? path.join(os.homedir(), ".tcg-snipers"),
  "browser-history-cache.json",
);

const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_URLS = 80;

interface HistoryCache {
  savedAt: number;
  urls: string[];
}

function getHistoryFilePaths(): string[] {
  if (process.platform !== "win32") return [];
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const appData = process.env.APPDATA ?? "";
  return [
    path.join(localAppData, "Google", "Chrome", "User Data", "Default", "History"),
    path.join(localAppData, "Microsoft", "Edge", "User Data", "Default", "History"),
    path.join(localAppData, "BraveSoftware", "Brave-Browser", "User Data", "Default", "History"),
    path.join(appData, "Mozilla", "Firefox", "Profiles"),
  ].filter((p) => {
    try {
      const stat = fs.statSync(p);
      return stat.isFile() || stat.isDirectory();
    } catch { return false; }
  });
}

function extractUrlsFromSqliteBinary(filePath: string): string[] {
  try {
    const tmpPath = path.join(os.tmpdir(), `tcg-hist-${Date.now()}.db`);
    fs.copyFileSync(filePath, tmpPath);
    const buf = fs.readFileSync(tmpPath);
    fs.unlinkSync(tmpPath);

    // SQLite stores text as UTF-8. URLs appear verbatim in the data pages.
    // We scan the binary for http(s):// patterns to extract them.
    const text = buf.toString("latin1");
    const urlRegex = /https?:\/\/[^\x00-\x1f\x7f-\xff "',<>[\]{}|\\^`]{10,300}/g;
    const matches = text.match(urlRegex) ?? [];

    return [...new Set(
      matches
        .map((u) => {
          // Trim trailing garbage characters
          return u.replace(/[^\w/?=&#%+.:@~\-]+$/, "");
        })
        .filter((u) => {
          try { new URL(u); return true; } catch { return false; }
        })
    )];
  } catch {
    return [];
  }
}

function extractUrlsFromFirefox(profilesDir: string): string[] {
  try {
    const profiles = fs.readdirSync(profilesDir);
    for (const profile of profiles) {
      const placesDb = path.join(profilesDir, profile, "places.sqlite");
      if (fs.existsSync(placesDb)) {
        return extractUrlsFromSqliteBinary(placesDb);
      }
    }
  } catch { /* ignore */ }
  return [];
}

function tryShellSqlite(filePath: string): string[] {
  // Try system sqlite3 binary as a fallback for better extraction quality
  try {
    const tmpPath = path.join(os.tmpdir(), `tcg-hist-${Date.now()}.db`);
    fs.copyFileSync(filePath, tmpPath);
    const result = execFileSync("sqlite3", [tmpPath, "SELECT url FROM urls ORDER BY visit_count DESC LIMIT 200"], {
      timeout: 5000,
      encoding: "utf8",
    });
    fs.unlinkSync(tmpPath);
    return result.split("\n").filter((u) => u.startsWith("http"));
  } catch {
    return [];
  }
}

export function loadCachedHistory(): string[] | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const cache = JSON.parse(raw) as HistoryCache;
    if (Date.now() - cache.savedAt < CACHE_MAX_AGE_MS) {
      return cache.urls;
    }
  } catch { /* no cache */ }
  return null;
}

export async function readBrowserHistory(): Promise<string[]> {
  const cached = loadCachedHistory();
  if (cached) return cached;

  const historyPaths = getHistoryFilePaths();
  const allUrls: string[] = [];

  for (const p of historyPaths) {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        // Firefox profiles directory
        allUrls.push(...extractUrlsFromFirefox(p));
      } else {
        // Chrome/Edge/Brave SQLite file — try shell sqlite3 first, then binary scan
        const shellUrls = tryShellSqlite(p);
        if (shellUrls.length > 0) {
          allUrls.push(...shellUrls);
        } else {
          allUrls.push(...extractUrlsFromSqliteBinary(p));
        }
      }
    } catch { /* skip this browser */ }
  }

  // De-duplicate, strip tracking params, limit to MAX_URLS
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of allUrls) {
    try {
      const u = new URL(raw);
      // Only keep main content pages — skip internal browser pages, PDFs, etc.
      if (!["http:", "https:"].includes(u.protocol)) continue;
      if (u.hostname.length < 4) continue;
      // Strip tracking params for privacy
      ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","gclid","ref"].forEach(
        (p) => u.searchParams.delete(p),
      );
      const clean = u.toString();
      if (!seen.has(clean)) {
        seen.add(clean);
        cleaned.push(clean);
      }
      if (cleaned.length >= MAX_URLS) break;
    } catch { /* skip malformed */ }
  }

  // Cache the result
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const cache: HistoryCache = { savedAt: Date.now(), urls: cleaned };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch { /* non-fatal */ }

  return cleaned;
}

/**
 * Inject browser history URLs into a Playwright browser context via CDP.
 * Visits a handful of representative domains quickly in the background so the
 * browser has a realistic browsing fingerprint from first launch.
 *
 * This is intentionally fast and quiet — it runs in the background and
 * any failure is silently swallowed.
 */
export async function warmBrowserHistory(
  context: import("playwright-core").BrowserContext,
  maxVisits = 5,
): Promise<void> {
  try {
    const urls = await readBrowserHistory();
    if (urls.length === 0) return;

    // Pick a diverse sample — prefer popular domains rather than deep page URLs
    const domainsSeen = new Set<string>();
    const toVisit: string[] = [];
    for (const url of urls) {
      try {
        const { hostname } = new URL(url);
        const domain = hostname.replace(/^www\./, "");
        if (!domainsSeen.has(domain)) {
          domainsSeen.add(domain);
          // Use the root of each domain rather than the specific page
          toVisit.push(`https://${hostname}/`);
          if (toVisit.length >= maxVisits) break;
        }
      } catch { /* skip */ }
    }

    for (const url of toVisit) {
      let page: import("playwright-core").Page | null = null;
      try {
        page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
      } catch { /* non-fatal */ } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  } catch { /* non-fatal — never block the main flow */ }
}
