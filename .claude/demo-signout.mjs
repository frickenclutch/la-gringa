// Demo: sign out returns to a clean PIN screen with the back-to-site link
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '.';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], colorScheme: 'light' });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:8787/owner');
await page.waitForSelector('#owner-login:not([hidden])', { timeout: 6000 });
await page.fill('#owner-pin', 'TACO-8321');
await page.locator('#owner-login-form button[type="submit"]').dispatchEvent('click');
await page.waitForSelector('#owner-editor:not([hidden])', { timeout: 6000 });

// sign out
await page.locator('#owner-logout').dispatchEvent('click');
await page.waitForSelector('#owner-login:not([hidden])', { timeout: 6000 });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, '10-signed-out-back-to-pin.png'), fullPage: true });

// reload must NOT auto-log back in (HttpOnly cookie really cleared)
await page.reload();
await page.waitForSelector('#owner-login:not([hidden])', { timeout: 6000 });
const editorHidden = await page.evaluate(() => document.getElementById('owner-editor').hidden);
console.log('after reload, editor hidden:', editorHidden);

// back link navigates to the hub
await page.locator('.back-link').dispatchEvent('click');
await page.waitForURL('**/hub**', { timeout: 6000 });
console.log('back link landed on:', page.url());

await browser.close();
