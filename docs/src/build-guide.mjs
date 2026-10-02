// Assemble the owner/admin guide: inline the two brand fonts and the captured
// screenshots into a single self-contained HTML file.
//   node build-guide.mjs            (run from the repo root so sharp resolves)
// Outputs:
//   <repo>/docs/how-the-site-works.html   full document, opens offline
//   <scratch>/guide-artifact.html         body-only copy for the Artifact tool
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SCRATCH = dirname(fileURLToPath(import.meta.url));
const REPO = process.cwd();
const SHOTS = join(SCRATCH, 'shots');

let body = readFileSync(join(SCRATCH, 'guide-body.html'), 'utf8');

function fontUri(file) {
  const buf = readFileSync(join(REPO, 'fonts', file));
  return 'data:font/woff2;base64,' + buf.toString('base64');
}
body = body
  .replace('{{FONT_CINZEL}}', fontUri('Cinzel-600-normal-latin.woff2'))
  .replace('{{FONT_FELL}}', fontUri('IMFellEnglish-400-normal-latin.woff2'));

const missing = [];
const used = [];
const figRe = /\{\{FIG (\S+) "([^"]*)"(?: (\w+))?\}\}/g;
const replacements = [];
for (const m of body.matchAll(figRe)) {
  const [token, name, caption, kind = 'phone'] = m;
  const file = join(SHOTS, name + '.webp');
  if (!existsSync(file)) {
    missing.push(name);
    replacements.push([token, '<!-- figure ' + name + ' not captured -->']);
    continue;
  }
  const meta = await sharp(file).metadata();
  const uri = 'data:image/webp;base64,' + readFileSync(file).toString('base64');
  const esc = caption.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html =
    '<figure class="fig fig-' + kind + '">' +
    '<img src="' + uri + '" data-shot="' + name + '" alt="' + esc + '" width="' + meta.width + '" height="' + meta.height + '" loading="lazy" decoding="async">' +
    '<figcaption>' + caption + '</figcaption></figure>';
  replacements.push([token, html]);
  used.push(name + ' ' + Math.round(statSync(file).size / 1024) + 'KB');
}
for (const [token, html] of replacements) body = body.replace(token, html);

// Artifact copy: the Artifact tool wraps it in its own document skeleton.
if (process.env.GUIDE_ARTIFACT) writeFileSync(join(SCRATCH, 'guide-artifact.html'), body);

// Repo copy: a complete document. Hoist <title> and the first <style> into <head>.
const titleMatch = body.match(/<title>([\s\S]*?)<\/title>\s*/);
const title = titleMatch ? titleMatch[1] : 'Dirty Gringo Owner’s Manual';
let rest = titleMatch ? body.replace(titleMatch[0], '') : body;
const styleMatch = rest.match(/<style>[\s\S]*?<\/style>\s*/);
const style = styleMatch ? styleMatch[0] : '';
if (styleMatch) rest = rest.replace(styleMatch[0], '');
const doc =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<meta name="robots" content="noindex,nofollow">\n' +
  '<title>' + title + '</title>\n' + style + '</head>\n<body>\n' + rest + '\n</body>\n</html>\n';
mkdirSync(join(REPO, 'docs'), { recursive: true });
const out = join(REPO, 'docs', 'how-the-site-works.html');
writeFileSync(out, doc);

console.log('figures used: ' + (used.join(', ') || 'none'));
console.log('figures missing: ' + (missing.join(', ') || 'none'));
console.log('wrote ' + out + ' (' + Math.round(statSync(out).size / 1024) + ' KB)');
if (process.env.GUIDE_ARTIFACT) console.log('wrote guide-artifact.html');
