// Makes the pictures of the web report that the home page's report section shows:
//   assets/report-web.(jpg|webp)    the client's report page, its first screen, as a phone shows it (390 by 844)
//   assets/report-leak.(jpg|webp)   the photo of one finding (the active leak in the attic), for the video card
//   assets/report-signature.png     the inspector's signature, on nothing, for the signature card
// The first two are taken from the real report page (branch claude/web-report: coming-soon/report.html) showing
// the sample report; the third is the sample's own signature picture. Neither the page nor the sample is in
// this branch: the sample is private (this repo is public), and the page is not live yet.
//
// usage, from a checkout of claude/web-report, with a sample folder (report.json, files/, report.pdf) whose
// picture addresses start with /sample-report/ :
//   node tools/report_serve.js --sample <sample folder> --port 4176 &
//   node <this file> <out folder> <sample folder>
// then copy the files from <out folder> into coming-soon/assets/.
//
// The sample is first prepared with tools/report_sample_touch.js: a realistic address that is nobody's home,
// the inspector's own name, his photo, a signature made for his name, and realistic words for the rest.
//
// One thing is added to what the page itself draws, and it is said in the manual: the number plate of the car
// in the cover photo is blurred (the place is given in page pixels below, for this sample's cover photo at
// 390 px wide).
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const out = process.argv[2], sample = process.argv[3];
(async () => {
  const b = await chromium.launch();
  // ---- 1. the first screen
  let p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:4176/r/sample', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await p.evaluate(() => {
    const d = document.body.appendChild(document.createElement('div'));
    d.style.cssText = 'position:absolute;left:82px;top:223px;width:22px;height:13px;border-radius:3px;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);background:rgba(210,205,200,.35);z-index:5';
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(out, 'first.png') });
  await p.close();
  // ---- 2. the photo of the finding "Active leak"
  p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
  await p.goto('http://127.0.0.1:4176/r/sample', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  const found = await p.evaluate(() => {
    const all = [...document.querySelectorAll('article')].filter((n) => /Active leak/.test(n.textContent) && n.querySelector('img'));
    all.sort((a, c) => a.textContent.length - c.textContent.length);
    const card = all[0]; if (!card) return null;
    card.querySelector('img').setAttribute('data-leak-photo', '1');
    return card.querySelector('h3, h4, .fid') ? card.textContent.replace(/\s+/g, ' ').slice(0, 60) : 'found';
  });
  console.log('finding:', found);
  const ph = await p.$('[data-leak-photo]');
  await ph.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  await ph.screenshot({ path: path.join(out, 'leak.png') });
  await p.close();
  // ---- to the sizes and formats the page serves
  p = await b.newPage();
  const shrink = async (file, name, w, kinds, crop) => {
    const data = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const res = await p.evaluate(async ([data, w, kinds, crop]) => {
      const img = new Image(); img.src = data; await img.decode();
      const sw = img.width, sh = crop ? Math.min(img.height, Math.round(sw / crop)) : img.height, sy = Math.round((img.height - sh) / 2);
      const h = Math.round(sh * w / sw);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      if (kinds.indexOf('png') < 0) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
      g.drawImage(img, 0, sy, sw, sh, 0, 0, w, h);
      const o = { w, h };
      for (const k of kinds) o[k] = c.toDataURL(k === 'jpg' ? 'image/jpeg' : 'image/' + k, k === 'png' ? undefined : (k === 'jpg' ? 0.84 : 0.82));
      return o;
    }, [data, w, kinds, crop || 0]);
    for (const k of kinds) fs.writeFileSync(path.join(out, name + '.' + k), Buffer.from(res[k].split(',')[1], 'base64'));
    console.log(name, res.w + 'x' + res.h, kinds.map((k) => k + ' ' + fs.statSync(path.join(out, name + '.' + k)).size).join(', '));
  };
  await shrink(path.join(out, 'first.png'), 'report-web', 600, ['jpg', 'webp']);
  await shrink(path.join(out, 'leak.png'), 'report-leak', 480, ['jpg', 'webp'], 4 / 3);
  await shrink(path.join(sample, 'files', 'signature.png'), 'report-signature', 560, ['png']);
  await b.close();
})();
