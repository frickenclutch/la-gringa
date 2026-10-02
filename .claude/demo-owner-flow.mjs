// Demo: the owner's secret door → PIN gate → editor → live Street Board
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '.';
const BASE = 'http://127.0.0.1:8787';
const PIN = 'TACO-8321';
mkdirSync(OUT, { recursive: true });
const shot = (name) => join(OUT, name);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], colorScheme: 'light' });
const page = await ctx.newPage();

// 0 — first visit: the language passport
await page.goto(BASE + '/menu');
await page.waitForFunction(() => Boolean(window.DGMenu));
await page.waitForSelector('#lang-passport:not([hidden])', { timeout: 6000 });
await page.waitForTimeout(800);
await page.screenshot({ path: shot('0-language-passport.png') });
await page.locator('.lang-skillet[data-lang="en"]').dispatchEvent('click');
await page.waitForSelector('#lang-passport[hidden]', { state: 'attached', timeout: 6000 });

// 1 — the manuscript cover; the wax seal (top-right) is the secret door
await page.waitForTimeout(1300);
await page.screenshot({ path: shot('1-menu-cover-seal.png') });

// 2 — the flame singe the owner sees on the fifth tap (same class the unlock adds,
// triggered here directly so the still isn't racing the 650ms redirect)
await page.evaluate(() => document.getElementById('cover-seal').classList.add('is-singeing'));
await page.waitForTimeout(260);
await page.screenshot({ path: shot('2-seal-flame-unlock.png') });
await page.evaluate(() => document.getElementById('cover-seal').classList.remove('is-singeing'));
await page.waitForTimeout(150);

// 2b — five real quick taps on the seal → secret door
const box = await page.locator('#cover-seal').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
for (let i = 0; i < 5; i += 1) {
  await page.touchscreen.tap(cx, cy);
  await page.waitForTimeout(110);
}

// 3 — lands on the PIN gate
await page.waitForURL('**/owner', { timeout: 6000 });
await page.waitForTimeout(600);
await page.screenshot({ path: shot('3-owner-pin-gate.png') });

// 4 — unlock and see the editor
await page.fill('#owner-pin', PIN);
await page.locator('#owner-login-form button[type="submit"]').dispatchEvent('click');
await page.waitForSelector('#owner-editor:not([hidden])', { timeout: 6000 });
await page.waitForTimeout(500);
await page.screenshot({ path: shot('4-owner-editor.png'), fullPage: true });

// 5 — add today's special and save
await page.locator('#add-special').dispatchEvent('click');
const row = page.locator('.special-row').last();
await row.locator('[name="name"]').fill('Carnitas Sunset Nachos');
await row.locator('[name="price"]').fill('11.50');
await row.locator('[name="note"]').fill('Monday only — river patio pick');
await page.locator('#owner-board-form button[type="submit"]').dispatchEvent('click');
await page.waitForFunction(
  () => /^Saved\./.test(document.getElementById('owner-status')?.textContent || ''),
  null,
  { timeout: 6000 }
);
await page.waitForTimeout(300);
await page.screenshot({ path: shot('5-special-saved.png'), fullPage: true });

// 6 — guest view: Street Board now shows it
await page.goto(BASE + '/menu');
await page.waitForFunction(() => Boolean(window.DGMenu));
await page.waitForTimeout(900);
await page.locator('#specials-board-btn').dispatchEvent('click');
await page.waitForSelector('#street-board:not([hidden])', { timeout: 6000 });
await page.waitForTimeout(600);
await page.screenshot({ path: shot('6-street-board-live.png') });

await browser.close();
console.log('demo complete -> ' + OUT);
