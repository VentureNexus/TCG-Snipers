import type { Page } from "playwright";

/**
 * After an item has been added to cart, attempt to set the quantity to
 * `requestedQty` while respecting any per-customer limit imposed by the site.
 *
 * Strategy:
 *  1. Find the first quantity input or select in the cart.
 *  2. Read the `max` attribute (or option count) to discover the site cap.
 *  3. Scan visible text for limit phrases like "Limit 2 per customer".
 *  4. Set quantity to min(requestedQty, detectedMax).
 *  5. Return the effective quantity actually used.
 *
 * Returns 1 if no quantity control is found (safe default).
 */
export async function applyCartQuantity(
  page: Page,
  requestedQty: number,
  log: (level: "INFO" | "WARN", msg: string) => void,
): Promise<number> {
  if (requestedQty <= 1) return 1;

  try {
    // ── 1. Detect site-imposed limit from page text ─────────────────────────
    let textCap = Infinity;
    try {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      // matches: "limit 2 per", "maximum of 3", "max qty: 4", "limit: 1 per customer"
      const limitMatch = bodyText.match(
        /(?:limit(?:ed to)?|maximum(?: of)?|max(?:imum)?\s*(?:qty|quantity)?)[:\s]+(\d+)/i,
      );
      if (limitMatch) {
        textCap = parseInt(limitMatch[1], 10);
        log("WARN", `[Cart] Site limit detected from page text: ${textCap}`);
      }
    } catch (_) {}

    // ── 2. Find quantity input (number or text) ──────────────────────────────
    const inputSel = [
      'input[type="number"][name*="quant"]',
      'input[type="number"][id*="quant"]',
      'input[type="number"][class*="quant"]',
      'input[name*="quantity"]',
      'input[id*="quantity"]',
      'input[name*="qty"]',
      'input[id*="qty"]',
      'input[type="number"]',
    ].join(", ");

    const qtyInput = await page.$(inputSel);
    if (qtyInput) {
      const maxAttr = await qtyInput.getAttribute("max");
      const inputCap = maxAttr ? parseInt(maxAttr, 10) : Infinity;
      if (Number.isFinite(inputCap) && inputCap < textCap) {
        log("WARN", `[Cart] Site quantity cap from input[max]: ${inputCap}`);
      }
      const effectiveCap = Math.min(
        Number.isFinite(inputCap) ? inputCap : Infinity,
        Number.isFinite(textCap) ? textCap : Infinity,
      );
      const qty = Number.isFinite(effectiveCap)
        ? Math.min(requestedQty, effectiveCap)
        : requestedQty;

      if (qty !== requestedQty) {
        log("WARN", `[Cart] Requested qty ${requestedQty} capped to ${qty} by site limit`);
      }

      await qtyInput.click({ clickCount: 3 });
      await qtyInput.fill(String(qty));
      // Trigger change events so the cart recalculates
      await qtyInput.press("Tab");
      await page.waitForTimeout(600);
      log("INFO", `[Cart] Quantity set to ${qty}`);
      return qty;
    }

    // ── 3. Fallback: try a <select> quantity control ─────────────────────────
    const selectSel = [
      'select[name*="quantity"]',
      'select[id*="quantity"]',
      'select[name*="qty"]',
      'select[id*="qty"]',
    ].join(", ");

    const qtySelect = await page.$(selectSel);
    if (qtySelect) {
      // Highest option value = site cap
      // evaluate runs in the browser context where HTMLSelectElement is available
      const options: string[] = await qtySelect.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el: any) => Array.from(el.options).map((o: any) => String(o.value)),
      );
      const selectCap = options.reduce((max, v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);

      const effectiveCap = Math.min(
        selectCap > 0 ? selectCap : Infinity,
        Number.isFinite(textCap) ? textCap : Infinity,
      );
      const qty = Number.isFinite(effectiveCap) && effectiveCap > 0
        ? Math.min(requestedQty, effectiveCap)
        : requestedQty;

      if (qty !== requestedQty) {
        log("WARN", `[Cart] Requested qty ${requestedQty} capped to ${qty} by site limit (select)`);
      }

      try {
        await qtySelect.selectOption(String(qty));
        await page.waitForTimeout(600);
        log("INFO", `[Cart] Quantity set to ${qty} (select)`);
      } catch (_) {
        // value not in options — use highest available
        const best = options
          .map((v) => parseInt(v, 10))
          .filter((n) => Number.isFinite(n) && n >= 1)
          .sort((a, b) => b - a)[0] ?? 1;
        await qtySelect.selectOption(String(best));
        await page.waitForTimeout(600);
        log("WARN", `[Cart] Qty ${qty} not in options — used highest available: ${best}`);
        return best;
      }
      return qty;
    }

    // No control found — item was added at qty=1 by the ATC click
    if (requestedQty > 1) {
      log("WARN", `[Cart] No quantity control found — proceeding with qty 1`);
    }
    return 1;
  } catch (err) {
    log("WARN", `[Cart] applyCartQuantity error: ${String(err)}`);
    return 1;
  }
}
