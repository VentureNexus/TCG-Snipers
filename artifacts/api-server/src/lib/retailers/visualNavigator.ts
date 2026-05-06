/**
 * visualNavigator — AI-powered visual page understanding for any retailer site.
 *
 * Two public functions:
 *   navigateTo(page, retailer, goal, stage) — screenshots the page, asks an LLM
 *     what to click to reach the goal, and executes up to MAX_STEPS actions.
 *     Discovered paths are cached per retailer+stage so the LLM is only called
 *     on first failure or cache invalidation.
 *
 *   detectChallenge(page) — checks for known CAPTCHA / bot-detection signals.
 *     Attempts a single checkbox click for simple challenges. Returns the
 *     challenge type and a screenshot for user notification.
 */

import fs from "fs";
import path from "path";
import os from "os";
import type { Page } from "playwright-core";

const NAV_CACHE_DIR = path.join(
  process.env.SESSION_CACHE_DIR ?? path.join(os.homedir(), ".tcg-snipers"),
  "nav-paths",
);

const MAX_STEPS = 8;
const MAX_WAIT_MS = 4000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionType = "click" | "wait" | "captcha" | "blocked";

interface NavAction {
  action: ActionType;
  descriptor: string;
  waitMs?: number;
}

export interface NavResult {
  success: boolean;
  steps: string[];
  message: string;
  visualAssist: boolean;
}

export type ChallengeType = "none" | "captcha" | "cloudflare" | "blocked";

export interface ChallengeResult {
  type: ChallengeType;
  attempted: boolean;
  screenshot?: string;
}

// ---------------------------------------------------------------------------
// Path cache helpers
// ---------------------------------------------------------------------------

function cachePath(retailer: string, stage: string): string {
  fs.mkdirSync(NAV_CACHE_DIR, { recursive: true });
  const safe = `${retailer}_${stage}`.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return path.join(NAV_CACHE_DIR, `${safe}.json`);
}

function loadCachedPath(retailer: string, stage: string): NavAction[] | null {
  try {
    const raw = fs.readFileSync(cachePath(retailer, stage), "utf-8");
    const data = JSON.parse(raw) as { savedAt: number; actions: NavAction[] };
    const AGE_LIMIT = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - data.savedAt > AGE_LIMIT) {
      fs.unlinkSync(cachePath(retailer, stage));
      return null;
    }
    return data.actions;
  } catch {
    return null;
  }
}

function saveCachedPath(retailer: string, stage: string, actions: NavAction[]): void {
  try {
    fs.writeFileSync(
      cachePath(retailer, stage),
      JSON.stringify({ savedAt: Date.now(), actions }),
      "utf-8",
    );
  } catch {
    // non-fatal
  }
}

function clearCachedPath(retailer: string, stage: string): void {
  try { fs.unlinkSync(cachePath(retailer, stage)); } catch { }
}

// ---------------------------------------------------------------------------
// Anthropic API call (vision)
// ---------------------------------------------------------------------------

