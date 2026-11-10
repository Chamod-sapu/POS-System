import { test, expect } from '@playwright/test';

test.describe('Role-Based Access Control E2E Verification', () => {
  test('Cashier role cannot access /reports, /staff, or /audit', async ({ page }) => {
    // Log in as Cashier
    await page.goto('/login');
    await page.fill('input[type="email"]', 'cashier@wewala.lk');
    await page.fill('input[type="password"]', 'CashierPass123!');
    await page.click('button[type="submit"]');

    // Attempt direct URL navigation to /reports
    await page.goto('/reports');
    const unauthorizedReports = page.locator('text=Not Authorised, text=Access Denied, text=403');
    await expect(unauthorizedReports).toBeVisible({ timeout: 5000 });

    // Attempt direct URL navigation to /staff
    await page.goto('/staff');
    const unauthorizedStaff = page.locator('text=Not Authorised, text=Access Denied, text=403');
    await expect(unauthorizedStaff).toBeVisible({ timeout: 5000 });

    // Attempt direct URL navigation to /audit
    await page.goto('/audit');
    const unauthorizedAudit = page.locator('text=Not Authorised, text=Access Denied, text=403');
    await expect(unauthorizedAudit).toBeVisible({ timeout: 5000 });
  });

  test('Manager role can access /reports and /inventory, but cannot access /staff', async ({ page }) => {
    // Log in as Manager
    await page.goto('/login');
    await page.fill('input[type="email"]', 'manager@wewala.lk');
    await page.fill('input[type="password"]', 'ManagerPass123!');
    await page.click('button[type="submit"]');

    // Manager can access /reports
    await page.goto('/reports');
    await expect(page).toHaveURL(/.*reports/);

    // Manager can access /inventory
    await page.goto('/inventory');
    await expect(page).toHaveURL(/.*inventory/);

    // Manager is blocked from /staff (owner only)
    await page.goto('/staff');
    const unauthorizedStaff = page.locator('text=Not Authorised, text=Access Denied, text=403');
    await expect(unauthorizedStaff).toBeVisible({ timeout: 5000 });
  });
});

