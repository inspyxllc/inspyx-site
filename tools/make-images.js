// Draws the small pictures the site needs from its own mark and film:
//   coming-soon/assets/favicon-32.png, apple-touch-icon.png and share.png (the picture a pasted link shows).
// usage: node tools/make-images.js      (then turn share.png into share.jpg; see coming-soon/README.md)
const path = require('path');
const { chromium } = require('playwright');

const assets = path.join(__dirname, '..', 'coming-soon', 'assets');

// The ribbon S logo (Moises's pick, 2026-11-16; logo canvas, board "Your pick: the ribbon S"): the
// one-line house without its door, a glowing ribbon S inside. Shapes in the mark's box, viewBox -6 0 252 252.
const HOUSE = 'M129.92,23.41 L201.03,83.71 Q214,94.7 214,111.7 L214,222 Q214,236 200,236 L40,236 Q26,236 26,222 L26,111.7 Q26,94.7 38.97,83.71 L110.08,23.41 Q120,15 129.92,23.41 Z';
const TOP = 'M139.28,110.12 C131.28,98.12 119.28,94.12 107.28,94.12 C89.28,94.12 77.28,104.12 77.28,118.12 C77.28,134.12 91.28,140.12 109.28,145.12 L130.72,152.88 C112.72,147.88 98.72,141.88 98.72,125.88 C98.72,111.88 110.72,101.88 128.72,101.88 C140.72,101.88 152.72,105.88 160.72,117.88 Z';
const BOT = 'M109.28,145.12 C127.28,150.12 141.28,156.12 141.28,172.12 C141.28,188.12 127.28,198.12 109.28,198.12 C95.28,198.12 83.28,192.12 77.28,182.12 L98.72,189.88 C104.72,199.88 116.72,205.88 130.72,205.88 C148.72,205.88 162.72,195.88 162.72,179.88 C162.72,163.88 148.72,157.88 130.72,152.88 Z';
const SPINE = 'M150,114 C142,102 130,98 118,98 C100,98 88,108 88,122 C88,138 102,144 120,149 C138,154 152,160 152,176 C152,192 138,202 120,202 C106,202 94,196 88,186';

// On navy: white house line; the ribbon's light top face and deep underside, with a sky-blue glow behind.
const RIBBON = '<defs>'
  + '<linearGradient id="t" gradientUnits="userSpaceOnUse" x1="84" y1="94" x2="150" y2="152"><stop offset="0" stop-color="#F0F9FF"/><stop offset="0.55" stop-color="#7DD3FC"/><stop offset="1" stop-color="#38BDF8"/></linearGradient>'
  + '<linearGradient id="b" gradientUnits="userSpaceOnUse" x1="120" y1="148" x2="150" y2="206"><stop offset="0" stop-color="#38BDF8"/><stop offset="0.6" stop-color="#2563EB"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient>'
  + '<filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>'
  + `<path d="${HOUSE}" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>`
  + `<path d="${SPINE}" fill="none" stroke="#38BDF8" stroke-width="30" stroke-linecap="round" opacity="0.5" filter="url(#g)"/>`
  + `<path d="${TOP}" fill="url(#t)"/><path d="${BOT}" fill="url(#b)"/>`;
// Under 40 px the glow and the twist smear: a heavier house line and one solid S stroke instead.
const SIMPLE = `<path d="${HOUSE}" fill="none" stroke="#FFFFFF" stroke-width="20" stroke-linejoin="round" stroke-linecap="round"/>`
  + `<path d="${SPINE}" fill="none" stroke="#38BDF8" stroke-width="28" stroke-linecap="round"/>`;

// The app's icon since 2026-11-16 ~00:1xZ (Moises: "a white background, a black outline of the house, and that's
// specs blue S in the middle. Maybe a bit smaller"; "Yes, use it"): white tile, near-black house, the ribbon's
// light-background colours with a faint glow, the S at 82% centred in the house's body. As inspyx-mobile's
// tool/app_icon draws it, so the iPhone home-screen bookmark matches the app.
const WHITE = '<defs>'
  + '<linearGradient id="t" gradientUnits="userSpaceOnUse" x1="84" y1="94" x2="150" y2="152"><stop offset="0" stop-color="#7DD3FC"/><stop offset="0.55" stop-color="#38BDF8"/><stop offset="1" stop-color="#0EA5E9"/></linearGradient>'
  + '<linearGradient id="b" gradientUnits="userSpaceOnUse" x1="120" y1="148" x2="150" y2="206"><stop offset="0" stop-color="#2563EB"/><stop offset="0.6" stop-color="#1D4ED8"/><stop offset="1" stop-color="#1E3A8A"/></linearGradient>'
  + '<filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>'
  + `<path d="${HOUSE}" fill="none" stroke="#0B0F19" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>`
  + '<g transform="translate(120 158) scale(0.82) translate(-120 -150)">'
  + `<path d="${SPINE}" fill="none" stroke="#38BDF8" stroke-width="30" stroke-linecap="round" opacity="0.12" filter="url(#g)"/>`
  + `<path d="${TOP}" fill="url(#t)"/><path d="${BOT}" fill="url(#b)"/></g>`;

// a tile with the mark at 70/96 of its side (the app icon's tile); radius 0 for the iPhone icon (iOS rounds it itself).
// look: 'simple' = the navy tab icon's simple mark; 'white' = the app's white icon.
const icon = (size, radius, look) => {
  const side = 252 * 96 / 70, o = (side - 252) / 2;
  const white = look === 'white';
  return `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-6 - o} ${-o} ${side} ${side}" style="display:block">
<rect x="${-6 - o}" y="${-o}" width="${side}" height="${side}" rx="${radius * side / size}" fill="${white ? '#FFFFFF' : '#0D2745'}"/>${white ? WHITE : look === 'simple' ? SIMPLE : RIBBON}
</svg></body></html>`;
};

(async () => {
  const browser = await chromium.launch();
  for (const [name, size, radius, look] of [['favicon-32.png', 32, 7, 'simple'], ['apple-touch-icon.png', 180, 0, 'white']]) {
    const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(icon(size, radius, look));
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
