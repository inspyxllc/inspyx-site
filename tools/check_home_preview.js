// Checks the preview bundle against the page as the site serves it: the same picture, the
// same pieces, nothing asked of anyone else, and the waitlist form sending nothing.
//
//   node tools/check_home_preview.js <out folder> .
//
// The artifact wraps the file it is given in a small skeleton, so the preview is drawn here
// inside the same skeleton (__wrapped.html, written into the out folder and removed after).
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const out = process.argv[2];
const repo = process.argv[3];
const SKELETON = (body) => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml' };

function serve(root, port) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    if (!path.extname(p)) p += '.html';
    const file = path.join(root, p);
    if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };

(async () => {
  fs.writeFileSync(path.join(out, '__wrapped.html'), SKELETON(fs.readFileSync(path.join(out, 'index.html'), 'utf8')));
  const a = await serve(out, 4181);                                   // the preview, inside the artifact's skeleton
  const b = await serve(path.join(repo, 'coming-soon'), 4182);        // the page as the site serves it
  const browser = await chromium.launch();

  for (const [what, size] of [['a desktop window', { width: 1280, height: 900 }], ['a phone', { width: 390, height: 844 }]]) {
    const shots = {};
    for (const [name, url] of [['preview', 'http://localhost:4181/__wrapped.html'], ['site', 'http://localhost:4182/index.html']]) {
      const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: size.width < 500, hasTouch: size.width < 500 });
      const page = await ctx.newPage();
      const errs = [], hosts = new Set(), missing = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      page.on('request', (r) => hosts.add(new URL(r.url()).origin));
      page.on('response', (r) => { if (r.status() >= 400) missing.push(r.status() + ' ' + new URL(r.url()).pathname); });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      const seen = await page.evaluate(() => ({
        title: document.title,
        h1: (document.querySelector('h1') || {}).textContent.trim().replace(/\s+/g, ' '),
        sections: document.querySelectorAll('section').length,
        canvases: Array.from(document.querySelectorAll('canvas')).filter((c) => c.width > 0).length,
        images: Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length,
        brokenImages: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
        form: !!document.querySelector('[data-join]'),
        preview: document.querySelector('[data-join]') ? document.querySelector('[data-join]').hasAttribute('data-preview') : null,
        height: document.documentElement.scrollHeight,
        wide: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      shots[name] = { seen, errs, hosts: Array.from(hosts), missing };
      await page.screenshot({ path: path.join(out, `__${name}-${size.width}.png`), fullPage: false });
      if (name === 'preview') {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.45));
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(out, `__preview-${size.width}-middle.png`) });
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(out, `__preview-${size.width}-end.png`) });
      }
      await ctx.close();
    }
    const p = shots.preview, s = shots.site;
    ok(`${what}: the same page (title, heading, sections, canvases)`,
      p.seen.title === s.seen.title && p.seen.h1 === s.seen.h1 && p.seen.sections === s.seen.sections && p.seen.canvases === s.seen.canvases,
      JSON.stringify(p.seen) + ' vs ' + JSON.stringify(s.seen));
    ok(`${what}: as tall as the site's own page, within 2%`,
      Math.abs(p.seen.height - s.seen.height) / s.seen.height < 0.02, `${p.seen.height} vs ${s.seen.height}`);
    ok(`${what}: every picture drawn, none broken, nothing missing`,
      p.seen.images >= s.seen.images && p.seen.brokenImages === 0 && p.missing.length === 0, `${p.seen.images} of ${s.seen.images} | broken ${p.seen.brokenImages} | missing ${p.missing.join(', ')}`);
    ok(`${what}: no sideways scroll`, !p.seen.wide);
    ok(`${what}: the waitlist form is marked preview, so it sends nothing`, p.seen.form && p.seen.preview === true);
    ok(`${what}: nothing was asked of anyone but this page`, p.hosts.every((h) => h === 'http://localhost:4181'), p.hosts.join(' '));
    ok(`${what}: the page raised no error`, p.errs.length === 0, p.errs.join(' | ').slice(0, 200));
  }

  // the other pages of the site
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  for (const name of ['pricing', 'privacy', 'terms', 'refunds']) {
    const bad = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status()); });
    await page.goto('http://localhost:4181/' + name + '.html', { waitUntil: 'load' });
    const t = await page.title();
    ok(`the ${name} page opens, with its pictures`, t.length > 0 && bad.length === 0, t + (bad.length ? ' | ' + bad.join(',') : ''));
  }
  // and back to the home page from one of them
  const back = await page.evaluate(() => { const a = document.querySelector('a.logo, header a[href]'); return a ? a.getAttribute('href') : null; });
  ok('the logo on another page leads back to the home page', back === 'index.html', String(back));
  await ctx.close();

  await browser.close();
  a.close(); b.close();
  fs.rmSync(path.join(out, '__wrapped.html'));
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
