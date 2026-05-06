import type { Browser } from "playwright-core";
import { createBrowser, createStealthContext, humanDelay, humanType } from "../browser";
import type { RetailerContext, RetailerResult } from "./types";
import { decrypt } from "../crypto";
import { applyCartQuantity } from "./cartHelpers";
import { emitScreenshot } from "./screenshotUtil";
import { saveSession, loadSession, clearSession } from "./sessionCache";
import { handleChallengeInTask, navigateTo } from "./visualNavigator";

const RETAILER = "Costco";

export async function runCostco(ctx: RetailerContext): Promise<RetailerResult> {
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
        if (captchaMsg) return fail(captchaMsg);

        const titleEl = await page.$('h1.product-title, h1[itemprop="name"]');
        if (titleEl) productName = (await titleEl.textContent())?.trim() ?? productName;

        const priceEl = await page.$('.value.your-price span, [automation-id="itemPrice"]');
        if (priceEl) productPrice = (await priceEl.textContent())?.trim().replace(/[^0-9.]/g, "") ?? "";

        if (!productImage) {
          productImage = await page.$eval('meta[property="og:image"], img.product-image-main', el => el.getAttribute("content") || (el as any).src || "").catch(() => "");
        }

        const memberGate = await page.$('a:has-text("Sign In"), button:has-text("Member Sign In"), a:has-text("Account"), button:has-text("Account")');
        const costcoLoginIdentity = retailerAccount ?? (profile ? { email: profile.email, password: null } : null);
        if (memberGate && costcoLoginIdentity) {
          if (cachedSession && loginEmail) {
            log("WARN", `[${RETAILER}] Cached session expired — re-authenticating as ${loginEmail}...`);
            clearSession(RETAILER, loginEmail);
          } else {
            log("INFO", `[${RETAILER}] Member gate / account button detected — navigating to sign-in...`);
          }
          await memberGate.click();
          await humanDelay(1500, 2500);
          await screenshot(page);

          // If clicking the account button didn't reveal a login form, use visual
          // navigator to find the "Sign In" button in any slide-out panel that appeared.
          const loginFormVisible = await page.$('#signInName, input[name="logonId"], input[name="email"]').catch(() => null);
          if (!loginFormVisible) {
            const navResult = await navigateTo(page, RETAILER, "click the Sign In or Log In button to reach the login form", "member_gate").catch(() => null);
            if (navResult?.success) {
              log("INFO", `[${RETAILER}] Visual navigator found login path: ${navResult.message}`);
            }
            await humanDelay(1000, 1800);
            await screenshot(page);
          }

          try {
            await humanType(page, '#signInName, input[name="logonId"], input[name="email"]', costcoLoginIdentity.email);
            await humanDelay(300, 600);
            if (retailerAccount?.password) {
              try { await humanType(page, '#logonPassword, input[name="logonPassword"], input[name="password"]', retailerAccount.password); } catch (_) {}
              await humanDelay(200, 400);
            }
            const loginBtn = await page.$('button:has-text("Sign In"), button[type="submit"], #login-btn, input[type="submit"]');
            if (loginBtn) { await loginBtn.click(); await humanDelay(2000, 3000); }
            await screenshot(page);

            // Save session after login
            if (loginEmail) {
              saveSession(RETAILER, loginEmail, await context.storageState());
              log("INFO", `[${RETAILER}] Session cached for ${loginEmail}`);
            }
          } catch (_) {}
        }

        const atcBtn = await page.$('button#add-to-cart-btn:not(.disabled), button:has-text("Add to Cart"):not(.disabled)');
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
    try {
      await page.click('button#add-to-cart-btn, button:has-text("Add to Cart")', { timeout: 5000 });
    } catch (_) {
      return fail("Could not click Add to Cart button");
    }
    await humanDelay(1500, 2500);

    await page.goto("https://www.costco.com/CheckoutCartDisplayCmd", { waitUntil: "domcontentloaded" });
    await humanDelay(1000, 1800);
    if (token.cancelled) return fail("Task cancelled");

    const effectiveQty = await applyCartQuantity(page, task.quantity, log);
    log("INFO", `[${RETAILER}] Cart quantity: ${effectiveQty}`);

    log("INFO", `[${RETAILER}] Proceeding to checkout...`);
    await setStatus("checking_out");
    const checkoutBtn = await page.$('a:has-text("Checkout"), button:has-text("Proceed to Checkout")');
    if (!checkoutBtn) return fail("Checkout button not found");
    await checkoutBtn.click();
    await humanDelay(2000, 3000);
    if (token.cancelled) return fail("Task cancelled");
    await screenshot(page);

    // ── Shipping address (skip if saved on account) ──────────────────────────
    const hasAddressForm = await page.$('input[name="addressLine1"], input[name="firstName"]');
    if (hasAddressForm && profile) {
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
    } else if (!hasAddressForm) {
      log("INFO", `[${RETAILER}] Saved address on file — skipping address entry`);
    }

    const continueBtn = await page.$('button:has-text("Continue")');
    if (continueBtn) { await continueBtn.click(); await humanDelay(2000, 3000); }
    if (token.cancelled) return fail("Task cancelled");

    // ── Payment (skip if saved on account) ───────────────────────────────────
    const hasPaymentForm = await page.$('input[name="cardNumber"], input[id*="cardNumber"]');
    if (hasPaymentForm && card) {
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
    } else if (!hasPaymentForm) {
      log("INFO", `[${RETAILER}] Saved payment method on file — skipping card entry`);
    } else {
      log("WARN", `[${RETAILER}] No credit card provided — skipping payment step`);
    }

    await screenshot(page);
    log("INFO", `[${RETAILER}] Submitting order...`);
    const placeOrder = await page.$('button:has-text("Place Order"), input[value="Place Order"]');
    if (!placeOrder) return fail("Place order button not found");
    await placeOrder.click();
    await humanDelay(3000, 5000);

    await screenshot(page);
    const confirmation = await page.$('[class*="confirmation"], h1:has-text("Thank you"), h1:has-text("Order Confirmed")');
    if (!confirmation) return fail("Order confirmation not detected");

    // Save fresh session after successful order
    if (loginEmail) saveSession(RETAILER, loginEmail, await context.storageState());

    const orderNumber = `CST-${Date.now()}`;
    log("SUCCESS", `[${RETAILER}] Order placed! ${productName}${productPrice ? " @ $" + productPrice : ""}`);
    return { success: true, productName, productImage, price: productPrice || null, orderNumber, errorMessage: "" };
  } catch (err) {
    return fail(String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