async function askLlmForActions(
  screenshotBase64: string,
  retailer: string,
  goal: string,
): Promise<NavAction[]> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Anthropic AI integration not configured (AI_INTEGRATIONS_ANTHROPIC_BASE_URL / AI_INTEGRATIONS_ANTHROPIC_API_KEY missing)");
  }

  const prompt = `You are a browser automation assistant helping a bot navigate the ${retailer} website.

GOAL: ${goal}

The screenshot shows the current state of the ${retailer} website in a browser.

Analyze the screenshot and return a JSON array of actions needed to reach the goal.
Each action has:
  - action: "click" | "wait" | "captcha" | "blocked"
  - descriptor: human-readable description of the element to click (for "click") or reason (for others)
  - waitMs: optional milliseconds to wait after this step (default 1500)

Rules:
- "click": click a visible element described by descriptor (e.g. "the 'Account' link in the top navigation bar", "the 'Sign In' button in the slide-out panel", "the 'Password' radio button")
- "wait": just wait waitMs ms (use for animations/transitions)
- "captcha": if you see a CAPTCHA or bot-detection challenge on this page
- "blocked": if the site appears to be fully blocking the bot (error page, access denied)
- Maximum ${MAX_STEPS} actions total
- Return ONLY the JSON array, no other text
- If the goal is already achieved (e.g. the login form is already visible), return []

Example response: [{"action":"click","descriptor":"the 'Account' link in the top-right navigation","waitMs":2000},{"action":"click","descriptor":"the 'Sign In' button in the dropdown panel","waitMs":1500}]`;

  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: screenshotBase64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("No text in Anthropic response");

  const raw = textBlock.text.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    if (raw === "[]" || raw.includes("already achieved")) return [];
    throw new Error(`Could not parse actions from LLM response: ${raw.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]) as NavAction[];
}

// ---------------------------------------------------------------------------
// Playwright element resolver
// ---------------------------------------------------------------------------

async function resolveAndClick(page: Page, descriptor: string): Promise<boolean> {
  const desc = descriptor.toLowerCase();

  const textMatch = descriptor.match(/['"]([^'"]+)['"]/);
  const labelText = textMatch?.[1];

  const candidates: Array<() => Promise<boolean>> = [];

  if (labelText) {
    candidates.push(async () => {
      const el = page.getByText(labelText, { exact: false }).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        return true;
      }
      return false;
    });
    candidates.push(async () => {
      const el = page.getByRole("button", { name: labelText }).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        return true;
      }
      return false;
    });
    candidates.push(async () => {
      const el = page.getByRole("link", { name: labelText }).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        return true;
      }
      return false;
    });
    candidates.push(async () => {
      const el = page.getByLabel(labelText).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        return true;
      }
      return false;
    });
  }

  if (desc.includes("radio")) {
    candidates.push(async () => {
      const el = page.getByRole("radio").first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        return true;
      }
      return false;
    });
  }
  if (desc.includes("checkbox")) {
    candidates.push(async () => {
      const el = page.getByRole("checkbox").first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        return true;
      }
      return false;
    });
  }
  if (desc.includes("account") || desc.includes("sign in") || desc.includes("login")) {
    candidates.push(async () => {
      for (const sel of ["[data-testid*='account']", "[aria-label*='account' i]", ".account-link", "#account", "a[href*='account']", "button:has-text('Account')", "a:has-text('Account')"]) {
        const el = await page.$(sel);
        if (el && await el.isVisible().catch(() => false)) {
          await el.click();
          return true;
        }
      }
      return false;
    });
  }

  for (const fn of candidates) {
    try {
      if (await fn()) return true;
    } catch {
      // try next
    }
  }

  if (labelText) {
    try {
      const el = await page.$(`*:text-is("${labelText}")`);
      if (el && await el.isVisible().catch(() => false)) {
        await el.click();
        return true;
      }
    } catch { }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Execute a cached or LLM-discovered action sequence
// ---------------------------------------------------------------------------

async function executeActions(page: Page, actions: NavAction[]): Promise<{ success: boolean; stepsExecuted: string[] }> {
  const stepsExecuted: string[] = [];

  for (const action of actions.slice(0, MAX_STEPS)) {
    if (action.action === "captcha" || action.action === "blocked") {
      stepsExecuted.push(`[${action.action}] ${action.descriptor}`);
      return { success: false, stepsExecuted };
    }

    if (action.action === "wait") {
      await new Promise((r) => setTimeout(r, action.waitMs ?? 1500));
      stepsExecuted.push(`[wait] ${action.waitMs ?? 1500}ms`);
      continue;
    }

    if (action.action === "click") {
      const clicked = await resolveAndClick(page, action.descriptor);
      if (!clicked) {
        stepsExecuted.push(`[click FAILED] ${action.descriptor}`);
        return { success: false, stepsExecuted };
      }
      stepsExecuted.push(`[click] ${action.descriptor}`);
      const waitMs = action.waitMs ?? 1500;
      await new Promise((r) => setTimeout(r, waitMs));
      await page.waitForLoadState("networkidle", { timeout: MAX_WAIT_MS }).catch(() => { });
    }
  }

  return { success: true, stepsExecuted };
}

// ---------------------------------------------------------------------------
// Public: navigateTo
// ---------------------------------------------------------------------------

export async function navigateTo(
  page: Page,
  retailer: string,
  goal: string,
  stage: string,
): Promise<NavResult> {
  const cached = loadCachedPath(retailer, stage);

  if (cached && cached.length > 0) {
    const result = await executeActions(page, cached);
    if (result.success) {
      return {
        success: true,
        steps: result.stepsExecuted,
        message: `Navigated via cached path (${result.stepsExecuted.length} steps)`,
        visualAssist: true,
      };
    }
    clearCachedPath(retailer, stage);
  }

  let screenshotBase64: string;
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 60 });
    screenshotBase64 = buf.toString("base64");
  } catch (err) {
    return { success: false, steps: [], message: `Screenshot failed: ${String(err)}`, visualAssist: true };
  }

  let actions: NavAction[];
  try {
    actions = await askLlmForActions(screenshotBase64, retailer, goal);
  } catch (err) {
    return { success: false, steps: [], message: `Vision LLM error: ${String(err)}`, visualAssist: true };
  }

  if (actions.length === 0) {
    return { success: true, steps: [], message: "Goal already achieved (no navigation needed)", visualAssist: true };
  }

  const hasCaptchaOrBlock = actions.some((a) => a.action === "captcha" || a.action === "blocked");
  if (hasCaptchaOrBlock) {
    const actionDesc = actions[0];
    return {
      success: false,
      steps: [actionDesc.descriptor],
      message: `${actionDesc.action === "captcha" ? "CAPTCHA" : "Bot detection"} detected on page: ${actionDesc.descriptor}`,
      visualAssist: true,
    };
  }

  const result = await executeActions(page, actions);

  if (result.success) {
    saveCachedPath(retailer, stage, actions);
    return {
      success: true,
      steps: result.stepsExecuted,
      message: `Visual navigation succeeded (${result.stepsExecuted.length} steps, path cached)`,
      visualAssist: true,
    };
  }

  return {
    success: false,
    steps: result.stepsExecuted,
    message: `Visual navigation failed after ${result.stepsExecuted.length} steps — could not complete: ${result.stepsExecuted.at(-1) ?? "unknown"}`,
    visualAssist: true,
  };
}

// ---------------------------------------------------------------------------
// Public: handleChallengeInTask
// Convenience wrapper used by checkout runners to detect, log, pause, and
// broadcast a CAPTCHA event.  Returns the failure message if blocked, null
// if no challenge was found.
// ---------------------------------------------------------------------------

export async function handleChallengeInTask(
  page: Page,
  taskId: number,
  retailer: string,
  log: (level: "INFO" | "SUCCESS" | "WARN" | "ERROR", msg: string) => void,
  setStatus: (status: string) => Promise<void>,
): Promise<string | null> {
  const challenge = await detectChallenge(page).catch(() => null);
  if (!challenge || challenge.type === "none") return null;

  const label =
    challenge.type === "cloudflare" ? "Cloudflare bot detection" : "CAPTCHA challenge";
  const msg = `[${retailer}] ${label} detected${challenge.attempted ? " (auto-click attempted)" : ""} — task paused. Complete verification manually then restart the task.`;

  log("ERROR", msg);
  await setStatus("paused_captcha").catch(() => {});

  if (challenge.screenshot) {
    try {
      const { broadcastScreenshot } = await import("../websocket");
      broadcastScreenshot(taskId, challenge.screenshot);
    } catch {
      // non-fatal
    }
  }

  return msg;
}

// ---------------------------------------------------------------------------
// Public: waitForSelectorWithVisualFallback
// Tries to find `selector` on the page. If not immediately found, invokes
// navigateTo() with `visualGoal` as the instruction (e.g. "click Proceed to
// Checkout") and retries once.  Returns the element handle on success, null
// on failure.  Used by checkout runners to avoid silently failing when a
// retailer moves a button to a new location.
// ---------------------------------------------------------------------------

export async function waitForSelectorWithVisualFallback(
  page: Page,
  selector: string,
  retailer: string,
  visualGoal: string,
  stage: string,
  log?: (level: "INFO" | "SUCCESS" | "WARN" | "ERROR", msg: string) => void,
): Promise<{ el: Awaited<ReturnType<Page["$"]>>; visualAssist: boolean }> {
  // Fast-path: element already present
  const existing = await page.$(selector).catch(() => null);
  if (existing) return { el: existing, visualAssist: false };

  // Slow-path: ask the AI to navigate to the element
  log?.("WARN", `[${retailer}] Selector not found: "${selector}" — asking visual navigator for help...`);
  const navResult = await navigateTo(page, retailer, visualGoal, stage).catch(() => null);
  if (navResult?.success) {
    log?.("INFO", `[${retailer}] Visual navigator: ${navResult.message}`);
  }

  const el = await page.$(selector).catch(() => null);
  return { el, visualAssist: true };
}

// ---------------------------------------------------------------------------
// Public: detectChallenge
// ---------------------------------------------------------------------------

const CAPTCHA_FRAME_PATTERNS = [
  "recaptcha",
  "hcaptcha",
  "cf-challenge",
  "challenge-platform",
  "captcha",
];

const CAPTCHA_TEXT_PATTERNS = [
  /verify you.?re human/i,
  /i.?m not a robot/i,
  /complete the security check/i,
  /enable javascript and cookies/i,
  /checking your browser/i,
  /please wait/i,
  /ray id/i,
  /cloudflare/i,
  /access denied/i,
  /please verify/i,
  /human verification/i,
];

export async function detectChallenge(page: Page): Promise<ChallengeResult> {
  try {
    for (const frame of page.frames()) {
      const url = frame.url().toLowerCase();
      if (CAPTCHA_FRAME_PATTERNS.some((p) => url.includes(p))) {
        const checkbox = await frame.$("input[type='checkbox']").catch(() => null);
        let attempted = false;
        if (checkbox) {
          try {
            await checkbox.click();
            await new Promise((r) => setTimeout(r, 3000));
            const stillPresent = await frame.$("input[type='checkbox']").catch(() => null);
            attempted = true;
            if (!stillPresent) {
              return { type: "none", attempted: true };
            }
          } catch { }
        }

        let screenshot: string | undefined;
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 50 });
          screenshot = "data:image/jpeg;base64," + buf.toString("base64");
        } catch { }

        return { type: "captcha", attempted, screenshot };
      }
    }

    const bodyText = await page.textContent("body").catch(() => "") ?? "";
    for (const pat of CAPTCHA_TEXT_PATTERNS) {
      if (pat.test(bodyText)) {
        const isCloudflare = /ray id|cloudflare|checking your browser/i.test(bodyText);

        let attempted = false;
        const checkbox = await page.$("input[type='checkbox']").catch(() => null);
        if (checkbox && await checkbox.isVisible().catch(() => false)) {
          try {
            await checkbox.click();
            await new Promise((r) => setTimeout(r, 3000));
            attempted = true;
            const stillVisible = await checkbox.isVisible().catch(() => false);
            if (!stillVisible) {
              return { type: "none", attempted: true };
            }
          } catch { }
        }

        let screenshot: string | undefined;
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 50 });
          screenshot = "data:image/jpeg;base64," + buf.toString("base64");
        } catch { }

        return {
          type: isCloudflare ? "cloudflare" : "captcha",
          attempted,
          screenshot,
        };
      }
    }

    return { type: "none", attempted: false };
  } catch {
    return { type: "none", attempted: false };
  }
}
