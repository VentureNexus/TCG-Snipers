import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { emitScreenshot } from "./screenshotUtil";

const RETAILER = "Best Buy";

export async function runBestBuy(ctx: RetailerContext): Promise<RetailerResult> {
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

    const targetUrl = task.productUrl || `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(task.productKeywords)}`;
    await setStatus("monitoring");
    let inStock = false;
    let productName = task.productUrl || task.productKeywords || "Best Buy Product";
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

        const titleEl = await page.$('.sku-title h1, [itemprop="name"]');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('[aria-label*="current price"], .priceView-hero-price span');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        if (!productImage) {
          productImage = await page.$eval('meta[property="og:image"]', el => el.getAttribute("content") ?? "").catch(() => "");
        }

        const atcBtn = await page.$('button.add-to-cart-button:not([disabled]):not(.btn-disabled)');
        const soldOut = await page.$('.btn-disabled, button:has-text("Sold Out"), button:has-text("Coming Soon")');
        if (atcBtn && !soldOut) {
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
        const queueBtn = await page.$('button:has-text("Queue"), a:has-text("Join Queue")');
        if (queueBtn) {
          log("INFO", `[${RETAILER}] Queue system detected — joining queue...`);
          await queueBtn.click();
          await humanDelay(2000, 4000);
          inStock = true;
          break;
        }
        log("WARN", `[${RETAILER}] Product sold out or ATC unavailable`);
      } catch (err) {
        log("WARN", `[${RETAILER}] Navigation error: ${String(err)}`);
      }
    }

    if (!inStock) return fail("Product out of stock after all retries");
    if (token.cancelled) return fail("Task cancelled");

    await setStatus("adding_to_cart");
    log("INFO", `[${RETAILER}] Adding to cart...`);
    try {
      await page.click('button.add-to-cart-button:not([disabled])', { timeout: 5000 });
    } catch (_) {
      return fail("Could not click Add to Cart button");
    }
    await humanDelay(1500, 2500);

    const goToCart = await page.$('a:has-text("Go to Cart"), button:has-text("Go to Cart")');
    if (goToCart) { await goToCart.click(); await humanDelay(1000, 1800); }
    else await page.goto("https://www.bestbuy.com/cart", { waitUntil: "domcontentloaded" });
    if (token.cancelled) return fail("Task cancelled");

    const effectiveQty = await applyCartQuantity(page, task.quantity, log);
    log("INFO", `[${RETAILER}] Cart quantity: ${effectiveQty}`);

    log("INFO", `[${RETAILER}] Proceeding to checkout...`);
    await setStatus("checking_out");
    const checkoutBtn = await page.$('button.btn-primary:has-text("Checkout"), a:has-text("Checkout")');
    if (!checkoutBtn) return fail("Checkout button not found");
    await checkoutBtn.click();
    await humanDelay(2000, 3000);
    if (token.cancelled) return fail("Task cancelled");
    await screenshot(page);

    // Detect sign-in prompt and handle it
    const bbSignInEmail = await page.$('input[id="userName"], input[name="email"], input[type="email"]');
    const bbLoginIdentity = retailerAccount ?? (profile ? { email: profile.email, password: null } : null);
    if (bbSignInEmail && bbLoginIdentity) {
      log("INFO", `[${RETAILER}] Sign-in prompt — logging in as ${bbLoginIdentity.email}...`);
      try { await humanType(page, 'input[id="userName"], input[name="email"]', bbLoginIdentity.email); } catch (_) {}
      await humanDelay(300, 600);
      if (retailerAccount?.password) {
        try { await humanType(page, 'input[id="password"], input[name="password"], input[type="password"]', retailerAccount.password); } catch (_) {}
        await humanDelay(200, 400);
      }
      const loginSubmit = await page.$('button:has-text("Sign In"), button:has-text("Log in"), button[type="submit"]');
      if (loginSubmit) { await loginSubmit.click(); await humanDelay(2000, 3000); }
      await screenshot(page);
      if (token.cancelled) return fail("Task cancelled");
    }

    if (profile) {
      log("INFO", `[${RETAILER}] Filling contact & shipping for profile: ${profile.name}`);
      const contactFields: Array<[string, string]> = [
        ['input[id="user.emailAddress"], input[name="email"]', profile.email],
        ['input[id="user.firstName"], input[name="firstName"]', profile.shipFirstName || profile.name],
        ['input[id="user.lastName"], input[name="lastName"]', profile.shipLastName || ""],
        ['input[id="user.phoneNumber"], input[name="phone"]', profile.phone],
        ['input[id="consolidated.billingAddress.street"], input[name="street"]', profile.shipAddress1],
        ['input[id="consolidated.billingAddress.city"], input[name="city"]', profile.shipCity],
        ['input[id="consolidated.billingAddress.zipcode"], input[name="zipCode"]', profile.shipZip],
      ];
      for (const [sel, val] of contactFields) {
        if (!val) continue;
        try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
      }
    }

    const continueBtn = await page.$('button:has-text("Continue"), button.btn-primary');
    if (continueBtn) { await continueBtn.click(); await humanDelay(2000, 3000); }
    if (token.cancelled) return fail("Task cancelled");

    if (card) {
      log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
      try {
        const cardNumber = decrypt(card.encryptedNumber);
        const cvv = decrypt(card.encryptedCvv);
        const payFields: Array<[string, string]> = [
          ['input[id="creditCard.cardNumber"], input[name="number"]', cardNumber],
          ['input[id="creditCard.expiration"], input[name="expiration"]', `${card.expiryMonth}/${card.expiryYear.slice(-2)}`],
          ['input[id="creditCard.cvv"], input[name="cvv"]', cvv],
        ];
        for (const [sel, val] of payFields) {
          try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
        }
      } catch (decryptErr) {
        log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
      }
    } else {
      log("WARN", `[${RETAILER}] No credit card provided — skipping payment step`);
    }

    await screenshot(page);
    log("INFO", `[${RETAILER}] Submitting order...`);
    const placeOrder = await page.$('button:has-text("Place Your Order"), button.btn-primary:has-text("order")');
    if (!placeOrder) return fail("Place order button not found");
    await placeOrder.click();
    await humanDelay(3000, 5000);

    await screenshot(page);
    const confirmation = await page.$('[class*="thank-you"], [class*="confirmation"], h1:has-text("Thank you")');
    if (!confirmation) return fail("Order confirmation not detected");

    const orderNumber = `BBY-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
