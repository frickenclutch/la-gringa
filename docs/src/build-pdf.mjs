// Render the owner's manual to PDF for sharing on messengers and phones.
//   node docs/src/build-pdf.mjs            (from the repo root, after build-guide.mjs)
// Uses the print stylesheet in the HTML: widgets become worked examples, every
// tab panel and accordion is expanded, chapters start on new pages, the PDF
// carries bookmarks (outline) and page numbers.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = resolve('docs/how-the-site-works.html');
const OUT = resolve('docs/how-the-site-works.pdf');

// The web build carries WebP figures; Chromium would embed those as lossless
// bitmaps and triple the PDF. Swap in JPEGs of the same captures for print.
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'shots');
const jpegs = {};
for (const f of readdirSync(SHOTS)) {
  if (!f.endsWith('.webp')) continue;
  const buf = await sharp(join(SHOTS, f)).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  jpegs[f.replace(/.webp$/, '')] = 'data:image/jpeg;base64,' + buf.toString('base64');
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(SRC).href, { waitUntil: 'load' });
await page.evaluate((map) => {
  document.querySelectorAll('img[data-shot]').forEach((img) => {
    if (map[img.dataset.shot]) img.src = map[img.dataset.shot];
  });
}, jpegs);
await page.evaluate(async () => {
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
  document.querySelectorAll('[role="tabpanel"]').forEach((p) => { p.hidden = false; });
  // Figures are lazy-loaded for the browser; force every image in before printing.
  document.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; });
  await Promise.all(Array.from(document.querySelectorAll('img')).map((img) => img.decode().catch(() => {})));
  await document.fonts.ready;
});
await page.emulateMedia({ media: 'print' });

const footer =
  '<div style="width:100%;box-sizing:border-box;padding:0 0.6in;font-family:Georgia,serif;font-size:7.5pt;color:#6f5d47;display:flex;justify-content:space-between;">' +
  '<span>The Dirty Gringo · Owner’s Manual for the Website · dirtygringonny.com</span>' +
  '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>';

await page.pdf({
  path: OUT,
  format: 'Letter',
  printBackground: true,
  margin: { top: '0.55in', right: '0.6in', bottom: '0.7in', left: '0.6in' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: footer,
  outline: true,
  tagged: true,
});
await browser.close();

const bytes = readFileSync(OUT);
const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log('wrote ' + OUT + ' (' + Math.round(statSync(OUT).size / 1024) + ' KB, ' + pages + ' pages)');
