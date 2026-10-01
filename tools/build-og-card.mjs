/**
 * Renders art/og-card.jpg — the 1200×630 link-preview card Facebook,
 * Messenger and iMessage show when someone shares the site. It is the menu's
 * riverfront scene (art/riverfront.svg) in its dusk palette (copied from
 * menu.html, so a repaint of the scene flows through) with the name on top.
 *
 *   node tools/build-og-card.mjs
 *
 * Re-run after changing the scene or the wording, then deploy.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFile(join(root, p), 'utf8');

const svg = await read('art/riverfront.svg');
const menu = await read('menu.html');
const dusk = menu.match(/html\[data-daypart="dusk"\]\s*\{([^}]+)\}/)[1];
const font = (file) => pathToFileURL(join(root, 'fonts', file)).href;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Rye; src: url(${font('Rye-400-normal-latin.woff2')}); }
@font-face { font-family: Lilita; src: url(${font('LilitaOne-400-normal-latin.woff2')}); }
@font-face { font-family: Outfit; font-weight: 500; src: url(${font('Outfit-500-normal-latin.woff2')}); }
:root { ${dusk} }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #2a1a2e; }
.scene, .scene svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.shade { position: absolute; inset: 0;
  background: radial-gradient(ellipse 62% 58% at 50% 38%, rgba(20,10,24,.72), rgba(20,10,24,.35) 60%, rgba(20,10,24,0) 85%); }
.card { position: absolute; left: 0; right: 0; top: 92px; text-align: center; color: #fff6e8; }
.eyebrow { font: 28px Lilita, sans-serif; letter-spacing: .16em; color: #ffc36b; text-transform: uppercase;
  text-shadow: 0 2px 8px rgba(0,0,0,.6); }
h1 { margin: 10px 0 0; font: 104px/1 Rye, serif; text-shadow: 0 4px 0 #6a2a1a, 0 10px 28px rgba(0,0,0,.65); }
.sub { margin-top: 22px; font: 500 32px Outfit, sans-serif; text-shadow: 0 2px 10px rgba(0,0,0,.75); }
.url { position: absolute; right: 34px; bottom: 26px; padding: 10px 20px; border-radius: 999px;
  background: rgba(20,10,24,.72); border: 2px solid #ffc36b; color: #ffe2b0;
  font: 26px Lilita, sans-serif; letter-spacing: .05em; }
</style></head><body>
<div class="scene">${svg}</div>
<div class="shade"></div>
<div class="card">
  <div class="eyebrow">Fresh Mex on the St. Lawrence</div>
  <h1>The Dirty Gringo</h1>
  <div class="sub">Riverfront patio at the Dobisky · Ogdensburg, NY</div>
</div>
<div class="url">dirtygringonny.com</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const tmp = join(root, '.og-card.tmp.html');
await writeFile(tmp, html);
await page.goto(pathToFileURL(tmp).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'art', 'og-card.jpg'), type: 'jpeg', quality: 86 });
await browser.close();
await (await import('node:fs/promises')).rm(tmp);
console.log('wrote art/og-card.jpg (1200×630)');
