// Self-checks for "Reports sent": /reports (2026-11-15, Inspyx 4, board item 32).
// NOTHING REAL IS ASKED. The reports-sent function is a stand-in this test runs itself, answering as the live one
// does (backend/supabase/functions/reports-sent in the app's repo; it never sends a link's key). The sign-in in the
// browser is a made-up one; any other request that tries to leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_reports.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_reports.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const FN = SERVER + '/functions/v1/reports-sent';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, DAY = 24 * HOUR, PHONE = 390, WIDE = 1280;
const kept = (endsInMs) => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + endsInMs, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const iso = (t) => new Date(t).toISOString();
// Fixed days in this year (so dates read "Nov 3" and not with a year), at noon UTC.
const Y = new Date().getUTCFullYear();
const on = (m, d) => iso(Date.UTC(Y, m - 1, d, 17));

const REPORTS = [
  { inspection_id: 'i-new', address: '1428 Elm St', locality: 'Miami, FL', published_at: on(11, 12), locked: true,
    links: [
      { id: 'l-1', audience: 'client', label: 'Jo Client', made_at: on(11, 12), off: false, first_opened_at: on(11, 13), last_opened_at: on(11, 14), opens: 3 },
      { id: 'l-2', audience: 'agent', label: 'Al Agent', made_at: on(11, 12), off: false, first_opened_at: null, last_opened_at: null, opens: 0 },
      { id: 'l-3', audience: 'other', label: 'Old link', made_at: on(11, 12), off: true, first_opened_at: on(11, 13), last_opened_at: on(11, 13), opens: 1 },
      { id: 'l-4', audience: 'client', label: 'Sam Client', made_at: on(11, 12), off: false, first_opened_at: on(11, 13), last_opened_at: on(11, 13), opens: 1 }
    ],
    emails: [
      { id: 'e-1', to_name: 'Jo Client', to_address: 'jo@client.test', status: 'sent', sent_at: on(11, 12), delivery: 'delivered', delivery_at: on(11, 12) },
      { id: 'e-2', to_name: 'Al Agent', to_address: 'al@wrong.test', status: 'sent', sent_at: on(11, 12), delivery: 'bounced', delivery_at: on(11, 12) },
      { id: 'e-3', to_name: 'Sam Client', to_address: 'sam@client.test', status: 'sent', sent_at: on(11, 12), delivery: 'complained', delivery_at: on(11, 13) },
      { id: 'e-4', to_name: 'Pat Buyer', to_address: 'pat@buyer.test', status: 'sent', sent_at: on(11, 12), delivery: null, delivery_at: null },
      { id: 'e-5', to_name: 'Lee Seller', to_address: 'lee@seller.test', status: 'failed', sent_at: null, delivery: null, delivery_at: null }
    ] },
  { inspection_id: 'i-old', address: '', locality: '', published_at: on(11, 3), locked: false, links: [], emails: [] }
];

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  const store = o.store === undefined ? kept(HOUR) : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(o.timeout || 8000);
  const errs = [], away = [], calls = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    const cors = { 'access-control-allow-origin': '*' };
    if (u.startsWith(SERVER + '/auth/v1/token')) return route.fulfill({ status: 400, contentType: 'application/json', headers: cors, body: '{}' });
    if (u !== FN) { away.push(u); return route.abort(); }
    calls.push({ headers: req.headers(), body: JSON.parse(req.postData() || '{}') });
    const a = o.answer ? o.answer(calls.length) : { status: 200, json: { reports: REPORTS, as_of: iso(Date.now()) } };
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.json) });
  });
  const res = await page.goto(url + 'reports', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, res };
}

