# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshots.spec.ts >> Automated UI Screen Capture Suite >> Captures screens at 1366x768 in light theme
- Location: e2e\screenshots.spec.ts:35:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.screenshot: Test timeout of 30000ms exceeded.
Call log:
  - taking page screenshot
  - waiting for fonts to load...
  - fonts loaded

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e12]:
      - heading "Wewala Super Store" [level=1] [ref=e13]
      - paragraph [ref=e14]: Retail Point of Sale System
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: Engineered for Speed & Accuracy
        - heading "Calm, trustworthy, sub-second checkout." [level=2] [ref=e19]
        - paragraph [ref=e20]: Precision integer arithmetic with PostgreSQL row-level security. Built for high-volume grocery and supermarket sales.
      - generic [ref=e21]:
        - generic [ref=e26]:
          - heading "Sub-100ms Barcode Scanning" [level=3] [ref=e27]
          - paragraph [ref=e28]: Barcode lookups, weighing scale inputs, and instant cash drawer triggers.
        - generic [ref=e34]:
          - heading "PostgreSQL Strict Hardening" [level=3] [ref=e35]
          - paragraph [ref=e36]: Tamper-evident audit logging, atomic shifts, and MFA security gates.
        - generic [ref=e42]:
          - heading "Byte-Perfect Thermal Printing" [level=3] [ref=e43]
          - paragraph [ref=e44]: Direct 80mm ESC/POS slips, A4 invoices, and Colombo timezone reconciliation.
    - generic [ref=e45]:
      - generic [ref=e46]: Wewala Stores POS • Wewala, Sri Lanka
      - generic [ref=e47]: Precision Engine v1.0
  - generic [ref=e48]:
    - button "Switch to Dark mode" [ref=e50] [cursor=pointer]
    - generic [ref=e53]:
      - generic [ref=e54]:
        - heading "Sign in to Terminal" [level=2] [ref=e55]
        - paragraph [ref=e56]: Enter your authorized staff credentials to begin your shift.
      - generic [ref=e57]: Postgres Row Level Security & Multi-Factor Protected
      - generic [ref=e62]:
        - generic [ref=e63]:
          - generic [ref=e64]: Staff Email Address
          - textbox "Staff Email Address" [ref=e66]:
            - /placeholder: cashier@wewala.lk
        - generic [ref=e67]:
          - generic [ref=e68]: Password
          - generic [ref=e69]:
            - textbox "Password" [ref=e70]:
              - /placeholder: ••••••••••
            - button "Show password" [ref=e71] [cursor=pointer]
        - button "Sign In to Terminal" [ref=e76] [cursor=pointer]
      - generic [ref=e77]:
        - paragraph [ref=e78]: Quick Test Credentials
        - generic [ref=e79]:
          - button "Owner" [ref=e80] [cursor=pointer]
          - button "Manager" [ref=e81] [cursor=pointer]
          - button "Cashier" [ref=e82] [cursor=pointer]
    - generic [ref=e83]: Only authorized store operators may log in. All terminal actions are recorded in the immutable audit log.
```

# Test source

```ts
  1  | import { test } from '@playwright/test';
  2  | import fs from 'fs';
  3  | import path from 'path';
  4  | 
  5  | const VIEWPORTS = [
  6  |   { name: '1366x768', width: 1366, height: 768 },
  7  |   { name: '1920x1080', width: 1920, height: 1080 },
  8  |   { name: 'tablet-portrait', width: 768, height: 1024 },
  9  |   { name: 'tablet-landscape', width: 1024, height: 768 },
  10 | ];
  11 | 
  12 | const THEMES = ['light', 'dark'] as const;
  13 | 
  14 | const PAGES = [
  15 |   { path: '/login', name: 'login', auth: false },
  16 |   { path: '/pos', name: 'pos', auth: true },
  17 |   { path: '/', name: 'dashboard', auth: true },
  18 |   { path: '/sales', name: 'sales', auth: true },
  19 |   { path: '/reports', name: 'reports', auth: true },
  20 |   { path: '/inventory', name: 'inventory', auth: true },
  21 |   { path: '/customer-display', name: 'customer-display', auth: false },
  22 | ];
  23 | 
  24 | test.describe('Automated UI Screen Capture Suite', () => {
  25 |   const outputDir = path.resolve(process.cwd(), 'docs/ui-screenshots');
  26 | 
  27 |   test.beforeAll(async () => {
  28 |     if (!fs.existsSync(outputDir)) {
  29 |       fs.mkdirSync(outputDir, { recursive: true });
  30 |     }
  31 |   });
  32 | 
  33 |   for (const vp of VIEWPORTS) {
  34 |     for (const theme of THEMES) {
  35 |       test(`Captures screens at ${vp.name} in ${theme} theme`, async ({ page }) => {
  36 |         await page.setViewportSize({ width: vp.width, height: vp.height });
  37 | 
  38 |         // Set theme in localStorage
  39 |         await page.addInitScript(({ th }) => {
  40 |           window.localStorage.setItem('wewala_pos_theme', th);
  41 |           if (th === 'dark') {
  42 |             document.documentElement.classList.add('dark');
  43 |           } else {
  44 |             document.documentElement.classList.remove('dark');
  45 |           }
  46 |         }, { th: theme });
  47 | 
  48 |         // First log in as manager/owner if needed
  49 |         await page.goto('/login');
  50 |         await page.waitForLoadState('networkidle');
  51 | 
  52 |         // Capture login screen
  53 |         const loginFilename = `${outputDir}/login_${vp.name}_${theme}.png`;
> 54 |         await page.screenshot({ path: loginFilename, fullPage: true });
     |                    ^ Error: page.screenshot: Test timeout of 30000ms exceeded.
  55 | 
  56 |         // Authenticate
  57 |         await page.fill('input[type="email"]', 'manager@wewala.lk');
  58 |         await page.fill('input[type="password"]', 'ManagerPass123!');
  59 |         await page.click('button[type="submit"]');
  60 | 
  61 |         // Wait for redirect to dashboard or POS
  62 |         await page.waitForURL((url) => url.pathname !== '/login', { timeout: 10000 }).catch(() => {});
  63 | 
  64 |         // Capture remaining authenticated pages
  65 |         for (const pg of PAGES) {
  66 |           if (pg.name === 'login') continue;
  67 | 
  68 |           try {
  69 |             await page.goto(pg.path, { timeout: 15000 });
  70 |             await page.waitForLoadState('domcontentloaded');
  71 |             // Give layout 400ms to settle transitions
  72 |             await page.waitForTimeout(400);
  73 | 
  74 |             const filename = `${outputDir}/${pg.name}_${vp.name}_${theme}.png`;
  75 |             await page.screenshot({ path: filename, fullPage: true });
  76 |           } catch (e) {
  77 |             console.warn(`Could not capture ${pg.name} at ${vp.name} (${theme}):`, e);
  78 |           }
  79 |         }
  80 |       });
  81 |     }
  82 |   }
  83 | });
  84 | 
```