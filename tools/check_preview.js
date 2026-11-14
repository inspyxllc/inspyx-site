// Self-checks for the private preview built by tools/report_preview.js.
//
// usage: node tools/check_preview.js <out folder>
//
// It serves the folder the way a published artifact is served (the one file wrapped in the publishing
// skeleton, its supporting files beside it), frames it from a second origin with no origin of its own, and
// checks: the sample opens with its photos; a finding and a photo open and close; the other states show;
// the PDF button hands the file to the viewer, waits for it, takes a "no", and falls back to a plain link
// where no viewer can save files; nothing runs off the side.
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(root, 'web-report-sample.html'))) { console.error('usage: node tools/check_preview.js <out folder>'); process.exit(2); }
const PORT_A = 4181, PORT_B = 4182;
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' };
const SKELETON_HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'
  + ':root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}'
  + '</style></head><body>';
const servers = [
  http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/a\//, '');
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('no'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    if (ext === '.html') return res.end(SKELETON_HEAD + fs.readFileSync(file, 'utf8') + '</body></html>');
    fs.createReadStream(file).pipe(res);
  }).listen(PORT_A),
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{display:block;width:100%;height:100%;border:0}</style>'
      + '<iframe sandbox="allow-scripts allow-popups" src="http://localhost:' + PORT_A + '/a/web-report-sample.html"></iframe>');
  }).listen(PORT_B),
];

const A = 'http://localhost:' + PORT_A + '/a/web-report-sample.html', B = 'http://localhost:' + PORT_B + '/';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const pdfSize = fs.statSync(path.join(root, 'sample-report/report.pdf')).size;
// What the sample says, so the checks hold for any sample.
const sample = JSON.parse(fs.readFileSync(path.join(root, 'sample-report/report.json'), 'utf8'));
const ADDRESS = sample.report.cover.address;
const ROWS = sample.report.glance.groups.reduce((n, g) => n + g.rows.length, 0);
const PDF_NAME = sample.pdf.name;

async function open(browser, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: o.w || 390, height: o.h || 844 }, deviceScaleFactor: 1, hasTouch: !o.desktop, isMobile: !o.desktop });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  if (o.init) await page.addInitScript(o.init);
  await page.goto(o.url || A, { waitUntil: 'load' });
  return { ctx, page, errs };
}
const ready = (frame) => frame.waitForFunction(() => !document.getElementById('app').hasAttribute('aria-busy') && document.querySelector('[data-state], #glance .row'), null, { timeout: 8000 });

