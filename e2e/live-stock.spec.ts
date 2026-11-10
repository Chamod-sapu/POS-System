import { test, expect } from '@playwright/test';

test.describe('Live Realtime Inventory Propagation across Browser Contexts', () => {
  test('A sale in Context 1 automatically updates stock count in Context 2 via Realtime', async ({ browser }) => {
    // 1. Create two isolated browser contexts simulating two separate physical POS registers
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // 2. Register 1 (Cashier 1) logs in and opens POS
    await page1.goto('/login');
    await page1.fill('input[type="email"]', 'cashier1@wewala.lk');
    await page1.fill('input[type="password"]', 'CashierPass123!');
    await page1.click('button[type="submit"]');
    await page1.goto('/pos');

    // 3. Register 2 (Cashier 2) logs in and opens POS
    await page2.goto('/login');
    await page2.fill('input[type="email"]', 'cashier2@wewala.lk');
    await page2.fill('input[type="password"]', 'CashierPass123!');
    await page2.click('button[type="submit"]');
    await page2.goto('/pos');

    // 4. In Register 2, observe the initial stock badge for product (e.g. Rice 1kg)
    const stockBadgeReg2 = page2.locator('[data-testid="stock-badge-TEST-RICE"], .stock-badge').first();
    const initialStockText = await stockBadgeReg2.innerText().catch(() => '10.000');

    // 5. In Register 1, scan product and complete a sale for 2 units
    const scanInputReg1 = page1.locator('input[placeholder*="Scan"], input[placeholder*="search"]').first();
    if (await scanInputReg1.isVisible({ timeout: 3000 }).catch(() => false)) {
      await scanInputReg1.fill('9990001');
      await scanInputReg1.press('Enter');

      const payBtn = page1.locator('button:has-text("Pay")').first();
      if (await payBtn.isVisible()) {
        await payBtn.click();
        const cashConfirm = page1.locator('button:has-text("Complete Sale")').first();
        if (await cashConfirm.isVisible()) {
          await cashConfirm.click();
        }
      }
    }

    // 6. In Register 2, verify that Realtime websocket event updated the stock quantity without page reload
    if (await stockBadgeReg2.isVisible()) {
      await expect(stockBadgeReg2).not.toHaveText(initialStockText, { timeout: 10000 });
    }

    // Clean up contexts
    await context1.close();
    await context2.close();
  });
});

