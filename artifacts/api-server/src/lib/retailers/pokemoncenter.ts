import type { Browser } from "playwright";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { db, creditCardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const RETAILER = "Pokemon Center";

export async function runPokemonCenter(ctx: RetailerContext): Promise<RetailerResult> {
  const { task, profile, proxy, token, log, setStatus } = ctx;
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

    const targetUrl = task.productUrl || `https://www.pokemoncenter.com/search?q=${encodeURIComponent(task.productKeywords)}`;
    await setStatus("monitoring");
    let inStock = false;
    let productName = task.productUrl || task.productKeywords || "Pokémon Center Product";
    let productPrice = "";

    const isUnlimited = task.retryCount === -1;
    for (let attempt = 0; isUnlimited || attempt <= task.retryCount; attempt++) {
      if (token.cancelled) return fail("Task cancelled");
      if (attempt > 0) {
        log("WARN", `[${RETAILER}] OOS — waiting ${task.monitorDelay}ms before retry ${attempt}/${isUnlimited ? "∞" : task.retryCount}...`);
        await humanDelay(task.monitorDelay, task.monitorDelay + 500);
      }
      try {
        log("INFO", `[${RETAILER}] Checking stock: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
        await humanDelay(800, 1500);
        if (token.cancelled) return fail("Task cancelled");

        // Detect waiting room / queue
        const queue = await page.$('[id*="queue"], [class*="waiting-room"], h1:has-text("Waiting")');
        if (queue) {
          log("WARN", `[${RETAILER}] Waiting room detected — standing by...`);
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

        // Pokémon Center uses Shopify — look for "Add to cart" button
        const atcBtn = await page.$('button[name="add"]:not([disabled]), button.add-to-cart:not([disabled]), button:has-text("Add to Cart"):not([disabled])');
        const outOfStock = await page.$('button[disabled]:has-text("Sold Out"), .sold-out-badge');
        if (atcBtn && !outOfStock) {
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
        log("WARN", `[${RETAILER}] Product not available (sold out or queue not cleared)`);
      } catch (err) {
        log("WARN", `[${RETAILER}] Navigation error: ${String(err)}`);
      }
    }

    if (!inStock) return fail("Product out of stock after all retries");
    if (token.cancelled) return fail("Task cancelled");

    await setStatus("adding_to_cart");
    log("INFO", `[${RETAILER}] Adding to cart (Shopify ATC)...`);
    try {
      await page.click('button[name="add"]:not([disabled]), button.add-to-cart:not([disabled])', { timeout: 5000 });
    } catch (_) {
      return fail("Could not click Add to Cart button");
    }
    await humanDelay(1500, 2500);

    // Shopify cart drawer or redirect
    const viewCart = await page.$('a:has-text("View Cart"), a[href="/cart"]');
    if (viewCart) { await viewCart.click(); await humanDelay(1000, 1800); }
    else await page.goto("https://www.pokemoncenter.com/cart", { waitUntil: "domcontentloaded" });
    if (token.cancelled) return fail("Task cancelled");

    log("INFO", `[${RETAILER}] Proceeding to checkout (Shopify)...`);
    await setStatus("checking_out");
    const checkoutBtn = await page.$('button:has-text("Check out"), a:has-text("Check out"), input[name="checkout"]');
    if (!checkoutBtn) return fail("Checkout button not found");
    await checkoutBtn.click();
    await humanDelay(2000, 3000);
    if (token.cancelled) return fail("Task cancelled");

    // Shopify checkout steps
    if (profile) {
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
    }

    const continueShipping = await page.$('button#continue_button, button:has-text("Continue to shipping")');
    if (continueShipping) { await continueShipping.click(); await humanDelay(2000, 3000); }
    if (token.cancelled) return fail("Task cancelled");

    const continuePayment = await page.$('button#continue_button, button:has-text("Continue to payment")');
    if (continuePayment) { await continuePayment.click(); await humanDelay(2000, 3000); }
    if (token.cancelled) return fail("Task cancelled");

    if (profile) {
      const cards = await db.select().from(creditCardsTable).where(eq(creditCardsTable.profileId, profile.id));
      if (cards.length > 0) {
        const card = cards[0];
        log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
        try {
          const cardNumber = decrypt(card.encryptedNumber);
          const cvv = decrypt(card.encryptedCvv);
          // Shopify embeds card fields in iframes
          const cardFrame = page.frameLocator('[id*="card-fields-number"] iframe, iframe[title*="Card Number"]');
          try { await cardFrame.locator('input').fill(cardNumber); await humanDelay(100, 200); } catch (_) {}
          const expFrame = page.frameLocator('[id*="card-fields-expiry"] iframe, iframe[title*="Expiry"]');
          try { await expFrame.locator('input').fill(`${card.expiryMonth} / ${card.expiryYear.slice(-2)}`); await humanDelay(100, 200); } catch (_) {}
          const cvvFrame = page.frameLocator('[id*="card-fields-verification"] iframe, iframe[title*="Security"]');
          try { await cvvFrame.locator('input').fill(cvv); await humanDelay(100, 200); } catch (_) {}
        } catch (decryptErr) {
          log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
        }
      }
    }

    log("INFO", `[${RETAILER}] Submitting Shopify order...`);
    const placeOrder = await page.$('button#continue_button, button:has-text("Pay now"), button:has-text("Complete order")');
    if (!placeOrder) return fail("Place order button not found");
    await placeOrder.click();
    await humanDelay(3000, 5000);

    const confirmation = await page.$('[class*="thank-you"], h2:has-text("Thank you"), h1:has-text("Order confirmed")');
    if (!confirmation) return fail("Order confirmation not detected");

    const orderNumEl = await page.$('[class*="order-number"], [class*="confirmation-number"]');
    const orderNumber = (await orderNumEl?.textContent())?.trim().replace(/[^0-9A-Z-]/g, "") || `PCK-${Date.now()}`;

    log("SUCCESS", `[${RETAILER}] Order placed! Order #${orderNumber} — ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage: "", price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
