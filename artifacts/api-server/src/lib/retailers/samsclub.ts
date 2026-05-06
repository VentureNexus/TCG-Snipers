import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { emitScreenshot } from "./screenshotUtil";
import { saveSession, loadSession, clearSession } from "./sessionCache";
import { handleChallengeInTask, waitForSelectorWithVisualFallback } from "./visualNavigator";

const RETAILER = "Sam's Club";

export async function runSamsClub(ctx: RetailerContext): Promise<RetailerResult> {
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

  const screenshot = async (page: Parameters<typeof emitScreenshot>[1]) =>
    emitScreenshot(task.id, page);

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

    if (profile?.samsMembershipId) {
      log("INFO", `[${RETAILER}] Membership ID on file: ****${profile.samsMembershipId.slice(-4)}`);
    } else {
      log("WARN", `[${RETAILER}] No Sam's Club membership ID in profile — checkout may fail`);
    }

    const targetUrl = task.productUrl ||
      `https://www.samsclub.com/search?q=${encodeURIComponent(task.productKeywords)}`;

    await setStatus("monitoring");
    let inStock = false;
    let productName = task.productUrl || task.productKeywords || "Sam's Club Product";
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
        if (token.cancelled) return fail("Task cancelled");

        const captchaMsg = await handleChallengeInTask(page, task.id, RETAILER, log, setStatus);
        if (captchaMsg) return { ...fail(captchaMsg), captchaPaused: true };

        const signInBtn = await page.$('a[href*="login"], button:has-text("Sign In"), a:has-text("Sign in")');
        const samLoginIdentity = retailerAccount ?? (profile ? { email: profile.email, password: null } : null);
        if (signInBtn && samLoginIdentity) {
          if (cachedSession && loginEmail) {
            log("WARN", `[${RETAILER}] Cached session expired — re-authenticating as ${loginEmail}...`);
            clearSession(RETAILER, loginEmail);
          } else {
            log("INFO", `[${RETAILER}] Sign-in prompt detected — logging in...`);
          }
          await signInBtn.click();
          await humanDelay(1200, 2000);
          await screenshot(page);
          try {
            await humanType(page, 'input[name="email"], input[id*="email"]', samLoginIdentity.email);
            await humanDelay(300, 600);
            const nextBtn = await page.$('button:has-text("Continue"), button:has-text("Next")');
            if (nextBtn) { await nextBtn.click(); await humanDelay(800, 1400); }
            await screenshot(page);
            if (retailerAccount?.password) {
              try { await humanType(page, 'input[name="password"], input[type="password"]', retailerAccount.password); } catch (_) {}
              await humanDelay(200, 400);
            }
            const loginBtn = await page.$('button:has-text("Sign In"), button[type="submit"]');
            if (loginBtn) { await loginBtn.click(); await humanDelay(2000, 3000); }
            await screenshot(page);

            // Save session after login
            if (loginEmail) {
              saveSession(RETAILER, loginEmail, await context.storageState());
              log("INFO", `[${RETAILER}] Session cached for ${loginEmail}`);
            }
          } catch (_) {}
        }

        const titleEl = await page.$('h1[data-automation="product-title"], h1.sc-product-title, h1');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('[data-automation="product-price"] span, .sc-product-price');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        if (!productImage) {
          productImage = await page.$eval('meta[property="og:image"]', el => el.getAttribute("content") ?? "").catch(() => "");
        }

        const atcBtn = await page.$(
          'button[data-automation="add-to-cart"]:not([disabled]), button:has-text("Add to cart"):not([disabled])'
        );
        if (atcBtn) {
          if (task.maxPrice != null && productPrice) {
            const priceCents = Math.round(parseFloat(productPrice) * 100);
            if (Number.isFinite(priceCents) && priceCents > task.maxPrice) {
              log("WARN", `[${RETAILER}] Price $${productPrice} exceeds limit $${(task.maxPrice / 100).toFixed(2)} — waiting for price to drop...`);
              continue;
            }
          }
          log("SUCCESS", `[${RETAILER}] In stock: ${productName}${productPrice ? " @ $" + productPrice : ""}`);
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

    await setStatus("adding_to_cart");
    log("INFO", `[${RETAILER}] Adding to cart...`);
    try {
      await page.click(
        'button[data-automation="add-to-cart"]:not([disabled]), button:has-text("Add to cart"):not([disabled])',
        { timeout: 5000 }
      );
    } catch (_) {
      return fail("Could not click Add to Cart button");
    }
    await humanDelay(1500, 2500);

    log("INFO", `[${RETAILER}] Navigating to cart...`);
    await page.goto("https://www.samsclub.com/cart", { waitUntil: "domcontentloaded" });
    await humanDelay(1000, 1800);
    if (token.cancelled) return fail("Task cancelled");
    const cartCaptchaMsg = await handleChallengeInTask(page, task.id, RETAILER, log, setStatus);
    if (cartCaptchaMsg) return { ...fail(cartCaptchaMsg), captchaPaused: true };

    const effectiveQty = await applyCartQuantity(page, task.quantity, log);
    log("INFO", `[${RETAILER}] Cart quantity: ${effectiveQty}`);

    log("INFO", `[${RETAILER}] Proceeding to checkout...`);
    await setStatus("checking_out");
    const { el: checkoutBtn, visualAssist: checkoutVisualAssist } = await waitForSelectorWithVisualFallback(
      page,
      'button:has-text("Checkout"), a:has-text("Proceed to Checkout"), button:has-text("Proceed to Checkout")',
      RETAILER,
      "find and click the Checkout or Proceed to Checkout button on the Sam's Club cart page",
      "checkout_btn",
      log,
    );
    if (!checkoutBtn) return fail("Checkout button not found");
    if (checkoutVisualAssist) { log("INFO", `[${RETAILER}] Visual navigator located checkout button`); anyVisualAssist = true; }
    await checkoutBtn.click();
    await humanDelay(2000, 3000);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const postCheckoutCaptcha = await handleChallengeInTask(page, task.id, RETAILER, log, setStatus);
    if (postCheckoutCaptcha) return { ...fail(postCheckoutCaptcha), captchaPaused: true };
    if (token.cancelled) return fail("Task cancelled");
    await screenshot(page);

    // ── Shipping address (skip if saved on account) ──────────────────────────
    const hasAddressForm = await page.$('input[name="addressLine1"], input[id*="address1"], input[name="firstName"]');
    if (hasAddressForm && profile) {
      log("INFO", `[${RETAILER}] Filling shipping for profile: ${profile.name}`);
      const addrFields: Array<[string, string]> = [
        ['input[name="firstName"], input[id*="firstName"]', profile.shipFirstName || profile.name],
        ['input[name="lastName"], input[id*="lastName"]', profile.shipLastName || ""],
        ['input[name="addressLine1"], input[id*="address1"]', profile.shipAddress1],
        ['input[name="city"], input[id*="city"]', profile.shipCity],
        ['input[name="state"], input[id*="state"]', profile.shipState],
        ['input[name="zipCode"], input[id*="zip"]', profile.shipZip],
        ['input[name="phone"], input[id*="phone"]', profile.phone],
      ];
      for (const [sel, val] of addrFields) {
        if (!val) continue;
        try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
      }
      const { el: continueBtn, visualAssist: contVisualAssist } = await waitForSelectorWithVisualFallback(
        page,
        'button:has-text("Continue"), button:has-text("Save & Continue")',
        RETAILER,
        "find and click the Continue button to advance through Sam\'s Club checkout",
        "continue_shipping",
        log,
        3000,
      );
      if (continueBtn) { if (contVisualAssist) anyVisualAssist = true; await continueBtn.click(); await humanDelay(2000, 3000); }
      if (token.cancelled) return fail("Task cancelled");
    } else if (!hasAddressForm) {
      log("INFO", `[${RETAILER}] Saved address on file — skipping address entry`);
    }

    // ── Payment (skip if saved on account) ───────────────────────────────────
    const hasPaymentForm = await page.$('input[name="cardNumber"], input[id*="cardNumber"]');
    if (hasPaymentForm && card) {
      log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
      try {
        const cardNumber = decrypt(card.encryptedNumber);
        const cvv = decrypt(card.encryptedCvv);
        const payFields: Array<[string, string]> = [
          ['input[name="cardNumber"], input[id*="cardNumber"]', cardNumber],
          ['input[name="expirationMonth"]', card.expiryMonth],
          ['input[name="expirationYear"]', card.expiryYear],
          ['input[name="cvv"], input[name="securityCode"]', cvv],
        ];
        for (const [sel, val] of payFields) {
          try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
        }
      } catch (decryptErr) {
        log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
      }
    } else if (!hasPaymentForm) {
      log("INFO", `[${RETAILER}] Saved payment method on file — skipping card entry`);
    } else {
      log("WARN", `[${RETAILER}] No credit card provided — skipping payment step`);
    }

    await screenshot(page);
    log("INFO", `[${RETAILER}] Submitting order...`);
    const { el: placeOrder, visualAssist: poVisualAssist } = await waitForSelectorWithVisualFallback(
      page,
      'button:has-text("Place Order"), button:has-text("Place order"), button:has-text("Submit order")',
      RETAILER,
      "find and click the Place Order button to submit the Sam's Club order",
      "place_order",
      log,
    );
    if (!placeOrder) return fail("Place order button not found");
    if (poVisualAssist) anyVisualAssist = true;
    await placeOrder.click();
    await humanDelay(3000, 5000);

    await screenshot(page);
    const confirmation = await page.$(
      '[class*="confirmation"], h1:has-text("Thank you"), h1:has-text("Order Confirmed"), h2:has-text("Order placed")'
    );
    if (!confirmation) return fail("Order confirmation not detected");

    // Save fresh session after successful order
    if (loginEmail) saveSession(RETAILER, loginEmail, await context.storageState());

    const orderNumber = `SAM-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "", ...(anyVisualAssist ? { visualAssist: true } : {}) };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