const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
/* Each report as read: its title and line, then its rows (who | what), then the "none" lines shown. */
const reports = (page) => page.evaluate(() => {
  const vis = (e) => !e.closest('[hidden]') && e.getClientRects().length > 0;
  const t = (e) => [...e.childNodes].filter((c) => c.nodeType === 3 || vis(c)).map((c) => c.nodeType === 3 ? c.textContent : [...c.childNodes].filter((d) => d.nodeType === 3 || vis(d)).map((d) => d.textContent).join('')).join('').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('[data-items] > li')].map((li) => ({
    title: t(li.querySelector('h2')),
    sub: [...li.querySelectorAll('.report-sub .bit')].filter(vis).map(t).join(' · '),
    links: [...li.querySelectorAll('[data-links] > li')].map((r) => t(r.querySelector('.who')) + ' | ' + [...r.querySelectorAll('.what')].filter(vis).map(t).join('')),
    emails: [...li.querySelectorAll('[data-emails] > li')].map((r) => t(r.querySelector('.who')) + ' | ' + [...r.querySelectorAll('.what')].filter(vis).map(t).join('')),
    none: [...li.querySelectorAll('.report-none')].filter(vis).map((e) => e.textContent.trim())
  }));
});
const shown = async (page, sel) => (await page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.closest('[hidden]') && e.getClientRects().length > 0).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel)).join(' | ');

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());
  const TIMEOUT = /localhost/.test(url) ? 8000 : 20000;   // the live site over the internet takes longer to load

  await group('signed out', async () => {
    const { page, ctx, calls } = await open(browser, { store: null, timeout: TIMEOUT });
    ok('signed out: the page sends the visitor to sign in, and asks nothing', await until(async () => new URL(page.url()).pathname === '/signin', TIMEOUT) && calls.length === 0, page.url());
    await ctx.close();
  });

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('the reports, ' + label, async () => {
      const { page, ctx, errs, away, calls, res } = await open(browser, { w, timeout: TIMEOUT });
      const c = calls[0] || { headers: {}, body: {} };
      ok(label + ': opens with no errors, asks only the reports-sent function, as the signed-in inspector', errs.length === 0 && away.length === 0 && c.headers.authorization === 'Bearer test-access-1' && JSON.stringify(c.body) === '{"action":"list"}', errs.concat(away).join(' | '));
      const csp = res.headers()['content-security-policy'] || '';
      ok(label + ': served with the signed-in pages\' rule, never cached', /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && /script-src 'self'(;|$)/.test(csp) && res.headers()['cache-control'] === 'no-store');
      const r = await reports(page);
      ok(label + ': two reports, newest first', r.length === 2, JSON.stringify(r.map((x) => x.title)));
      ok(label + ': the newest: its address, its town, when it was published, and that it is locked until paid', r[0].title === '1428 Elm St' && r[0].sub === 'Miami, FL · Published Nov 12 · Locked until paid', r[0].sub);
      ok(label + ': a link opened more than once: when first, how often, when last', r[0].links[0] === 'Jo Client Client | Opened Nov 13, 3 times, last Nov 14', r[0].links[0]);
      ok(label + ': a link never opened', r[0].links[1] === 'Al Agent Agent | Not opened yet', r[0].links[1]);
      ok(label + ': a link turned off says so, whatever its opens', r[0].links[2] === 'Old link Other | Turned off', r[0].links[2]);
      ok(label + ': a link opened once: no "1 times"', r[0].links[3] === 'Sam Client Client | Opened Nov 13', r[0].links[3]);
      ok(label + ': each email\'s fate: delivered, bounced, marked as spam, sent, not sent', JSON.stringify(r[0].emails) === JSON.stringify([
        'Jo Client jo@client.test | Delivered Nov 12', 'Al Agent al@wrong.test | Bounced Nov 12', 'Sam Client sam@client.test | Marked as spam Nov 13',
        'Pat Buyer pat@buyer.test | Sent Nov 12', 'Lee Seller lee@seller.test | Not sent']), JSON.stringify(r[0].emails));
      ok(label + ': an older report with no address, no links and no emails says so plainly', r[1].title === 'A report with no address' && r[1].sub === 'Published Nov 3' && JSON.stringify(r[1].none) === JSON.stringify(['No one has a link to this report yet.', 'This report wasn\'t emailed from Inspyx.']), JSON.stringify(r[1]));
      ok(label + ': no state line while reports show; the way back', (await shown(page, '.sent-state [data-state]')) === '' && (await shown(page, '.sent-links a')) === 'What needs you | Your numbers | Account');
      ok(label + ': nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await ctx.close();
    });
  }

  await group('none published', async () => {
    const { page, ctx } = await open(browser, { answer: () => ({ status: 200, json: { reports: [] } }), timeout: TIMEOUT });
    ok('none published: says so, and lists nothing', /^No reports published yet\./.test(await shown(page, '.sent-state [data-state]')) && (await reports(page)).length === 0);
    await ctx.close();
  });

  await group('the server down', async () => {
    let down = true;
    const { page, ctx } = await open(browser, { answer: () => (down ? { status: 503, json: { error: 'database' } } : { status: 200, json: { reports: REPORTS } }), timeout: TIMEOUT });
    ok('the server down: says it couldn\'t load them, with Try again, never "none published"', (await shown(page, '.sent-state [data-state]')) === 'Couldn\'t load your reports. Check your connection and try again.' && (await shown(page, '[data-again]')) === 'Try again');
    down = false;
    await page.click('[data-again]');
    ok('Try again: the reports come', await until(async () => (await reports(page)).length === 2));
    await ctx.close();
  });

  await group('the sign-in ended', async () => {
    const { page, ctx } = await open(browser, { answer: () => ({ status: 401, json: { error: 'signed_out' } }), timeout: TIMEOUT });
    ok('the server says the sign-in ended and it can\'t be renewed: the page sends the visitor to sign in', await until(async () => new URL(page.url()).pathname === '/signin', TIMEOUT), page.url());
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
