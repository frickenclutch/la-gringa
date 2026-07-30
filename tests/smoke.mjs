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
  'worker.js',
  'data/site.json',
  'data/recipes.json',
  'js/gate-game.js',
  'js/menu-book.js',
  'js/sw-register.js',
  'assets/logo-source.png',
  'robots.txt',
  'sitemap.xml',
  'icons/icon-192.png',
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

console.log('\nworker holds rewards');
const worker = read('worker.js');
ok(/PATIOQUESO20/.test(worker) && /\/api\/reward/.test(worker), 'worker maps recipe → code');

console.log('\nHTML hygiene');
['index.html', 'hub.html', 'menu.html'].forEach((page) => {
  const html = read(page);
  ok(html.includes('rel="canonical"'), page + ' has canonical');
  ok(html.includes('og:title'), page + ' has Open Graph');
  ok(html.includes('application/ld+json'), page + ' has JSON-LD');
  ok(html.includes('js/sw-register.js'), page + ' registers SW via external script');
  ok(!/<script>\s*for\s*\(/.test(html) && !/document\.write/.test(html), page + ' no document.write');
});
ok(read('index.html').includes('js/gate-game.js'), 'index loads gate-game.js');
ok(read('menu.html').includes('js/menu-book.js'), 'menu loads menu-book.js');
ok(!/wp-content\/uploads/.test(read('tools/build-icons.mjs')), 'icon build uses local logo');

console.log('\n' + (failed ? failed + ' failed' : 'all passed'));
process.exit(failed ? 1 : 0);
