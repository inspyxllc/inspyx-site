// Times the film's draw call at several film times (software canvas, so an upper bound).
const path = require('path');
const { chromium } = require('playwright');
const html = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('file://' + html);
  await page.waitForTimeout(600);
  const res = await page.evaluate(() => {
    const c = window.__comp, out = {};
    const cv = document.querySelector('canvas[data-film]');
    const ctx = cv.getContext('2d');
    for (const T of [1.0, 1.3, 1.9, 2.3, 2.9, 3.45, 3.8, 4.45, 4.8, 5.0]) {
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) c._draw(ctx, cv.clientWidth, cv.clientHeight, 2, T, i * 0.05);
      ctx.getImageData(0, 0, 1, 1);
      out[T] = ((performance.now() - t0) / 20).toFixed(1) + ' ms';
    }
    return out;
  });
  console.log(JSON.stringify(res));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
