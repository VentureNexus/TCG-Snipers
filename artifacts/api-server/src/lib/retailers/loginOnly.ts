/**
 * loginRetailer — spins up a stealth browser, signs in to the given retailer,
 * and saves the Playwright storage state (cookies + localStorage) to disk so
 * that subsequent checkout runs skip the login step entirely.
 */
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import { saveSession, clearSession } from "./sessionCache";

interface RetailerConfig {
  url: string;
  emailSel: string;
  continueSel?: string;
  passwordSel: string;
  submitSel: string;
  /** Selector that should be ABSENT after a successful login */
  failureCheck: string;
}

const CONFIGS: Record<string, RetailerConfig> = {
  Amazon: {
    url: "https://www.amazon.com/ap/signin?openid.pape.max_auth_age=900&openid.return_to=https%3A%2F%2Fwww.amazon.com%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=usflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0",
    emailSel: "#ap_email, input[name='email']",
    continueSel: "#continue",
    passwordSel: "#ap_password, input[name='password']",
    submitSel: "#signInSubmit, input[type='submit']",
    failureCheck: "#ap_email, input[name='email']",
  },
  Walmart: {
    // creator.walmart.com uses the same Walmart ID / SSO but has a simpler,
    // less bot-detected login form.  The resulting session cookies are shared
    // with walmart.com so checkout works normally after login.
    url: "https://creator.walmart.com/account/login",
    emailSel: [
      "input[type='email']",
      "input[name='email']",
      "#email",
      "input[autocomplete='email']",
      "input[placeholder*='email' i]",
      "input[data-automation-id='email']",
    ].join(", "),
    continueSel: [
      "button:has-text('Continue')",
      "button:has-text('Next')",
      "button[type='submit']:has-text('Continue')",
      "button[data-automation-id='signin-continue-btn']",
    ].join(", "),
    passwordSel: [
      "input[type='password']",
      "input[name='password']",
      "#password",
      "input[autocomplete='current-password']",
      "input[data-automation-id='password']",
    ].join(", "),
    submitSel: [
      "button[type='submit']",
      "button:has-text('Sign in')",
      "button:has-text('Sign In')",
      "button:has-text('Log in')",
      "button[data-automation-id='signin-submit-btn']",
    ].join(", "),
    failureCheck: "input[type='email'], input[name='email'], input[data-automation-id='email']",
  },
  "Best Buy": {
    url: "https://www.bestbuy.com/identity/global/signin",
    emailSel: "#fld-e",
    continueSel: "button.cia-form__controls__btn",
    passwordSel: "#fld-p1",
    submitSel: "button.cia-form__controls__btn",
    failureCheck: "#fld-e",
  },
  Target: {
    url: "https://www.target.com/account",
    emailSel: "#username",
    continueSel: "button:has-text('Continue')",
    passwordSel: "#password",
    submitSel: "button:has-text('Sign in'), button[type='submit']",
    failureCheck: "#username, #password",
  },
  Costco: {
    url: "https://www.costco.com/LogonForm",
    emailSel: "#signInName, input[name='logonId']",
    passwordSel: "#logonPassword, input[name='logonPassword']",
    submitSel: "button[type='submit'], input[type='submit']",
    failureCheck: "#signInName, input[name='logonId']",
  },
  "Sam's Club": {
    url: "https://www.samsclub.com/account/sign-in",
    emailSel: "input[name='email'], input[type='email']",
    continueSel: "button:has-text('Continue')",
    passwordSel: "input[name='password'], input[type='password']",
    submitSel: "button[type='submit']:has-text('Sign in'), button:has-text('Sign in')",
    failureCheck: "input[name='email'], input[type='email']",
  },
  "Pokemon Center": {
    url: "https://www.pokemoncenter.com/account/login",
    emailSel: "input[name='email'], input[type='email']",
    passwordSel: "input[name='password'], input[type='password']",
    submitSel: "button[type='submit'], button:has-text('Sign in'), button:has-text('Log in')",
    failureCheck: "input[name='email'], input[type='email']",
  },
};

