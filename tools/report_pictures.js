// Makes the two pictures of the web report that the home page's report section shows:
//   assets/report-web.(jpg|webp)   the client's report page on a phone, its first screen
//   assets/report-clip.(jpg|webp)  one finding of it (the active leak in the attic), with a video marked on its photo
// Both are taken from the real report page (branch claude/web-report: coming-soon/report.html) showing the
// anonymized sample report. Neither the page nor the sample is in this branch: the sample is private (this
// repo is public), and the page is not live yet.
//
// usage, from a checkout of claude/web-report, with a sample folder (report.json, files/, report.pdf) whose
// picture addresses start with /sample-report/ :
//   node tools/report_serve.js --sample <sample folder> --port 4176 &
//   node <this file> <out folder>
// then copy report-web.* and report-clip.* from <out folder> into coming-soon/assets/.
//
// Two things are added to what the page itself draws, and both are said in the manual:
//   - the number plate of the car in the cover photo is blurred (the place is given in page pixels below, for
//     this sample's cover photo at 390 px wide);
//   - the video mark on the finding's photo (a "Video" label, a play button, "0:12"). The page does not play
//     clips yet; the home page shows this under "Arrives with the pilot".
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const b = await chromium.launch();
  // ---- 1. the first screen
  let p = await b.newPage({ viewport: { width: 390, height: 640 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:4176/r/sample', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await p.evaluate(() => {
    // the car's number plate in the cover photo is blurred: a detail of a real driveway that the report's own
    // anonymizing did not reach
    const d = document.body.appendChild(document.createElement('div'));
    d.style.cssText = 'position:absolute;left:82px;top:223px;width:22px;height:13px;border-radius:3px;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);background:rgba(210,205,200,.35);z-index:5';
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(out, 'phone.png') });
  await p.close();
  // ---- 2. the finding "Active leak" in the attic, with a clip on its photo
  p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
  await p.goto('http://127.0.0.1:4176/r/sample', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  const ok = await p.evaluate(() => {
    const all = [...document.querySelectorAll('article, section, div, li')].filter((n) => /C9\.2/.test(n.textContent) && /observed condition/i.test(n.textContent) && n.querySelector('img'));
    all.sort((a, c) => a.textContent.length - c.textContent.length);
    const card = all[0]; if (!card) return null;
    card.setAttribute('data-clip-card', '1');
    const img = card.querySelector('img'); const box = img.parentElement;
    const cs = getComputedStyle(box); if (cs.position === 'static') box.style.position = 'relative';
    const r = img.getBoundingClientRect(), pr = box.getBoundingClientRect();
    const lay = box.appendChild(document.createElement('div'));
    lay.style.cssText = 'position:absolute;left:' + (r.left - pr.left) + 'px;top:' + (r.top - pr.top) + 'px;width:' + r.width + 'px;height:' + r.height + 'px;pointer-events:none;font-family:inherit';
    // The page's own rules refuse styles written into markup, so each piece is made and styled through the DOM.
    const mk = (parent, css, text) => { const e = parent.appendChild(document.createElement('div')); e.style.cssText = css; if (text) e.appendChild(document.createTextNode(text)); return e; };
    const svg = (parent, w, h, box, kids, css) => { const NS = 'http://www.w3.org/2000/svg'; const e = parent.appendChild(document.createElementNS(NS, 'svg')); e.setAttribute('width', w); e.setAttribute('height', h); e.setAttribute('viewBox', box); if (css) e.style.cssText = css; for (const [tag, at] of kids) { const k = e.appendChild(document.createElementNS(NS, tag)); for (const n in at) k.setAttribute(n, at[n]); } return e; };
    const play = mk(lay, 'position:absolute;left:50%;top:50%;width:66px;height:66px;margin:-33px 0 0 -33px;border-radius:50%;background:rgba(255,255,255,.94);box-shadow:0 6px 22px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center');
    svg(play, 26, 28, '0 0 26 28', [['path', { d: 'M2 1.8v24.4a1.3 1.3 0 0 0 2 1.1l20-12.2a1.3 1.3 0 0 0 0-2.2L4 .7a1.3 1.3 0 0 0-2 1.1z', fill: '#1F4E79' }]], 'margin-left:5px');
    const kind = mk(lay, 'position:absolute;left:10px;top:10px;height:26px;padding:0 11px 0 9px;border-radius:13px;background:rgba(255,255,255,.94);color:#1D1D1F;font-size:13px;font-weight:700;line-height:26px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,.25)');
    svg(kind, 14, 12, '0 0 14 12', [['rect', { x: '.8', y: '1.3', width: '8.6', height: '9.4', rx: '2', fill: 'none', stroke: '#1D1D1F', 'stroke-width': '1.5' }], ['path', { d: 'M9.6 4.6l3.4-2v6.8l-3.4-2z', fill: '#1D1D1F' }]]);
    kind.appendChild(document.createTextNode('Video'));
    mk(lay, 'position:absolute;right:10px;bottom:10px;height:24px;padding:0 9px;border-radius:12px;background:rgba(0,0,0,.66);color:#fff;font-size:13px;font-weight:600;line-height:24px;font-variant-numeric:tabular-nums', '0:12');
    const cr = card.getBoundingClientRect();
    return { top: Math.round(cr.top + scrollY), w: Math.round(cr.width), h: Math.round(cr.height), cls: card.tagName + '.' + card.className };
  });
  console.log('finding card:', JSON.stringify(ok));
  const el = await p.$('[data-clip-card]');
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  await el.screenshot({ path: path.join(out, 'clip.png') });
  await p.close();
  // ---- to the sizes and formats the page serves: 600 px wide, JPEG and WebP
  p = await b.newPage();
  for (const [name, file] of [['report-web', 'phone.png'], ['report-clip', 'clip.png']]) {
    const data = 'data:image/png;base64,' + fs.readFileSync(path.join(out, file)).toString('base64');
    const res = await p.evaluate(async (data) => {
      const img = new Image(); img.src = data; await img.decode();
      const w = 600, h = Math.round(img.height * w / img.width);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high'; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      return { w, h, jpg: c.toDataURL('image/jpeg', 0.84), webp: c.toDataURL('image/webp', 0.82) };
    }, data);
    fs.writeFileSync(path.join(out, name + '.jpg'), Buffer.from(res.jpg.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(out, name + '.webp'), Buffer.from(res.webp.split(',')[1], 'base64'));
    console.log(name, res.w + 'x' + res.h, 'jpg', fs.statSync(path.join(out, name + '.jpg')).size, 'webp', fs.statSync(path.join(out, name + '.webp')).size);
  }
  await b.close();
})();
