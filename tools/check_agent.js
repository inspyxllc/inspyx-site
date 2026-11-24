// Self-checks for an agent's private page: /a (2026-11-15, Inspyx 4, board item 32).
// NOTHING REAL IS ASKED. The agent-page function is a stand-in this test runs itself, answering as the live one
// does (backend/supabase/functions/agent-page in the app's repo). The keys are made up; any other request that
// tries to leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_agent.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_agent.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const FN = SERVER + '/functions/v1/agent-page';
// Made-up keys, built at run time so no literal here looks like a secret (the #425 lesson).
const PAGE_KEY = 'A'.repeat(11) + 'b'.repeat(11);
const LINK_A = '0a1b2c3d-0000-4000-8000-00000000abcd', LINK_B = '0a1b2c3d-0000-4000-8000-00000000beef';
const PHONE = 390, WIDE = 1280;
const TIMEOUT = /localhost/.test(url) ? 8000 : 20000;   // the live site over the internet takes longer to load
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const Y = new Date().getUTCFullYear();
const on = (m, d) => new Date(Date.UTC(Y, m - 1, d, 17)).toISOString();

const LIST = {
  state: 'open',
  inspector: { name: 'Sam Rivera', company: 'Rivera Inspections' },
  reports: [
    { link_id: LINK_A, address: '1428 Elm St', locality: 'Miami, FL', published_at: on(11, 12), locked: true },
    { link_id: LINK_B, address: '', locality: 'Tampa, FL', published_at: on(11, 3), locked: false },
  ],
};
const PDF = SERVER + '/storage/v1/object/sign/reports/x/y/pdf/z.pdf?token=dl';
const PLAIN = { state: 'plain', about: { address: '1428 Elm St', locality: 'Miami, FL' }, pdf: { url: PDF, name: 'Inspection Report.pdf' } };
const LOCKED = { state: 'locked', about: { address: '9 Oak Ave', locality: 'Tampa, FL' }, pay_url: null };

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);
  const errs = [], away = [], calls = [], asked = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  page.on('request', (r) => asked.push(r.url()));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    const cors = { 'access-control-allow-origin': '*' };
    if (u === FN && req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': 'accept, content-type', 'access-control-allow-methods': 'POST' } });
    if (u !== FN) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ method: req.method(), headers: req.headers(), body });
    const a = o.answer ? o.answer(body, calls.length) : (body.link_id ? { status: 200, json: PLAIN } : { status: 200, json: LIST });
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.json) });
  });
  const res = await page.goto(url + (o.path === undefined ? 'a#' + PAGE_KEY : o.path), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, asked, res };
}

