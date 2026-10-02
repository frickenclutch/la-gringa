import { webkit } from '@playwright/test';
import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['tests/serve.mjs'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await webkit.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem('dg-lang', 'en');
  } catch {}
});
await page.goto('http://127.0.0.1:4173/menu.html');
await page.waitForFunction(() => Boolean(window.DGMenu));
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const btn = document.getElementById('menu-install-btn');
  const cs = getComputedStyle(btn);
  return {
    innerHeight: window.innerHeight,
    docScrollHeight: document.documentElement.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    btnRect: btn.getBoundingClientRect().toJSON(),
    btnPos: { position: cs.position, top: cs.top, bottom: cs.bottom, transform: cs.transform, margin: cs.margin, height: cs.height, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, fontSize: cs.fontSize, lineHeight: cs.lineHeight },
    dialerRect: document.getElementById('dialer').getBoundingClientRect().toJSON(),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
server.kill();
