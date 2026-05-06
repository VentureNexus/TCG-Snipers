/**
 * loginRetailer — spins up a stealth browser, signs in to the given retailer,
 * and saves the Playwright storage state (cookies + localStorage) to disk so
 * that subsequent checkout runs skip the login step entirely.
 */
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import { saveSession, clearSession } from "./sessionCache";
import { navigateTo, detectChallenge } from "./visualNavigator";

interface RetailerConfig {
  url: string;
  emailSel: string;
  continueSel?: string;
  /**
   * Optional: after clicking Continue, if this selector appears it must be
   * clicked to select the sign-in method (e.g. Walmart's Password radio button)
   * before the password field becomes visible.
   */
  selectMethodSel?: string;
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
    // Walmart's identity system lives at identity.walmart.com.
    // walmart.com/account/login redirects there automatically.
    // Page 1: "Phone number or email" text input → Continue button
    // Page 2: choose sign-in method (Password radio is default) → password field → Sign in
    url: "https://www.walmart.com/account/login",
    emailSel: [
      // identity.walmart.com uses autocomplete="username" for the phone-or-email field
      "input[autocomplete='username']",
      "input[autocomplete='email']",
      "input[type='email']",
      "input[name='email']",
      "input[name='phoneOrEmail']",
      "#email",
      // generic text fallback — identity.walmart.com renders a plain <input type="text">
      "input[type='text']:not([type='hidden'])",
    ].join(", "),
    continueSel: [
      "button:has-text('Continue')",
      "button[type='submit']:has-text('Continue')",
      "button[data-automation-id='signin-continue-btn']",
    ].join(", "),
    // After Continue, Walmart shows a "Choose a sign in method" page.
    // We must click the Password radio to reveal the password field.
    selectMethodSel: [
      "label:has-text('Password') input[type='radio']",
      "input[type='radio'][value*='password' i]",
      "input[type='radio'][id*='password' i]",
      "[data-testid*='password'] input[type='radio']",
      // If Password is already selected, clicking again is a no-op — safe either way
      "input[type='radio']:last-of-type",
    ].join(", "),
    passwordSel: [
      "input[type='password']",
      "input[name='password']",
      "#password",
      "input[autocomplete='current-password']",
      "input[data-automation-id='password']",
    ].join(", "),
    submitSel: [
      "button:has-text('Sign in')",
      "button:has-text('Sign In')",
      "button[type='submit']",
      "button[data-automation-id='signin-submit-btn']",
    ].join(", "),
    // After successful login identity.walmart.com redirects to walmart.com —
    // the phone-or-email input will be gone.
    failureCheck: [
      "input[autocomplete='username']",
      "input[type='text']:not([type='hidden'])",
      "input[name='phoneOrEmail']",
    ].join(", "),
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
    // Costco's sign-in is behind an Account nav link that opens a slide-out
    // panel — navigating directly to the homepage lets the visual navigator
    // discover and cache that path on first use.
    url: "https://www.costco.com",
    emailSel: "#signInName, input[name='logonId'], input[name='email'], input[type='email']",
    passwordSel: "#logonPassword, input[name='logonPassword'], input[name='password'], input[type='password']",
    submitSel: "button[type='submit'], input[type='submit'], button:has-text('Sign In'), button:has-text('Log In')",
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
    let emailFound = await page.waitForSelector(config.emailSel, { timeout: 15000 }).catch(() => null);

    // ── Visual navigator fallback ─────────────────────────────────────────────
    // If the email field didn't appear, the login form may be hidden behind a
    // navigation step (e.g. Costco's Account → Sign In slide-out panel).
    // Ask the AI vision layer to look at the page and figure out what to click.
    if (!emailFound) {
      const navResult = await navigateTo(
        page,
        retailer,
        "find and reach the login or sign-in form",
        "login",
      ).catch(() => null);

      if (navResult?.success) {
        emailFound = await page.waitForSelector(config.emailSel, { timeout: 10000 }).catch(() => null);
      }

      if (!emailFound) {
        // Visual navigator also failed — ask the user to manually navigate
        // to the login form via the Login Assist popup in the app.
        try {
          const { registerLoginAssist } = await import("../loginAssistManager");
          const currentUrl = page.url();
          const navMsg = navResult ? ` (visual navigator: ${navResult.message})` : "";
          console.log(
            `[login-assist] Email field not found (url: ${currentUrl})${navMsg} — requesting human assistance`,
          );

          const { promise } = registerLoginAssist(page, retailer);
          const outcome = await promise;

          if (outcome === "done") {
            // Re-try finding the email field from wherever the user landed
            emailFound = await page
              .waitForSelector(config.emailSel, { timeout: 8000 })
              .catch(() => null);
          }

          if (!emailFound) {
            const afterUrl = page.url();
            const reason =
              outcome === "giveup"
                ? "User cancelled login assist"
                : outcome === "timeout"
                  ? "Login assist timed out (5 min)"
                  : `Email field still not found after human assist (url: ${afterUrl})`;
            return { success: false, message: reason };
          }
        } catch {
          // loginAssistManager unavailable — fall back to error message
          const currentUrl = page.url();
          return {
            success: false,
            message: `Email field not found on login page (url: ${currentUrl})`,
          };
        }
      }
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

    // ── Step 2: Click Continue (two-step login pages) ────────────────────────
    if (config.continueSel) {
      const continueEl = await page.$(config.continueSel);
      if (continueEl) {
        await continueEl.click();
      } else {
        // Fallback: press Enter — works for any submit-on-enter email form
        const emailEl = await page.$(config.emailSel);
        if (emailEl) await emailEl.press("Enter");
      }
      await humanDelay(1200, 2000);

      // ── Step 2b: Select sign-in method (e.g. Walmart Password radio) ───────
      // Some retailers show a "choose how to sign in" page between the email
      // and password steps.  We wait briefly for the method selector, click it
      // if present, then proceed to wait for the password field.
      if (config.selectMethodSel) {
        const methodEl = await page
          .waitForSelector(config.selectMethodSel, { timeout: 6000 })
          .catch(() => null);
        if (methodEl) {
          await methodEl.click();
          await humanDelay(600, 1200);
        }
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
      await humanDelay(600, 1000);
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

    // ── CAPTCHA / bot-detection check after submit ────────────────────────────
    const challenge = await detectChallenge(page).catch(() => null);
    if (challenge && challenge.type !== "none") {
      clearSession(retailer, email);
      const challengeLabel = challenge.type === "cloudflare" ? "Cloudflare bot detection" : "CAPTCHA";
      return {
        success: false,
        message: `Login blocked by ${challengeLabel}${challenge.attempted ? " (auto-click attempted)" : ""} — complete verification manually then retry`,
      };
    }

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
