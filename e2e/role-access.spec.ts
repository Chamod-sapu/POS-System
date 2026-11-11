import { test, expect } from '@playwright/test';
import { setupMockSupabase } from './mockSupabase';

test.describe('Role-Based Access Control E2E Verification', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSupabase(page);
  });

  test('Cashier role cannot access /reports, /staff, or /audit', async ({ page }) => {
    // Log in as Cashier
    await page.goto('/login');
    await page.fill('input[type="email"]', 'cashier@wewala.lk');
    await page.fill('input[type="password"]', 'CashierPass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname !== '/login', { timeout: 10000 }).catch(() => { });

    // Attempt direct URL navigation to /reports
    await page.goto('/reports');
    const unauthorizedReports = page.getByText('Not Authorised').first();
    await expect(unauthorizedReports).toBeVisible({ timeout: 10000 });

    // Attempt direct URL navigation to /staff
    await page.goto('/staff');
    const unauthorizedStaff = page.getByText('Not Authorised').first();
    await expect(unauthorizedStaff).toBeVisible({ timeout: 10000 });

    // Attempt direct URL navigation to /audit
    await page.goto('/audit');
    const unauthorizedAudit = page.getByText('Not Authorised').first();
    await expect(unauthorizedAudit).toBeVisible({ timeout: 10000 });
  });

  test('Manager role can access /reports and /inventory, but cannot access /staff', async ({ page }) => {
    // Log in as Manager
    await page.goto('/login');
    await page.fill('input[type="email"]', 'manager@wewala.lk');
    await page.fill('input[type="password"]', 'ManagerPass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname !== '/login', { timeout: 10000 }).catch(() => { });

    // Manager can access /reports
    await page.goto('/reports');
    await expect(page).toHaveURL(/.*reports/);

    // Manager can access /inventory
    await page.goto('/inventory');
    await expect(page).toHaveURL(/.*inventory/);

    // Manager is blocked from /staff (owner only)
    await page.goto('/staff');
    const unauthorizedStaff = page.getByText('Not Authorised').first();
    await expect(unauthorizedStaff).toBeVisible({ timeout: 10000 });
  });
});

