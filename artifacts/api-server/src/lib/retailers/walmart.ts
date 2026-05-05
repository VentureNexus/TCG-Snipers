import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { smartClick, smartFind } from "../checkoutLearner";

const RETAILER = "Walmart";

export async function runWalmart(ctx: RetailerContext): Promise<RetailerResult> {
  const { task, profile, card, proxy, token, log, setStatus, setRetryProgress } = ctx;
  let browser: Browser | null = null;

  const fail = (msg: string): RetailerResult => ({
    success: false,
    productName: task.productUrl || task.productKeywords || "Unknown Product",
    productImage: "",
    price: null,
    orderNumber: "",
    errorMessage: msg,
  });

  try {
    log("INFO", `[${RETAILER}] Launching stealth browser...`);
    browser = await createBrowser(proxy);
    const context = await createStealthContext(browser);
    const page = await context.newPage();
    await page.setDefaultNavigationTimeout(30000);

    const targetUrl = task.productUrl ||
      `https://www.walmart.com/search?q=${encodeURIComponent(task.productKeywords ?? "")}`;

    await setStatus("monitoring");
    let inStock = false;
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
        if (token.cancelled) return fail("Task cancelled");

        const titleEl = await page.$('[itemprop="name"], h1.prod-ProductTitle, h1');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('[itemprop="price"], [class*="price-characteristic"], [class*="Price"]');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        if (!productImage) {
          productImage = await page.$eval('meta[property="og:image"]', el => el.getAttribute("content") ?? "").catch(() => "");
        }

        const atcBtn = await page.$(
          'button[data-automation-id="add-to-cart"]:not([disabled]), button:has-text("Add to cart"):not([disabled])'
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
    // Re-query — Walmart re-renders the button on hydration so the stock-check reference is stale
    const atcClicked = await smartClick(page, RETAILER, "atc", [
      "button[data-automation-id='add-to-cart']:not([disabled])",
      "button:has-text('Add to cart'):not([disabled])",
      "button[data-automation-id='add-to-cart']",
    ]);
    if (!atcClicked) return fail("Could not click Add to Cart button");
    await humanDelay(1500, 2500);

    log("INFO", `[${RETAILER}] Navigating to cart...`);
    await page.goto("https://www.walmart.com/cart", { waitUntil: "domcontentloaded" });
    await humanDelay(1000, 1800);
    if (token.cancelled) return fail("Task cancelled");

    const effectiveQty = await applyCartQuantity(page, task.quantity, log);
    log("INFO", `[${RETAILER}] Cart quantity: ${effectiveQty}`);

    log("INFO", `[${RETAILER}] Proceeding to checkout...`);
    await setStatus("checking_out");
    // Walmart's cart is React — the checkout button renders async after hydration.
    // Wait up to 10s for any variant to appear before querying.
    try {
      await page.waitForSelector(
        "[data-automation-id='cart-checkout-btn'], button:has-text('Continue to checkout'), button:has-text('Check out'), button:has-text('Checkout')",
        { timeout: 10000 },
      );
    } catch (_) {}
    const checkoutClicked = await smartClick(page, RETAILER, "checkout_btn", [
      "[data-automation-id='cart-checkout-btn']",
      "button:has-text('Continue to checkout')",
      "button:has-text('Check out')",
      "button:has-text('Checkout')",
      "[class*='checkout-btn']",
      "[class*='checkoutBtn']",
      "a[href*='/checkout']:not([href*='help']):not([href*='account'])",
    ]);
    if (!checkoutClicked) return fail("Checkout button not found");
    await humanDelay(1500, 2500);
    if (token.cancelled) return fail("Task cancelled");

    if (profile) {
      log("INFO", `[${RETAILER}] Filling shipping for profile: ${profile.name}`);
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

      const continueBtn = await page.$('button:has-text("Continue"), button:has-text("Save & Continue")');
      if (continueBtn) { await continueBtn.click(); await humanDelay(2000, 3000); }
      if (token.cancelled) return fail("Task cancelled");
    }

    if (card) {
      log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
      try {
        const cardNumber = decrypt(card.encryptedNumber);
        const cvv = decrypt(card.encryptedCvv);
        const payFields: Array<[string, string]> = [
          ['input[name="cardNumber"], input[id*="card-number"]', cardNumber],
          ['input[name="expirationMonth"]', card.expiryMonth],
          ['input[name="expirationYear"]', card.expiryYear],
          ['input[name="cvv"], input[name="cvc"]', cvv],
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

    log("INFO", `[${RETAILER}] Submitting order...`);
    const placeOrderClicked = await smartClick(page, RETAILER, "place_order", [
      "button:has-text('Place Order')",
      "button:has-text('Place order')",
      "[data-automation-id='place-order-btn']",
      "button:has-text('Submit order')",
    ]);
    if (!placeOrderClicked) return fail("Place order button not found");
    await humanDelay(3000, 5000);

    const confirmation = await page.$(
      '[class*="confirmation"], h1:has-text("Thank you"), h1:has-text("Order Confirmed"), h2:has-text("Your order")'
    );
    if (!confirmation) return fail("Order confirmation not detected");

    const orderNumber = `WMT-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
