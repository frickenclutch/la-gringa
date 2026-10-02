// Capture real screenshots of the site for the owner/admin guide.
// Run from the repo root (needs @playwright/test + sharp from devDependencies):
//   node docs/src/shots.mjs <outDir>
// Requires the worker running locally: npx wrangler dev --var OWNER_PIN:TACO-8321 (port 8787)
import { chromium, devices } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'shots';
const BASE = 'http://127.0.0.1:8787';
const PIN = 'TACO-8321';
mkdirSync(OUT, { recursive: true });
const png = (name) => join(OUT, name + '.png');
const results = [];

async function attempt(name, fn) {
  try {
    await fn();
    results.push('ok   ' + name);
  } catch (err) {
    results.push('FAIL ' + name + ': ' + (err && err.message ? err.message.split('\n')[0] : err));
  }
}

const browser = await chromium.launch();
const phone = { ...devices['iPhone 14'], deviceScaleFactor: 2, colorScheme: 'light' };

// ---- first visit: the language passport on the gate ----
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await attempt('passport', async () => {
    await page.goto(BASE + '/');
    await page.waitForSelector('#lang-passport:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: png('passport') });
  });
  await ctx.close();
}

// ---- returning guest (English already stamped): gate, game, hub, menu, street board ----
{
  const ctx = await browser.newContext(phone);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('dg-lang', 'en');
      localStorage.setItem('dg-flip-hint', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();

  await attempt('gate', async () => {
    await page.goto(BASE + '/');
    await page.waitForSelector('#ui-welcome', { timeout: 8000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: png('gate') });
  });

  await attempt('game', async () => {
    const craft = page.locator('#ui-welcome button, #ui-welcome [onclick*="startGame"]').first();
    await craft.dispatchEvent('click');
    await page.waitForSelector('#ui-hud:not(.hidden)', { timeout: 8000 });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: png('game') });
  });

  await attempt('hub', async () => {
    await page.goto(BASE + '/hub');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: png('hub') });
  });

  await attempt('menu-cover', async () => {
    await page.goto(BASE + '/menu');
    await page.waitForFunction(() => Boolean(window.DGMenu), null, { timeout: 8000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: png('menu-cover') });
  });

  await attempt('menu-page', async () => {
    await page.evaluate(() => window.navigateBook && window.navigateBook(1));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: png('menu-page') });
  });

  await attempt('street-board', async () => {
    await page.locator('#specials-board-btn').dispatchEvent('click');
    await page.waitForSelector('#street-board:not([hidden])', { timeout: 6000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: png('street-board') });
    await page.locator('#street-board-close').dispatchEvent('click');
  });

  await attempt('install-coach', async () => {
    await page.waitForTimeout(400);
    await page.locator('#menu-install-btn').dispatchEvent('click');
    await page.waitForSelector('#install-coach:not([hidden])', { timeout: 6000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: png('install-coach') });
  });

  await ctx.close();
}

// ---- desktop: the manuscript spread over the riverfront at dusk ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('dg-lang', 'en');
      localStorage.setItem('dg-flip-hint', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await attempt('menu-desktop', async () => {
    await page.goto(BASE + '/menu?daypart=day');
    await page.waitForFunction(() => Boolean(window.DGMenu), null, { timeout: 8000 });
    await page.waitForSelector('#fx-scene svg', { timeout: 8000 });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: png('menu-desktop') });
  });
  await attempt('menu-desktop-open', async () => {
    await page.evaluate(() => window.navigateBook && window.navigateBook(1));
    await page.waitForTimeout(1600);
    await page.screenshot({ path: png('menu-desktop-open') });
  });
  await ctx.close();
}

// ---- owner: PIN gate, editor, live menu editor ----
{
  const ctx = await browser.newContext(phone);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('dg-lang', 'en');
      localStorage.setItem('dg-flip-hint', '1');
    } catch (e) {}
  });
  const page = await ctx.newPage();

  await attempt('owner-pin', async () => {
    await page.goto(BASE + '/owner');
    await page.waitForSelector('#owner-login:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: png('owner-pin') });
  });

  await attempt('owner-editor', async () => {
    await page.fill('#owner-pin', PIN);
    await page.locator('#owner-login-form button[type="submit"]').dispatchEvent('click');
    await page.waitForSelector('#owner-editor:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: png('owner-editor'), fullPage: true });
  });

  await attempt('menu-edit', async () => {
    await page.goto(BASE + '/menu?edit=1');
    await page.waitForFunction(() => Boolean(window.DGMenu), null, { timeout: 8000 });
    await page.waitForSelector('.mlive-bar', { timeout: 8000 });
    await page.evaluate(() => window.navigateBook && window.navigateBook(1));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: png('menu-edit-glow') });
    // open the sheet on the first editable dish of the visible page
    await page.evaluate(() => {
      const el = document.querySelector('#leaf1 .mlive-editable') || document.querySelector('.mlive-editable');
      if (!el) throw new Error('no editable element found');
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForSelector('.mlive-sheet:not([hidden])', { timeout: 6000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: png('menu-edit-sheet') });
  });

  await ctx.close();
}

await browser.close();

// ---- compress to WebP for embedding ----
for (const f of readdirSync(OUT)) {
  if (!f.endsWith('.png')) continue;
  const name = f.replace(/\.png$/, '');
  const src = join(OUT, f);
  const wide = name.startsWith('menu-desktop');
  const width = wide ? 1200 : 520;
  const out = join(OUT, name + '.webp');
  await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: 74 }).toFile(out);
  results.push('webp ' + name + ' ' + Math.round(statSync(out).size / 1024) + ' KB');
}

console.log(results.join('\n'));
