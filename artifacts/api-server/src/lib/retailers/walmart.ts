import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { smartClick } from "../checkoutLearner";
import { imapFetchCode } from "../imap";
import { emitScreenshot } from "./screenshotUtil";

const RETAILER = "Walmart";

export async function runWalmart(ctx: RetailerContext): Promise<RetailerResult> {
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

    const targetUrl = task.productUrl ||
      `https://www.walmart.com/search?q=${encodeURIComponent(task.productKeywords ?? "")}`;

    await setStatus("monitoring");
    let inStock = false;
    let buyNowAvailable = false;
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

        // Check Buy Now first, then ATC
        const buyNowBtn = await page.$(
          'button[data-automation-id="buy-now"]:not([disabled]), ' +
          'a[link-identifier="buyNow"]:not([disabled])'
        );
        const atcBtn = await page.$(
          'button[data-automation-id="add-to-cart"]:not([disabled]), button:has-text("Add to cart"):not([disabled])'
        );
        const purchaseBtn = buyNowBtn ?? atcBtn;

        if (purchaseBtn) {
          if (task.maxPrice != null && productPrice) {
            const priceCents = Math.round(parseFloat(productPrice) * 100);
            if (Number.isFinite(priceCents) && priceCents > task.maxPrice) {
              log("WARN", `[${RETAILER}] Price $${productPrice} exceeds limit $${(task.maxPrice / 100).toFixed(2)} — waiting for price to drop...`);
              continue;
            }
          }
          buyNowAvailable = !!buyNowBtn;
          log("SUCCESS", `[${RETAILER}] In stock${buyNowAvailable ? " (Buy Now available)" : ""}: ${productName}${productPrice ? " @ $" + productPrice : ""}`);
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

    if (buyNowAvailable) {
      // ── Buy Now path: skip cart entirely ──────────────────────────────────
      log("INFO", `[${RETAILER}] Clicking Buy Now — skipping cart for faster checkout...`);
      await setStatus("checking_out");
      const clicked = await smartClick(page, RETAILER, "buy_now", [
        "button[data-automation-id='buy-now']:not([disabled])",
        "a[link-identifier='buyNow']:not([disabled])",
      ]);
      if (!clicked) {
        // Fall back to ATC if Buy Now click fails
        log("WARN", `[${RETAILER}] Buy Now click failed — falling back to ATC`);
        buyNowAvailable = false;
      } else {
        await humanDelay(2000, 3000);
        await screenshot(page);
      }
    }

    if (!buyNowAvailable) {
      // ── Standard Add-to-Cart path ──────────────────────────────────────────
      await setStatus("adding_to_cart");
      log("INFO", `[${RETAILER}] Adding to cart...`);
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
      await humanDelay(2000, 3000);
      if (token.cancelled) return fail("Task cancelled");
      await screenshot(page);
    }

    // ── Sign-in (if prompted) ──────────────────────────────────────────────
    const walmartSignInEmail = await page.$('input[name="email"], input[type="email"], input[id*="email"]');
    const loginIdentity = retailerAccount ?? (profile ? { email: profile.email, password: null } : null);
    if (walmartSignInEmail && loginIdentity) {
      log("INFO", `[${RETAILER}] Sign-in required — logging in as ${loginIdentity.email}...`);
      try { await humanType(page, 'input[name="email"], input[type="email"]', loginIdentity.email); } catch (_) {}
      await humanDelay(300, 600);

      const signInContinue = await page.$(
        'button:has-text("Continue"), button:has-text("Sign in"), ' +
        'button[type="submit"], input[type="submit"]',
      );
      if (signInContinue) {
        await signInContinue.click();
        await humanDelay(2000, 3000);
      }
      if (token.cancelled) return fail("Task cancelled");
      await screenshot(page);

      const passwordField = await page.$('input[name="password"], input[type="password"]');
      if (passwordField && retailerAccount?.password) {
        log("INFO", `[${RETAILER}] Password prompt — entering credentials...`);
        try { await humanType(page, 'input[name="password"], input[type="password"]', retailerAccount.password); } catch (_) {}
        await humanDelay(300, 600);
        const submitBtn = await page.$('button[type="submit"], button:has-text("Sign in"), button:has-text("Continue")');
        if (submitBtn) { await submitBtn.click(); await humanDelay(2000, 3000); }
        await screenshot(page);
      } else {
        const otpField = await page.$('input[name="code"], input[name="otpCode"], input[placeholder*="code" i], input[aria-label*="code" i]');
        const walmartImapConfig = profile?.imapHost
          ? { host: profile.imapHost, port: parseInt(profile.imapPort, 10), user: profile.imapUser, password: profile.imapPassword }
          : ctx.globalImapConfig;

        if (otpField && walmartImapConfig) {
          log("INFO", `[${RETAILER}] OTP prompt — fetching code from IMAP...`);
          const code = await imapFetchCode(walmartImapConfig, /walmart|verification|sign.?in|code/i, 30000);
          if (code) {
            log("SUCCESS", `[${RETAILER}] OTP code retrieved`);
            await humanType(page, 'input[name="code"], input[name="otpCode"]', code);
            await humanDelay(300, 600);
            const submitOtp = await page.$('button[type="submit"], button:has-text("Verify"), button:has-text("Continue")');
            if (submitOtp) { await submitOtp.click(); await humanDelay(2000, 3000); }
            await screenshot(page);
          } else {
            log("WARN", `[${RETAILER}] OTP code not found in IMAP within timeout — continuing anyway`);
          }
        } else if (!otpField) {
          log("INFO", `[${RETAILER}] No OTP or password prompt — proceeding`);
        } else {
          log("WARN", `[${RETAILER}] OTP prompt visible but no IMAP config set — cannot fetch code`);
        }
      }
      await humanDelay(1500, 2500);
      if (token.cancelled) return fail("Task cancelled");
    } else if (walmartSignInEmail && !loginIdentity) {
      return fail("Walmart requires sign-in but no profile or account is assigned to this task");
    }

    // ── Shipping address (skip if saved on account) ───────────────────────
    const hasAddressForm = await page.$('input[name="addressLineOne"], input[id*="address-1"], input[name="firstName"]');
    if (hasAddressForm && profile) {
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
    } else if (!hasAddressForm) {
      log("INFO", `[${RETAILER}] Saved address on file — skipping address entry`);
    }

    // ── Payment (skip if saved on account) ───────────────────────────────
    const hasPaymentForm = await page.$('input[name="cardNumber"], input[id*="card-number"]');
    if (hasPaymentForm && card) {
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
    } else if (!hasPaymentForm) {
      log("INFO", `[${RETAILER}] Saved payment method on file — skipping card entry`);
    } else {
      log("WARN", `[${RETAILER}] No credit card provided — skipping payment step`);
    }

    await screenshot(page);
    log("INFO", `[${RETAILER}] Submitting order...`);
    const placeOrderClicked = await smartClick(page, RETAILER, "place_order", [
      "button:has-text('Place Order')",
      "button:has-text('Place order')",
      "[data-automation-id='place-order-btn']",
      "button:has-text('Submit order')",
    ]);
    if (!placeOrderClicked) return fail("Place order button not found");
    await humanDelay(3000, 5000);

    await screenshot(page);
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
