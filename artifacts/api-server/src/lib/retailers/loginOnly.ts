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
    url: "https://www.walmart.com/account/login",
    emailSel: "input[name='email'], input[type='email']",
    continueSel: "button:has-text('Continue'), button[type='submit']",
    passwordSel: "input[name='password'], input[type='password']",
    submitSel: "button[type='submit']:not(:has-text('Continue')), button:has-text('Sign in')",
    failureCheck: "input[name='email'], input[type='email']",
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
    await humanDelay(1500, 2500);

    // Fill email
    try {
      await humanType(page, config.emailSel, email);
    } catch {
      return { success: false, message: "Email field not found on login page" };
    }
    await humanDelay(300, 600);

    // Click Continue if two-step login
    if (config.continueSel) {
      const continueEl = await page.$(config.continueSel);
      if (continueEl) {
        await continueEl.click();
        await humanDelay(1500, 2500);
        // Wait for password field to appear
        await page.waitForSelector(config.passwordSel, { timeout: 8000 }).catch(() => {});
      }
    }

    // Fill password
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

    // Submit
    const submitEl = await page.$(config.submitSel);
    if (!submitEl) {
      return { success: false, message: "Submit button not found" };
    }
    await submitEl.click();

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
