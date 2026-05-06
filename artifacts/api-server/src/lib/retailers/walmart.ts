import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { smartClick } from "../checkoutLearner";
import { imapFetchCode } from "../imap";
import { emitScreenshot } from "./screenshotUtil";
import { saveSession, loadSession, clearSession } from "./sessionCache";
import { handleChallengeInTask, navigateTo, waitForSelectorWithVisualFallback } from "./visualNavigator";

const RETAILER = "Walmart";

export async function runWalmart(ctx: RetailerContext): Promise<RetailerResult> {
  const { task, profile, card, proxy, token, log, setStatus, setRetryProgress, retailerAccount } = ctx;
  let browser: Browser | null = null;

  const fail = (msg: string): RetailerResult => ({
    success: false,
    productName: task.productUrl || task.productKeywords || "Unknown Product",
    productImage: "",
    price: null,
    orderNumber: "",
    errorMessage: msg,
  });

  const loginEmail = retailerAccount?.email ?? profile?.email ?? "";
  let anyVisualAssist = false;

  try {
    // ── Session cache ────────────────────────────────────────────────────────
    const cachedSession = loginEmail ? loadSession(RETAILER, loginEmail) : null;
    if (cachedSession && loginEmail) {
      log("INFO", `[${RETAILER}] Restoring saved session for ${loginEmail}...`);
    }

    log("INFO", `[${RETAILER}] Launching stealth browser...`);
    browser = await createBrowser(proxy);
    const context = await createStealthContext(browser, {
      storageState: cachedSession ?? undefined,
    });
    const page = await context.newPage();
    await page.setDefaultNavigationTimeout(30000);

    const screenshot = async () => emitScreenshot(task.id, page);

    const targetUrl = task.productUrl ||
      `https://www.walmart.com/search?q=${encodeURIComponent(task.productKeywords ?? "")}`;

    await setStatus("monitoring");
    let inStock = false;
    let buyNowAvailable = false;
    let productName = task.productUrl || task.productKeywords || "Walmart Product";
    let productPrice = "";
    let productImage = "";

    const isUnlimited = task.retryCount === -1;
    const stopAt = isUnlimited && task.stopAfterMs != null ? Date.now() + task.stopAfterMs : null;
    if (stopAt !== null) {
      const hrs = (task.stopAfterMs! / 3_600_000).toFixed(1);
      log("INFO", `[${RETAILER}] Time limit active — will stop after ${hrs}h if nothing is found.`);
    }

    for (let attempt = 0; isUnlimited || attempt <= task.retryCount; attempt++) {
      if (token.cancelled) return fail("Task cancelled");
      if (stopAt !== null && Date.now() >= stopAt) return fail("Time limit reached — task timed out");
      if (attempt > 0) {
        setRetryProgress(attempt, isUnlimited ? null : task.retryCount);
        const delayMax = task.monitorDelayMax ?? task.monitorDelay + 500;
        log("WARN", `[${RETAILER}] OOS — waiting ${task.monitorDelay}–${delayMax}ms before retry ${attempt}/${isUnlimited ? "∞" : task.retryCount}...`);
        await humanDelay(task.monitorDelay, delayMax);
      }
      try {
        log("INFO", `[${RETAILER}] Checking stock: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
        await humanDelay(800, 1500);
        await screenshot();
        if (token.cancelled) return fail("Task cancelled");

        const captchaMsg = await handleChallengeInTask(page, task.id, RETAILER, log, setStatus);
        if (captchaMsg) return { ...fail(captchaMsg), captchaPaused: true };

        const titleEl = await page.$('[itemprop="name"], h1.prod-ProductTitle, h1');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('[itemprop="price"], [class*="price-characteristic"], [class*="Price"]');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        if (!productImage) {
          productImage = await page.$eval('meta[property="og:image"]', el => el.getAttribute("content") ?? "").catch(() => "");
        }

        const buyNowBtn = await page.$(
          'button[data-automation-id="buy-now"]:not([disabled]), a[link-identifier="buyNow"]:not([disabled])'
        );
        const atcBtn = await page.$(
          'button[data-automation-id="add-to-cart"]:not([disabled]), button:has-text("Add to cart"):not([disabled])'
        );
        const purchaseBtn = buyNowBtn ?? atcBtn;

        if (purchaseBtn) {
          if (task.maxPrice != null && productPrice) {
            const priceCents = Math.round(parseFloat(productPrice) * 100);
            if (Number.isFinite(priceCents) && priceCents > task.maxPrice) {
              log("WARN", `[${RETAILER}] Price $${productPrice} exceeds limit $${(task.maxPrice / 100).toFixed(2)} — waiting...`);
              continue;
            }
          }
          buyNowAvailable = !!buyNowBtn;
          log("SUCCESS", `[${RETAILER}] In stock${buyNowAvailable ? " (Buy Now available)" : ""}: ${productName}${productPrice ? " @ $" + productPrice : ""}`);
          inStock = true;
          break;
        }
        log("WARN", `[${RETAILER}] Product not available for purchase`);
      } catch (err) {
        log("WARN", `[${RETAILER}] Navigation error: ${String(err)}`);
      }
    }

    if (!inStock) return fail("Product out of stock after all retries");
    if (token.cancelled) return fail("Task cancelled");

    if (buyNowAvailable) {
      // ── Buy Now path ──────────────────────────────────────────────────────
      log("INFO", `[${RETAILER}] Clicking Buy Now — skipping cart...`);
      await setStatus("checking_out");
      await screenshot();
      const clicked = await smartClick(page, RETAILER, "buy_now", [
        "button[data-automation-id='buy-now']:not([disabled])",
        "a[link-identifier='buyNow']:not([disabled])",
      ]);
      if (!clicked) {
        log("WARN", `[${RETAILER}] Buy Now click failed — falling back to ATC`);
        buyNowAvailable = false;
      } else {
        await humanDelay(2000, 3000);
        await screenshot();
      }
    }

    if (!buyNowAvailable) {
      // ── Add to Cart path ─────────────────────────────────────────────────
      await setStatus("adding_to_cart");
      log("INFO", `[${RETAILER}] Adding to cart...`);
      await screenshot();
      const atcClicked = await smartClick(page, RETAILER, "atc", [
        "button[data-automation-id='add-to-cart']:not([disabled])",
        "button:has-text('Add to cart'):not([disabled])",
        "button[data-automation-id='add-to-cart']",
      ]);
      if (!atcClicked) return fail("Could not click Add to Cart button");
      await humanDelay(1500, 2500);
      await screenshot();

      log("INFO", `[${RETAILER}] Navigating to cart...`);
      await page.goto("https://www.walmart.com/cart", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await screenshot();
      log("INFO", `[${RETAILER}] Cart URL: ${page.url()}`);
      if (token.cancelled) return fail("Task cancelled");
      const cartCaptchaMsg = await handleChallengeInTask(page, task.id, RETAILER, log, setStatus);
      if (cartCaptchaMsg) return { ...fail(cartCaptchaMsg), captchaPaused: true };

      const effectiveQty = await applyCartQuantity(page, task.quantity, log);
      log("INFO", `[${RETAILER}] Cart quantity: ${effectiveQty}`);

      // ── Sign-in from cart if session invalid ─────────────────────────────
      const cartSignIn = await page.$('input[name="email"], input[type="email"]');
      const cartLoginIdentity = retailerAccount ?? (profile ? { email: profile.email, password: null } : null);
      if (cartSignIn && cartLoginIdentity) {
        if (cachedSession && loginEmail) {
          log("WARN", `[${RETAILER}] Cached session expired — re-authenticating as ${loginEmail}...`);
          clearSession(RETAILER, loginEmail);
        } else {
          log("INFO", `[${RETAILER}] Sign-in required on cart page — logging in as ${loginEmail}...`);
        }
        await _walmartLogin(page, loginEmail, retailerAccount?.password ?? null, ctx, log, screenshot);
        if (loginEmail) {
          saveSession(RETAILER, loginEmail, await context.storageState());
          log("INFO", `[${RETAILER}] Session cached for ${loginEmail}`);
        }
        await humanDelay(1500, 2500);
        await screenshot();
        if (token.cancelled) return fail("Task cancelled");
      }

      // ── Find checkout button ─────────────────────────────────────────────
      log("INFO", `[${RETAILER}] Proceeding to checkout...`);
      await setStatus("checking_out");

      // Scroll to bottom — checkout button may be below fold
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await humanDelay(500, 1000);
      await screenshot();

      const checkoutSelectors = [
        "button[data-automation-id='cart-checkout-btn']",
        "button:has-text('Continue to checkout')",
        "button:has-text('Check out')",
        "button:has-text('Checkout')",
        "a:has-text('Checkout')",
        "[class*='checkout-btn']:is(button,a):not([disabled])",
        "[class*='checkoutBtn']:is(button,a):not([disabled])",
        "button[class*='checkout']:not([disabled])",
        "a[href*='/checkout']:not([href*='help']):not([href*='account']):not([href*='returns'])",
      ];

      // Wait up to 8 seconds for checkout button to appear
      try {
        await page.waitForSelector(checkoutSelectors.join(", "), { timeout: 8000 });
      } catch (_) {
        log("WARN", `[${RETAILER}] Checkout button not found — asking visual navigator for help...`);
        await screenshot();
        const { el: visEl, visualAssist } = await waitForSelectorWithVisualFallback(
          page,
          checkoutSelectors.join(", "),
          RETAILER,
          "find and click the Checkout button in the Walmart cart",
          "checkout_btn",
          log,
        );
        if (!visEl) {
          // Final fallback: direct URL navigation
          log("WARN", `[${RETAILER}] Visual navigator could not find checkout button — navigating directly to /checkout...`);
          await page.goto("https://www.walmart.com/checkout", { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          await screenshot();
          log("INFO", `[${RETAILER}] Direct checkout URL: ${page.url()}`);
          if (token.cancelled) return fail("Task cancelled");
        } else {
          if (visualAssist) { log("INFO", `[${RETAILER}] Visual navigator located checkout button`); anyVisualAssist = true; }
          await visEl.click().catch(() => {});
          await humanDelay(1500, 2500);
          await screenshot();
        }
      }

      const checkoutClicked = await smartClick(page, RETAILER, "checkout_btn", checkoutSelectors);
      if (!checkoutClicked && !page.url().includes("/checkout")) {
        return fail("Checkout button not found and direct navigation failed");
      }
      if (checkoutClicked) {
        await humanDelay(2000, 3000);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await screenshot();
      }
      if (token.cancelled) return fail("Task cancelled");
    }

    // ── Sign-in on checkout page (if not already done) ─────────────────────
    const walmartSignInEmail = await page.$('input[name="email"], input[type="email"], input[id*="email"]');
    const walmartLoginIdentity = retailerAccount ?? (profile ? { email: profile.email, password: null } : null);
    if (walmartSignInEmail && walmartLoginIdentity) {
      log("INFO", `[${RETAILER}] Sign-in on checkout — logging in as ${loginEmail}...`);
      await screenshot();
      await _walmartLogin(page, loginEmail, retailerAccount?.password ?? null, ctx, log, screenshot);
      if (loginEmail) {
        saveSession(RETAILER, loginEmail, await context.storageState());
        log("INFO", `[${RETAILER}] Session cached for ${loginEmail}`);
      }
      await humanDelay(1500, 2500);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await screenshot();
      if (token.cancelled) return fail("Task cancelled");
    } else if (walmartSignInEmail && !walmartLoginIdentity) {
      return fail("Walmart requires sign-in but no profile or account is assigned");
    }

    log("INFO", `[${RETAILER}] Checkout URL: ${page.url()}`);

    // ── Shipping address (skip if saved) ──────────────────────────────────
    const hasAddressForm = await page.$('input[name="addressLineOne"], input[id*="address-1"], input[name="firstName"]');
    if (hasAddressForm && profile) {
      log("INFO", `[${RETAILER}] Filling shipping for profile: ${profile.name}`);
      await screenshot();
      const addrFields: Array<[string, string]> = [
        ['input[name="firstName"], input[id*="first-name"]', profile.shipFirstName || profile.name],
        ['input[name="lastName"], input[id*="last-name"]', profile.shipLastName || ""],
        ['input[name="addressLineOne"], input[id*="address-1"]', profile.shipAddress1],
        ['input[name="city"], input[id*="city"]', profile.shipCity],
        ['input[name="state"], input[id*="state"]', profile.shipState],
        ['input[name="postalCode"], input[id*="zip"]', profile.shipZip],
        ['input[name="phone"], input[id*="phone"]', profile.phone],
      ];
      for (const [sel, val] of addrFields) {
        if (!val) continue;
        try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
      }
      await screenshot();
      const continueBtn = await page.$('button:has-text("Continue"), button:has-text("Save & Continue")');
      if (continueBtn) { await continueBtn.click(); await humanDelay(2000, 3000); }
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await screenshot();
      if (token.cancelled) return fail("Task cancelled");
    } else if (!hasAddressForm) {
      log("INFO", `[${RETAILER}] Saved address on file — skipping address entry`);
    }

    // ── Payment (skip if saved) ───────────────────────────────────────────
    const hasPaymentForm = await page.$('input[name="cardNumber"], input[id*="card-number"]');
    if (hasPaymentForm && card) {
      log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
      await screenshot();
      try {
        const cardNumber = decrypt(card.encryptedNumber);
        const cvv = decrypt(card.encryptedCvv);
        for (const [sel, val] of [
          ['input[name="cardNumber"], input[id*="card-number"]', cardNumber],
          ['input[name="expirationMonth"]', card.expiryMonth],
          ['input[name="expirationYear"]', card.expiryYear],
          ['input[name="cvv"], input[name="cvc"]', cvv],
        ] as Array<[string, string]>) {
          try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
        }
        await screenshot();
      } catch (decryptErr) {
        log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
      }
    } else if (!hasPaymentForm) {
      log("INFO", `[${RETAILER}] Saved payment method on file — skipping card entry`);
    } else {
      log("WARN", `[${RETAILER}] No credit card provided — skipping payment step`);
    }

    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await humanDelay(500, 1000);
    await screenshot();
    log("INFO", `[${RETAILER}] Submitting order... (page: ${page.url()})`);

    const placeOrderClicked = await smartClick(page, RETAILER, "place_order", [
      "button:has-text('Place Order')",
      "button:has-text('Place order')",
      "[data-automation-id='place-order-btn']",
      "button:has-text('Submit order')",
      "button:has-text('Complete purchase')",
    ]);
    if (!placeOrderClicked) {
      const { el: poEl, visualAssist: poVisualAssist } = await waitForSelectorWithVisualFallback(
        page,
        'button:has-text("Place Order"), button:has-text("Place order"), [data-automation-id="place-order-btn"]',
        RETAILER,
        "find and click the Place Order button to complete the Walmart purchase",
        "place_order",
        log,
      );
      if (!poEl) return fail("Place order button not found");
      if (poVisualAssist) anyVisualAssist = true;
      await poEl.click();
    }
    await humanDelay(3000, 5000);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await screenshot();

    const confirmation = await page.$(
      '[class*="confirmation"], h1:has-text("Thank you"), h1:has-text("Order Confirmed"), h2:has-text("Your order")'
    );
    if (!confirmation) return fail("Order confirmation not detected");

    if (loginEmail) saveSession(RETAILER, loginEmail, await context.storageState());

    const orderNumber = `WMT-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "", ...(anyVisualAssist ? { visualAssist: true } : {}) };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function _walmartLogin(
  page: import("playwright-core").Page,
  email: string,
  password: string | null,
  ctx: RetailerContext,
  log: RetailerContext["log"],
  screenshot: () => Promise<void>,
): Promise<void> {
  try { await humanType(page, 'input[name="email"], input[type="email"]', email); } catch (_) {}
  await screenshot();
  await humanDelay(300, 600);

  const signInContinue = await page.$('button:has-text("Continue"), button:has-text("Sign in"), button[type="submit"], input[type="submit"]');
  if (signInContinue) { await signInContinue.click(); await humanDelay(2000, 3000); }
  await screenshot();

  const passwordField = await page.$('input[name="password"], input[type="password"]');
  if (passwordField && password) {
    log("INFO", `[Walmart] Password prompt — entering credentials...`);
    try { await humanType(page, 'input[name="password"], input[type="password"]', password); } catch (_) {}
    await screenshot();
    await humanDelay(300, 600);
    const submitBtn = await page.$('button[type="submit"], button:has-text("Sign in"), button:has-text("Continue")');
    if (submitBtn) { await submitBtn.click(); await humanDelay(2000, 3000); }
    await screenshot();
  } else {
    // OTP path
    const otpField = await page.$('input[name="code"], input[name="otpCode"], input[placeholder*="code" i], input[aria-label*="code" i]');
    const walmartImapConfig = ctx.profile?.imapHost
      ? { host: ctx.profile.imapHost, port: parseInt(ctx.profile.imapPort, 10), user: ctx.profile.imapUser, password: ctx.profile.imapPassword }
      : ctx.globalImapConfig;
    if (otpField && walmartImapConfig) {
      log("INFO", `[Walmart] OTP prompt — fetching code from IMAP...`);
      await screenshot();
      const code = await imapFetchCode(walmartImapConfig, /walmart|verification|sign.?in|code/i, 30000);
      if (code) {
        log("SUCCESS", `[Walmart] OTP code retrieved`);
        await humanType(page, 'input[name="code"], input[name="otpCode"]', code);
        await screenshot();
        await humanDelay(300, 600);
        const submitOtp = await page.$('button[type="submit"], button:has-text("Verify"), button:has-text("Continue")');
        if (submitOtp) { await submitOtp.click(); await humanDelay(2000, 3000); }
        await screenshot();
      } else {
        log("WARN", `[Walmart] OTP code not found in IMAP — continuing anyway`);
      }
    }
  }
}
