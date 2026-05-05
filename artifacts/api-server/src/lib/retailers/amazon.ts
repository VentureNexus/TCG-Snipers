import type { Browser } from "playwright";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import { imapFetchCode } from "../imap";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { db, creditCardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const RETAILER = "Amazon";

export async function runAmazon(ctx: RetailerContext): Promise<RetailerResult> {
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

    const targetUrl = task.productUrl || `https://www.amazon.com/s?k=${encodeURIComponent(task.productKeywords)}`;
    await setStatus("monitoring");
    let inStock = false;
    let productName = task.productUrl || task.productKeywords || "Amazon Product";
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

        const titleEl = await page.$('#productTitle, h1.a-size-large');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        const atcBtn = await page.$('#add-to-cart-button:not([disabled]), #buy-now-button:not([disabled])');
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
        log("WARN", `[${RETAILER}] ATC button not available — out of stock or captcha`);
      } catch (err) {
        log("WARN", `[${RETAILER}] Navigation error: ${String(err)}`);
      }
    }

    if (!inStock) return fail("Product out of stock after all retries");
    if (token.cancelled) return fail("Task cancelled");

    await setStatus("adding_to_cart");
    log("INFO", `[${RETAILER}] Adding to cart...`);
    await page.click('#add-to-cart-button', { timeout: 5000 });
    await humanDelay(1500, 2500);

    const proceedToCart = await page.$('a:has-text("Cart"), a[href*="/cart"]');
    if (proceedToCart) await proceedToCart.click();
    await page.goto("https://www.amazon.com/gp/cart/view.html", { waitUntil: "domcontentloaded" });
    await humanDelay(1000, 1800);
    if (token.cancelled) return fail("Task cancelled");

    log("INFO", `[${RETAILER}] Proceeding to checkout...`);
    await setStatus("checking_out");
    const checkoutBtn = await page.$('[name="proceedToRetailCheckout"], button:has-text("Proceed to checkout")');
    if (!checkoutBtn) return fail("Checkout button not found");
    await checkoutBtn.click();
    await humanDelay(2000, 3000);
    if (token.cancelled) return fail("Task cancelled");

    const signInCheck = await page.$('input[name="email"], #ap_email');
    if (signInCheck && profile) {
      log("INFO", `[${RETAILER}] Signing in as ${profile.email}...`);
      try { await humanType(page, '#ap_email', profile.email); } catch (_) {}
      const continueBtn = await page.$('#continue, input[id="continue"]');
      if (continueBtn) { await continueBtn.click(); await humanDelay(1500, 2500); }
      if (token.cancelled) return fail("Task cancelled");

      const otpCheck = await page.$('input[name="otpCode"], #auth-mfa-otpcode');
      if (otpCheck && profile.imapHost) {
        log("INFO", `[${RETAILER}] OTP prompt — fetching code from IMAP...`);
        const code = await imapFetchCode(
          { host: profile.imapHost, port: parseInt(profile.imapPort, 10), user: profile.imapUser, password: profile.imapPassword },
          /amazon|otp|sign.?in/i,
          30000,
        );
        if (code) {
          log("SUCCESS", `[${RETAILER}] OTP code retrieved`);
          await humanType(page, '#auth-mfa-otpcode', code);
          const submitOtp = await page.$('input[id="auth-signin-button"]');
          if (submitOtp) { await submitOtp.click(); await humanDelay(2000, 3000); }
        } else {
          log("WARN", `[${RETAILER}] OTP code not found in IMAP within timeout`);
        }
      }
    }

    if (profile) {
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

    const continueShipping = await page.$('input[name="continue-to-payment"], button:has-text("Continue"), input[value="Continue"]');
    if (continueShipping) { await continueShipping.click(); await humanDelay(2000, 3000); }
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
      }
    }

    log("INFO", `[${RETAILER}] Submitting order...`);
    const placeOrder = await page.$('input[name="placeYourOrder1"], button:has-text("Place your order")');
    if (!placeOrder) return fail("Place order button not found");
    await placeOrder.click();
    await humanDelay(3000, 5000);

    const confirmation = await page.$('[class*="confirmation"], h1:has-text("order"), h4:has-text("order")');
    if (!confirmation) return fail("Order confirmation not detected");

    const orderNumber = `AMZ-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage: "", price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
