// One-off: self-host the Google Fonts used across the site.
// Fetches the CSS2 stylesheet as a modern browser, keeps the latin + latin-ext
// subsets (covers the Spanish accents like jalapeño/é/ñ), downloads each woff2
// into ./fonts, and writes ./fonts.css with the src rewritten to local paths.
import { mkdir, writeFile, rm } from 'node:fs/promises';

const CSS_URL = 'https://fonts.googleapis.com/css2'
  + '?family=Rye'
  + '&family=Outfit:wght@300;500;800'
  + '&family=Lilita+One'
  + '&family=Cinzel:wght@600;800'
  + '&family=IM+Fell+English:ital@0;1'
  + '&family=Pirata+One'
  + '&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error('CSS fetch failed: ' + res.status);
const css = await res.text();

await rm('fonts', { recursive: true, force: true });
await mkdir('fonts', { recursive: true });

const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
let m, out = [], count = 0; const fams = new Set();
while ((m = re.exec(css))) {
  const subset = m[1];
  if (subset !== 'latin' && subset !== 'latin-ext') continue;
  let face = m[2];
  const fam = (face.match(/font-family:\s*'([^']+)'/) || [])[1] || 'font';
  const weight = (face.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
  const style = (face.match(/font-style:\s*(italic|normal)/) || [])[1] || 'normal';
  const urlm = face.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
  if (!urlm) continue;
  const slug = fam.replace(/\s+/g, '') + '-' + weight + '-' + style + '-' + subset + '.woff2';
  const fr = await fetch(urlm[1], { headers: { 'User-Agent': UA } });
  if (!fr.ok) throw new Error('font fetch failed: ' + urlm[1]);
  await writeFile('fonts/' + slug, Buffer.from(await fr.arrayBuffer()));
  face = face.replace(urlm[1], 'fonts/' + slug);
  out.push('/* ' + fam + ' ' + weight + ' ' + style + ' (' + subset + ') */\n' + face);
  count++; fams.add(fam);
}
await writeFile('fonts.css', out.join('\n\n') + '\n');
console.log('Fonts: wrote ' + count + ' woff2 files for [' + [...fams].join(', ') + '] + fonts.css');
