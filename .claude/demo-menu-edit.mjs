// Demo: edit the manuscript in place -> guests see it on next load
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '.';
const BASE = 'http://127.0.0.1:8787';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

// --- Owner session: log in, then open the menu in edit mode
const owner = await browser.newContext({ ...devices['iPhone 14'], colorScheme: 'light' });
const page = await owner.newPage();
await page.goto(BASE + '/owner');
await page.evaluate(async () => {
  await fetch('/api/owner/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: 'TACO-8321' }),
  });
});
await page.addInitScript(() => {
  try {
    localStorage.setItem('dg-lang', 'en');
  } catch {}
});
await page.goto(BASE + '/menu?edit=1');
await page.waitForFunction(() => Boolean(window.DGMenu));
await page.waitForSelector('.mlive-bar', { timeout: 8000 });
await page.waitForFunction(() => document.querySelectorAll('.mlive-editable').length > 40);

// jump to Sides & Salads where Taco Salad lives
await page.evaluate(() => window.jumpToView(1));
await page.waitForTimeout(1300);
await page.screenshot({ path: join(OUT, '11-edit-mode-glowing-items.png') });

// tap the Taco Salad price -> bottom sheet
await page.evaluate(() => {
  window.DGMenuLive.getMap()['item.tacoSalad'].price.click();
});
await page.waitForSelector('.mlive-sheet:not([hidden])', { timeout: 5000 });
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, '12-tap-item-edit-sheet.png') });

// change the price and save
await page.fill('#mlive-f-price', '9.75');
await page.locator('#mlive-save').dispatchEvent('click');
await page.waitForFunction(
  () => window.DGMenuLive.getMap()['item.tacoSalad'].price.textContent === '9.75',
  null,
  { timeout: 6000 }
);
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, '13-saved-price-live-on-page.png') });
await owner.close();

// --- Fresh guest (no session, separate profile): sees the new price
const guest = await browser.newContext({ ...devices['iPhone 14'], colorScheme: 'light' });
const gpage = await guest.newPage();
await gpage.addInitScript(() => {
  try {
    localStorage.setItem('dg-lang', 'en');
  } catch {}
});
await gpage.goto(BASE + '/menu');
await gpage.waitForFunction(
  () =>
    window.DGMenuLive &&
    window.DGMenuLive.getMap()['item.tacoSalad'] &&
    window.DGMenuLive.getMap()['item.tacoSalad'].price.textContent === '9.75',
  null,
  { timeout: 8000 }
);
await gpage.evaluate(() => window.jumpToView(1));
await gpage.waitForTimeout(1300);
const guestSees = await gpage.evaluate(() => ({
  price: window.DGMenuLive.getMap()['item.tacoSalad'].price.textContent,
  desc: window.DGMenuLive.getMap()['item.tacoSalad'].desc.textContent.slice(0, 60),
  quesadillaLoaded: window.DGMenuLive.getMap()['quesadillas.chorizo'].loaded.textContent,
  editableChrome: document.querySelectorAll('.mlive-bar, .mlive-editable').length,
}));
console.log('guest sees:', JSON.stringify(guestSees));
await gpage.screenshot({ path: join(OUT, '14-guest-sees-new-price.png') });

await browser.close();
