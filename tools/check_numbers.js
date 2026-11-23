// Self-checks for "Your numbers": /numbers (2026-11-15, Inspyx 4, board item 32).
// NOTHING REAL IS ASKED. The numbers function is a stand-in this test runs itself, answering as the live one does
// (backend/supabase/functions/numbers in the app's repo). The sign-in in the browser is a made-up one that exists
// nowhere; any other request that tries to leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_numbers.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_numbers.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const TIMEOUT = /localhost/.test(url) ? 8000 : 20000;   // the live site over the internet takes longer to load
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const NUMBERS = SERVER + '/functions/v1/numbers';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const kept = (endsInMs) => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + endsInMs, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

const ALL = {
  money_in: { this_month_cents: 125000, last_month_cents: 34950, this_year_cents: 1259950, payments_this_month: 3 },
  owed: { cents: 35000, links: 1 },
  reports: { published: 12, published_this_month: 4, client_links: 10, client_links_opened: 7 },
  emails: { sent: 15, delivered: 13, bounced: 1, complained: 0, sent_this_month: 5 },
  mia: { calls_this_month: 1, calls_last_month: 6, callbacks_this_month: 2, minutes_this_month: 14 }
};

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: 'America/Chicago' });
  const store = o.store === undefined ? kept(HOUR) : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);
  const errs = [], away = [], calls = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    const cors = { 'access-control-allow-origin': '*' };
    if (u.startsWith(SERVER + '/auth/v1/token')) return route.fulfill({ status: 400, contentType: 'application/json', headers: cors, body: '{}' });
    if (u !== NUMBERS) { away.push(u); return route.abort(); }
    calls.push({ headers: req.headers(), body: JSON.parse(req.postData() || '{}') });
    const a = o.answer ? o.answer(calls.length) : { status: 200, json: { numbers: ALL, zone: 'America/Chicago', as_of: new Date().toISOString() } };
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.json) });
  });
  const res = await page.goto(url + 'numbers', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, res };
}

