import { chromium, devices } from '@playwright/test';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem('dg-lang', 'en');
  } catch {}
});
await page.goto('http://127.0.0.1:8787/menu');
await page.waitForFunction(() => Boolean(window.DGMenu));
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const seal = document.getElementById('cover-seal');
  const r = seal.getBoundingClientRect();
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const chain = [];
  let node = document.elementFromPoint(cx, cy);
  while (node && node !== document.body && chain.length < 8) {
    chain.push(
      node.tagName.toLowerCase() +
        (node.id ? '#' + node.id : '') +
        (typeof node.className === 'string' && node.className
          ? '.' + node.className.split(' ').slice(0, 3).join('.')
          : '')
    );
    node = node.parentElement;
  }
  const sealCS = getComputedStyle(seal);
  return {
    sealRect: r.toJSON(),
    center: { cx, cy },
    hitChain: chain,
    sealPointerEvents: sealCS.pointerEvents,
    sealZ: sealCS.zIndex,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