(async () => {
  const browser = await chromium.launch();

  // ---- the page, opened on its own
  {
    const { ctx, page, errs } = await open(browser);
    await ready(page);
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({
      h1: document.querySelector('h1').textContent, rows: document.querySelectorAll('#glance .row').length,
      hero: (document.querySelector('.hero img') || document.querySelector('img.hero') || {}).naturalWidth || 0,
      thumbs: Array.from(document.querySelectorAll('#glance .row img')).slice(0, 6).filter((i) => i.complete && i.naturalWidth > 0).length,
      missing: document.querySelectorAll('.ph-missing').length, tag: !!Array.from(document.querySelectorAll('.cover *')).find((e) => e.textContent === 'Sample report'),
      sw: document.documentElement.scrollWidth, vw: window.innerWidth, pdf: document.querySelectorAll('a[data-pdf]').length,
    }));
    ok('the preview opens the sample report, with its photos', r.h1 === ADDRESS && r.rows === ROWS && r.hero > 0 && r.thumbs >= 3 && r.missing === 0 && r.pdf >= 1, JSON.stringify(r));
    ok('nothing runs off the side', r.sw <= r.vw, r.sw + '/' + r.vw);
    // a finding, a photo, close both
    await page.click('#glance .row');
    await page.waitForTimeout(250);
    await page.click('.sheet-finding .ph');
    await page.waitForTimeout(250);
    const two = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    await page.click('.viewer .ibtn[aria-label="Close"]');
    await page.waitForTimeout(800);
    await page.click('.sheet-finding .ibtn[aria-label="Close"]');
    await page.waitForTimeout(800);
    const none = await page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    ok('a finding and its photo open and close', two === 2 && none === 0, two + ',' + none);
    // the other states
    await page.evaluate(() => document.querySelector('.pv').scrollIntoView());
    await page.waitForTimeout(200);
    await page.click('.pv-b[data-show="locked"]');
    await page.waitForFunction(() => document.querySelector('[data-state="locked"]'), null, { timeout: 4000 });
    await page.waitForTimeout(400);
    const url0 = page.url();
    await page.click('.state-locked a.btn');
    await page.waitForTimeout(300);
    const pay = await page.evaluate(() => ({ note: document.getElementById('pv-note').textContent, hidden: document.getElementById('pv-note').hidden, photo: (document.querySelector('.about-ph') || {}).naturalWidth || 0 }));
    ok('"It isn\'t paid yet" shows the locked page; Pay now explains itself and goes nowhere', page.url() === url0 && /pay page/.test(pay.note) && !pay.hidden && pay.photo > 0, JSON.stringify(pay));
    await page.click('.pv-b[data-show="plain"]');
    await page.waitForFunction(() => document.querySelector('[data-state="plain"]'), null, { timeout: 4000 });
    const plain = await page.evaluate(() => ({ t: document.querySelector('.state-t').textContent, pdf: document.querySelectorAll('a[data-pdf]').length }));
    await page.click('.pv-b[data-show="gone"]');
    await page.waitForFunction(() => document.querySelector('[data-state="gone"]'), null, { timeout: 4000 });
    const gone = await page.evaluate(() => document.querySelector('.state-t').textContent);
    await page.click('.pv-b[data-show="report"]');
    await page.waitForFunction(() => document.querySelector('#glance .row'), null, { timeout: 4000 });
    const again = await page.evaluate(() => ({ rows: document.querySelectorAll('#glance .row').length, pressed: document.querySelector('.pv-b[aria-pressed="true"]').dataset.show }));
    ok('the other states show, and the report comes back', plain.pdf === 1 && /PDF|page/.test(plain.t) && /link/.test(gone) && again.rows === ROWS && again.pressed === 'report', JSON.stringify({ plain, gone, again }));
    ok('none of that raised an error', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- the PDF button, where the viewer can save files
  {
    const { ctx, page, errs } = await open(browser, { init: () => {
      window.claude = { use: (n) => new Promise((done) => setTimeout(() => done(n === 'downloads' ? { save: (req) => { window.__saved = { filename: req.filename, size: req.data && req.data.size, blob: req.data instanceof Blob }; return Promise.resolve({ status: 'saved' }); } } : null), 50)) };
    } });
    await ready(page);
    await page.waitForTimeout(300);
    await page.click('.bar a[data-pdf]');
    await page.waitForFunction(() => window.__saved, null, { timeout: 8000 }).catch(() => {});
    const s = await page.evaluate(() => ({ saved: window.__saved, note: document.getElementById('pv-note').hidden, url: location.href }));
    ok('PDF hands the viewer the whole file under the report\'s name', s.saved && s.saved.blob && s.saved.size === pdfSize && s.saved.filename === PDF_NAME && s.note && s.url === A, JSON.stringify(s));
    ok('no error', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  // ---- declined, and a click before the viewer has answered
  {
    const { ctx, page } = await open(browser, { init: () => {
      window.__calls = 0;
      window.claude = { use: () => new Promise((done) => setTimeout(() => done({ save: () => { window.__calls++; return Promise.reject({ code: 'declined', message: 'no' }); } }), 1200)) };
    } });
    await ready(page);
    await page.click('.bar a[data-pdf]');           // before the viewer has answered
    await page.waitForFunction(() => window.__calls === 1, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const d = await page.evaluate(() => ({ calls: window.__calls, hidden: document.getElementById('pv-note').hidden }));
    ok('an early tap waits for the viewer, and a "no" to the save is left at that', d.calls === 1 && d.hidden, JSON.stringify(d));
    await ctx.close();
  }
  // ---- where the viewer can't save files: the link opens the PDF
  {
    // (A headless browser has no PDF viewer: the new tab turns into a download at once, so the check reads
    // what the link was left to do instead of waiting for a tab.)
    const watch = () => { document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[data-pdf]'); if (a) window.__click = { prevented: e.defaultPrevented, target: a.target, download: a.hasAttribute('download'), href: a.href }; }); };
    for (const [name, init] of [['the viewer can\'t save files', () => { window.claude = { use: () => Promise.resolve(null) }; }], ['there is no viewer around it at all', () => {}]]) {
      const { ctx, page, errs } = await open(browser, { init });
      await ready(page);
      await page.evaluate(watch);
      await page.waitForTimeout(300);
      await page.click('.bar a[data-pdf]').catch(() => {});
      await page.waitForTimeout(300);
      const c = await page.evaluate(() => ({ click: window.__click, note: document.getElementById('pv-note').textContent }));
      ok('where ' + name + ', PDF is left to open the file in a new tab, and says what the real page does',
        c.click && !c.click.prevented && c.click.target === '_blank' && !c.click.download && /sample-report\/report\.pdf$/.test(c.click.href) && /real page/.test(c.note) && errs.length === 0, JSON.stringify(c) + errs.join('|'));
      await ctx.close();
    }
  }

  // ---- framed and sandboxed from another origin, the way a viewer may show it
  {
    const { ctx, page, errs } = await open(browser, { url: B });
    const frame = page.frames().find((f) => f.url().includes('web-report-sample'));
    await ready(frame);
    await page.waitForTimeout(700);
    const r = await frame.evaluate(() => ({
      origin: self.origin, h1: document.querySelector('h1').textContent, rows: document.querySelectorAll('#glance .row').length,
      hero: (document.querySelector('.hero img') || document.querySelector('img.hero') || {}).naturalWidth || 0, missing: document.querySelectorAll('.ph-missing').length,
    }));
    ok('framed with no origin of its own, it still opens the sample with its photos', r.origin === 'null' && r.h1 === ADDRESS && r.rows === ROWS && r.hero > 0 && r.missing === 0, JSON.stringify(r));
    await frame.click('#glance .row');
    await page.waitForTimeout(300);
    const one = await frame.evaluate(() => document.querySelectorAll('dialog[open]').length);
    await frame.click('.sheet-finding .ibtn[aria-label="Close"]');
    await page.waitForTimeout(900);
    const zero = await frame.evaluate(() => document.querySelectorAll('dialog[open]').length);
    await frame.click('.pv-b[data-show="locked"]');
    await frame.waitForFunction(() => document.querySelector('[data-state="locked"]'), null, { timeout: 4000 }).catch(() => {});
    const locked = await frame.evaluate(() => !!document.querySelector('[data-state="locked"]'));
    ok('framed: a finding opens and closes, and the states switch', one === 1 && zero === 0 && locked, one + ',' + zero + ',' + locked);
    ok('framed: no error', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---- the sample can't be fetched: the preview says what it tried
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.route('**/sample-report/report.json', (route) => route.abort('failed'));
    await page.goto(A, { waitUntil: 'load' });
    await page.waitForSelector('.pv-diag', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => ({ state: (document.querySelector('[data-state]') || { dataset: {} }).dataset.state, diag: (document.querySelector('.pv-diag') || {}).textContent || '' }));
    ok('if the sample can\'t be fetched, the page says so and the preview adds what it tried', d.state === 'failed' && /plain: 200/.test(d.diag) && /picture: ok/.test(d.diag) && /no cookies: 200/.test(d.diag), JSON.stringify(d));
    await ctx.close();
  }

  // ---- a computer-sized window
  {
    const { ctx, page, errs } = await open(browser, { w: 1280, h: 900, desktop: true });
    await ready(page);
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth, side: getComputedStyle(document.querySelector('.side')).display }));
    ok('wide: the contents column shows, and nothing runs off the side', r.side === 'block' && r.sw <= r.vw && errs.length === 0, JSON.stringify(r) + errs.join('|'));
    await page.evaluate(() => document.querySelector('.pv').scrollIntoView());
    await page.waitForTimeout(200);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { w: 320, h: 568 });
    await ready(page);
    await page.evaluate(() => document.querySelector('.pv').scrollIntoView());
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth, small: Array.from(document.querySelectorAll('.pv-b')).filter((b) => b.getBoundingClientRect().height < 43.5).length }));
    ok('the smallest phone: the preview strip fits and its buttons are big enough', r.sw <= r.vw && r.small === 0, JSON.stringify(r));
    await ctx.close();
  }

  await browser.close();
  servers.forEach((s) => s.close());
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall preview checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
