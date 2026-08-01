#!/usr/bin/env node
/**
 * Repo smoke tests — no browser required.
 * Run: npm test
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else {
    console.error('  ✗ ' + msg);
    failed++;
  }
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

console.log('structure');
[
  'LICENSE',
  'README.md',
  'index.html',
  'hub.html',
  'menu.html',
  'owner.html',
  'worker.js',
  'data/site.json',
  'data/recipes.json',
  'data/menu-board.json',
  'data/i18n.json',
  'js/i18n.js',
  'js/gate-game.js',
  'js/haptics.js',
  'js/menu-book.js',
  'js/menu-install.js',
  'js/menu-board-ui.js',
  'js/owner-board.js',
  'js/sw-register.js',
  'assets/logo-source.png',
  'robots.txt',
  'sitemap.xml',
  'icons/icon-192.png',
  'manifest-menu.webmanifest',
].forEach((f) => ok(existsSync(join(root, f)), f + ' exists'));

console.log('\nsite.json');
const site = JSON.parse(read('data/site.json'));
ok(!!site.brand && !!site.phone && !!site.canonicalBase, 'brand, phone, canonicalBase');
ok(!!site.address?.street && !!site.address?.city, 'address fields');

console.log('\nrecipes (no client-side promo codes)');
const recipes = JSON.parse(read('data/recipes.json'));
const recipeKeys = Object.keys(recipes);
ok(recipeKeys.length >= 3, 'at least 3 recipes');
ok(
  recipeKeys.every((k) => recipes[k].reqs?.length && !('promo' in recipes[k])),
  'reqs present, no promo field'
);

console.log('\nclient source must not embed reward codes');
const clientBlob = ['js/gate-game.js', 'js/menu-book.js', 'index.html', 'hub.html', 'menu.html', 'data/recipes.json']
  .map(read)
  .join('\n');
ok(!/PATIOQUESO20|MARINOBRIDGE15|RIVERMARLEY10/.test(clientBlob), 'promo strings absent from client');

console.log('\nworker holds rewards + menu board APIs');
const worker = read('worker.js');
ok(/PATIOQUESO20/.test(worker) && /\/api\/reward/.test(worker), 'worker maps recipe → code');
ok(/\/api\/menu-board/.test(worker), 'public menu-board route');
ok(/\/api\/owner\/login/.test(worker), 'owner login route');
ok(/\/api\/owner\/board/.test(worker), 'owner board route');
ok(/\/api\/owner\/history/.test(worker), 'owner history route');
ok(/OWNER_PIN|OWNER_TOKEN/.test(worker), 'owner PIN secret supported');
ok(/MENU_BOARD/.test(worker), 'MENU_BOARD KV usage');

console.log('\nmenu-board seed');
const boardSeed = JSON.parse(read('data/menu-board.json'));
ok(!!boardSeed.month?.label && Array.isArray(boardSeed.month.additions), 'month label + additions');
ok(Array.isArray(boardSeed.specials) && boardSeed.specials.length >= 1, 'seed specials present');
ok(boardSeed.specials.every((s) => s.id && s.name), 'specials have id + name');

console.log('\nHTML hygiene');
['index.html', 'hub.html', 'menu.html', 'owner.html'].forEach((page) => {
  const html = read(page);
  ok(html.includes('rel="canonical"'), page + ' has canonical');
  ok(html.includes('og:title'), page + ' has Open Graph');
  ok(html.includes('application/ld+json'), page + ' has JSON-LD');
  ok(html.includes('js/sw-register.js'), page + ' registers SW via external script');
  ok(!/<script>\s*for\s*\(/.test(html) && !/document\.write/.test(html), page + ' no document.write');
});
ok(read('index.html').includes('js/gate-game.js'), 'index loads gate-game.js');
ok(read('index.html').includes('js/haptics.js'), 'index loads haptics before game');
ok(read('menu.html').includes('js/menu-book.js'), 'menu loads menu-book.js');
ok(read('menu.html').includes('js/haptics.js'), 'menu loads haptics before book');
ok(read('menu.html').includes('js/menu-install.js'), 'menu loads menu-install.js');
ok(read('menu.html').includes('js/menu-board-ui.js'), 'menu loads menu-board-ui.js');
ok(read('menu.html').includes('id="cover-month"'), 'cover month is data-driven');
ok(read('menu.html').includes('id="specials-board-btn"'), 'specials street-board control');
ok(read('menu.html').includes('id="street-board"'), 'street-board overlay markup');
ok(read('menu.html').includes('manifest-menu.webmanifest'), 'menu uses menu-scoped manifest');
ok(read('manifest-menu.webmanifest').includes('"/menu"'), 'menu manifest starts at /menu');
ok(read('menu.html').includes('href="tel:+13157138151"'), 'menu phone opens the preferred dialer');
ok(
  read('menu.html').includes('href="https://www.dirtygringonny.com/"'),
  'menu domain links to the restaurant website'
);
ok(read('owner.html').includes('js/owner-board.js'), 'owner loads owner-board.js');
ok(read('owner.html').includes('noindex'), 'owner page is noindex');
ok(read('wrangler.jsonc').includes('MENU_BOARD'), 'wrangler binds MENU_BOARD KV');
ok(read('sw.js').includes('dg-v12'), 'service worker bumped for board assets');
ok(read('menu.html').includes('data-perf'), 'menu sets early perf gate');
ok(read('menu.html').includes('icon-192.png'), 'cover seal uses lighter icon');
ok(/defer/.test(read('menu.html')) && read('menu.html').includes('js/menu-book.js'), 'menu scripts deferred');
ok(read('sw.js').includes('/js/menu-board-ui.js'), 'SW precaches menu-board UI');
ok(read('sw.js').includes('/js/i18n.js'), 'SW precaches i18n');
ok(read('index.html').includes('js/i18n.js'), 'index loads i18n');
ok(read('hub.html').includes('js/i18n.js'), 'hub loads i18n');
ok(read('menu.html').includes('js/i18n.js'), 'menu loads i18n');
ok(read('index.html').includes('data-i18n='), 'index has i18n hooks');
ok(read('js/i18n.js').includes('lang-passport'), 'passport language gate present');
const i18n = JSON.parse(read('data/i18n.json'));
ok(i18n.en && i18n.es && i18n.es['gate.welcomeTitle'], 'i18n en/es packs');
ok(i18n.es['menu.item.dirtyNachos.name'], 'menu manuscript Spanish present');
ok(read('menu.html').includes('data-i18n="menu.item.dirtyNachos.name"'), 'menu hooks dish names');
ok(read('tools/stage-assets.mjs').includes('owner.html'), 'stage includes owner.html');
ok(!/wp-content\/uploads/.test(read('tools/build-icons.mjs')), 'icon build uses local logo');

console.log('\nJavaScript syntax');
[
  'js/gate-game.js',
  'js/haptics.js',
  'js/i18n.js',
  'js/menu-book.js',
  'js/menu-install.js',
  'js/menu-board-ui.js',
  'js/owner-board.js',
  'js/sw-register.js',
].forEach((file) => {
  try {
    new Function(read(file));
    ok(true, file + ' parses');
  } catch (error) {
    ok(false, file + ' parses: ' + error.message);
  }
});

console.log('\n' + (failed ? failed + ' failed' : 'all passed'));
process.exit(failed ? 1 : 0);
