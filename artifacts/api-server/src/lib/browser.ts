import { execSync } from "child_process";
import { existsSync } from "fs";

// Keep versions current — Akamai cross-checks UA version against actual browser capabilities.
// Each entry: [userAgent, Sec-CH-UA header, Sec-CH-UA-Platform]
const UA_PROFILES: Array<{ ua: string; chUa: string; platform: string }> = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    chUa: '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    platform: "Windows",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    chUa: '"Chromium";v="135", "Google Chrome";v="135", "Not.A/Brand";v="99"',
    platform: "Windows",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    chUa: '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    platform: "macOS",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    chUa: '"Chromium";v="135", "Google Chrome";v="135", "Not.A/Brand";v="99"',
    platform: "macOS",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    chUa: '"Chromium";v="134", "Google Chrome";v="134", "Not.A/Brand";v="99"',
    platform: "Windows",
  },
];

// Legacy flat list kept for pickUserAgent() callers
const USER_AGENTS = UA_PROFILES.map((p) => p.ua);

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

export function pickUAProfile(): { ua: string; chUa: string; platform: string } {
  return UA_PROFILES[Math.floor(Math.random() * UA_PROFILES.length)];
}

export function pickViewport() {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

function buildStealthScript(platform: string): string {
  const win32 = platform === "Windows";
  return `
  (() => {
    // --- webdriver ---
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // --- plugins (Akamai checks plugin count) ---
    const fakePlugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
    ];
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = Object.assign(fakePlugins, {
          item: (i) => fakePlugins[i] ?? null,
          namedItem: (n) => fakePlugins.find(p => p.name === n) ?? null,
          refresh: () => {},
        });
        return arr;
      },
    });

    // --- language / platform ---
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => '${win32 ? "Win32" : "MacIntel"}' });

    // --- chrome object (Akamai checks for runtime.connect, etc.) ---
    window.chrome = {
      app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
      runtime: {
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
        OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        connect: () => {},
        sendMessage: () => {},
      },
      loadTimes: () => ({
        requestTime: Date.now() / 1000 - Math.random() * 2,
        startLoadTime: Date.now() / 1000 - Math.random(),
        commitLoadTime: Date.now() / 1000 - Math.random() * 0.5,
        finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 0.1,
        finishLoadTime: Date.now() / 1000,
        firstPaintTime: Date.now() / 1000 - Math.random() * 0.3,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'h2',
      }),
      csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: Math.random() * 5000, tran: 15 }),
    };

    // --- permissions (Akamai checks notifications permission path) ---
    const origQuery = window.navigator.permissions.query.bind(navigator.permissions);
    window.navigator.permissions.query = (p) =>
      p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, onchange: null })
        : origQuery(p);

    // --- WebGL vendor/renderer (Akamai fingerprints GPU strings) ---
    try {
      const getParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(p) {
        if (p === 37445) return 'Google Inc. (Intel)';
        if (p === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return getParam.call(this, p);
      };
    } catch(_) {}

    // --- Prevent Akamai sensor detection of automation timing ---
    const origNow = Date.now;
    Date.now = () => origNow() + Math.floor(Math.random() * 3);

    // --- Hide automation in error stacks ---
    const origErr = Error;
    window.Error = function(...args) {
      const e = new origErr(...args);
      if (e.stack) e.stack = e.stack.replace(/puppeteer|playwright|webdriver/gi, 'chrome');
      return e;
    };
    Object.assign(window.Error, origErr);
  })();
`;
}

async function getChromium() {
  const pw = await import("playwright-core");
  return pw.chromium;
}

function resolveChromiumPathSync(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    const p = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    if (existsSync(p)) return p;
  }

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    candidates.push(
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
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
  const fromEnvOrSystem = resolveChromiumPathSync();
  if (fromEnvOrSystem) return fromEnvOrSystem;
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

export interface StealthContextOptions {
  storageState?: import("playwright-core").BrowserContextOptions["storageState"];
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export async function createStealthContext(
  browser: Browser,
  options?: StealthContextOptions,
): Promise<BrowserContext> {
  // Pick a full UA profile so the Client Hints headers match the user-agent string.
  // Akamai validates that Sec-CH-UA version == the UA string version.
  const profile = options?.userAgent
    ? UA_PROFILES.find((p) => p.ua === options.userAgent) ?? pickUAProfile()
    : pickUAProfile();
  const ua = profile.ua;
  const vp = options?.viewport ?? pickViewport();
  const context = await browser.newContext({
    userAgent: ua,
    viewport: vp,
    locale: "en-US",
    timezoneId: "America/New_York",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      // Client Hints — must match the UA string version or Akamai flags it
      "Sec-CH-UA": profile.chUa,
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": `"${profile.platform}"`,
    },
    ...(options?.storageState ? { storageState: options.storageState } : {}),
  });
  await context.addInitScript(buildStealthScript(profile.platform));
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
