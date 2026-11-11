import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { setupMockSupabase } from './mockSupabase';

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
];

const THEMES = ['light', 'dark'] as const;

const PAGES = [
  { path: '/login', name: 'login', auth: false },
  { path: '/pos', name: 'pos', auth: true },
  { path: '/', name: 'dashboard', auth: true },
  { path: '/sales', name: 'sales', auth: true },
  { path: '/reports', name: 'reports', auth: true },
  { path: '/inventory', name: 'inventory', auth: true },
  { path: '/customer-display', name: 'customer-display', auth: false },
];

test.describe('Automated UI Screen Capture Suite', () => {
  const outputDir = path.resolve(process.cwd(), 'docs/ui-screenshots');

  test.beforeAll(async () => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`Captures screens at ${vp.name} in ${theme} theme`, async ({ page }) => {
        await setupMockSupabase(page, { currentRole: 'manager' });
        await page.setViewportSize({ width: vp.width, height: vp.height });

        // Set theme in localStorage
        await page.addInitScript(({ th }) => {
          window.localStorage.setItem('wewala_pos_theme', th);
          if (th === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }, { th: theme });

        // First log in as manager/owner if needed
        await page.goto('/login');
        await page.waitForLoadState('networkidle');

        // Capture login screen
        const loginFilename = `${outputDir}/login_${vp.name}_${theme}.png`;
        await page.screenshot({ path: loginFilename, fullPage: true });

        // Authenticate
        await page.fill('input[type="email"]', 'manager@wewala.lk');
        await page.fill('input[type="password"]', 'ManagerPass123!');
        await page.click('button[type="submit"]');

        // Wait for redirect to dashboard or POS
        await page.waitForURL((url) => url.pathname !== '/login', { timeout: 10000 }).catch(() => {});

        // Capture remaining authenticated pages
        for (const pg of PAGES) {
          if (pg.name === 'login') continue;

          try {
            await page.goto(pg.path, { timeout: 15000 });
            await page.waitForLoadState('domcontentloaded');
            // Give layout 400ms to settle transitions
            await page.waitForTimeout(400);

            const filename = `${outputDir}/${pg.name}_${vp.name}_${theme}.png`;
            await page.screenshot({ path: filename, fullPage: true });
          } catch (e) {
            console.warn(`Could not capture ${pg.name} at ${vp.name} (${theme}):`, e);
          }
        }
      });
    }
  }
});

