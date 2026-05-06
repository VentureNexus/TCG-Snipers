import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { emitScreenshot } from "./screenshotUtil";
import { saveSession, loadSession, clearSession } from "./sessionCache";
import { handleChallengeInTask, waitForSelectorWithVisualFallback } from "./visualNavigator";

const RETAILER = "Pokemon Center";

export async function runPokemonCenter(ctx: RetailerContext): Promise<RetailerResult> {
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

    const targetUrl = task.productUrl || `https://www.pokemoncenter.com/search?q=${encodeURIComponent(task.productKeywords)}`;
    await setStatus("monitoring");
    let inStock = false;
    let buyItNowAvailable = false;
    let productName = task.productUrl || task.productKeywords || "Pokémon Center Product";
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

        const queue = await page.$('[id*="queue"], [class*="waiting-room"], h1:has-text("Waiting")');
        if (queue) {
          log("WARN", `[${RETAILER}] Waiting room detected — standing by...`);
          await screenshot(page);
          const queueStart = Date.now();
          const maxWait = 120_000;
          while (Date.now() - queueStart < maxWait) {
            if (token.cancelled) return fail("Task cancelled");
            await humanDelay(5000, 8000);
            const stillQueued = await page.$('[id*="queue"], [class*="waiting-room"]');
            if (!stillQueued) { log("INFO", `[${RETAILER}] Queue cleared — proceeding...`); break; }
          }
        }

        const titleEl = await page.$('h1.product-title, h1.ProductName, [class*="product-name"]');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('.ProductPrice, [class*="product-price"], [class*="Price"]');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        if (!productImage) {
          productImage = await page.$eval('meta[property="og:image"]', el => el.getAttribute("content") ?? "").catch(() => "");
        }

        const atcBtn = await page.$('button[name="add"]:not([disabled]), button.add-to-cart:not([disabled]), button:has-text("Add to Cart"):not([disabled])');
        const outOfStock = await page.$('button[disabled]:has-text("Sold Out"), .sold-out-badge');

        // Shopify "Buy it now" button — faster than ATC + checkout flow
        const buyItNowBtn = await page.$(
          'button.shopify-payment-button__button:not([disabled]), ' +
          'button[data-action="instant-checkout"]:not([disabled])'
        );

        if ((atcBtn || buyItNowBtn) && !outOfStock) {
          if (task.maxPrice != null && productPrice) {
            const priceCents = Math.round(parseFloat(productPrice) * 100);
            if (Number.isFinite(priceCents) && priceCents > task.maxPrice) {
              log("WARN", `[${RETAILER}] Price $${productPrice} exceeds limit $${(task.maxPrice / 100).toFixed(2)} — waiting for price to drop...`);
              continue;
            }
          }
          buyItNowAvailable = !!buyItNowBtn && !atcBtn; // prefer ATC+checkout for more control; use BIN only when ATC absent
          log("SUCCESS", `[${RETAILER}] In stock${buyItNowAvailable ? " (Buy it Now available)" : ""}: ${productName}${productPrice ? " @ $" + productPrice : ""}`);
          inStock = true;
          break;
        }
        log("WARN", `[${RETAILER}] Product not available (sold out or queue not cleared)`);
      } catch (err) {
        log("WARN", `[${RETAILER}] Navigation error: ${String(err)}`);
      }
    }

    if (!inStock) return fail("Product out of stock after all retries");
    if (token.cancelled) return fail("Task cancelled");

    if (buyItNowAvailable) {
      // ── Shopify Buy it now path — skips cart ────────────────────────────────
      log("INFO", `[${RETAILER}] Clicking Buy it Now — skipping cart for faster checkout...`);
      await setStatus("checking_out");
      try {
        await page.click(
          'button.shopify-payment-button__button:not([disabled]), button[data-action="instant-checkout"]:not([disabled])',
          { timeout: 5000 }
        );
      } catch (_) {
        log("WARN", `[${RETAILER}] Buy it Now click failed — falling back to ATC`);
        buyItNowAvailable = false;
      }
      if (buyItNowAvailable) {
        await humanDelay(2000, 3000);
        await screenshot(page);
        // Buy it now on Shopify may open Shop Pay or redirect to checkout
        // If it's already on the checkout page, fall through to sign-in/address/payment
      }
    }

    if (!buyItNowAvailable) {
      // ── Standard Add-to-Cart path ────────────────────────────────────────────
      await setStatus("adding_to_cart");
      log("INFO", `[${RETAILER}] Adding to cart (Shopify ATC)...`);
      try {
        await page.click('button[name="add"]:not([disabled]), button.add-to-cart:not([disabled])', { timeout: 5000 });
      } catch (_) {
        return fail("Could not click Add to Cart button");
      }
      await humanDelay(1500, 2500);

      const viewCart = await page.$('a:has-text("View Cart"), a[href="/cart"]');
      if (viewCart) { await viewCart.click(); await humanDelay(1000, 1800); }
      else await page.goto("https://www.pokemoncenter.com/cart", { waitUntil: "domcontentloaded" });
      if (token.cancelled) return fail("Task cancelled");
      const cartCaptchaMsg = await handleChallengeInTask(page, task.id, RETAILER, log, setStatus);
      if (cartCaptchaMsg) return { ...fail(cartCaptchaMsg), captchaPaused: true };

      const effectiveQty = await applyCartQuantity(page, task.quantity, log);
      log("INFO", `[${RETAILER}] Cart quantity: ${effectiveQty}`);

      log("INFO", `[${RETAILER}] Proceeding to checkout (Shopify)...`);
      await setStatus("checking_out");
      const { el: checkoutBtn, visualAssist: checkoutVisualAssist } = await waitForSelectorWithVisualFallback(
        page,
        'button:has-text("Check out"), a:has-text("Check out"), input[name="checkout"]',
        RETAILER,
        "find and click the Check Out button on the Pokemon Center cart page",
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
    }

    // ── Sign-in (if Shopify login page detected) ─────────────────────────────
    const pcSignInEmail = await page.$('input[name="email"][autocomplete*="email"], #checkout_email');
    const pcLoginIdentity = retailerAccount ?? null;
    if (pcSignInEmail && pcLoginIdentity) {
      const isLoginPage = await page.$('button:has-text("Log in"), a:has-text("Log in"), input[name="password"]');
      if (isLoginPage) {
        if (cachedSession && loginEmail) {
          log("WARN", `[${RETAILER}] Cached session expired — re-authenticating as ${loginEmail}...`);
          clearSession(RETAILER, loginEmail);
        } else {
          log("INFO", `[${RETAILER}] Account sign-in detected — logging in as ${pcLoginIdentity.email}...`);
        }
        try { await humanType(page, 'input[name="email"]', pcLoginIdentity.email); } catch (_) {}
        await humanDelay(300, 600);
        if (pcLoginIdentity.password) {
          try { await humanType(page, 'input[name="password"]', pcLoginIdentity.password); } catch (_) {}
          await humanDelay(200, 400);
        }
        const loginSubmit = await page.$('button:has-text("Log in"), button[type="submit"]');
        if (loginSubmit) { await loginSubmit.click(); await humanDelay(2000, 3000); }
        await screenshot(page);
        if (token.cancelled) return fail("Task cancelled");

        // Save session after login
        if (loginEmail) {
          saveSession(RETAILER, loginEmail, await context.storageState());
          log("INFO", `[${RETAILER}] Session cached for ${loginEmail}`);
        }
      }
    }

    // ── Shipping address (skip if saved on account) ──────────────────────────
    const hasAddressForm = await page.$('input[name="address1"], #checkout_shipping_address_address1, input[name="firstName"]');
    if (hasAddressForm && profile) {
      log("INFO", `[${RETAILER}] Filling Shopify contact & shipping for profile: ${profile.name}`);
      const contactFields: Array<[string, string]> = [
        ['input[name="email"], #checkout_email', profile.email],
        ['input[name="firstName"], #checkout_shipping_address_first_name', profile.shipFirstName || profile.name],
        ['input[name="lastName"], #checkout_shipping_address_last_name', profile.shipLastName || ""],
        ['input[name="address1"], #checkout_shipping_address_address1', profile.shipAddress1],
        ['input[name="city"], #checkout_shipping_address_city', profile.shipCity],
        ['input[name="zip"], #checkout_shipping_address_zip', profile.shipZip],
        ['input[name="phone"], #checkout_shipping_address_phone', profile.phone],
      ];
      for (const [sel, val] of contactFields) {
        if (!val) continue;
        try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
      }
    } else if (!hasAddressForm) {
      log("INFO", `[${RETAILER}] Saved address on file — skipping address entry`);
    }

    const continueShipping = await page.$('button#continue_button, button:has-text("Continue to shipping")');
    if (continueShipping) { await continueShipping.click(); await humanDelay(2000, 3000); }
    if (token.cancelled) return fail("Task cancelled");

    const continuePayment = await page.$('button#continue_button, button:has-text("Continue to payment")');
    if (continuePayment) { await continuePayment.click(); await humanDelay(2000, 3000); }
    if (token.cancelled) return fail("Task cancelled");

    // ── Payment (skip if saved on account — Shopify may show saved card) ─────
    // Shopify payment fields are in iframes; check for the card number iframe as indicator
    const hasPaymentIframe = await page.$('[id*="card-fields-number"] iframe, iframe[title*="Card Number"]');
    if (hasPaymentIframe && card) {
      log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
      try {
        const cardNumber = decrypt(card.encryptedNumber);
        const cvv = decrypt(card.encryptedCvv);
        const cardFrame = page.frameLocator('[id*="card-fields-number"] iframe, iframe[title*="Card Number"]');
        try { await cardFrame.locator('input').fill(cardNumber); await humanDelay(100, 200); } catch (_) {}
        const expFrame = page.frameLocator('[id*="card-fields-expiry"] iframe, iframe[title*="Expiry"]');
        try { await expFrame.locator('input').fill(`${card.expiryMonth} / ${card.expiryYear.slice(-2)}`); await humanDelay(100, 200); } catch (_) {}
        const cvvFrame = page.frameLocator('[id*="card-fields-verification"] iframe, iframe[title*="Security"]');
        try { await cvvFrame.locator('input').fill(cvv); await humanDelay(100, 200); } catch (_) {}
      } catch (decryptErr) {
        log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
      }
    } else if (!hasPaymentIframe) {
      log("INFO", `[${RETAILER}] Saved payment method on file — skipping card entry`);
    } else {
      log("WARN", `[${RETAILER}] No credit card provided — skipping payment step`);
    }

    await screenshot(page);
    log("INFO", `[${RETAILER}] Submitting Shopify order...`);
    const { el: placeOrder, visualAssist: poVisualAssist } = await waitForSelectorWithVisualFallback(
      page,
      'button#continue_button, button:has-text("Pay now"), button:has-text("Complete order")',
      RETAILER,
      "find and click the Pay Now or Complete Order button to submit the Pokemon Center order",
      "place_order",
      log,
    );
    if (!placeOrder) return fail("Place order button not found");
    if (poVisualAssist) anyVisualAssist = true;
    await placeOrder.click();
    await humanDelay(3000, 5000);

    await screenshot(page);
    const confirmation = await page.$('[class*="thank-you"], h2:has-text("Thank you"), h1:has-text("Order confirmed")');
    if (!confirmation) return fail("Order confirmation not detected");

    // Save fresh session after successful order
    if (loginEmail) saveSession(RETAILER, loginEmail, await context.storageState());

    const orderNumEl = await page.$('[class*="order-number"], [class*="confirmation-number"]');
    const orderNumber = (await orderNumEl?.textContent())?.trim().replace(/[^0-9A-Z-]/g, "") || `PCK-${Date.now()}`;

    log("SUCCESS", `[${RETAILER}] Order placed! Order #${orderNumber} — ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "", ...(anyVisualAssist ? { visualAssist: true } : {}) };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
