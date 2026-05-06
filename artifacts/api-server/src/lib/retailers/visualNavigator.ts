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
import type { Page, Locator } from "playwright-core";

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

export type ChallengeType = "none" | "captcha" | "recaptcha_grid" | "press_hold" | "cloudflare" | "blocked";

type LogFn = (level: "INFO" | "SUCCESS" | "WARN" | "ERROR", msg: string) => void;

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
  const safe = `${retailer}-${stage}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
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

// Ask Claude to identify which grid cells match the CAPTCHA instruction
async function askLlmForCaptchaGridCells(
  screenshotBase64: string,
  instruction: string,
): Promise<{ cells: number[]; gridSize: number }> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Anthropic AI integration not configured");

  const prompt = `You are analyzing a CAPTCHA image grid challenge.

CAPTCHA INSTRUCTION: "${instruction}"

Examine the grid image. Cells are numbered 0-based, left-to-right, top-to-bottom (like reading order).
Count the grid dimensions (typically 3×3 = 9 cells, or 4×4 = 16 cells).
Identify which cells contain images that match the CAPTCHA instruction.

Return ONLY a JSON object — no explanation, no markdown:
{"cells":[0,3,5],"gridSize":3}

Where:
- "cells": 0-based indices of matching cells ([] if none match)
- "gridSize": 3 for 3×3, 4 for 4×4`;

  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshotBase64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = await response.json() as { content: Array<{ type: string; text?: string }> };
  const text = data.content.find((b) => b.type === "text")?.text?.trim() ?? "";
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return { cells: [], gridSize: 3 };
  try { return JSON.parse(jsonMatch[0]) as { cells: number[]; gridSize: number }; } catch { return { cells: [], gridSize: 3 }; }
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
  log?: (level: "INFO" | "SUCCESS" | "WARN" | "ERROR", msg: string) => void,
): Promise<NavResult> {
  const TAG = `[VisualNav][${retailer}/${stage}]`;

  const cached = loadCachedPath(retailer, stage);

  if (cached && cached.length > 0) {
    log?.("INFO", `${TAG} Replaying cached path (${cached.length} step(s)): ${cached.map(a => a.descriptor).join(" → ")}`);
    const result = await executeActions(page, cached);
    if (result.success) {
      log?.("INFO", `${TAG} Cached path succeeded: ${result.stepsExecuted.join(", ")}`);
      return {
        success: true,
        steps: result.stepsExecuted,
        message: `Navigated via cached path (${result.stepsExecuted.length} steps)`,
        visualAssist: true,
      };
    }
    log?.("WARN", `${TAG} Cached path failed at step: ${result.stepsExecuted.at(-1) ?? "unknown"} — invalidating cache`);
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
    log?.("INFO", `${TAG} Asking Claude for navigation steps toward: "${goal}"`);
    actions = await askLlmForActions(screenshotBase64, retailer, goal);
  } catch (err) {
    log?.("WARN", `${TAG} Vision LLM error: ${String(err)}`);
    return { success: false, steps: [], message: `Vision LLM error: ${String(err)}`, visualAssist: true };
  }

  if (actions.length === 0) {
    log?.("INFO", `${TAG} Goal already achieved (LLM returned no actions)`);
    return { success: true, steps: [], message: "Goal already achieved (no navigation needed)", visualAssist: true };
  }

  log?.("INFO", `${TAG} LLM suggested ${actions.length} step(s): ${actions.map((a, i) => `${i + 1}.[${a.action}] ${a.descriptor}`).join(" | ")}`);

  const hasCaptchaOrBlock = actions.some((a) => a.action === "captcha" || a.action === "blocked");
  if (hasCaptchaOrBlock) {
    const actionDesc = actions.find((a) => a.action === "captcha" || a.action === "blocked") ?? actions[0];
    log?.("WARN", `${TAG} LLM detected ${actionDesc.action}: ${actionDesc.descriptor}`);
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
    log?.("INFO", `${TAG} Navigation succeeded — steps: ${result.stepsExecuted.join(", ")} (path cached)`);
    return {
      success: true,
      steps: result.stepsExecuted,
      message: `Visual navigation succeeded (${result.stepsExecuted.length} steps, path cached)`,
      visualAssist: true,
    };
  }

  log?.("WARN", `${TAG} Navigation failed — last step: ${result.stepsExecuted.at(-1) ?? "unknown"}`);
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

  // ── Auto-solve attempts before pausing ──────────────────────────────────

  if (challenge.type === "press_hold") {
    log("INFO", `[${retailer}] PerimeterX press-and-hold detected — attempting auto-solve...`);
    await setStatus("solving_captcha").catch(() => {});
    const solved = await solveWalmartPressHold(page, log).catch(() => false);
    if (solved) {
      await new Promise((r) => setTimeout(r, 2000));
      const recheck = await detectChallenge(page).catch(() => null);
      if (!recheck || recheck.type === "none") {
        log("SUCCESS", `[${retailer}] Press-and-hold CAPTCHA auto-solved — continuing`);
        return null;
      }
    }
  }

  if (challenge.type === "recaptcha_grid" || challenge.type === "captcha") {
    log("INFO", `[${retailer}] reCAPTCHA/hCaptcha image grid detected — attempting auto-solve...`);
    await setStatus("solving_captcha").catch(() => {});
    const solved = await solveRecaptchaGrid(page, log).catch(() => false);
    if (solved) {
      await new Promise((r) => setTimeout(r, 2000));
      const recheck = await detectChallenge(page).catch(() => null);
      if (!recheck || recheck.type === "none") {
        log("SUCCESS", `[${retailer}] Image grid CAPTCHA auto-solved — continuing`);
        return null;
      }
    }
  }

  // ── All auto-solve attempts failed — check for human assistance ──────────

  const label =
    challenge.type === "cloudflare" ? "Cloudflare bot detection"
    : challenge.type === "press_hold" ? "press-and-hold CAPTCHA (PerimeterX)"
    : challenge.type === "recaptcha_grid" ? "reCAPTCHA image grid"
    : "CAPTCHA challenge";

  const attemptedNote = challenge.attempted || ["press_hold", "recaptcha_grid"].includes(challenge.type)
    ? " (auto-solve attempted)"
    : "";

  // Capture fresh screenshot for the UI notification
  let screenshot = challenge.screenshot;
  if (!screenshot) {
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: 50 });
      screenshot = "data:image/jpeg;base64," + buf.toString("base64");
    } catch { }
  }

  // Check if human CAPTCHA assistance is enabled in settings
  try {
    const { db: dbSettings, settingsTable: stbl } = await import("@workspace/db");
    const [settRow] = await dbSettings
      .select({ captchaAssist: stbl.captchaAssist })
      .from(stbl)
      .limit(1);

    if (settRow?.captchaAssist) {
      log("WARN", `[${retailer}] ${label} detected${attemptedNote} — requesting human assistance. Use the CAPTCHA Assist popup in the app.`);
      await setStatus("awaiting_user_captcha").catch(() => {});

      if (screenshot) {
        try {
          const { broadcastScreenshot } = await import("../websocket");
          broadcastScreenshot(taskId, screenshot);
        } catch { /* non-fatal */ }
      }

      const { registerSession, saveLearning } = await import("../captchaAssistManager");
      const { outcome, clicks } = await registerSession(taskId, page, retailer, challenge.type);

      if (outcome === "done") {
        const recheck = await detectChallenge(page).catch(() => null);
        const resolved = !recheck || recheck.type === "none";
        saveLearning(retailer, challenge.type, clicks, resolved);
        if (resolved) {
          log("SUCCESS", `[${retailer}] CAPTCHA resolved via human assist — continuing`);
          return null;
        }
        log("WARN", `[${retailer}] CAPTCHA still detected after human assist — pausing task`);
      } else if (outcome === "timeout") {
        log("WARN", `[${retailer}] Human assist timed out (5 min) — pausing task`);
      } else {
        log("WARN", `[${retailer}] Human assist cancelled — pausing task`);
      }
    }
  } catch {
    // Settings fetch failed — fall through to normal pause
  }

  const msg = `[${retailer}] ${label} detected${attemptedNote} — task paused. Complete verification manually then restart the task.`;

  log("ERROR", msg);
  await setStatus("paused_captcha").catch(() => {});

  if (screenshot) {
    try {
      const { broadcastScreenshot } = await import("../websocket");
      broadcastScreenshot(taskId, screenshot);
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
  timeout = 8000,
): Promise<{ el: Awaited<ReturnType<Page["$"]>>; visualAssist: boolean; alreadyNavigated: boolean; captchaDetected: boolean }> {
  // Normal-path: wait the full selector timeout before giving up
  const existing = await page.waitForSelector(selector, { timeout }).catch(() => null);
  if (existing) return { el: existing, visualAssist: false, alreadyNavigated: false, captchaDetected: false };

  // Slow-path: selector not found after full timeout — ask the AI to navigate
  log?.("WARN", `[${retailer}] Selector "${selector}" not found after ${timeout}ms — asking visual navigator for help...`);
  const navResult = await navigateTo(page, retailer, visualGoal, stage, log).catch(() => null);
  if (navResult?.success) {
    log?.("INFO", `[${retailer}] Visual navigator: ${navResult.message}`);
  }

  // Detect captcha/blocked signal in navResult message
  const navMsg = navResult?.message?.toLowerCase() ?? "";
  const captchaDetected = !navResult?.success && (
    navMsg.includes("captcha") || navMsg.includes("bot detection") || navMsg.includes("blocked")
  );
  if (captchaDetected) {
    log?.("WARN", `[${retailer}] Visual navigator detected challenge during navigation: ${navResult?.message}`);
    return { el: null, visualAssist: true, alreadyNavigated: false, captchaDetected: true };
  }

  const el = await page.$(selector).catch(() => null);

  // If nav succeeded but element is gone, the AI likely already clicked/submitted it.
  // Signal alreadyNavigated so callers skip the click rather than failing.
  if (!el && navResult?.success) {
    log?.("INFO", `[${retailer}] Visual navigator appears to have already executed the action (element absent post-nav)`);
    return { el: null, visualAssist: true, alreadyNavigated: true, captchaDetected: false };
  }

  return { el, visualAssist: true, alreadyNavigated: false, captchaDetected: false };
}

// ---------------------------------------------------------------------------
// Public: solveRecaptchaGrid
// Uses Claude vision to solve reCAPTCHA / hCaptcha image-grid challenges.
// Iterates up to 4 rounds — each round screenshots the grid, asks Claude
// which cells to click, clicks them, then presses Verify.
// Returns true if the challenge iframe disappears (solved), false otherwise.
// ---------------------------------------------------------------------------

export async function solveRecaptchaGrid(page: Page, log?: LogFn): Promise<boolean> {
  const TAG = "[CAPTCHA-Grid]";

  // reCAPTCHA bframe OR hCaptcha challenge iframe
  const CHALLENGE_FRAME_URL_PATTERNS = ["bframe", "hcaptcha.com/challenge", "recaptcha/api2/bframe"];

  const INSTRUCTION_SELECTORS = [
    ".rc-imageselect-desc-no-canonical",
    ".rc-imageselect-desc",
    ".rc-imageselect-instructions",
    "[class*='prompt-text']",
    ".task-description",
  ];
  const TILE_SELECTORS = [
    ".rc-imageselect-tile",
    "td.rc-imageselect-tile",
    "[class*='task-image']",
    "[class*='image-wrapper'] img",
  ];
  const VERIFY_SELECTORS = [
    "#recaptcha-verify-button",
    "button:has-text('Verify')",
    "button:has-text('Submit')",
    ".button-submit",
    "[class*='verify']",
  ];
  const GRID_SCREENSHOT_SELECTORS = [
    ".rc-imageselect-table",
    "[class*='task-grid']",
    ".challenge-container",
    "body",
  ];

  const getChallengeFrame = () =>
    page.frames().find((f) =>
      CHALLENGE_FRAME_URL_PATTERNS.some((p) => f.url().includes(p))
    ) ?? null;

  const MAX_ROUNDS = 4;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const frame = getChallengeFrame();
    if (!frame) {
      log?.("SUCCESS", `${TAG} Challenge frame gone — assumed solved`);
      return true;
    }

    log?.("INFO", `${TAG} Round ${round}/${MAX_ROUNDS}`);

    // Extract instruction text
    let instruction = "";
    for (const sel of INSTRUCTION_SELECTORS) {
      const text = await frame.locator(sel).first().textContent().catch(() => null);
      if (text?.trim()) { instruction = text.trim(); break; }
    }
    log?.("INFO", `${TAG} Instruction: "${instruction || "(none found)"}"`);

    // Screenshot the grid
    let screenshotBuf: Buffer | null = null;
    for (const sel of GRID_SCREENSHOT_SELECTORS) {
      const loc = frame.locator(sel).first();
      if (await loc.count().catch(() => 0) > 0) {
        screenshotBuf = await loc.screenshot({ type: "jpeg", quality: 75 }).catch(() => null);
        if (screenshotBuf) break;
      }
    }
    if (!screenshotBuf) {
      log?.("WARN", `${TAG} Could not screenshot challenge grid — aborting`);
      break;
    }

    // Ask Claude which cells to click
    let cellResult = { cells: [] as number[], gridSize: 3 };
    try {
      cellResult = await askLlmForCaptchaGridCells(screenshotBuf.toString("base64"), instruction);
      log?.("INFO", `${TAG} Claude identified cells [${cellResult.cells.join(", ")}] in ${cellResult.gridSize}×${cellResult.gridSize} grid`);
    } catch (err) {
      log?.("WARN", `${TAG} Claude cell identification failed: ${String(err)}`);
      break;
    }

    // Click the identified tiles
    if (cellResult.cells.length > 0) {
      let tilesLocator: Locator | null = null;
      for (const sel of TILE_SELECTORS) {
        const loc = frame.locator(sel);
        if (await loc.count().catch(() => 0) > 0) { tilesLocator = loc; break; }
      }

      if (tilesLocator) {
        const tileCount = await tilesLocator.count().catch(() => 0);
        for (const idx of cellResult.cells) {
          if (idx < tileCount) {
            await tilesLocator.nth(idx).click({ force: true }).catch(() => {});
            await new Promise((r) => setTimeout(r, 350 + Math.random() * 200));
          }
        }
        log?.("INFO", `${TAG} Clicked ${cellResult.cells.filter((i) => i < tileCount).length} tiles`);
      } else {
        log?.("WARN", `${TAG} Could not locate tile elements`);
      }
    } else {
      log?.("INFO", `${TAG} No matching cells — proceeding to verify`);
    }

    await new Promise((r) => setTimeout(r, 800));

    // Click Verify
    let verified = false;
    for (const sel of VERIFY_SELECTORS) {
      const btn = frame.locator(sel).first();
      if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        verified = true;
        log?.("INFO", `${TAG} Clicked verify button`);
        break;
      }
    }
    if (!verified) {
      log?.("WARN", `${TAG} Verify button not found`);
      break;
    }

    await new Promise((r) => setTimeout(r, 2500));

    // Check if challenge frame is gone (= solved)
    if (!getChallengeFrame()) {
      log?.("SUCCESS", `${TAG} Image grid CAPTCHA solved!`);
      return true;
    }

    // Log any retry feedback from the challenge
    const feedback = await frame.locator(
      ".rc-imageselect-error-select-more, .rc-imageselect-error-dynamic-more, [class*='error-message']"
    ).first().textContent().catch(() => "");
    if (feedback?.trim()) log?.("INFO", `${TAG} Challenge feedback: "${feedback.trim()}"`);
  }

  log?.("WARN", `${TAG} Image grid CAPTCHA not solved after ${MAX_ROUNDS} rounds`);
  return false;
}

// ---------------------------------------------------------------------------
// Public: solveWalmartPressHold
// Simulates the PerimeterX "press & hold" challenge used by Walmart.
// Finds the hold button (in the main page or a PerimeterX iframe), moves the
// mouse to its center, holds mouse down for ~4-5 s, then releases.
// Returns true if the challenge element disappears after the hold.
// ---------------------------------------------------------------------------

export async function solveWalmartPressHold(page: Page, log?: LogFn): Promise<boolean> {
  const TAG = "[Press-Hold]";

  const HOLD_SELECTORS = [
    "#px-captcha",
    "[class*='px-captcha']",
    "button:has-text('Press & Hold')",
    "button:has-text('Hold')",
    "[aria-label*='press' i]",
    "[class*='press-hold']",
    "[class*='pressHold']",
    "[id*='captcha']",
  ];

  const PX_FRAME_PATTERNS = ["px-cdn.net", "perimeterx", "px.ads", "human.security"];

  // Try to find the hold element — first in main page, then in PX iframes
  let holdLocator: Locator | null = null;
  let holdContext: "page" | "frame" = "page";

  for (const sel of HOLD_SELECTORS) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0) > 0 && await loc.isVisible().catch(() => false)) {
      holdLocator = loc;
      break;
    }
  }

  if (!holdLocator) {
    for (const frame of page.frames()) {
      const url = frame.url().toLowerCase();
      if (!PX_FRAME_PATTERNS.some((p) => url.includes(p))) continue;
      for (const sel of HOLD_SELECTORS) {
        const loc = frame.locator(sel).first();
        if (await loc.count().catch(() => 0) > 0) {
          holdLocator = loc;
          holdContext = "frame";
          break;
        }
      }
      if (holdLocator) break;
    }
  }

  if (!holdLocator) {
    log?.("INFO", `${TAG} No press-and-hold CAPTCHA detected`);
    return false;
  }

  log?.("INFO", `${TAG} Press-and-hold CAPTCHA detected (${holdContext}) — simulating hold gesture`);

  const performHold = async (holdMs: number): Promise<boolean> => {
    const box = await holdLocator!.boundingBox().catch(() => null);
    if (!box) return false;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy, { steps: 12 });
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 100));
    await page.mouse.down();
    log?.("INFO", `${TAG} Mouse down — holding for ${holdMs}ms...`);
    await new Promise((r) => setTimeout(r, holdMs));
    await page.mouse.up();
    log?.("INFO", `${TAG} Mouse up — waiting for verification result...`);
    await new Promise((r) => setTimeout(r, 2000));

    // Success if hold element disappears
    const stillVisible = await holdLocator!.isVisible().catch(() => false);
    return !stillVisible;
  };

  // First attempt: 4-5 seconds
  if (await performHold(4000 + Math.random() * 1000)) {
    log?.("SUCCESS", `${TAG} Press-and-hold CAPTCHA solved!`);
    return true;
  }

  // Retry with longer hold: 6-7 seconds
  log?.("INFO", `${TAG} First hold incomplete — retrying with longer hold...`);
  if (await performHold(6000 + Math.random() * 1000)) {
    log?.("SUCCESS", `${TAG} Press-and-hold CAPTCHA solved on retry!`);
    return true;
  }

  log?.("WARN", `${TAG} Press-and-hold CAPTCHA not resolved after 2 attempts`);
  return false;
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

// High-confidence text patterns that unambiguously indicate a CAPTCHA or
// bot-detection page — deliberately narrow to avoid false-positives on
// normal site content (loading states, 403 pages, etc.)
const CAPTCHA_TEXT_PATTERNS = [
  /verify you.?re human/i,
  /i.?m not a robot/i,
  /complete the security check/i,
  /enable javascript and cookies to continue/i,
  /checking your browser before accessing/i,
  /human verification/i,
];

// Cloudflare-specific text indicators (only considered alongside a page
// element check to avoid triggering on sites that merely mention Cloudflare)
const CLOUDFLARE_TEXT_PATTERNS = [
  /ray id:/i,
  /one more step\s*please complete the security check/i,
  /ddos protection by cloudflare/i,
];

// DOM elements that strongly indicate a Cloudflare challenge is active
const CLOUDFLARE_ELEMENT_SELECTORS = [
  "iframe[src*='challenges.cloudflare.com']",
  "[id*='cf-please-wait']",
  "[class*='cf-browser-verification']",
  "form#challenge-form",
  "#turnstile-wrapper",
];

// PerimeterX / press-hold detection selectors and frame URL patterns
const PRESS_HOLD_PAGE_SELECTORS = [
  "#px-captcha",
  "[class*='px-captcha']",
  "button:has-text('Press & Hold')",
  "[class*='press-hold']",
  "[class*='pressHold']",
];
const PRESS_HOLD_FRAME_PATTERNS = ["px-cdn.net", "perimeterx", "human.security"];

// reCAPTCHA image-grid challenge frame patterns
const RECAPTCHA_GRID_FRAME_PATTERNS = ["bframe", "recaptcha/api2/bframe", "hcaptcha.com/challenge"];

export async function detectChallenge(page: Page): Promise<ChallengeResult> {
  try {
    // ── 1. Press-and-hold (PerimeterX / Walmart) ──────────────────────────
    for (const sel of PRESS_HOLD_PAGE_SELECTORS) {
      const el = await page.$(sel).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) {
        let screenshot: string | undefined;
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 50 });
          screenshot = "data:image/jpeg;base64," + buf.toString("base64");
        } catch { }
        return { type: "press_hold", attempted: false, screenshot };
      }
    }
    for (const frame of page.frames()) {
      const url = frame.url().toLowerCase();
      if (PRESS_HOLD_FRAME_PATTERNS.some((p) => url.includes(p))) {
        let screenshot: string | undefined;
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 50 });
          screenshot = "data:image/jpeg;base64," + buf.toString("base64");
        } catch { }
        return { type: "press_hold", attempted: false, screenshot };
      }
    }

    // ── 2. reCAPTCHA / hCaptcha image grid (bframe present) ───────────────
    for (const frame of page.frames()) {
      const url = frame.url().toLowerCase();
      if (RECAPTCHA_GRID_FRAME_PATTERNS.some((p) => url.includes(p))) {
        let screenshot: string | undefined;
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 50 });
          screenshot = "data:image/jpeg;base64," + buf.toString("base64");
        } catch { }
        return { type: "recaptcha_grid", attempted: false, screenshot };
      }
    }

    // ── 3. Generic CAPTCHA iframe (checkbox-style) ─────────────────────────
    for (const frame of page.frames()) {
      const url = frame.url().toLowerCase();
      if (CAPTCHA_FRAME_PATTERNS.some((p) => url.includes(p))) {
        const checkbox = await frame.$("input[type='checkbox']").catch(() => null);
        let attempted = false;
        if (checkbox) {
          try {
            await checkbox.click();
            await new Promise((r) => setTimeout(r, 3000));
            attempted = true;
            if (!(await frame.$("input[type='checkbox']").catch(() => null))) {
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

    // ── 4. Cloudflare challenge ────────────────────────────────────────────
    const hasCloudflareText = CLOUDFLARE_TEXT_PATTERNS.some((p) => p.test(bodyText));
    const hasCloudflareElement = hasCloudflareText
      ? (await Promise.all(
          CLOUDFLARE_ELEMENT_SELECTORS.map((sel) => page.$(sel).then((el) => !!el).catch(() => false)),
        )).some(Boolean)
      : false;

    if (hasCloudflareText && hasCloudflareElement) {
      let attempted = false;
      const checkbox = await page.$("input[type='checkbox']").catch(() => null);
      if (checkbox && await checkbox.isVisible().catch(() => false)) {
        try {
          await checkbox.click();
          await new Promise((r) => setTimeout(r, 3000));
          attempted = true;
          if (!(await checkbox.isVisible().catch(() => false))) {
            return { type: "none", attempted: true };
          }
        } catch { }
      }
      let screenshot: string | undefined;
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 50 });
        screenshot = "data:image/jpeg;base64," + buf.toString("base64");
      } catch { }
      return { type: "cloudflare", attempted, screenshot };
    }

    // ── 5. Generic CAPTCHA text patterns ──────────────────────────────────
    for (const pat of CAPTCHA_TEXT_PATTERNS) {
      if (pat.test(bodyText)) {
        let attempted = false;
        const checkbox = await page.$("input[type='checkbox']").catch(() => null);
        if (checkbox && await checkbox.isVisible().catch(() => false)) {
          try {
            await checkbox.click();
            await new Promise((r) => setTimeout(r, 3000));
            attempted = true;
            if (!(await checkbox.isVisible().catch(() => false))) {
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

    return { type: "none", attempted: false };
  } catch {
    return { type: "none", attempted: false };
  }
}
