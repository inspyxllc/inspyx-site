// Draws the small pictures the site needs from its own mark and film:
//   coming-soon/assets/favicon-32.png, apple-touch-icon.png and share.png (the picture a pasted link shows).
// usage: node tools/make-images.js      (then turn share.png into share.jpg; see coming-soon/README.md)
const path = require('path');
const { chromium } = require('playwright');

const assets = path.join(__dirname, '..', 'coming-soon', 'assets');
const MARK = 'M129.92,23.41 L201.03,83.71 Q214.0,94.7 214.00,111.70 L214.00,222.00 Q214.0,236.0 200.00,236.00 L145.50,236.00 Q143.0,236.0 143.00,233.50 L143.00,192.00 Q143.0,178.0 129.00,178.00 L111.00,178.00 Q97.0,178.0 97.00,192.00 L97.00,233.50 Q97.0,236.0 94.50,236.00 L40.00,236.00 Q26.0,236.0 26.00,222.00 L26.00,111.70 Q26.0,94.7 38.97,83.71 L110.08,23.41 Q120.0,15.0 129.92,23.41 Z';

// a white tile with the black house mark; radius 0 for the iPhone icon (iOS rounds it itself)
const icon = (size, radius, stroke, pad) => `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
<rect width="${size}" height="${size}" rx="${radius}" fill="#FFFFFF"/>
<svg x="${pad}" y="${pad}" width="${size - 2 * pad}" height="${size - 2 * pad}" viewBox="-6 0 252 252"><path d="${MARK}" fill="none" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/></svg>
</svg></body></html>`;

(async () => {
  const browser = await chromium.launch();
  for (const [name, size, radius, stroke, pad] of [['favicon-32.png', 32, 7, 22, 4], ['apple-touch-icon.png', 180, 0, 15, 34]]) {
    const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(icon(size, radius, stroke, pad));
    await page.screenshot({ path: path.join(assets, name), omitBackground: true });
    await ctx.close();
    console.log('wrote ' + name);
  }
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  // one fixed moment for the film's own clock, so the picture is the same every time
  await ctx.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (fn) => raf(() => fn(5000)); });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(__dirname, 'share-image.html'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(assets, 'share.png') });
  console.log('wrote share.png');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
