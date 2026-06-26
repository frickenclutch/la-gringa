// One-off: generate PWA/app icons + favicons from the real Dirty Gringo logo
// (the circular siesta-peon seal). Non-transparent variants (apple-touch,
// maskable, favicon) are composited onto the brand parchment so they read well
// on any home screen. Requires sharp (devDependency).
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const LOGO = 'https://i0.wp.com/www.dirtygringonny.com/wp/wp-content/uploads/2017/07/cropped-logo200x100.png?resize=512,512&ssl=1';

const r = await fetch(LOGO, { headers: { 'User-Agent': UA } });
if (!r.ok) throw new Error('logo fetch failed: ' + r.status);
const logo = Buffer.from(await r.arrayBuffer());
await mkdir('icons', { recursive: true });

const meta = await sharp(logo).metadata();
console.log('source logo: ' + meta.width + 'x' + meta.height + ' ' + meta.format);

const PARCH = { r: 0xe8, g: 0xd5, b: 0xa5, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const fit = 'contain';

async function shrunk(size) {
  return sharp(logo).resize(size, size, { fit, background: CLEAR }).png().toBuffer();
}
async function onParchment(canvas, logoSize, file) {
  const inner = await shrunk(logoSize);
  await sharp({ create: { width: canvas, height: canvas, channels: 4, background: PARCH } })
    .composite([{ input: inner, gravity: 'center' }]).png().toFile('icons/' + file);
}

// any-purpose (transparent corners — Android adaptive supplies its own bg)
await sharp(logo).resize(512, 512, { fit, background: CLEAR }).png().toFile('icons/icon-512.png');
await sharp(logo).resize(192, 192, { fit, background: CLEAR }).png().toFile('icons/icon-192.png');
// maskable (full-bleed parchment + safe zone), apple-touch (iOS needs opaque), favicons
await onParchment(512, 400, 'icon-maskable-512.png');
await onParchment(180, 156, 'apple-touch-icon-180.png');
await onParchment(32, 30, 'favicon-32.png');
await onParchment(16, 15, 'favicon-16.png');
console.log('icons written: icon-192, icon-512, icon-maskable-512, apple-touch-icon-180, favicon-32, favicon-16');
