// Demo: owner opens their private setup link and claims the board in the UI
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '.';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], colorScheme: 'light' });
const page = await ctx.newPage();

// 1 — owner opens the setup link they were texted
await page.goto('http://127.0.0.1:8787/owner?claim=demo-claim-abc123');
await page.waitForSelector('#owner-claim:not([hidden])', { timeout: 6000 });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, '7-claim-your-board.png'), fullPage: true });

// 2 — they pick their own PIN and stamp it
await page.fill('#claim-pin', 'rio-grande-fiesta');
await page.fill('#claim-pin-confirm', 'rio-grande-fiesta');
await page.locator('#owner-claim-form button[type="submit"]').dispatchEvent('click');
await page.waitForSelector('#owner-editor:not([hidden])', { timeout: 6000 });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, '8-claimed-straight-into-editor.png'), fullPage: true });

// 3 — the Change PIN panel for later maintenance
await page.locator('#owner-pin-form').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, '9-change-pin-panel.png') });

// prove the URL token was scrubbed
console.log('url after claim:', page.url());
await browser.close();
