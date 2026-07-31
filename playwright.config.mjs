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
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
