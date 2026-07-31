import { expect, test } from '@playwright/test';

async function openMenu(page) {
  await page.goto('/menu.html');
  await page.waitForFunction(() => Boolean(window.DGMenu));
}

async function drag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

test('chooses the correct adaptive layout mode', async ({ page }, testInfo) => {
  await openMenu(page);
  const expected = testInfo.project.name === 'desktop-chromium' ? 'spread' : 'single';
  await expect.poll(() => page.evaluate(() => window.DGMenu.getLayoutMode())).toBe(expected);
});

test('one horizontal gesture produces exactly one navigation step', async ({ page }, testInfo) => {
  await openMenu(page);
  const viewport = page.viewportSize();
  await drag(
    page,
    { x: viewport.width * 0.78, y: viewport.height * 0.55 },
    { x: viewport.width * 0.2, y: viewport.height * 0.55 }
  );

  const expectedView = testInfo.project.name === 'desktop-chromium' ? 1 : 1;
  await expect.poll(() => page.evaluate(() => window.DGMenu.getCurrentView())).toBe(expectedView);
  await page.waitForTimeout(850);
  await expect(await page.evaluate(() => window.DGMenu.getCurrentView())).toBe(expectedView);
});

test('vertical reading gestures never turn the page', async ({ page }, testInfo) => {
  await openMenu(page);
  await page.evaluate(() => window.jumpToView(1));
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => window.DGMenu.getCurrentView());
  const viewport = page.viewportSize();

  await drag(
    page,
    { x: viewport.width * 0.52, y: viewport.height * 0.72 },
    { x: viewport.width * 0.5, y: viewport.height * 0.25 }
  );
  if (testInfo.project.name === 'desktop-chromium') {
    await page.mouse.wheel(0, 320);
  } else {
    await page.evaluate(() => {
      const visibleFace = [...document.querySelectorAll('.face')].find(
        (face) => face.scrollHeight > face.clientHeight
      );
      if (visibleFace) {
        visibleFace.scrollTop += 160;
        visibleFace.dispatchEvent(new Event('scroll'));
      }
    });
  }
  await page.waitForTimeout(150);

  expect(await page.evaluate(() => window.DGMenu.getCurrentView())).toBe(before);
});

test('rapid duplicate gestures are transition-locked', async ({ page }) => {
  await openMenu(page);
  await page.evaluate(() => {
    window.DGMenu.navigate(1);
    window.DGMenu.navigate(1);
  });
  await page.waitForTimeout(120);

  expect(await page.evaluate(() => window.DGMenu.getCurrentView())).toBe(1);
});

test('rotation keeps the current menu face meaningful', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium');
  await openMenu(page);
  await page.evaluate(() => window.jumpToView(2));
  await page.waitForTimeout(800);

  await page.setViewportSize({ width: 932, height: 430 });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.DGMenu.getLayoutMode())).toBe('single');
  expect(await page.evaluate(() => window.DGMenu.getCurrentView())).toBe(2);

  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.DGMenu.getCurrentView())).toBe(2);
});

test('install and dialer controls remain inside the viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium');
  await openMenu(page);
  await page.waitForTimeout(1_000);

  const boxes = await page.evaluate(() => {
    const ids = ['menu-install-btn', 'dialer'];
    return ids.map((id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
  });
  const viewport = page.viewportSize();

  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
    expect(box.bottom).toBeLessThanOrEqual(viewport.height);
  }
  expect(boxes[0].right).toBeLessThan(boxes[1].left);
});

test('gate and hub remain within mobile viewport bounds', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium');

  await page.goto('/index.html');
  await page.waitForSelector('#ui-welcome');
  let dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    panel: document.getElementById('ui-welcome').getBoundingClientRect().toJSON(),
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.panel.left).toBeGreaterThanOrEqual(0);
  expect(dimensions.panel.right).toBeLessThanOrEqual(dimensions.viewport + 1);

  await page.goto('/hub.html');
  await page.waitForSelector('.nav-grid');
  dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    grid: document.querySelector('.nav-grid').getBoundingClientRect().toJSON(),
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.grid.left).toBeGreaterThanOrEqual(0);
  expect(dimensions.grid.right).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test('Android page turns request best-effort haptics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'galaxy-chromium');
  await page.addInitScript(() => {
    window.__vibrationCalls = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value(pattern) {
        window.__vibrationCalls.push(pattern);
        return true;
      },
    });
  });
  await openMenu(page);
  await page.evaluate(() => window.DGMenu.navigate(1));
  await expect.poll(() => page.evaluate(() => window.__vibrationCalls.length)).toBe(1);
});
