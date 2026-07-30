/**
 * Stage only public site files into dist/ for Workers Assets deploy.
 * Keeps node_modules, tools, tests, and worker source out of the asset bundle.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');

const FILES = [
  'index.html',
  'hub.html',
  'menu.html',
  'styles.css',
  'fonts.css',
  'sw.js',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
];

const DIRS = ['js', 'data', 'icons', 'fonts'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const f of FILES) {
  await cp(join(root, f), join(dist, f));
}
for (const d of DIRS) {
  await cp(join(root, d), join(dist, d), { recursive: true });
}

console.log('staged → dist/ (' + FILES.length + ' files + ' + DIRS.join(', ') + ')');
