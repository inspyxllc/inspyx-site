// Self-check of the report page against the report function itself: a link's key in, the page out.
//
// usage: node tools/report_serve.js &
//        node tools/check_report_cloud.js <key> [--cloud http://localhost:4199]
//
// <key> is the key of a link to a published report. With --cloud, the function is the one on this machine
// (the app repo's backend/supabase/functions/report/sample/local_cloud.mjs, after publish_sample.mjs put the
// sample on it): the page still asks Inspyx's real address, under its real Content-Security-Policy, and
// this check carries each request over to the local one. Without --cloud it asks the live function.
//
// It checks what only the two together can show: the page reads the function's answer across origins, the
// pictures and the PDF come from the function's signed addresses, the PDF downloads under the report's
// name, a key no link has says so, and nothing is asked of anyone else.
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const key = args[0];
const cloud = args.includes('--cloud') ? args[args.indexOf('--cloud') + 1].replace(/\/+$/, '') : null;
if (!key || !/^[A-Za-z0-9_-]{22}$/.test(key)) { console.error('usage: node tools/check_report_cloud.js <key> [--cloud <address>]'); process.exit(2); }
const SITE = 'http://localhost:4174';
const INSPYX = 'https://btxlrfvqifnrnxffohsz.supabase.co';

let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };

/** Carries the page's requests to Inspyx over to the local function, and its answers back as Inspyx's. */
async function carry(page, seen) {
  if (!cloud) return;
  await page.route(INSPYX + '/**', async (route) => {
    const req = route.request();
    seen.push(req.method() + ' ' + new URL(req.url()).pathname);
    const res = await route.fetch({ url: cloud + req.url().slice(INSPYX.length) });
    const type = res.headers()['content-type'] || '';
    if (type.includes('application/json')) {
      // The local function signs addresses on itself; to the page they must be Inspyx's.
      return route.fulfill({ response: res, body: (await res.text()).split(cloud).join(INSPYX) });
    }
    return route.fulfill({ response: res });
  });
}

(async () => {
  const browser = await chromium.launch();

  // ---- the report a key opens
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = [], hosts = new Set(), seen = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('request', (r) => hosts.add(new URL(r.url()).origin));
    await carry(page, seen);
    const answered = page.waitForResponse((r) => r.url().includes('/functions/v1/report/' + key), { timeout: 15000 }).catch(() => null);
    await page.goto(SITE + '/r/' + key, { waitUntil: 'load' });
    const res = await answered;
    const answer = res ? await res.json().catch(() => null) : null;
    ok('the function answers the page across origins with an open report', !!answer && res.status() === 200 && answer.state === 'open' && res.headers()['access-control-allow-origin'] === '*',
      res ? res.status() + ' ' + (answer && answer.state) : 'no answer');
    if (answer && answer.state === 'open') {
      await page.waitForSelector('#glance .row', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const rows = answer.report.glance.groups.reduce((n, g) => n + g.rows.length, 0);
      const r = await page.evaluate(() => ({
        h1: (document.querySelector('h1') || {}).textContent, rows: document.querySelectorAll('#glance .row').length,
        hero: (document.querySelector('.hero img') || document.querySelector('img.hero') || {}).naturalWidth || 0,
        heroSrc: (document.querySelector('.hero img') || document.querySelector('img.hero') || {}).currentSrc || '',
        thumbs: Array.from(document.querySelectorAll('#glance .row img')).slice(0, 6).filter((i) => i.complete && i.naturalWidth > 0).length,
        missing: document.querySelectorAll('.ph-missing').length, sample: document.body.textContent.includes('Sample report'),
        pdf: (document.querySelector('.bar a[data-pdf]') || {}).href || '',
      }));
      ok('the page shows that report: its address, every finding, the cover photo and the list\'s small pictures',
        r.h1 === answer.report.cover.address && r.rows === rows && r.hero > 0 && r.thumbs >= Math.min(3, rows) && r.missing === 0, JSON.stringify(r).slice(0, 300));
      ok('the pictures come from the function\'s signed addresses', r.heroSrc.startsWith(INSPYX + '/storage/v1/object/sign/reports/') && /[?&]token=/.test(r.heroSrc), r.heroSrc.slice(0, 90));
      ok('a real report is not marked as a sample', !r.sample);
      // a finding with a photo, at full size
      const withPhoto = await page.evaluate(() => { const row = Array.from(document.querySelectorAll('#glance .row')).find((x) => x.querySelector('img')); return row ? row.dataset.finding : null; });
      if (withPhoto) {
        await page.click(`#glance .row[data-finding="${withPhoto}"]`);
        await page.waitForTimeout(1200);
        const big = await page.evaluate(() => { const i = document.querySelector('.sheet-finding .ph img'); return i ? { w: i.naturalWidth, src: i.currentSrc } : null; });
        ok('an opened finding loads its photo at full size', !!big && big.w > 0 && !/thumbs\//.test(big.src), JSON.stringify(big).slice(0, 160));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
      // the PDF
      const pdfOk = r.pdf.startsWith(INSPYX + '/storage/v1/object/sign/reports/') && r.pdf.includes('download=');
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('.bar a[data-pdf]')]);
      ok('PDF downloads the report\'s PDF under the report\'s own name', pdfOk && !!download && download.suggestedFilename() === answer.pdf.name,
        (download ? download.suggestedFilename() : 'no download') + ' | ' + r.pdf.slice(0, 80));
      const allowed = new Set([SITE, INSPYX]);
      ok('nothing was asked of anyone but this site and Inspyx', Array.from(hosts).every((h) => allowed.has(h)), Array.from(hosts).join(' '));
      ok('the page raised no error (its Content-Security-Policy let all of it through)', errs.length === 0, errs.join(' | ').slice(0, 300));
    }
    await ctx.close();
  }

  // ---- a key no link has
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await carry(page, []);
    const other = key.split('').reverse().join('');
    await page.goto(SITE + '/r/' + (other === key ? 'A'.repeat(22) : other), { waitUntil: 'load' });
    await page.waitForSelector('[data-state]', { timeout: 10000 }).catch(() => {});
    const state = await page.evaluate(() => { const m = document.querySelector('[data-state]'); return m ? m.dataset.state + '|' + m.textContent : ''; });
    ok('a key no link has: "This report link doesn\'t work."', state.startsWith('gone|') && state.includes('doesn’t work'), state.slice(0, 120));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
