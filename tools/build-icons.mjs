// Generate PWA/app icons + favicons from the vendored Dirty Gringo logo
// (assets/logo-source.png). Non-transparent variants (apple-touch, maskable,
// favicon) are composited onto the brand parchment. Requires sharp.
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';

const LOGO_PATH = 'assets/logo-source.png';

const logo = await readFile(LOGO_PATH);
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
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toFile('icons/' + file);
}

await sharp(logo).resize(512, 512, { fit, background: CLEAR }).png().toFile('icons/icon-512.png');
await sharp(logo).resize(192, 192, { fit, background: CLEAR }).png().toFile('icons/icon-192.png');
await onParchment(512, 400, 'icon-maskable-512.png');
await onParchment(180, 156, 'apple-touch-icon-180.png');
await onParchment(32, 30, 'favicon-32.png');
await onParchment(16, 15, 'favicon-16.png');
console.log('icons written: icon-192, icon-512, icon-maskable-512, apple-touch-icon-180, favicon-32, favicon-16');
