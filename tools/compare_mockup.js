// Checks the real home page against the phone mock-up it was built from, frame by frame, on a 390 x 844 phone,
// and counts every pixel that differs at all.
//
// The mock-up Moises approved on 2026-11-10 is kept on the branch claude/home-page-mockup:
//   git fetch origin claude/home-page-mockup && git show FETCH_HEAD:mockup/preview.html > /tmp/mockup.html
//
// usage: node tools/serve.js &
//        node tools/compare_mockup.js /tmp/mockup.html <outDir> [--same-pictures]
//
// --same-pictures gives the real page the mock-up's own JPEG report pictures (its WebP copies left out), so that
// whatever still differs is in the page itself and not in a picture's file format.
//
// The footer is left out: the real page's footer differs on purpose (three links to pages that don't exist were removed).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const samePictures = args.includes('--same-pictures');
const [mockup, outDir] = args.filter((a) => !a.startsWith('--'));
if (!mockup || !outDir) { console.error('usage: node tools/compare_mockup.js <mockup preview.html> <outDir> [--same-pictures]'); process.exit(2); }
const SITE = 'http://localhost:4173/';

// film moments (the page is scrolled to (T - 1) x 1300), then places lower down: the report pages, the calculator, the form
const frames = [1, 1.3, 1.62, 1.9, 2.3, 2.6, 2.9, 3.3, 3.45, 3.8, 3.97, 4.45, 4.8, 5].map((T) => ['T' + String(T).replace('.', '_'), Math.round((T - 1) * 1300)])
  .concat([5480, 5900, 6350, 6800].map((y) => ['y' + y, y]));

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const which of ['mockup', 'real']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    // one fixed moment for the film's own clock, so drifting clouds and shadows sit in the same place in both
    await ctx.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (fn) => raf(() => fn(5000)); });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    if (which === 'real' && samePictures) {
      await page.route(SITE, async (route) => {
        const r = await route.fetch();
        const body = (await r.text()).replace(/<source srcset="[^"]*\.webp" type="image\/webp">/g, '');
        await route.fulfill({ response: r, body });
      });
    }
    await page.goto(which === 'mockup' ? 'file://' + path.resolve(mockup) : SITE, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    for (const [name, top] of frames) {
      await page.evaluate(([w, y]) => {
        // the mock-up scrolls inside its phone screen; the real page scrolls the document
        if (w === 'mockup') document.querySelector('[data-scroller]').scrollTo({ top: y, behavior: 'instant' });
        else { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, y); }
      }, [which, top]);
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(outDir, which + '-' + name + '.png') });
    }
    if (errs.length) console.log(which + ' page errors: ' + errs.join(' | '));
    await ctx.close();
  }

  // count the differing pixels of each pair, in a blank page (no extra packages needed)
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let same = 0, total = 0;
  for (const [name] of frames) {
    const a = fs.readFileSync(path.join(outDir, 'mockup-' + name + '.png')).toString('base64');
    const b = fs.readFileSync(path.join(outDir, 'real-' + name + '.png')).toString('base64');
    const r = await page.evaluate(async ([A, B]) => {
      const load = (d) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + d; });
      const px = (i) => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
      const ia = px(await load(A)), ib = px(await load(B));
      if (ia.width !== ib.width || ia.height !== ib.height) return { size: [ia.width, ia.height, ib.width, ib.height] };
      let n = 0, big = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let p = 0, k = 0; p < ia.data.length; p += 4, k++) {
        const d = Math.max(Math.abs(ia.data[p] - ib.data[p]), Math.abs(ia.data[p + 1] - ib.data[p + 1]), Math.abs(ia.data[p + 2] - ib.data[p + 2]));
        if (!d) continue;
        n++; if (d > big) big = d;
        const x = k % ia.width, y = (k - x) / ia.width;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return { n, big, box: n ? [x0, y0, x1, y1] : null };
    }, [a, b]);
    if (r.size) { console.log(name + ': different sizes ' + r.size.join(' x ')); continue; }
    if (!r.n) { same++; continue; }
    total += r.n;
    console.log(name + ': ' + r.n + ' pixels differ, by at most ' + r.big + ' of 255, inside x ' + r.box[0] + '-' + r.box[2] + ', y ' + r.box[1] + '-' + r.box[3]);
  }
  console.log((samePictures ? 'same report pictures: ' : 'as visitors get it: ') + frames.length + ' frames, ' + same + ' identical to the last pixel, ' + total + ' differing pixels in the rest');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
