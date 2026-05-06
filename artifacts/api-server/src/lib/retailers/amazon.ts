import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import { imapFetchCode } from "../imap";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { smartClick, smartFind } from "../checkoutLearner";
import { emitScreenshot } from "./screenshotUtil";
import { saveSession, loadSession, clearSession } from "./sessionCache";
import { handleChallengeInTask } from "./visualNavigator";

const RETAILER = "Amazon";

export async function runAmazon(ctx: RetailerContext): Promise<RetailerResult> {
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

    const targetUrl = task.productUrl || `https://www.amazon.com/s?k=${encodeURIComponent(task.productKeywords ?? "")}`;
    await setStatus("monitoring");
    let inStock = false;
    let buyNowAvailable = false;
    let productName = task.productUrl || task.productKeywords || "Amazon Product";
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
        if (captchaMsg) return fail(captchaMsg);

        const titleEl = await page.$('#productTitle, h1.a-size-large');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        if (!productImage) {
          productImage = await page.$eval('#landingImage, #imgBlkFront, meta[property="og:image"]', el =>
            (el as any).src || (el as any).getAttribute?.("content") || ""
          ).catch(() => "");
        }

        const buyNowBtn = await page.$('#buy-now-button:not([disabled])');
        const atcBtn = await page.$('#add-to-cart-button:not([disabled]), input[name="submit.add-to-cart"]:not([disabled])');
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
        log("WARN", `[${RETAILER}] ATC/Buy Now not available — out of stock or captcha`);
      } catch (err) {
        log("WARN", `[${RETAILER}] Navigation error: ${String(err)}`);
      }
    }

    if (!inStock) return fail("Product out of stock after all retries");
    if (token.cancelled) return fail("Task cancelled");

    if (buyNowAvailable) {
      // ── Buy Now path ────────────────────────────────────────────────────────
      log("INFO", `[${RETAILER}] Clicking Buy Now — skipping cart...`);
      await setStatus("checking_out");
      await screenshot();
      try { await page.click('#buy-now-button', { timeout: 5000 }); } catch (_) {}
      await humanDelay(1500, 2500);
      await screenshot();

      const turboPlaceOrder = await page.$(
        '#turbo-checkout-pyo-button, #turbo-checkout-place-order-button-text, ' +
        '[id*="turbo"] input[type="submit"], [id*="turbo"] button:has-text("Place your order")'
      );
      if (turboPlaceOrder) {
        log("INFO", `[${RETAILER}] Buy Now one-click modal — placing order...`);
        await turboPlaceOrder.scrollIntoViewIfNeeded();
        await page.evaluate(el => (el as unknown as { click(): void }).click(), turboPlaceOrder);
        await humanDelay(3000, 5000);
        await screenshot();
        const confirmation = await page.$('[class*="confirmation"], h1:has-text("order"), h4:has-text("order")');
        if (!confirmation) return fail("Order confirmation not detected after Buy Now modal");
        if (loginEmail) saveSession(RETAILER, loginEmail, await context.storageState());
        const orderNumber = `AMZ-${Date.now()}`;
        log("SUCCESS", `[${RETAILER}] Order placed via Buy Now! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
        return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "" };
      }
      log("INFO", `[${RETAILER}] Buy Now redirected to checkout page — continuing...`);
    } else {
      // ── Add to Cart path ────────────────────────────────────────────────────
      await setStatus("adding_to_cart");
      log("INFO", `[${RETAILER}] Adding to cart...`);
      await screenshot();
      await smartClick(page, RETAILER, "atc", [
        "#add-to-cart-button",
        "input[name='submit.add-to-cart']",
      ]);
      await humanDelay(1500, 2500);
      await screenshot();

      await page.goto("https://www.amazon.com/gp/cart/view.html", { waitUntil: "domcontentloaded" });
      await humanDelay(1000, 1800);
      await screenshot();
      if (token.cancelled) return fail("Task cancelled");

      const effectiveQty = await applyCartQuantity(page, task.quantity, log);
      log("INFO", `[${RETAILER}] Cart quantity: ${effectiveQty}`);

      log("INFO", `[${RETAILER}] Proceeding to checkout...`);
      await setStatus("checking_out");
      await screenshot();
      const clicked = await smartClick(page, RETAILER, "checkout_btn", [
        "[name='proceedToRetailCheckout']",
        "input[name='proceedToRetailCheckout']",
        "button:has-text('Proceed to checkout')",
        "a:has-text('Proceed to checkout')",
      ]);
      if (!clicked) return fail("Checkout button not found");
      await humanDelay(1500, 2500);
      await screenshot();
    }

    if (token.cancelled) return fail("Task cancelled");

    // ── Sign-in (if prompted) ─────────────────────────────────────────────────
    // Wait for page to settle after Buy Now redirect or checkout navigation
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await screenshot();

    const signInCheck = await page.$('input[name="email"], #ap_email');
    if (signInCheck) {
      if (cachedSession && loginEmail) {
        log("WARN", `[${RETAILER}] Cached session expired — re-authenticating as ${loginEmail}...`);
        clearSession(RETAILER, loginEmail);
      } else {
        log("INFO", `[${RETAILER}] Sign-in required — logging in as ${loginEmail}...`);
      }

      await screenshot();
      try { await humanType(page, '#ap_email, input[name="email"]', loginEmail); } catch (_) {}
      await screenshot();
      const continueBtn = await page.$('#continue, input[id="continue"]');
      if (continueBtn) { await continueBtn.click(); await humanDelay(1500, 2500); }
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      await screenshot();
      if (token.cancelled) return fail("Task cancelled");

      const passwordField = await page.$('#ap_password, input[name="password"]');
      if (passwordField && retailerAccount?.password) {
        log("INFO", `[${RETAILER}] Password prompt — entering credentials...`);
        await screenshot();
        try { await humanType(page, '#ap_password', retailerAccount.password); } catch (_) {}
        await screenshot();
        await humanDelay(300, 600);
        const signInBtn = await page.$('#signInSubmit, input[id="signInSubmit"]');
        if (signInBtn) { await signInBtn.click(); await humanDelay(2000, 3000); }
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await screenshot();
      }

      // OTP check
      const otpCheck = await page.$('input[name="otpCode"], #auth-mfa-otpcode');
      const amazonImapConfig = profile?.imapHost
        ? { host: profile.imapHost, port: parseInt(profile.imapPort, 10), user: profile.imapUser, password: profile.imapPassword }
        : ctx.globalImapConfig;
      if (otpCheck && amazonImapConfig) {
        log("INFO", `[${RETAILER}] OTP prompt — fetching code from IMAP...`);
        await screenshot();
        const code = await imapFetchCode(amazonImapConfig, /amazon|otp|sign.?in/i, 30000);
        if (code) {
          log("SUCCESS", `[${RETAILER}] OTP code retrieved`);
          await humanType(page, '#auth-mfa-otpcode', code);
          await screenshot();
          const submitOtp = await page.$('input[id="auth-signin-button"]');
          if (submitOtp) { await submitOtp.click(); await humanDelay(2000, 3000); }
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
          await screenshot();
        } else {
          log("WARN", `[${RETAILER}] OTP code not found in IMAP`);
        }
      }

      // Save session after successful login
      if (loginEmail) {
        saveSession(RETAILER, loginEmail, await context.storageState());
        log("INFO", `[${RETAILER}] Session cached for ${loginEmail}`);
      }
    }

    // After all sign-in redirects settle, log where we are
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await screenshot();
    log("INFO", `[${RETAILER}] Checkout URL: ${page.url()}`);

    // ── Address (skip if saved) ───────────────────────────────────────────────
    const quickPlaceOrder = await page.$(
      "input[name='placeYourOrder1'], [data-action='place-order'], " +
      "span[id*='placeOrder'] input[type='submit'], " +
      "button:has-text('Place your order'), button:has-text('Place Order'), " +
      "input#submitOrderButtonId"
    );
    const hasAddressForm = !quickPlaceOrder && await page.$('input[name="address1"], input[name="city"]');
    if (hasAddressForm && profile) {
      log("INFO", `[${RETAILER}] Filling address for profile: ${profile.name}`);
      await screenshot();
      const addressFields: Array<[string, string]> = [
        ['input[name="address1"]', profile.shipAddress1],
        ['input[name="city"]', profile.shipCity],
        ['input[name="zip"]', profile.shipZip],
        ['input[name="phone"]', profile.phone],
      ];
      for (const [sel, val] of addressFields) {
        if (!val) continue;
        try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
      }
      await screenshot();
    } else if (!hasAddressForm && !quickPlaceOrder) {
      log("INFO", `[${RETAILER}] Saved address on file — skipping address entry`);
    }

    if (!quickPlaceOrder) {
      const continueShipping = await page.$('input[name="continue-to-payment"], button:has-text("Continue"), input[value="Continue"]');
      if (continueShipping) {
        await continueShipping.click();
        await humanDelay(1500, 2000);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await screenshot();
      }
    }
    if (token.cancelled) return fail("Task cancelled");

    // ── Payment (skip if saved) ───────────────────────────────────────────────
    const hasPaymentForm = !quickPlaceOrder && await page.$('input[name="addCreditCardNumber"], input[name="cvv"]');
    if (hasPaymentForm && card) {
      log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
      await screenshot();
      try {
        const cardNumber = decrypt(card.encryptedNumber);
        const cvv = decrypt(card.encryptedCvv);
        for (const [sel, val] of [
          ['input[name="addCreditCardNumber"]', cardNumber],
          ['input[name="addCreditCardExpirationDate"]', `${card.expiryMonth}/${card.expiryYear}`],
          ['input[name="cvv"]', cvv],
        ] as Array<[string, string]>) {
          try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
        }
        await screenshot();
      } catch (decryptErr) {
        log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
      }
      const paymentContinue = await page.$(
        'input[name="ppw-widgetEvent:SetPaymentPlanSelectAction"], ' +
        'input[name="continue-to-review"], ' +
        'button:has-text("Use this payment method"), ' +
        'button:has-text("Continue"), ' +
        'input[value*="Use these"]',
      );
      if (paymentContinue) {
        await paymentContinue.scrollIntoViewIfNeeded();
        await page.evaluate(el => (el as unknown as { click(): void }).click(), paymentContinue);
        await humanDelay(2000, 3000);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await screenshot();
      }
    } else if (!hasPaymentForm && !quickPlaceOrder) {
      log("INFO", `[${RETAILER}] Saved payment method on file — skipping card entry`);
    }

    if (token.cancelled) return fail("Task cancelled");

    // ── Dismiss Amazon Prime / upsell interstitials ───────────────────────────
    // Amazon shows a "Try Prime" page mid-checkout (URL contains referrer=prime
    // or pipelineType=Chewbacca). Clicking "No thanks" continues to place-order.
    for (let primePass = 0; primePass < 3; primePass++) {
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      const primeNoThanks = await page.$(
        "#prime-interstitial-nothanks, " +
        "a:has-text('No thanks'), a:has-text('No, thanks'), " +
        "button:has-text('No thanks'), button:has-text('No, thanks'), " +
        "a[href*='nothanks'], a[href*='no-thanks'], " +
        "input[value*='No thanks'], input[value*='No, thanks'], " +
        "span:has-text('No thanks'), " +
        "[data-prime-interstitial] a, [id*='prime'][id*='nothanks'], " +
        "a:has-text('Continue without'), button:has-text('Continue without'), " +
        "a:has-text('Decline'), button:has-text('Decline offer')"
      );
      if (primeNoThanks) {
        log("INFO", `[${RETAILER}] Dismissing Prime/upsell offer — clicking No thanks...`);
        await screenshot();
        await primeNoThanks.click();
        await humanDelay(1500, 2500);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await screenshot();
        log("INFO", `[${RETAILER}] Post-Prime URL: ${page.url()}`);
      } else {
        break; // no more interstitials
      }
    }

    // ── Place order ───────────────────────────────────────────────────────────
    log("INFO", `[${RETAILER}] Submitting order... (page: ${page.url()})`);

    // Wait for page to be ready, then scroll to ensure button is in view
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await humanDelay(800, 1200);
    await screenshot();

    const placeOrderSelectors = [
      "input[name='placeYourOrder1']",
      "input#submitOrderButtonId",
      "[data-feature-id='place-order-button'] input[type='submit']",
      "[data-feature-id='place-order-button'] button",
      "span[id*='placeOrder'] input[type='submit']",
      "[data-action='place-order']",
      "button:has-text('Place your order')",
      "button:has-text('Place Order')",
      "input[aria-label*='Place your order']",
      "input[aria-label*='place your order']",
      "input[value*='Place your order']",
      "form[action*='place-order'] input[type='submit']",
      "form[action*='placeOrder'] input[type='submit']",
      "#checkout-confirm-page input[type='submit']",
    ];

    // Extended wait for place order button (up to 15s)
    try {
      await page.waitForSelector(placeOrderSelectors.join(", "), { timeout: 15000 });
    } catch (_) {
      log("WARN", `[${RETAILER}] Place order button not immediately visible — trying JS fallback...`);
      await screenshot();
    }

    const placeOrder = quickPlaceOrder ?? await smartFind(page, RETAILER, "place_order", placeOrderSelectors);

    if (!placeOrder) {
      // Last-resort: click via JS evaluation searching by button text
      const found = await page.evaluate(`(function() {
        var els = Array.from(document.querySelectorAll('input[type="submit"], button, a'));
        var match = els.find(function(el) {
          var text = (el.textContent || '') + (el.getAttribute('value') || '') + (el.getAttribute('aria-label') || '');
          return /place\\s*(your\\s*)?order|submit\\s*order/i.test(text);
        });
        if (match) { match.click(); return true; }
        return false;
      })()`);
      if (!found) {
        await screenshot();
        return fail("Place order button not found");
      }
      log("INFO", `[${RETAILER}] Place order clicked via JS fallback`);
    } else {
      await placeOrder.scrollIntoViewIfNeeded();
      await humanDelay(200, 400);
      await screenshot();
      await page.evaluate(el => (el as unknown as { click(): void }).click(), placeOrder);
    }

    await humanDelay(3000, 5000);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await screenshot();

    const confirmation = await page.$('[class*="confirmation"], h1:has-text("order"), h4:has-text("order")');
    if (!confirmation) return fail("Order confirmation not detected");

    // Save fresh session after successful order
    if (loginEmail) saveSession(RETAILER, loginEmail, await context.storageState());

    const orderNumber = `AMZ-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
