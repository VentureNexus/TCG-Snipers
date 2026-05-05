import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import { imapFetchCode } from "../imap";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { smartClick, smartFind } from "../checkoutLearner";
import { emitScreenshot } from "./screenshotUtil";

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

  const screenshot = async (page: Parameters<typeof emitScreenshot>[1]) =>
    emitScreenshot(task.id, page);

  try {
    log("INFO", `[${RETAILER}] Launching stealth browser...`);
    browser = await createBrowser(proxy);
    const context = await createStealthContext(browser);
    const page = await context.newPage();
    await page.setDefaultNavigationTimeout(30000);

    const targetUrl = task.productUrl || `https://www.amazon.com/s?k=${encodeURIComponent(task.productKeywords)}`;
    await setStatus("monitoring");
    let inStock = false;
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
        if (token.cancelled) return fail("Task cancelled");

        const titleEl = await page.$('#productTitle, h1.a-size-large');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        if (!productImage) {
          productImage = await page.$eval('#landingImage, #imgBlkFront, meta[property="og:image"]', el => (el as HTMLImageElement).src || el.getAttribute("content") || "").catch(() => "");
        }

        const atcBtn = await page.$('#add-to-cart-button:not([disabled]), #buy-now-button:not([disabled])');
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
        log("WARN", `[${RETAILER}] ATC button not available — out of stock or captcha`);
      } catch (err) {
        log("WARN", `[${RETAILER}] Navigation error: ${String(err)}`);
      }
    }

    if (!inStock) return fail("Product out of stock after all retries");
    if (token.cancelled) return fail("Task cancelled");

    await setStatus("adding_to_cart");
    log("INFO", `[${RETAILER}] Adding to cart...`);
    await smartClick(page, RETAILER, "atc", [
      "#add-to-cart-button",
      "#buy-now-button",
      "input[name='submit.add-to-cart']",
    ]);
    await humanDelay(1500, 2500);

    // Navigate directly to cart — more reliable than clicking the cart link
    await page.goto("https://www.amazon.com/gp/cart/view.html", { waitUntil: "domcontentloaded" });
    await humanDelay(1000, 1800);
    if (token.cancelled) return fail("Task cancelled");

    const effectiveQty = await applyCartQuantity(page, task.quantity, log);
    log("INFO", `[${RETAILER}] Cart quantity: ${effectiveQty}`);

    log("INFO", `[${RETAILER}] Proceeding to checkout...`);
    await setStatus("checking_out");
    const clicked = await smartClick(page, RETAILER, "checkout_btn", [
      "[name='proceedToRetailCheckout']",
      "input[name='proceedToRetailCheckout']",
      "button:has-text('Proceed to checkout')",
      "a:has-text('Proceed to checkout')",
    ]);
    if (!clicked) return fail("Checkout button not found");
    await humanDelay(1500, 2500);
    if (token.cancelled) return fail("Task cancelled");

    await screenshot(page);

    const signInCheck = await page.$('input[name="email"], #ap_email');
    if (signInCheck && (profile || retailerAccount)) {
      const loginEmail = retailerAccount?.email ?? profile?.email ?? "";
      log("INFO", `[${RETAILER}] Signing in as ${loginEmail}...`);
      try { await humanType(page, '#ap_email', loginEmail); } catch (_) {}
      const continueBtn = await page.$('#continue, input[id="continue"]');
      if (continueBtn) { await continueBtn.click(); await humanDelay(1500, 2500); }
      if (token.cancelled) return fail("Task cancelled");
      await screenshot(page);

      // Try password field first (faster than OTP when account has password)
      const passwordField = await page.$('#ap_password, input[name="password"]');
      if (passwordField && retailerAccount?.password) {
        log("INFO", `[${RETAILER}] Password prompt — entering credentials...`);
        try { await humanType(page, '#ap_password', retailerAccount.password); } catch (_) {}
        await humanDelay(300, 600);
        const signInBtn = await page.$('#signInSubmit, input[id="signInSubmit"]');
        if (signInBtn) { await signInBtn.click(); await humanDelay(2000, 3000); }
        await screenshot(page);
      }

      const otpCheck = await page.$('input[name="otpCode"], #auth-mfa-otpcode');
      const amazonImapConfig = profile?.imapHost
        ? { host: profile.imapHost, port: parseInt(profile.imapPort, 10), user: profile.imapUser, password: profile.imapPassword }
        : ctx.globalImapConfig;
      if (otpCheck && amazonImapConfig) {
        log("INFO", `[${RETAILER}] OTP prompt — fetching code from IMAP...`);
        const code = await imapFetchCode(
          amazonImapConfig,
          /amazon|otp|sign.?in/i,
          30000,
        );
        if (code) {
          log("SUCCESS", `[${RETAILER}] OTP code retrieved`);
          await humanType(page, '#auth-mfa-otpcode', code);
          const submitOtp = await page.$('input[id="auth-signin-button"]');
          if (submitOtp) { await submitOtp.click(); await humanDelay(2000, 3000); }
          await screenshot(page);
        } else {
          log("WARN", `[${RETAILER}] OTP code not found in IMAP within timeout`);
        }
      }
    }

    // If Amazon already shows the place-your-order button (saved address + payment on file),
    // skip address/payment filling entirely — trying to fill fields that don't exist wastes
    // minutes and causes the "Place order button not found" error when Amazon redirects away.
    const quickPlaceOrder = await page.$(
      'input[name="placeYourOrder1"], [data-action="place-order"], ' +
      'span[id*="placeOrder"] input[type="submit"], ' +
      'button:has-text("Place your order"), button:has-text("Place Order")'
    );
    if (!quickPlaceOrder && profile) {
      log("INFO", `[${RETAILER}] Filling address for profile: ${profile.name}`);
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
    }

    if (!quickPlaceOrder) {
      const continueShipping = await page.$('input[name="continue-to-payment"], button:has-text("Continue"), input[value="Continue"]');
      if (continueShipping) { await continueShipping.click(); await humanDelay(1500, 2000); }
    }
    if (token.cancelled) return fail("Task cancelled");

    if (!quickPlaceOrder && card) {
      log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
      try {
        const cardNumber = decrypt(card.encryptedNumber);
        const cvv = decrypt(card.encryptedCvv);
        const payFields: Array<[string, string]> = [
          ['input[name="addCreditCardNumber"]', cardNumber],
          ['input[name="addCreditCardExpirationDate"]', `${card.expiryMonth}/${card.expiryYear}`],
          ['input[name="cvv"]', cvv],
        ];
        for (const [sel, val] of payFields) {
          try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
        }
      } catch (decryptErr) {
        log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
      }
      // After filling payment, click Continue to advance to order review page
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
      }
    } else if (!quickPlaceOrder) {
      log("WARN", `[${RETAILER}] No credit card provided — skipping payment step`);
    }
    if (token.cancelled) return fail("Task cancelled");
    await screenshot(page);

    log("INFO", `[${RETAILER}] Submitting order...`);
    const placeOrderSelectors = [
      "input[name='placeYourOrder1']",
      "[data-action='place-order']",
      "[data-feature-id='place-order-button'] input",
      "#submitOrderButtonId",
      "span[id*='placeOrder'] input[type='submit']",
      "button:has-text('Place your order')",
      "button:has-text('Place Order')",
      "input[value*='Place your order']",
      "input[aria-label*='Place your order']",
    ];
    // Wait for the order review page to settle before querying
    try {
      await page.waitForSelector(
        "input[name='placeYourOrder1'], [data-feature-id='place-order-button'] input, " +
        "span[id*='placeOrder'] input, button:has-text('Place your order')",
        { timeout: 10000 },
      );
    } catch (_) {}
    // Re-query (quickPlaceOrder ref may be stale after address/payment nav)
    const placeOrder = quickPlaceOrder ?? await smartFind(page, RETAILER, "place_order", placeOrderSelectors);
    if (!placeOrder) return fail("Place order button not found");
    await placeOrder.scrollIntoViewIfNeeded();
    await humanDelay(200, 400);
    await page.evaluate(el => (el as unknown as { click(): void }).click(), placeOrder);
    await humanDelay(3000, 5000);

    await screenshot(page);
    const confirmation = await page.$('[class*="confirmation"], h1:has-text("order"), h4:has-text("order")');
    if (!confirmation) return fail("Order confirmation not detected");

    const orderNumber = `AMZ-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