// A look taken while the page reloads (it reloads on purpose when its address's mark changes) is no answer: try again.
const until = async (fn, ms) => { const end = Date.now() + (ms || TIMEOUT / 2); for (;;) { let got = false; try { got = await fn(); } catch (e) { got = false; } if (got) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
const shown = async (page, sel) => (await page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.closest('[hidden]') && e.getClientRects().length > 0).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel)).join(' | ');
const items = (page) => page.evaluate(() => {
  const vis = (e) => !e.closest('[hidden]') && e.getClientRects().length > 0;
  return [...document.querySelectorAll('[data-items] > li')].map((li) => [...li.querySelectorAll('.agent-addr, .agent-noaddr, .agent-sub .bit, .agent-lock')].filter(vis).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
});

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('the list, ' + label, async () => {
      const { page, ctx, errs, away, calls, asked, res } = await open(browser, { w });
      const loc = await page.evaluate(() => location.pathname + location.hash);
      ok(label + ': the key is taken out of the address at once (/a, nothing after it)', loc === '/a', loc);
      ok(label + ': asks only the agent page, once, by POST, with the key in the body alone and no sign-in',
        errs.length === 0 && away.length === 0 && calls.length === 1 && calls[0].method === 'POST' &&
        JSON.stringify(calls[0].body) === JSON.stringify({ key: PAGE_KEY }) && !calls[0].headers.authorization,
        errs.concat(away).join(' | ') + ' ' + JSON.stringify(calls.map((c) => c.body)));
      ok(label + ': the key is in no address the browser asked for', asked.every((u) => !u.includes(PAGE_KEY)), asked.filter((u) => u.includes(PAGE_KEY)).join(' '));
      const csp = res.headers()['content-security-policy'] || '';
      ok(label + ': served with the report page\'s strict rule, never cached, never framed', /connect-src 'self' https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) &&
        /script-src 'self';/.test(csp) && res.headers()['cache-control'] === 'no-store' && res.headers()['x-frame-options'] === 'DENY' &&
        res.headers()['referrer-policy'] === 'no-referrer' && /noindex/.test(res.headers()['x-robots-tag'] || ''), csp);
      ok(label + ': who sent them', (await shown(page, '[data-from]')) === 'From Sam Rivera, Rivera Inspections', await shown(page, '[data-from]'));
      const t = await items(page);
      ok(label + ': each report: its address, place and date; "Locked until paid" only on a locked one; one with no address says so',
        t.length === 2 && t[0] === '1428 Elm St | Miami, FL | Published Nov 12 | Locked until paid' && t[1] === 'A report with no address | Tampa, FL | Published Nov 3', JSON.stringify(t));
      ok(label + ': no state line while reports show; the note under them', (await shown(page, '.agent-state [data-state]')) === '' && (await shown(page, '[data-note]')) === 'Only the reports this inspector emailed to you are here.');
      const hrefs = await page.$$eval('.agent-open', (as) => as.map((a) => a.getAttribute('href')));
      ok(label + ': a report\'s link holds its link id only, never a key', JSON.stringify(hrefs) === JSON.stringify(['#' + LINK_A, '#' + LINK_B]), JSON.stringify(hrefs));
      ok(label + ': nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await ctx.close();
    });
  }

  await group('a report, opened from the list', async () => {
    const { page, ctx, errs, away, calls, asked } = await open(browser, {});
    await page.click('.agent-open');
    ok('opening a report asks the agent page with the key and that report\'s link id, nothing else',
      await until(async () => calls.length === 2) && JSON.stringify(calls[1].body) === JSON.stringify({ key: PAGE_KEY, link_id: LINK_A }), JSON.stringify(calls.map((c) => c.body)));
    ok('the report is drawn by the report page\'s own renderer (its address, and the PDF from Inspyx\'s store)',
      await until(async () => (await page.$('#app [data-pdf]')) !== null) && (await page.getAttribute('#app [data-pdf]', 'href')).startsWith(PDF), await shown(page, '#app'));
    ok('the list is put away, the way back shows', (await shown(page, '[data-agent]')) === '' && (await shown(page, '[data-back] a')) === 'All your reports');
    const loc = await page.evaluate(() => location.pathname + location.hash);
    ok('the address names the report\'s link id only', loc === '/a#' + LINK_A, loc);
    ok('no key in any address, no errors, nothing else asked', asked.every((u) => !u.includes(PAGE_KEY)) && errs.length === 0 && away.length === 0, errs.concat(away).join(' | '));
    await page.click('[data-back] a');
    ok('the way back: the list again, asked again with the key this tab kept', await until(async () => (await items(page)).length === 2) && calls.length === 3 && JSON.stringify(calls[2].body) === JSON.stringify({ key: PAGE_KEY }), JSON.stringify(calls.map((c) => c.body)));
    await page.reload({ waitUntil: 'load' });
    ok('a reload keeps the list (the key kept for this tab)', await until(async () => (await items(page)).length === 2));
    await ctx.close();
  });

  await group('a locked report', async () => {
    const { page, ctx } = await open(browser, { answer: (b) => ({ status: 200, json: b.link_id ? LOCKED : LIST }) });
    await page.click('.agent-open');
    ok('a locked report shows its cover only, as a client\'s does', await until(async () => (await page.$('#app [data-state="locked"]')) !== null) && /9 Oak Ave/.test(await shown(page, '#app')));
    await ctx.close();
  });

  await group('a report that opens nothing', async () => {
    const { page, ctx } = await open(browser, { answer: (b) => (b.link_id ? { status: 404, json: { state: 'gone' } } : { status: 200, json: LIST }) });
    await page.click('.agent-open');
    ok('a report link turned off since: the report page\'s "doesn\'t work" line', await until(async () => /doesn’t work/.test(await shown(page, '#app'))));
    await ctx.close();
  });

  for (const [name, status, json, line] of [
    ['gone', 404, { state: 'gone' }, 'This link doesn’t work. The link in your newest report email from your inspector does.'],
    ['slow', 429, { state: 'slow' }, 'Too many tries just now. Please wait a few minutes, then try again.'],
    ['failed', 503, { error: 'database' }, 'Your reports couldn’t be opened. Check your connection and try again.'],
  ]) {
    await group('the page ' + name, async () => {
      const { page, ctx } = await open(browser, { answer: () => ({ status, json }) });
      ok(name + ': says so, lists nothing' + (name === 'gone' ? ', no Try again' : ', with Try again'),
        (await shown(page, '.agent-state [data-state]')) === line && (await items(page)).length === 0 &&
        (await shown(page, '[data-again]')) === (name === 'gone' ? '' : 'Try again') && (await shown(page, '[data-from]')) === '', await shown(page, '.agent-state'));
      await ctx.close();
    });
  }

  await group('try again', async () => {
    let down = true;
    const { page, ctx } = await open(browser, { answer: () => (down ? { status: 503, json: {} } : { status: 200, json: LIST }) });
    down = false;
    await page.click('[data-again]');
    ok('Try again: the reports come', await until(async () => (await items(page)).length === 2) && (await shown(page, '[data-again]')) === '');
    await ctx.close();
  });

  await group('nothing yet', async () => {
    const { page, ctx } = await open(browser, { answer: () => ({ status: 200, json: { state: 'open', inspector: { name: '', company: '' }, reports: [] } }) });
    ok('no reports: says how they come; no sender line, no note', (await shown(page, '.agent-state [data-state]')) === 'No reports to show right now. Each report your inspector emails you shows here too.' &&
      (await shown(page, '[data-from]')) === '' && (await shown(page, '[data-note]')) === '');
    await ctx.close();
  });

  await group('no key', async () => {
    const { page, ctx, calls } = await open(browser, { path: 'a' });
    ok('opened with no key (a fresh tab): says the link doesn\'t work, asks nothing', calls.length === 0 && /doesn’t work/.test(await shown(page, '.agent-state [data-state]')));
    await ctx.close();
    const bad = await open(browser, { path: 'a#not-a-key' });
    ok('a mark that is no key: the same, asks nothing', bad.calls.length === 0 && /doesn’t work/.test(await shown(bad.page, '.agent-state [data-state]')));
    await bad.ctx.close();
  });

  await group('the client\'s report page, unchanged', async () => {
    // report.js learned one thing for this page (where to ask, when the page names it); a client's /r#<key> must
    // still ask the report function with its key alone, and draw.
    const ctx = await browser.newContext({ viewport: { width: PHONE, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const calls = [], away = [];
    await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
      const req = route.request(), u = req.url();
      if (u === SERVER + '/functions/v1/report' && req.method() === 'POST') {
        calls.push(JSON.parse(req.postData() || '{}'));
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(PLAIN) });
      }
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'accept, content-type' } });
      away.push(u); return route.abort();
    });
    await page.goto(url + 'r#' + PAGE_KEY, { waitUntil: 'load' });
    ok('/r#<key>: asks the report function with {key} alone, draws the report, and takes the key out of the address',
      await until(async () => (await page.$('#app [data-pdf]')) !== null) && JSON.stringify(calls) === JSON.stringify([{ key: PAGE_KEY }]) &&
      away.length === 0 && (await page.evaluate(() => location.pathname + location.hash)) === '/r', JSON.stringify(calls) + ' ' + away.join(' '));
    await ctx.close();
  });

  await group('an address or name that is markup', async () => {
    const { page, ctx, errs } = await open(browser, { answer: () => ({ status: 200, json: { state: 'open', inspector: { name: '<img src=x onerror=alert(1)>', company: '' },
      reports: [{ link_id: LINK_A, address: '<b>bold</b>', locality: '', published_at: on(11, 12), locked: false }] } }) });
    ok('a name or an address is shown as text, never run', (await page.$('[data-items] b')) === null && (await page.$('[data-from] img')) === null && errs.length === 0 && /<b>bold<\/b>/.test((await items(page))[0] || ''));
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