const until = async (fn, ms) => { const end = Date.now() + (ms || TIMEOUT / 2); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
/* Each tile shown, as read: its title, its big line, its visible parts joined by the dot the page draws. */
const tiles = (page) => page.evaluate(() => {
  const t = (e) => e.textContent.replace(/\s+/g, ' ').trim();
  const visible = (e) => !e.closest('[hidden]') && e.getClientRects().length > 0;
  return [...document.querySelectorAll('[data-group]')].filter((g) => !g.hidden).map((g) => [
    g.getAttribute('data-group'),
    t(g.querySelector('h2')),
    [...g.querySelector('.big').childNodes].map((n) => n.nodeType === 3 ? n.textContent : (visible(n) ? [...n.childNodes].filter((c) => c.nodeType === 3 || visible(c)).map((c) => c.textContent).join('') : '')).join('').replace(/\s+/g, ' ').trim(),
    [...g.querySelectorAll('.bit')].filter(visible).map((b) => [...b.childNodes].filter((c) => c.nodeType === 3 || visible(c)).map((c) => c.textContent).join('').replace(/\s+/g, ' ').trim()).join('·')
  ].join(' | '));
});
const shown = async (page, sel) => (await page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.closest('[hidden]') && e.getClientRects().length > 0).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel)).join(' | ');

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  await group('signed out', async () => {
    const { page, ctx, calls } = await open(browser, { store: null });
    ok('signed out: the page sends the visitor to sign in, and asks nothing', await until(async () => new URL(page.url()).pathname === '/signin') && calls.length === 0, page.url());
    await ctx.close();
  });

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('every group, ' + label, async () => {
      const { page, ctx, errs, away, calls, res } = await open(browser, { w });
      const c = calls[0] || { headers: {}, body: {} };
      ok(label + ': opens with no errors, asks only the numbers function, as the signed-in inspector, in their time zone', errs.length === 0 && away.length === 0 && c.headers.authorization === 'Bearer test-access-1' && JSON.stringify(c.body) === '{"action":"read","zone":"America/Chicago"}', errs.concat(away).join(' | ') + ' ' + JSON.stringify(c.body));
      const csp = res.headers()['content-security-policy'] || '';
      ok(label + ': served with the signed-in pages\' rule, never cached', /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && /script-src 'self'(;|$)/.test(csp) && res.headers()['cache-control'] === 'no-store');
      const t = await tiles(page);
      ok(label + ': five groups, in order', t.length === 5, JSON.stringify(t));
      ok(label + ': paid by card: this month big, then last month, this year and how many payments', t[0] === 'money_in | Paid by card | $1,250 this month | $349.50 last month·$12,599.50 this year·3 payments this month', t[0]);
      ok(label + ': still owed, on how many pay links, with a way to see them', t[1] === 'owed | Still owed | $350 | 1 pay link·See them', t[1]);
      ok(label + ': reports published, this month, and client links opened', t[2] === 'reports | Reports | 12 published | 4 this month·7 of 10 client links opened', t[2]);
      ok(label + ': report emails: sent, delivered, bounced; nothing about spam when there was none', t[3] === 'emails | Report emails | 15 sent | 13 delivered·1 bounced·5 this month', t[3]);
      ok(label + ': Mia: one call this month (said as one), last month, callbacks, minutes', t[4] === 'mia | Mia | 1 call this month | 6 last month·2 asked for a call back·14 minutes this month', t[4]);
      ok(label + ': no state line while numbers show; who is signed in; the way back', (await shown(page, '[data-state]')) === '' && (await shown(page, '.numbers-who')) === 'Signed in as pat@example.com' && (await shown(page, '.numbers-links a')) === 'Reports sent' &&
        await page.isVisible('nav.dash a[href="/today"]') && (await page.$('nav.dash [aria-current]')) === null);
      ok(label + ': "See them" goes to What needs you', await page.getAttribute('[data-group="owed"] a', 'href') === '/today');
      ok(label + ': nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await ctx.close();
    });
  }

  await group('only what the account has', async () => {
    const { page, ctx } = await open(browser, { answer: () => ({ status: 200, json: { numbers: { reports: { published: 1, published_this_month: 1, client_links: 0, client_links_opened: 0 } } } }) });
    const t = await tiles(page);
    ok('a group the server leaves out is not shown at all; a part about nothing (no client links) is left out', t.length === 1 && t[0] === 'reports | Reports | 1 published | 1 this month', JSON.stringify(t));
    await ctx.close();
  });

  await group('nothing at all', async () => {
    const { page, ctx } = await open(browser, { answer: () => ({ status: 200, json: { numbers: {} } }) });
    ok('no groups: says how numbers come, and shows no tile', (await tiles(page)).length === 0 && /^No numbers yet\./.test(await shown(page, '[data-state]')));
    await ctx.close();
  });

  await group('a group that is not whole', async () => {
    const { page, ctx, errs } = await open(browser, { answer: () => ({ status: 200, json: { numbers: { owed: { cents: 100 }, mia: { calls_this_month: -1, calls_last_month: 0, callbacks_this_month: 0, minutes_this_month: 0 }, emails: ALL.emails } } }) });
    const t = await tiles(page);
    ok('a group missing a count, or with a count that is not whole, is not shown; the rest are; no errors', t.length === 1 && t[0].startsWith('emails |') && errs.length === 0, JSON.stringify(t));
    await ctx.close();
  });

  await group('the server down', async () => {
    let down = true;
    const { page, ctx } = await open(browser, { answer: () => (down ? { status: 503, json: { error: 'database' } } : { status: 200, json: { numbers: ALL } }) });
    ok('the server down: says it couldn\'t count, with Try again, never "no numbers yet"', (await shown(page, '[data-state]')) === 'Couldn\'t count your numbers. Check your connection and try again.' && (await shown(page, '[data-again]')) === 'Try again' && (await tiles(page)).length === 0);
    down = false;
    await page.click('[data-again]');
    ok('Try again: the numbers come', await until(async () => (await tiles(page)).length === 5) && (await shown(page, '[data-again]')) === '');
    await ctx.close();
  });

  await group('the sign-in ended', async () => {
    const { page, ctx } = await open(browser, { answer: () => ({ status: 401, json: { error: 'signed_out' } }) });
    ok('the server says the sign-in ended and it can\'t be renewed: the page sends the visitor to sign in', await until(async () => new URL(page.url()).pathname === '/signin'), page.url());
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
