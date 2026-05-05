import { execSync } from "child_process";
import { existsSync } from "fs";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
];

export interface ProxyConfig {
  host: string;
  port: string;
  username?: string;
  password?: string;
}

export type Browser = import("playwright-core").Browser;
export type BrowserContext = import("playwright-core").BrowserContext;
export type Page = import("playwright-core").Page;

export function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function pickViewport() {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

const STEALTH_SCRIPT = `
  (() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', {
      get: () => { const a = [1,2,3,4,5]; a.item = (i) => a[i]; a.namedItem = () => null; a.refresh = () => {}; return a; }
    });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}), app: {} };
    const origQuery = window.navigator.permissions.query.bind(navigator.permissions);
    window.navigator.permissions.query = (p) =>
      p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, onchange: null })
        : origQuery(p);
    try {
      const getParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(p) {
        if (p === 37445) return 'Intel Inc.';
        if (p === 37446) return 'Intel Iris OpenGL Engine';
        return getParam.call(this, p);
      };
    } catch(_) {}
  })();
`;

async function getChromium() {
  const pw = await import("playwright-core");
  return pw.chromium;
}

function resolveChromiumPathSync(): string | undefined {
  // 1. Explicit env override — highest priority (set by Electron main before API server starts)
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    const p = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    if (existsSync(p)) return p;
  }

  // 2. Platform-specific well-known Chrome/Edge paths (covers packaged Electron — no `which` needed)
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    candidates.push(
      // Chrome (user install)
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
      // Chrome (machine install)
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      // Edge (almost always present on Windows 10+)
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    );
  } else {
    // Linux — use `which` as before
    for (const bin of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
      try {
        const p = execSync(`which ${bin} 2>/dev/null`, { encoding: "utf8" }).trim();
        if (p && existsSync(p)) return p;
      } catch (_) {}
    }
  }
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return undefined;
}

async function resolveChromiumPath(): Promise<string | undefined> {
  // Try sync (env var + system browsers) first
  const fromEnvOrSystem = resolveChromiumPathSync();
  if (fromEnvOrSystem) return fromEnvOrSystem;

  // Fall back to Playwright's own downloaded Chromium (only present if `playwright install chromium` was run)
  try {
    const chromium = await getChromium();
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch (_) {}
  return undefined;
}

export async function createBrowser(proxy?: ProxyConfig | null): Promise<Browser> {
  const headless = process.env.SHOW_BROWSER !== "true";
  const executablePath = await resolveChromiumPath();
  if (!executablePath) {
    throw new Error(
      "Chromium not found. Run `playwright install chromium` or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.",
    );
  }
  const chromium = await getChromium();
  return chromium.launch({
    headless,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
    ...(proxy
      ? {
          proxy: {
            server: `http://${proxy.host}:${proxy.port}`,
            ...(proxy.username ? { username: proxy.username } : {}),
            ...(proxy.password ? { password: proxy.password } : {}),
          },
        }
      : {}),
  });
}

export async function createStealthContext(
  browser: Browser,
  userAgent?: string,
  viewport?: { width: number; height: number },
): Promise<BrowserContext> {
  const ua = userAgent ?? pickUserAgent();
  const vp = viewport ?? pickViewport();
  const context = await browser.newContext({
    userAgent: ua,
    viewport: vp,
    locale: "en-US",
    timezoneId: "America/New_York",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    },
  });
  await context.addInitScript(STEALTH_SCRIPT);
  return context;
}

export async function humanDelay(min = 50, max = 300): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise((r) => setTimeout(r, ms));
}

export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await humanDelay(80, 180);
  await page.fill(selector, "");
  for (const char of text) {
    await page.type(selector, char, { delay: Math.floor(Math.random() * 80) + 30 });
  }
}
