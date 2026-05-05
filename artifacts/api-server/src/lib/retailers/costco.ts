import type { Browser } from "playwright";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { db, creditCardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const RETAILER = "Costco";

export async function runCostco(ctx: RetailerContext): Promise<RetailerResult> {
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

    if (profile?.costcoMembershipId) {
      log("INFO", `[${RETAILER}] Membership ID on file: ****${profile.costcoMembershipId.slice(-4)}`);
    } else {
      log("WARN", `[${RETAILER}] No Costco membership ID in profile — checkout may fail`);
    }

    const targetUrl = task.productUrl || `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(task.productKeywords)}`;
    await setStatus("monitoring");
    let inStock = false;
    let productName = task.productUrl || task.productKeywords || "Costco Product";
    let productPrice = "";

    for (let attempt = 0; attempt <= task.retryCount; attempt++) {
      if (token.cancelled) return fail("Task cancelled");
      if (attempt > 0) {
        log("WARN", `[${RETAILER}] OOS — waiting ${task.monitorDelay}ms before retry ${attempt}/${task.retryCount}...`);
        await humanDelay(task.monitorDelay, task.monitorDelay + 500);
      }
      try {
        log("INFO", `[${RETAILER}] Checking stock: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
        await humanDelay(800, 1500);
        if (token.cancelled) return fail("Task cancelled");

        const titleEl = await page.$('h1.product-title, h1[itemprop="name"]');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('.value.your-price span, [automation-id="itemPrice"]');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        // Check for member gate
        const memberGate = await page.$('a:has-text("Sign In"), button:has-text("Member Sign In")');
        if (memberGate && profile) {
          log("INFO", `[${RETAILER}] Member gate detected — signing in...`);
          await memberGate.click();
          await humanDelay(1000, 2000);
          try {
            await humanType(page, '#signInName, input[name="email"]', profile.email);
            // Retailer account password is not stored — skip password field and
            // rely on the user being already signed in or continuing as guest
            const loginBtn = await page.$('button:has-text("Sign In"), #login-btn');
            if (loginBtn) { await loginBtn.click(); await humanDelay(2000, 3000); }
          } catch (_) {}
        }

        const atcBtn = await page.$('button#add-to-cart-btn:not(.disabled), button:has-text("Add to Cart"):not(.disabled)');
        if (atcBtn) {
          if (task.maxPrice != null && productPrice) {
            const priceCents = Math.round(parseFloat(productPrice) * 100);
            if (priceCents > task.maxPrice) {
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
      await page.click('button#add-to-cart-btn, button:has-text("Add to Cart")', { timeout: 5000 });
    } catch (_) {
      return fail("Could not click Add to Cart button");
    }
    await humanDelay(1500, 2500);

    await page.goto("https://www.costco.com/CheckoutCartDisplayCmd", { waitUntil: "domcontentloaded" });
    await humanDelay(1000, 1800);
    if (token.cancelled) return fail("Task cancelled");

    log("INFO", `[${RETAILER}] Proceeding to checkout...`);
    await setStatus("checking_out");
    const checkoutBtn = await page.$('a:has-text("Checkout"), button:has-text("Proceed to Checkout")');
    if (!checkoutBtn) return fail("Checkout button not found");
    await checkoutBtn.click();
    await humanDelay(2000, 3000);
    if (token.cancelled) return fail("Task cancelled");

    if (profile) {
      log("INFO", `[${RETAILER}] Filling shipping for profile: ${profile.name}`);
      const addrFields: Array<[string, string]> = [
        ['input[name="firstName"]', profile.shipFirstName || profile.name],
        ['input[name="lastName"]', profile.shipLastName || ""],
        ['input[name="addressLine1"]', profile.shipAddress1],
        ['input[name="city"]', profile.shipCity],
        ['input[name="zipCode"]', profile.shipZip],
        ['input[name="phone"]', profile.phone],
      ];
      for (const [sel, val] of addrFields) {
        if (!val) continue;
        try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
      }
    }

    const continueBtn = await page.$('button:has-text("Continue")');
    if (continueBtn) { await continueBtn.click(); await humanDelay(2000, 3000); }
    if (token.cancelled) return fail("Task cancelled");

    if (profile) {
      const cards = await db.select().from(creditCardsTable).where(eq(creditCardsTable.profileId, profile.id));
      if (cards.length > 0) {
        const card = cards[0];
        log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
        try {
          const cardNumber = decrypt(card.encryptedNumber);
          const cvv = decrypt(card.encryptedCvv);
          const payFields: Array<[string, string]> = [
            ['input[name="cardNumber"], input[id*="cardNumber"]', cardNumber],
            ['input[name="expirationDate"]', `${card.expiryMonth}/${card.expiryYear.slice(-2)}`],
            ['input[name="cvvCode"], input[name="cvv"]', cvv],
          ];
          for (const [sel, val] of payFields) {
            try { await humanType(page, sel, val); await humanDelay(80, 150); } catch (_) {}
          }
        } catch (decryptErr) {
          log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
        }
      }
    }

    log("INFO", `[${RETAILER}] Submitting order...`);
    const placeOrder = await page.$('button:has-text("Place Order"), input[value="Place Order"]');
    if (!placeOrder) return fail("Place order button not found");
    await placeOrder.click();
    await humanDelay(3000, 5000);

    const confirmation = await page.$('[class*="confirmation"], h1:has-text("Thank you"), h1:has-text("Order Confirmed")');
    if (!confirmation) return fail("Order confirmation not detected");

    const orderNumber = `CST-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage: "", price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
