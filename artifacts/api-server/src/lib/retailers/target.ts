import type { Browser } from "playwright";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import { imapFetchCode } from "../imap";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { db, creditCardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const RETAILER = "Target";

async function waitForAddToCart(
  page: import("playwright").Page,
  timeoutMs: number,
  token: { cancelled: boolean },
): Promise<boolean> {
  const selectors = [
    '[data-test="shoppingCartButton"]:not([disabled])',
    'button[data-test="addToCartButton"]:not([disabled])',
    'button:has-text("Add to cart"):not([disabled])',
    'button:has-text("Add to Cart"):not([disabled])',
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (token.cancelled) return false;
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const disabled = await el.getAttribute("disabled");
          const ariaDisabled = await el.getAttribute("aria-disabled");
          if (disabled === null && ariaDisabled !== "true") return true;
        }
      } catch (_) {}
    }
    await humanDelay(500, 1000);
  }
  return false;
}

export async function runTarget(ctx: RetailerContext): Promise<RetailerResult> {
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

    const targetUrl = task.productUrl || `https://www.target.com/s?searchTerm=${encodeURIComponent(task.productKeywords)}`;
    log("INFO", `[${RETAILER}] Navigating to product page: ${targetUrl}`);

    await setStatus("monitoring");
    let inStock = false;
    let productName = task.productUrl || task.productKeywords || "Target Product";
    let productPrice = "";

    const isUnlimited = task.retryCount === -1;
    for (let attempt = 0; isUnlimited || attempt <= task.retryCount; attempt++) {
      if (token.cancelled) return fail("Task cancelled");
      if (attempt > 0) {
        log("WARN", `[${RETAILER}] OOS — waiting ${task.monitorDelay}ms before retry ${attempt}/${isUnlimited ? "∞" : task.retryCount}...`);
        await humanDelay(task.monitorDelay, task.monitorDelay + 500);
      }

      try {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
        await humanDelay(800, 1500);
        if (token.cancelled) return fail("Task cancelled");

        const titleEl = await page.$('h1[data-test="product-title"]');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('[data-test="product-price"]');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        log("INFO", `[${RETAILER}] Checking availability: ${productName}`);
        inStock = await waitForAddToCart(page, 5000, token);
        if (inStock) {
          if (task.maxPrice != null && productPrice) {
            const priceCents = Math.round(parseFloat(productPrice) * 100);
            if (Number.isFinite(priceCents) && priceCents > task.maxPrice) {
              log("WARN", `[${RETAILER}] Price $${productPrice} exceeds limit $${(task.maxPrice / 100).toFixed(2)} — waiting for price to drop...`);
              inStock = false;
              continue;
            }
          }
          log("SUCCESS", `[${RETAILER}] In stock! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
          break;
        } else {
          log("WARN", `[${RETAILER}] Out of stock or ATC button not found.`);
        }
      } catch (err) {
        log("WARN", `[${RETAILER}] Navigation error: ${String(err)}`);
      }
    }

    if (!inStock) return fail("Product out of stock after all retries");
    if (token.cancelled) return fail("Task cancelled");

    await setStatus("adding_to_cart");
    log("INFO", `[${RETAILER}] Adding ${task.quantity}x to cart...`);

    const atcSelectors = [
      '[data-test="shoppingCartButton"]:not([disabled])',
      'button[data-test="addToCartButton"]:not([disabled])',
      'button:has-text("Add to cart"):not([disabled])',
    ];
    let clicked = false;
    for (const sel of atcSelectors) {
      try {
        await page.click(sel, { timeout: 5000 });
        clicked = true;
        break;
      } catch (_) {}
    }
    if (!clicked) return fail("Could not click Add to Cart button");

    await humanDelay(1500, 2500);
    if (token.cancelled) return fail("Task cancelled");

    log("INFO", `[${RETAILER}] Item added — navigating to cart...`);
    await page.goto("https://www.target.com/cart", { waitUntil: "domcontentloaded" });
    await humanDelay(1000, 1800);

    const cartEmpty = await page.$('[data-test="empty-cart"]');
    if (cartEmpty) return fail("Cart is empty after ATC — item may not have been added");

    log("SUCCESS", `[${RETAILER}] Cart verified. Proceeding to checkout...`);
    await setStatus("checking_out");

    const checkoutBtn = await page.$('button[data-test="checkout-button"], a[data-test="checkout-button"]');
    if (!checkoutBtn) return fail("Checkout button not found");
    await checkoutBtn.click();
    await humanDelay(2000, 3000);
    if (token.cancelled) return fail("Task cancelled");

    log("INFO", `[${RETAILER}] Entering guest checkout...`);
    const guestBtn = await page.$('button:has-text("Continue as guest"), button[data-test="continue-as-guest"]');
    if (guestBtn) {
      await guestBtn.click();
      await humanDelay(1500, 2500);
    }

    if (profile) {
      log("INFO", `[${RETAILER}] Filling shipping address for profile: ${profile.name}`);
      const fields: Array<[string, string]> = [
        ['[id="email"], input[name="email"], input[type="email"]', profile.email],
        ['input[name="firstName"], input[id="firstName"]', profile.shipFirstName || profile.name.split(" ")[0]],
        ['input[name="lastName"], input[id="lastName"]', profile.shipLastName || profile.name.split(" ")[1] || ""],
        ['input[name="address1"], input[id="line1"]', profile.shipAddress1],
        ['input[name="city"], input[id="city"]', profile.shipCity],
        ['input[name="zip"], input[id="zipCode"]', profile.shipZip],
        ['input[name="phone"], input[type="tel"]', profile.phone],
      ];
      for (const [sel, val] of fields) {
        if (!val) continue;
        try {
          await humanType(page, sel, val);
          await humanDelay(100, 200);
        } catch (_) {}
      }
    }

    const continueBtn = await page.$('button:has-text("Continue"), button[data-test="save-address-button"]');
    if (continueBtn) {
      await continueBtn.click();
      await humanDelay(2000, 3000);
    }
    if (token.cancelled) return fail("Task cancelled");

    log("INFO", `[${RETAILER}] Selecting shipping method...`);
    await humanDelay(1000, 1500);
    const shipBtn = await page.$('button:has-text("Continue"), button[data-test="continue-to-payment"]');
    if (shipBtn) {
      await shipBtn.click();
      await humanDelay(1500, 2500);
    }

    if (profile) {
      const cards = await db.select().from(creditCardsTable).where(eq(creditCardsTable.profileId, profile.id));
      if (cards.length > 0) {
        const card = cards[0];
        log("INFO", `[${RETAILER}] Entering payment (${card.cardType} ****${card.lastFour})...`);
        try {
          const cardNumber = decrypt(card.encryptedNumber);
          const cvv = decrypt(card.encryptedCvv);
          const cardFields: Array<[string, string]> = [
            ['input[name="cardNumber"], input[id="creditCardInput-cardNumber"]', cardNumber],
            ['input[name="expirationDate"], input[id="creditCardInput-expirationDate"]', `${card.expiryMonth}/${card.expiryYear}`],
            ['input[name="cvv"], input[id="creditCardInput-cvv"]', cvv],
          ];
          for (const [sel, val] of cardFields) {
            try {
              await humanType(page, sel, val);
              await humanDelay(100, 200);
            } catch (_) {}
          }
        } catch (decryptErr) {
          log("WARN", `[${RETAILER}] Could not decrypt card: ${String(decryptErr)}`);
        }
      } else {
        log("WARN", `[${RETAILER}] No credit card found for profile — skipping payment step`);
      }
    }

    const otpTrigger = await page.$('input[aria-label*="verification"], input[placeholder*="code"], input[placeholder*="Code"]');
    const targetImapConfig = profile?.imapHost
      ? { host: profile.imapHost, port: parseInt(profile.imapPort, 10), user: profile.imapUser, password: profile.imapPassword }
      : ctx.globalImapConfig;
    if (otpTrigger && targetImapConfig) {
      log("INFO", `[${RETAILER}] OTP/verification prompt detected — polling IMAP for code (30s timeout)...`);
      const code = await imapFetchCode(
        targetImapConfig,
        /target|verification/i,
        30000,
      );
      if (code) {
        log("SUCCESS", `[${RETAILER}] Verification code retrieved — entering...`);
        await humanType(page, 'input[aria-label*="verification"], input[placeholder*="code"]', code);
        await humanDelay(300, 600);
      } else {
        log("WARN", `[${RETAILER}] No verification code found within timeout`);
      }
    }

    if (token.cancelled) return fail("Task cancelled");

    log("INFO", `[${RETAILER}] Submitting order...`);
    const placeOrderBtn = await page.$(
      'button:has-text("Place your order"), button[data-test="placeOrderButton"], button:has-text("Place Order")',
    );
    if (!placeOrderBtn) return fail("Place order button not found");
    await placeOrderBtn.click();
    await humanDelay(3000, 5000);

    const confirmationEl = await page.$(
      '[data-test="orderConfirmationNumber"], [class*="confirmation"], h1:has-text("Order confirmed"), h1:has-text("Thank you")',
    );
    if (!confirmationEl) return fail("Order confirmation not detected — checkout may have failed");

    const orderText = (await confirmationEl.textContent())?.trim() ?? "";
    const orderNumberMatch = orderText.match(/\d{6,}/);
    const orderNumber = orderNumberMatch ? orderNumberMatch[0] : `TGT-${Date.now()}`;

    log("SUCCESS", `[${RETAILER}] Order placed! Order #${orderNumber} — ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage: "", price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