/** Click any unchecked "Keep me signed in" / "Remember me" checkbox on the page. */
async function tickKeepSignedIn(page: import("playwright-core").Page): Promise<void> {
  const KEEP_SIGNED_IN_SEL = [
    "input[type='checkbox'][name*='remember' i]",
    "input[type='checkbox'][name*='keep' i]",
    "input[type='checkbox'][id*='remember' i]",
    "input[type='checkbox'][id*='keep' i]",
    "input[type='checkbox'][id*='staySignedIn' i]",
    "input[type='checkbox'][id*='stay-signed' i]",
    "#rememberMe",
    "#remember",
    "#keepSignedIn",
    "#staySignedIn",
    "input[data-automation-id*='remember' i]",
    "input[data-automation-id*='keep' i]",
    // label-wrapped checkboxes
    "label:has-text('Keep me signed in') input[type='checkbox']",
    "label:has-text('Remember me') input[type='checkbox']",
    "label:has-text('Stay signed in') input[type='checkbox']",
    "label:has-text('Keep me logged in') input[type='checkbox']",
  ].join(", ");

  try {
    const checkbox = await page.$(KEEP_SIGNED_IN_SEL);
    if (checkbox) {
      const checked = await checkbox.isChecked().catch(() => false);
      if (!checked) await checkbox.check();
    }
  } catch (_) {
    // non-fatal — not all sites have this checkbox
  }
}

export interface LoginResult {
  success: boolean;
  message: string;
}

export async function loginRetailer(
  retailer: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  const config = CONFIGS[retailer];
  if (!config) {
    return { success: false, message: `Unsupported retailer: ${retailer}` };
  }

  const browser = await createBrowser(null);
  try {
    const context = await createStealthContext(browser);
    const page = await context.newPage();
    await page.setDefaultNavigationTimeout(30000);

    await page.goto(config.url, { waitUntil: "domcontentloaded" });

    // Wait for the email field to be rendered (JS-heavy pages like Walmart need this)
    const emailFound = await page.waitForSelector(config.emailSel, { timeout: 15000 }).catch(() => null);
    if (!emailFound) {
      const currentUrl = page.url();
      return { success: false, message: `Email field not found on login page (url: ${currentUrl}) — page may have changed or requires cookie consent` };
    }
    await humanDelay(800, 1500);

    // Tick "Keep me signed in" if present on email page
    await tickKeepSignedIn(page);

    // Fill email
    try {
      await humanType(page, config.emailSel, email);
    } catch (e) {
      return { success: false, message: `Could not type into email field: ${String(e)}` };
    }
    await humanDelay(300, 600);

    // ── Step 2: Click Continue (two-step login pages like creator.walmart.com) ─
    if (config.continueSel) {
      const continueEl = await page.$(config.continueSel);
      if (continueEl) {
        await continueEl.click();
      } else {
        // Fallback: press Enter — works for any submit-on-enter email form
        const emailEl = await page.$(config.emailSel);
        if (emailEl) await emailEl.press("Enter");
      }
      // Wait up to 12 s for the password field to appear after page transition
      const pwAppeared = await page
        .waitForSelector(config.passwordSel, { timeout: 12000 })
        .catch(() => null);
      if (!pwAppeared) {
        const currentUrl = page.url();
        const snippet = (await page.textContent("body").catch(() => ""))?.slice(0, 300) ?? "";
        return {
          success: false,
          message: `Password field did not appear after Continue (url: ${currentUrl}) — ${snippet}`,
        };
      }
      await humanDelay(800, 1400);
    }

    // ── Step 3: Fill password ─────────────────────────────────────────────────
    // Tick "Keep me signed in" if it appears on the password page
    await tickKeepSignedIn(page);

    const passwordVisible = await page.$(config.passwordSel);
    if (!passwordVisible) {
      return { success: false, message: "Password field not found — login page may have changed or requires 2FA" };
    }
    try {
      await humanType(page, config.passwordSel, password);
    } catch {
      return { success: false, message: "Could not fill password field" };
    }
    await humanDelay(300, 600);

    // ── Step 4: Submit (Sign in) ──────────────────────────────────────────────
    const submitEl = await page.$(config.submitSel);
    if (submitEl) {
      await submitEl.click();
    } else {
      // Fallback: press Enter on the password field
      const pwEl = await page.$(config.passwordSel);
      if (pwEl) await pwEl.press("Enter");
    }

    // Wait for navigation and network to settle
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await humanDelay(1000, 2000);

    // Check if we're still on the login page
    const stillOnLogin = await page.$(config.failureCheck);
    if (stillOnLogin) {
      clearSession(retailer, email);
      // Check for OTP/captcha hints
      const pageText = await page.textContent("body").catch(() => "");
      if (/otp|one.time|verification|captcha|verify|code/i.test(pageText ?? "")) {
        return { success: false, message: "Login requires OTP or CAPTCHA — complete sign-in manually first" };
      }
      return { success: false, message: "Sign-in failed — check your email and password" };
    }

    // Success — save session
    const storageState = await context.storageState();
    saveSession(retailer, email, storageState);
    await context.close().catch(() => {});
    return { success: true, message: `Signed in as ${email} — session cached` };
  } finally {
    await browser.close().catch(() => {});
  }
}
