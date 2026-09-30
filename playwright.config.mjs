import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'mobile-menu.spec.mjs',
  fullyParallel: false,
  workers: 3,
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 5_000 },
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    actionTimeout: 5_000,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/serve.mjs',
    port: 4173,
    reuseExistingServer: true,
    timeout: 10_000,
  },
  projects: [
    {
      name: 'iphone-webkit',
      use: {
        browserName: 'webkit',
        viewport: { width: 430, height: 932 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      },
    },
    {
      name: 'galaxy-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (Linux; Android 15; SM-S938U) AppleWebKit/537.36 Chrome/132.0 Mobile Safari/537.36',
      },
    },
    {
      name: 'galaxy-fold-cover',
      use: {
        browserName: 'chromium',
        viewport: { width: 280, height: 653 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (Linux; Android 15; SM-F966U) AppleWebKit/537.36 Chrome/132.0 Mobile Safari/537.36',
      },
    },
    {
      name: 'galaxy-fold-inner',
      use: {
        browserName: 'chromium',
        viewport: { width: 884, height: 1104 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (Linux; Android 15; SM-F966U) AppleWebKit/537.36 Chrome/132.0 Safari/537.36',
      },
    },
    // Facebook's in-app browser: most social traffic arrives here (tapping the
    // link in a post or Messenger). The toolbar eats screen height, and the
    // iPhone version is a WKWebView with no service worker support.
    {
      name: 'facebook-ios',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 664 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        serviceWorkers: 'block',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 [FBAN/FBIOS;FBAV/482.0.0.40.109;FBBV/650000000;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.0;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]',
      },
    },
    {
      name: 'facebook-android',
      use: {
        browserName: 'chromium',
        viewport: { width: 412, height: 780 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (Linux; Android 15; SM-S938U Build/AP3A.240905.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.6834.163 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/482.0.0.47.109;]',
      },
    },
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
