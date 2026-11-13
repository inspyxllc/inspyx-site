// Self-checks for "Your plan" on the website: /plan.
// NOTHING REAL IS ASKED OR PAID HERE. Every call the page makes to Inspyx's billing server and to the account
// server is caught and answered by this test; the sign-in in the browser is a made-up one that exists nowhere;
// Stripe's pages are stand-ins this test serves itself; any other request that tries to leave the site is
// stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_plan.js
//        (served somewhere else: URL=http://localhost:4174/ node tools/check_plan.js)
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_plan.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const fs = require('fs');
const path = require('path');

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const BILLING = '/functions/v1/billing';
const WHO = 'pat@example.com';
const PHONE = 390, WIDE = 1280, HOUR = 3600000;
const STORE = 'inspyx.signin';
const CHECKOUT = 'https://checkout.stripe.com/c/pay/cs_test_1', PORTAL = 'https://billing.stripe.com/p/session/test_1';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const granted = (n, secs) => ({ access_token: 'test-access-' + n, refresh_token: 'test-renew-' + n, token_type: 'bearer', expires_in: secs || 3600, user: { id: '11111111-1111-4111-8111-111111111111', email: WHO } });
const kept = (n, endsInMs) => JSON.stringify({ access: 'test-access-' + n, renew: 'test-renew-' + n, ends: Date.now() + endsInMs, id: '11111111-1111-4111-8111-111111111111', email: WHO });

// What the billing server says about a plan (statusView in the app's repo, backend/supabase/functions/billing/core.ts).
const plan = (o) => Object.assign({ status: 'none', has_plan: false, trial_end: null, current_period_end: null, cancel_at_period_end: false, free_month: true, plan_amount: null, plan_interval: null }, o);
const DEC9 = '2026-12-09T10:00:00+00:00';   // a free month ends at 10:00 UTC, so the date reads the same from UTC to UTC-10
const FREE = plan({ status: 'trialing', has_plan: true, trial_end: DEC9, current_period_end: DEC9, free_month: false, plan_amount: 6900, plan_interval: 'month' });
const ACTIVE = plan({ status: 'active', has_plan: true, current_period_end: '2026-12-09T15:52:27+00:00', free_month: false, plan_amount: 6900, plan_interval: 'month' });
const bill = (json) => ({ status: 200, json });
const isBilling = (call) => call.path === BILLING;
const action = (call) => { try { return JSON.parse(call.body).action; } catch (e) { return ''; } };

// The page's words. Every sentence about the plan is the app's own, word for word (lib/src/shell/plan_billing.dart
// in the app's repo): Moises approved those on 2026-11-09. "You're all set." and "No charge was made." are the home
// page's headings for an inspector back from Stripe. A change here needs his word.
const OFFER_FREE = '30 days free, then $69 a month or $649 a year. Your card is saved when you start and first charged when the free month ends. Cancel before then and you pay nothing.';
const OFFER = '$69 a month or $649 a year, first charged when you start.';
const PROBLEM = 'Your last payment didn\'t go through. Update your card to keep your plan.';
const ATTENTION = 'Your plan needs attention. Open billing to fix it.';
const ENDED = 'Your plan has ended. Start it again anytime: $69 a month or $649 a year.';
const NOT_SET_UP = 'Billing isn\'t set up yet.';
const FAILED = 'Couldn\'t check your plan. Check your connection and try again.';
const PAGE_FAILED = 'Couldn\'t open the page. Try again.';
const CHECKING = 'Checking your plan…';
const PLAN_WORDS = ['h1: Your plan', 'span: Founding inspector', 'p: You\'re all set.', 'p: No charge was made.',
  'p: ' + CHECKING, 'p: ' + OFFER_FREE, 'p: ' + OFFER,
  'p: Free until {date}, then {amount} a {every}.', 'p: Free until {date}.', 'p: In your free month. Then {amount} a {every}.', 'p: In your free month.',
  'p: Active. Next payment on {date}.', 'p: Active.', 'p: Ends {date}. Nothing more will be charged.', 'p: Ending. Nothing more will be charged.',
  'p: ' + PROBLEM, 'p: ' + ATTENTION, 'p: ' + ENDED, 'p: ' + NOT_SET_UP, 'p: ' + FAILED, 'p: ' + PAGE_FAILED, 'p: ' + NOT_SET_UP,
  'button: Start your plan', 'button: Manage billing', 'button: Update card', 'button: Try again',
  'p: Signed in as', 'p: Account', 'span: Founding inspector'];
const read = () => {
  const flat = (t) => t.replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main').cloneNode(true);
  main.querySelectorAll('noscript, [data-email]').forEach((e) => e.remove());
  main.querySelectorAll('[data-fill]').forEach((e) => { e.textContent = '{' + e.getAttribute('data-fill') + '}'; });
  const SEL = 'h1, h2, label, p, button, .badge, .face-plan .name';
  return [...main.querySelectorAll(SEL)].filter((e) => !e.parentElement.closest(SEL)).map((e) => e.tagName.toLowerCase() + ': ' + flat(e.textContent));
};

// answers(call, n) says how a server "answers" one call: { status, json } | 'offline' | 'silent' (it never answers) |
// { wait, status, json }. Without it, the billing server says the inspector is in the free month. Other options:
// store (what the browser holds as the page opens; without it, a good sign-in), stripe (Stripe's two pages may be
// gone to: this test serves a stand-in), clock (the page's clock can be wound forward), zone (the browser's time
// zone), without (a file of the site that fails to load).
async function open(browser, where, opts) {
  const o = opts || {};
  const ctx = o.ctx || await browser.newContext({ viewport: { width: o.w || PHONE, height: o.h || 844 }, deviceScaleFactor: 1, hasTouch: !o.desktop, isMobile: !o.desktop, reducedMotion: o.still ? 'reduce' : 'no-preference', timezoneId: o.zone || 'America/New_York', locale: 'en-US' });
  const store = o.store === undefined ? kept(1, HOUR) : o.store;
  if (!o.ctx) await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* no storage */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  if (o.clock) await page.clock.install();
  if (o.without) await page.route('**/' + o.without, (route) => route.abort());
  const errs = [], away = [], calls = [], arrived = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|net::ERR_ABORTED/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (o.stripe && (u === CHECKOUT || u === PORTAL)) { arrived.push(u); return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>A stand-in for Stripe</title>' }); }
    if (!u.startsWith(SERVER + '/auth/v1/') && !u.startsWith(SERVER + '/functions/v1/')) { away.push(u); return route.abort(); }
    const call = { method: req.method(), path: u.slice(SERVER.length), headers: req.headers(), body: req.postData() };
    calls.push(call);
    const a = o.answers ? await o.answers(call, calls.length) : bill(FREE);
    if (a === 'offline') return route.abort('failed');
    if (a === 'silent') return undefined;
    if (a.wait) await new Promise((r) => setTimeout(r, a.wait));
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json === undefined ? {} : a.json) });
  });
  const res = await page.goto(url + where, { waitUntil: 'load' });
  await page.waitForTimeout(o.settle === undefined ? 400 : o.settle);
  return { ctx, page, errs, away, calls, arrived, res };
}
const at = (page) => page.evaluate(() => location.pathname + location.search);
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), STORE);
// What the page shows right now: the sentence about the plan, any trouble line, Stripe's last word, and the buttons.
const sees = (page) => page.evaluate(() => {
  const m = document.querySelector('[data-plan]');
  const vis = (e) => !e.hidden && e.getClientRects().length > 0;
  const flat = (e) => e.textContent.replace(/\s+/g, ' ').trim();
  const of = (sel) => [...m.querySelectorAll(sel)].filter(vis).map(flat);
  return { stands: of('[data-stands]'), say: of('[data-say]'), back: of('[data-back]'), buttons: [...m.querySelectorAll('[data-do]')].filter(vis).map((b) => flat(b) + (b.disabled ? ' (off)' : '')) };
});
const shows = (v, sentence, button) => same(v.stands, [sentence]) && same(v.buttons, button ? [button] : []) && v.say.length === 0;

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());
  let planRule = '';

  // ---- the page as it opens, for an inspector in the free month: on a phone and on a wide screen
  for (const [label, w, desktop] of [['phone', PHONE, false], ['wide', WIDE, true]]) {
    await group('plan page, ' + label, async () => {
      const { ctx, page, errs, away, calls, res } = await open(browser, 'plan', { w, h: desktop ? 900 : 844, desktop });
      const c = calls[0] || { headers: {} };
      ok('plan page, ' + label + ': opens with no errors and asks one thing of one server: where the plan stands, the way the app asks', errs.length === 0 && away.length === 0 && calls.length === 1 && c.method === 'POST' && c.path === BILLING && c.body === '{"action":"status"}' && c.headers.authorization === 'Bearer test-access-1' && !!c.headers.apikey && /^application\/json/.test(c.headers['content-type'] || ''), errs.concat(away).join(' | ') + ' calls: ' + calls.map((x) => x.method + ' ' + x.path + ' ' + x.body).join(', '));
      const h = res.headers(), csp = h['content-security-policy'] || '';
      if (!planRule) planRule = csp;
      ok('plan page, ' + label + ': served with the rule that only the site\'s own scripts and styles run and only Inspyx\'s server may be called; browsers keep no copy', /script-src 'self'(;|$)/.test(csp) && /style-src 'self'(;|$)/.test(csp) && /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co(;|$)/.test(csp) && /default-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /form-action 'none'/.test(csp) && h['cache-control'] === 'no-store' && h['referrer-policy'] === 'no-referrer' && h['x-frame-options'] === 'DENY' && h['x-content-type-options'] === 'nosniff', csp.slice(0, 90));
      const v = await sees(page);
      ok('plan page, ' + label + ': says where the plan stands in the app\'s own sentence, with one button', shows(v, 'Free until December 9, 2026, then $69 a month.', 'Manage billing') && v.back.length === 0, JSON.stringify(v));
      const r = await page.evaluate(() => {
        const box = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
        const q = (s) => document.querySelector(s);
        const art = q('.hero-art'), hero = q('.hero');
        return {
          sw: document.documentElement.scrollWidth,
          inline: document.querySelectorAll('[style], style, script:not([src])').length,
          robots: (q('meta[name=robots]') || {}).content, title: document.title, h1: document.querySelectorAll('h1').length,
          btn: box(q('[data-do="manage"]')).h, logo: box(q('.bar .logo')).h, more: box(q('.more a')).h, moreTo: q('.more a').getAttribute('href'),
          who: q('.who').textContent.replace(/\s+/g, ' ').trim(), holder: q('.holder').textContent,
          h1box: box(q('h1')), plan: box(q('.plan')),
          art: { hidden: art.getAttribute('aria-hidden'), focusable: art.querySelectorAll('a, button, input, [tabindex]').length, card: box(q('.card3d')), hero: box(hero) },
          font: getComputedStyle(document.body).fontFamily, foot: [...document.querySelectorAll('footer nav a')].map((a) => a.getAttribute('href')).join(',')
        };
      });
      ok('plan page, ' + label + ': nothing scrolls sideways, and nothing is written into the page as a script or a style', r.sw <= w && r.inline === 0, r.sw + ' wide in ' + w + '; written in: ' + r.inline);
      ok('plan page, ' + label + ': kept out of search results, one main heading, the home page\'s own type, the footer\'s six pages', r.robots === 'noindex' && r.title === 'Inspyx — Your plan' && r.h1 === 1 && /^-apple-system/.test(r.font) && r.foot === '/about,/support,/pricing,/refunds,/terms,/privacy', JSON.stringify({ robots: r.robots, title: r.title, h1: r.h1, foot: r.foot }));
      ok('plan page, ' + label + ': the button, the logo and the link to the account page are big enough to tap; the heading stands clear of the card under it', r.btn >= 44 && r.logo >= 44 && r.more >= 44 && r.moreTo === '/account' && r.plan.t - r.h1box.b >= 12, JSON.stringify({ btn: r.btn, logo: r.logo, more: r.more, gap: r.plan.t - r.h1box.b }));
      ok('plan page, ' + label + ': names who is signed in, on the page and on the card', r.who === 'Signed in as ' + WHO && r.holder === WHO, r.who + ' / ' + r.holder);
      const a = r.art, inside = a.card.l >= a.hero.l - 2 && a.card.r <= a.hero.r + 2 && a.card.t >= a.hero.t - 2 && a.card.b <= a.hero.b + 2;
      ok('plan page, ' + label + ': the card beside the plan is a picture: hidden from screen readers, nothing in it to tab to, and whole inside its panel', a.hidden === 'true' && a.focusable === 0 && inside && a.card.w > 150, JSON.stringify(a));
      const words = await page.evaluate(read);
      ok('plan page, ' + label + ': its words are the approved ones, and no others', same(words, PLAN_WORDS), JSON.stringify(words.filter((x, i) => x !== PLAN_WORDS[i]).slice(0, 2)) + ' ' + words.length + ' of ' + PLAN_WORDS.length);
      await ctx.close();
    });
  }

  // ---- every way a plan can stand: the sentence and the button, as the app shows them
  await group('where the plan stands', async () => {
    const STANDS = [
      ['never started: the offer with the free month', plan({}), OFFER_FREE, 'Start your plan'],
      ['not running, the free month used: the offer without it', plan({ free_month: false }), OFFER, 'Start your plan'],
      ['in the free month, paying monthly', FREE, 'Free until December 9, 2026, then $69 a month.', 'Manage billing'],
      ['in the free month, paying yearly', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false, plan_amount: 64900, plan_interval: 'year' }), 'Free until December 9, 2026, then $649 a year.', 'Manage billing'],
      ['in the free month, at an older price', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false, plan_amount: 8495, plan_interval: 'month' }), 'Free until December 9, 2026, then $84.95 a month.', 'Manage billing'],
      ['in the free month, at a price in the thousands', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false, plan_amount: 109000, plan_interval: 'year' }), 'Free until December 9, 2026, then $1,090 a year.', 'Manage billing'],
      ['in the free month, the price not said', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false }), 'Free until December 9, 2026.', 'Manage billing'],
      ['in the free month, the date not said', plan({ status: 'trialing', has_plan: true, free_month: false, plan_amount: 6900, plan_interval: 'month' }), 'In your free month. Then $69 a month.', 'Manage billing'],
      ['in the free month, neither said', plan({ status: 'trialing', has_plan: true, free_month: false }), 'In your free month.', 'Manage billing'],
      ['a price that is not whole cents is left out, never guessed', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false, plan_amount: 69.5, plan_interval: 'month' }), 'Free until December 9, 2026.', 'Manage billing'],
      ['a price charged every something else than a month or a year is left out', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false, plan_amount: 6900, plan_interval: 'week' }), 'Free until December 9, 2026.', 'Manage billing'],
      ['a price below nothing is left out', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false, plan_amount: -6900, plan_interval: 'month' }), 'Free until December 9, 2026.', 'Manage billing'],
      ['a price that comes as words is left out', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false, plan_amount: '6900', plan_interval: 'month' }), 'Free until December 9, 2026.', 'Manage billing'],
      ['an amount with no "how often" is left out too', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, free_month: false, plan_amount: 6900, plan_interval: null }), 'Free until December 9, 2026.', 'Manage billing'],
      ['a date that is not a date is left out', plan({ status: 'trialing', has_plan: true, trial_end: 'soon', free_month: false, plan_amount: 6900, plan_interval: 'month' }), 'In your free month. Then $69 a month.', 'Manage billing'],
      ['paid up', ACTIVE, 'Active. Next payment on December 9, 2026.', 'Manage billing'],
      ['paid up, the date not said', plan({ status: 'active', has_plan: true, free_month: false }), 'Active.', 'Manage billing'],
      ['canceled, running to the end of what is paid for', Object.assign({}, ACTIVE, { cancel_at_period_end: true }), 'Ends December 9, 2026. Nothing more will be charged.', 'Manage billing'],
      ['canceled in the free month', plan({ status: 'trialing', has_plan: true, trial_end: DEC9, cancel_at_period_end: true, free_month: false, plan_amount: 6900, plan_interval: 'month' }), 'Ends December 9, 2026. Nothing more will be charged.', 'Manage billing'],
      ['canceled, the date not said', plan({ status: 'active', has_plan: true, cancel_at_period_end: true, free_month: false }), 'Ending. Nothing more will be charged.', 'Manage billing'],
      ['a payment that did not go through', plan({ status: 'past_due', has_plan: true, free_month: false, plan_amount: 6900, plan_interval: 'month' }), PROBLEM, 'Update card'],
      ['a first payment not finished', plan({ status: 'incomplete', free_month: false }), ATTENTION, 'Manage billing'],
      ['unpaid', plan({ status: 'unpaid', free_month: false }), ATTENTION, 'Manage billing'],
      ['paused', plan({ status: 'paused', free_month: false }), ATTENTION, 'Manage billing'],
      ['ended', plan({ status: 'canceled', free_month: false }), ENDED, 'Start your plan'],
      ['a first payment never finished', plan({ status: 'incomplete_expired', free_month: false }), ENDED, 'Start your plan'],
      ['a word for it this page does not know: the offer, as in the app', plan({ status: 'some_new_word', free_month: false }), OFFER, 'Start your plan'],
    ];
    for (const [label, json, sentence, button] of STANDS) {
      const { ctx, page, errs, away } = await open(browser, 'plan', { answers: () => bill(json), settle: 300 });
      const v = await sees(page);
      ok('a plan ' + label, shows(v, sentence, button) && v.back.length === 0 && errs.length === 0 && away.length === 0, JSON.stringify(v) + errs.join(' | '));
      await ctx.close();
    }
    // The date is the day on the inspector's own calendar, as in the app. 03:00 in London on the 9th is still the 8th in New York.
    const early = plan({ status: 'trialing', has_plan: true, trial_end: '2026-12-09T03:00:00+00:00', free_month: false });
    const ny = await open(browser, 'plan', { answers: () => bill(early), zone: 'America/New_York', settle: 300 });
    const uk = await open(browser, 'plan', { answers: () => bill(early), zone: 'Europe/London', settle: 300 });
    const a = (await sees(ny.page)).stands[0], b = (await sees(uk.page)).stands[0];
    ok('a date is the day on the inspector\'s own calendar', a === 'Free until December 8, 2026.' && b === 'Free until December 9, 2026.', a + ' / ' + b);
    await ny.ctx.close(); await uk.ctx.close();
  });

  // ---- no answer, or one that is not about a plan
  await group('no answer', async () => {
    const NOT_PLANS = [
      ['an answer that is not about a plan', bill([]), FAILED, 'Try again'],
      ['an answer with no word for where the plan stands', bill({ has_plan: true }), FAILED, 'Try again'],
      ['an answer that leaves out whether there is a plan', bill({ status: 'active' }), FAILED, 'Try again'],
      ['an answer that is not JSON at all', { status: 200, json: undefined }, FAILED, 'Try again'],
      ['a server that fails', { status: 500, json: { error: 'failed' } }, FAILED, 'Try again'],
      ['a database that cannot be read', { status: 503, json: { error: 'database' } }, FAILED, 'Try again'],
      ['no connection', 'offline', FAILED, 'Try again'],
      ['a billing server that is not there', { status: 404, json: {} }, NOT_SET_UP, ''],
      ['a billing server with no Stripe key yet', { status: 503, json: { error: 'not_configured' } }, NOT_SET_UP, ''],
    ];
    for (const [label, answer, sentence, button] of NOT_PLANS) {
      const { ctx, page, errs } = await open(browser, 'plan', { answers: () => answer, settle: 300 });
      const v = await sees(page);
      ok(label + ': the page says so' + (button ? ', with "' + button + '"' : ', and offers nothing to press'), shows(v, sentence, button) && errs.length === 0, JSON.stringify(v) + errs.join(' | '));
      await ctx.close();
    }
    let up = false;
    const t = await open(browser, 'plan', { answers: () => (up ? { wait: 700, status: 200, json: ACTIVE } : 'offline') });
    up = true;
    await t.page.focus('[data-do="again"]'); await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(250);
    const between = await sees(t.page);
    await t.page.waitForTimeout(900);
    ok('"Try again" asks again: the page says it is checking, with nothing to press, then shows the plan once the server answers', shows(between, CHECKING, '') && shows(await sees(t.page), 'Active. Next payment on December 9, 2026.', 'Manage billing') && t.calls.length === 2 && t.calls.every((c) => c.body === '{"action":"status"}'), JSON.stringify(between) + ' calls: ' + t.calls.length);
    const on = () => t.page.evaluate(() => { const e = document.activeElement; return e === document.body ? '(the top of the page)' : e.getAttribute('data-do') || e.className; });
    ok('the button pressed goes away, but the keyboard is not sent back to the top of the page: it is on the button that shows now', (await on()) === 'manage', await on());
    await t.ctx.close();
    let then = 'offline';
    const u = await open(browser, 'plan', { answers: () => then });
    then = { status: 404, json: {} };
    await u.page.focus('[data-do="again"]'); await u.page.keyboard.press('Enter'); await u.page.waitForTimeout(400);
    const where = await u.page.evaluate(() => document.activeElement.className);
    ok('with no button to show afterwards, the keyboard is on the sentence', shows(await sees(u.page), NOT_SET_UP, '') && where === 'stands', where);
    await u.ctx.close();
    then = 'offline';
    const w = await open(browser, 'plan', { answers: () => then });
    then = { wait: 600, status: 200, json: ACTIVE };
    await w.page.focus('[data-do="again"]'); await w.page.keyboard.press('Enter'); await w.page.waitForTimeout(150);
    await w.page.focus('.more a'); await w.page.waitForTimeout(800);
    const kept = await w.page.evaluate(() => document.activeElement.getAttribute('href'));
    ok('someone who has moved on meanwhile is left where they are', kept === '/account' && shows(await sees(w.page), 'Active. Next payment on December 9, 2026.', 'Manage billing'), String(kept));
    await w.ctx.close();
    const s = await open(browser, 'plan', { clock: true, answers: () => 'silent' });
    const first = await sees(s.page);
    await s.page.clock.fastForward(19000); await s.page.waitForTimeout(200);
    const before = await sees(s.page);
    await s.page.clock.fastForward(1500); await s.page.waitForTimeout(300);
    const after = await sees(s.page);
    ok('while the server is asked the page says it is checking, and shows no button', shows(first, CHECKING, ''), JSON.stringify(first));
    ok('a server that never answers is waited on for 20 seconds and no longer, as in the app; then the page says it could not check', shows(before, CHECKING, '') && shows(after, FAILED, 'Try again') && s.calls.length === 1, JSON.stringify([before, after]));
    await s.ctx.close();
  });

  // ---- Stripe's pages: asked for, checked to be Stripe's, gone to
  await group('opening Stripe\'s pages', async () => {
    const go = async (label, standing, button, want, to) => {
      const { ctx, page, calls, arrived, away, errs } = await open(browser, 'plan', { stripe: true, answers: (c) => (action(c) === 'status' ? bill(standing) : { wait: 500, status: 200, json: { url: to, page: 'x' } }) });
      await page.evaluate((sel) => { const b = document.querySelector(sel); b.click(); b.click(); }, '[data-do="' + button + '"]');
      await page.waitForTimeout(200);
      const mid = await sees(page);
      await page.evaluate((sel) => document.querySelector(sel).click(), '[data-do="' + button + '"]');
      await page.waitForURL(to, { timeout: 5000 });
      const asks = calls.filter((c) => action(c) !== 'status');
      ok(label, mid.buttons.length === 1 && / \(off\)$/.test(mid.buttons[0]) && asks.length === 1 && asks[0].path === BILLING && asks[0].body === '{"action":"' + want + '"}' && asks[0].headers.authorization === 'Bearer test-access-1' && same(arrived, [to]) && away.length === 0 && errs.length === 0, JSON.stringify({ mid: mid.buttons, asks: asks.map((c) => c.body), arrived, away }));
      await ctx.close();
    };
    await go('"Start your plan" asks the server once for Stripe\'s checkout page, however often it is pressed, and goes there', plan({}), 'start', 'start', CHECKOUT);
    await go('"Manage billing" asks once for Stripe\'s billing page and goes there', FREE, 'manage', 'portal', PORTAL);
    await go('"Update card" goes to Stripe\'s billing page too', plan({ status: 'past_due', has_plan: true, free_month: false }), 'card', 'portal', PORTAL);
    await go('a start with a plan already running is given the billing page by the server, and the page goes where it is sent', plan({}), 'start', 'start', PORTAL);

    // An address that is not one of Stripe's two is never followed, whatever the server (or something posing as it) says.
    const NOT_STRIPE = ['http://checkout.stripe.com/c/pay/cs_test_1', 'https://checkout.stripe.com.example.net/c/pay', 'https://example.net/?https://checkout.stripe.com/', 'https://pat@checkout.stripe.com/c/pay', 'https://checkout.stripe.com:8443/c/pay',
      'https://stripe.com/c/pay', 'https://dashboard.stripe.com/login', '//checkout.stripe.com/c/pay', '/account', 'javascript:alert(1)', 'data:text/html,hello', '', 7, null, { href: CHECKOUT }];
    let to = NOT_STRIPE[0];
    const n = await open(browser, 'plan', { stripe: true, answers: (c) => (action(c) === 'status' ? bill(plan({})) : { status: 200, json: { url: to } }) });
    const followed = [];
    for (const bad of NOT_STRIPE) {
      to = bad;
      await n.page.click('[data-do="start"]'); await n.page.waitForTimeout(250);
      const v = await sees(n.page);
      if ((await at(n.page)) !== '/plan' || !same(v.say, [PAGE_FAILED]) || !same(v.buttons, ['Start your plan']) || !same(v.stands, [OFFER_FREE])) followed.push(JSON.stringify(bad));
    }
    ok('an address that is not Stripe\'s own (' + NOT_STRIPE.length + ' kinds tried) is never gone to: the page stays, says it could not open the page, and the button works again', followed.length === 0 && n.arrived.length === 0 && n.away.length === 0 && n.errs.length === 0, followed.join(' ') + n.away.join(' ') + n.errs.join(' '));
    to = CHECKOUT;
    await n.page.click('[data-do="start"]'); await n.page.waitForURL(CHECKOUT, { timeout: 5000 });
    ok('after a page that could not be opened, pressing again opens it', same(n.arrived, [CHECKOUT]));
    await n.ctx.close();

    const REFUSED = [
      ['Stripe cannot be asked', { status: 502, json: { error: 'stripe' } }, PAGE_FAILED],
      ['there is no plan to manage', { status: 409, json: { error: 'no_plan' } }, PAGE_FAILED],
      ['there is no connection', 'offline', PAGE_FAILED],
      ['the answer names no page', { status: 200, json: {} }, PAGE_FAILED],
      ['the billing server has no Stripe key yet', { status: 503, json: { error: 'not_configured' } }, NOT_SET_UP],
    ];
    for (const [label, answer, line] of REFUSED) {
      const r = await open(browser, 'plan', { stripe: true, answers: (c) => (action(c) === 'status' ? bill(plan({})) : answer), settle: 300 });
      await r.page.click('[data-do="start"]'); await r.page.waitForTimeout(350);
      const v = await sees(r.page);
      ok('a page that cannot be opened because ' + label + ': the page says so and stays as it was', same(v.say, [line]) && same(v.stands, [OFFER_FREE]) && same(v.buttons, ['Start your plan']) && (await at(r.page)) === '/plan' && r.arrived.length === 0, JSON.stringify(v));
      await r.ctx.close();
    }
    const m = await open(browser, 'plan', { stripe: true, answers: (c, i) => (action(c) === 'status' ? bill(plan({})) : i === 2 ? { status: 502, json: {} } : { wait: 600, status: 200, json: { url: CHECKOUT } }) });
    await m.page.click('[data-do="start"]'); await m.page.waitForTimeout(300);
    const one = (await sees(m.page)).say;
    await m.page.click('[data-do="start"]'); await m.page.waitForTimeout(250);
    const two = (await sees(m.page)).say;
    ok('pressing again takes the message away while the page is asked for again', same(one, [PAGE_FAILED]) && two.length === 0, JSON.stringify([one, two]));
    await m.ctx.close();
  });

  // ---- back from Stripe
  await group('back from Stripe', async () => {
    const d = await open(browser, 'plan?billing=done', {});
    const v = await sees(d.page);
    ok('back from a checkout with the plan started: the page says "You\'re all set." and where the plan stands, and takes Stripe\'s word out of the address', same(v.back, ['You\'re all set.']) && shows(v, 'Free until December 9, 2026, then $69 a month.', 'Manage billing') && (await at(d.page)) === '/plan', JSON.stringify(v) + ' at ' + (await at(d.page)));
    await d.page.reload({ waitUntil: 'load' }); await d.page.waitForTimeout(400);
    const again = await sees(d.page);
    ok('loading the page again does not say "You\'re all set." a second time', again.back.length === 0 && shows(again, 'Free until December 9, 2026, then $69 a month.', 'Manage billing'), JSON.stringify(again));
    await d.ctx.close();

    // Stripe tells the inspector before it tells Inspyx's server: the plan can be a few seconds behind.
    const late = await open(browser, 'plan?billing=done', { clock: true, answers: (c, i) => bill(i < 3 ? plan({}) : FREE) });
    const l1 = await sees(late.page), n1 = late.calls.length;
    await late.page.clock.fastForward(2100); await late.page.waitForTimeout(300);
    const l2 = await sees(late.page), n2 = late.calls.length;
    await late.page.clock.fastForward(2100); await late.page.waitForTimeout(300);
    const l3 = await sees(late.page), n3 = late.calls.length;
    ok('back from a checkout before Inspyx\'s server has heard of it: the page keeps checking, two seconds apart, and never shows "Start your plan" in between', shows(l1, CHECKING, '') && shows(l2, CHECKING, '') && l1.back.length === 0 && n1 === 1 && n2 === 2 && n3 === 3, JSON.stringify([l1, l2, n1, n2, n3]));
    ok('once the server has heard, the page says "You\'re all set." and where the plan stands', same(l3.back, ['You\'re all set.']) && shows(l3, 'Free until December 9, 2026, then $69 a month.', 'Manage billing'), JSON.stringify(l3));
    await late.ctx.close();

    const never = await open(browser, 'plan?billing=done', { clock: true, answers: () => bill(plan({})) });
    for (let i = 0; i < 3; i++) { await never.page.clock.fastForward(2100); await never.page.waitForTimeout(250); }
    const n = await sees(never.page), looks = never.calls.length;
    await never.page.clock.fastForward(10000); await never.page.waitForTimeout(250);
    ok('a plan that never shows up is looked for four times and no more; the page then says what the server says, and does not say "You\'re all set."', shows(n, OFFER_FREE, 'Start your plan') && n.back.length === 0 && looks === 4 && never.calls.length === 4, JSON.stringify(n) + ' looks: ' + looks + ', then ' + never.calls.length);
    await never.ctx.close();

    const trouble = await open(browser, 'plan?billing=done', { clock: true, answers: (c, i) => (i === 1 ? bill(plan({})) : 'offline') });
    await trouble.page.clock.fastForward(2100); await trouble.page.waitForTimeout(300);
    ok('a look that gets no answer ends the looking: the page says it could not check, with "Try again"', shows(await sees(trouble.page), FAILED, 'Try again') && trouble.calls.length === 2, JSON.stringify(await sees(trouble.page)));
    await trouble.ctx.close();

    const c = await open(browser, 'plan?billing=canceled', { answers: () => bill(plan({})) });
    const cv = await sees(c.page);
    ok('back from a checkout left without starting: the page says "No charge was made." over the offer, with one look', same(cv.back, ['No charge was made.']) && shows(cv, OFFER_FREE, 'Start your plan') && c.calls.length === 1 && (await at(c.page)) === '/plan', JSON.stringify(cv));
    await c.ctx.close();
    const b = await open(browser, 'plan?billing=back', {});
    const bv = await sees(b.page);
    ok('back from the billing page: the page says where the plan stands now, and nothing else', bv.back.length === 0 && shows(bv, 'Free until December 9, 2026, then $69 a month.', 'Manage billing') && (await at(b.page)) === '/plan' && b.calls.length === 1, JSON.stringify(bv));
    await b.ctx.close();
    // Stripe's word is only said when the plan agrees with it (an address can be typed by hand, or kept from another day).
    const lie1 = await open(browser, 'plan?billing=canceled', {});
    const lie2 = await open(browser, 'plan?billing=done', { clock: true, answers: () => ({ status: 500, json: {} }) });
    const lie3 = await open(browser, 'plan?billing=free-forever&x=1', { answers: () => bill(plan({})) });
    ok('"No charge was made." is not said over a plan that is running, nor "You\'re all set." over no answer; a word Stripe never sends says nothing', (await sees(lie1.page)).back.length === 0 && (await sees(lie2.page)).back.length === 0 && (await sees(lie3.page)).back.length === 0 && shows(await sees(lie3.page), OFFER_FREE, 'Start your plan'), JSON.stringify([await sees(lie1.page), await sees(lie2.page), await sees(lie3.page)].map((x) => x.back)));
    await lie1.ctx.close(); await lie2.ctx.close(); await lie3.ctx.close();

    // The Back button from Stripe. A browser that brings the page back shows it as it was left (the button still off)
    // and tells the page so; the browser these checks run in loads the page again instead, so the signal is sent here.
    let standing = plan({});
    const k = await open(browser, 'plan?billing=canceled', { stripe: true, answers: (call) => (action(call) === 'status' ? bill(standing) : 'silent') });
    await k.page.click('[data-do="start"]'); await k.page.waitForTimeout(250);
    const stuck = await sees(k.page);
    standing = FREE;
    await k.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await k.page.waitForTimeout(400);
    const fresh = await sees(k.page);
    ok('a plan page brought back by the Back button looks at the plan again and has its button at rest, not stuck', same(stuck.buttons, ['Start your plan (off)']) && shows(fresh, 'Free until December 9, 2026, then $69 a month.', 'Manage billing') && fresh.back.length === 0, JSON.stringify([stuck.buttons, fresh]));
    await k.ctx.close();
  });

  // ---- the sign-in: whose plan, and what happens when the sign-in is not good any more
  await group('the sign-in', async () => {
    const a = await open(browser, 'plan', { store: null });
    ok('the plan page with nobody signed in sends the browser to the sign-in page, and asks no server anything', (await at(a.page)) === '/signin' && a.calls.length === 0, (await at(a.page)) + ' calls: ' + a.calls.length);
    await a.ctx.close();
    const g = await open(browser, 'plan', { store: null, without: 'assets/plan.js' });
    ok('the gate alone sends a signed-out browser away from the plan page, even when the page\'s own script never arrives', (await at(g.page)) === '/signin', await at(g.page));
    await g.ctx.close();
    const junk = await open(browser, 'plan', { store: '{"access":"x"}' });
    ok('something in the browser that is not a whole sign-in counts as nobody signed in', (await at(junk.page)) === '/signin' && junk.calls.length === 0, await at(junk.page));
    await junk.ctx.close();
    const bare = await open(browser, 'plan', { without: 'assets/auth.js' });
    const shown = await bare.page.evaluate(() => { const m = document.querySelector('[data-plan]'); return m.hidden ? 0 : m.getClientRects().length; });
    ok('if the sign-in script never arrives, nothing of the plan is shown and no server is asked', shown === 0 && bare.calls.length === 0, 'shown: ' + shown);
    await bare.ctx.close();

    const r = await open(browser, 'plan', { store: kept(2, 20000), answers: (c) => (isBilling(c) ? bill(ACTIVE) : { status: 200, json: granted(3) }) });
    ok('a sign-in with seconds left is renewed first, and the plan is asked for with the new one', r.calls.length === 2 && r.calls[0].path === '/auth/v1/token?grant_type=refresh_token' && JSON.parse(r.calls[0].body).refresh_token === 'test-renew-2' && r.calls[1].path === BILLING && r.calls[1].headers.authorization === 'Bearer test-access-3' && JSON.parse(await stored(r.page)).access === 'test-access-3' && shows(await sees(r.page), 'Active. Next payment on December 9, 2026.', 'Manage billing'), r.calls.map((c) => c.path).join(', '));
    await r.ctx.close();

    // The billing server refuses the sign-in. It may be right: the app's own "Sign out" ends every sign-in the person
    // has, and a sign-in ended that way still looks good from the browser until its hour is up.
    const by = (billingAnswers, renewal) => { let n = 0; return (c) => (isBilling(c) ? billingAnswers[Math.min(n++, billingAnswers.length - 1)] : renewal); };
    const e = await open(browser, 'plan', { store: kept(4, HOUR), answers: by([{ status: 401, json: { error: 'account' } }], { status: 400, json: { error: 'invalid_grant' } }) });
    await e.page.waitForURL('**/signin', { timeout: 5000 }).catch(() => {});
    ok('a sign-in ended somewhere else (the app\'s "Sign out"): the billing server refuses it, the sign-in server confirms it, and the browser is signed out', (await at(e.page)) === '/signin' && (await stored(e.page)) === null && e.calls.length === 2 && e.calls[0].path === BILLING && e.calls[1].path === '/auth/v1/token?grant_type=refresh_token', (await at(e.page)) + ' ' + e.calls.map((c) => c.path).join(', '));
    await e.ctx.close();
    const f = await open(browser, 'plan', { store: kept(5, HOUR), answers: by([{ status: 401, json: { error: 'account' } }, bill(ACTIVE)], { status: 200, json: granted(6) }) });
    ok('a refusal the sign-in server does not confirm: the sign-in is renewed and the plan asked for once more with the new one', f.calls.length === 3 && f.calls[0].headers.authorization === 'Bearer test-access-5' && f.calls[1].path === '/auth/v1/token?grant_type=refresh_token' && f.calls[2].path === BILLING && f.calls[2].headers.authorization === 'Bearer test-access-6' && JSON.parse(await stored(f.page)).access === 'test-access-6' && shows(await sees(f.page), 'Active. Next payment on December 9, 2026.', 'Manage billing'), f.calls.map((c) => c.path + ' ' + (c.headers.authorization || '')).join(', '));
    await f.ctx.close();
    const h = await open(browser, 'plan', { store: kept(7, HOUR), answers: by([{ status: 401, json: { error: 'account' } }], { status: 200, json: granted(8) }) });
    ok('refused again with the new sign-in: the page says it could not check, and does not ask a third time', h.calls.length === 3 && shows(await sees(h.page), FAILED, 'Try again') && (await at(h.page)) === '/plan' && JSON.parse(await stored(h.page)).access === 'test-access-8', h.calls.map((c) => c.path).join(', '));
    await h.ctx.close();
    const i = await open(browser, 'plan', { store: kept(9, HOUR), answers: by([{ status: 401, json: { error: 'account' } }], 'offline') });
    ok('refused, and the sign-in server cannot be reached: the sign-in stays, and the page says it could not check', (await at(i.page)) === '/plan' && JSON.parse(await stored(i.page)).access === 'test-access-9' && shows(await sees(i.page), FAILED, 'Try again') && i.calls.length === 2, JSON.stringify(await sees(i.page)));
    await i.ctx.close();
    const j = await open(browser, 'plan', { store: kept(10, HOUR), stripe: true, answers: (() => { let starts = 0; return (c) => (!isBilling(c) ? { status: 200, json: granted(11) } : action(c) === 'status' ? bill(plan({})) : starts++ === 0 ? { status: 401, json: { error: 'account' } } : { status: 200, json: { url: CHECKOUT } }); })() });
    await j.page.click('[data-do="start"]'); await j.page.waitForURL(CHECKOUT, { timeout: 5000 });
    const starts = j.calls.filter((c) => isBilling(c) && action(c) === 'start');
    ok('the same when a page is asked for: refused, renewed, asked once more, and gone to', starts.length === 2 && starts[1].headers.authorization === 'Bearer test-access-11' && same(j.arrived, [CHECKOUT]), j.calls.map((c) => c.path).join(', '));
    await j.ctx.close();
    const x = await open(browser, 'plan', { store: kept(12, HOUR), stripe: true, answers: (c) => (!isBilling(c) ? { status: 400, json: {} } : action(c) === 'status' ? bill(plan({})) : { status: 401, json: { error: 'account' } }) });
    await x.page.click('[data-do="start"]'); await x.page.waitForURL('**/signin', { timeout: 5000 }).catch(() => {});
    ok('a page asked for with a sign-in that was ended somewhere else: the browser is signed out, and goes nowhere but the sign-in page', (await at(x.page)) === '/signin' && (await stored(x.page)) === null && x.arrived.length === 0, await at(x.page));
    await x.ctx.close();

    // Two tabs.
    const one = await open(browser, 'plan', { store: kept(13, HOUR) });
    const two = await open(browser, 'account', { ctx: one.ctx, answers: () => ({ status: 204 }) });
    await two.page.click('[data-signout]'); await two.page.waitForURL('**/signin'); await one.page.waitForURL('**/signin', { timeout: 5000 }).catch(() => {});
    ok('signed out in another tab, the plan page follows to the sign-in page', (await at(one.page)) === '/signin', await at(one.page));
    await one.ctx.close();
    let whose = FREE;
    const p = await open(browser, 'plan?billing=done', { store: kept(14, HOUR), answers: (c) => (c.headers.authorization === 'Bearer test-access-15' ? bill(whose) : bill(FREE)) });
    const said = (await sees(p.page)).back;
    const q = await open(browser, 'account', { ctx: p.ctx });
    whose = ACTIVE;
    await q.page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE, kept(15, HOUR).replace(WHO, 'sam@example.com')]);
    await p.page.waitForTimeout(500);
    const names = await p.page.evaluate(() => [...document.querySelectorAll('[data-email]')].map((e) => e.textContent).join(','));
    ok('somebody else signs in from another tab: the plan page names them, and shows their plan, asked for with their sign-in', names === 'sam@example.com,sam@example.com' && shows(await sees(p.page), 'Active. Next payment on December 9, 2026.', 'Manage billing') && p.calls[p.calls.length - 1].headers.authorization === 'Bearer test-access-15', names + ' ' + JSON.stringify(await sees(p.page)));
    ok('"You\'re all set." was said to the one who came back from Stripe, and is not said to the next one', same(said, ['You\'re all set.']) && (await sees(p.page)).back.length === 0, JSON.stringify([said, (await sees(p.page)).back]));
    await p.ctx.close();

    // An older answer never takes the place of a newer one.
    const slow = await open(browser, 'plan', { store: kept(16, HOUR), settle: 150, answers: (c) => (c.headers.authorization === 'Bearer test-access-16' ? { wait: 1500, status: 200, json: plan({}) } : bill(ACTIVE)) });
    const other = await open(browser, 'account', { ctx: slow.ctx, settle: 100 });
    await other.page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE, kept(17, HOUR).replace(WHO, 'sam@example.com')]);
    await slow.page.waitForTimeout(500);
    const quick = await sees(slow.page);
    await slow.page.waitForTimeout(1600);
    ok('an answer that comes late, for whoever was signed in before, never replaces the newer one', shows(quick, 'Active. Next payment on December 9, 2026.', 'Manage billing') && same(await sees(slow.page), quick), JSON.stringify([quick, await sees(slow.page)]));
    await slow.ctx.close();

    const t = await open(browser, 'plan', { store: kept(18, HOUR), stripe: true, answers: (c) => (action(c) === 'status' ? bill(plan({})) : { status: 200, json: { url: CHECKOUT } }) });
    const handed = await t.page.evaluate(() => { const w = window.InspyxAuth.who(); return w ? Object.keys(w).sort().join(',') + ' ' + JSON.stringify(w) : 'nobody'; });
    ok('what a page is told about who is signed in is their address and their id, and nothing that could sign anyone in', handed === 'email,id {"id":"11111111-1111-4111-8111-111111111111","email":"' + WHO + '"}' && !/test-access|test-renew/.test(handed), handed);
    const where = await t.page.evaluate(() => document.documentElement.outerHTML + ' ' + location.href + ' ' + document.cookie + ' ' + JSON.stringify(sessionStorage));
    await t.page.click('[data-do="start"]'); await t.page.waitForURL(CHECKOUT, { timeout: 5000 });
    ok('the sign-in is sent to Inspyx\'s server only, and in a header: it is never in the page, an address or a cookie, and never goes along to Stripe', !/test-access|test-renew/.test(where) && t.calls.every((c) => !/test-access|test-renew/.test(c.path) && !/test-access|test-renew/.test(c.body || '')) && !/test-access|test-renew/.test(t.arrived.join(' ')) && t.away.length === 0, t.arrived.join(' '));
    await t.ctx.close();
  });

  // ---- getting there and back, and the keys
  await group('getting around', async () => {
    const a = await open(browser, 'account', { answers: () => bill(FREE) });
    const link = await a.page.evaluate(() => { const l = document.querySelector('.account a[href="/plan"]'); const b = l ? l.getBoundingClientRect() : { height: 0, width: 0 }; const o = document.querySelector('[data-signout]'); return l ? { text: l.textContent.trim(), h: Math.round(b.height), sw: document.documentElement.scrollWidth, out: o.getBoundingClientRect().height, solid: getComputedStyle(l).backgroundColor, quiet: getComputedStyle(o).backgroundColor, row: Math.abs(o.getBoundingClientRect().top - b.top) < 2 } : null; });
    await a.page.click('.account a[href="/plan"]'); await a.page.waitForURL('**/plan'); await a.page.waitForTimeout(400);
    const there = shows(await sees(a.page), 'Free until December 9, 2026, then $69 a month.', 'Manage billing');
    await a.page.click('.more a'); await a.page.waitForURL('**/account');
    ok('the account page has a link to the plan page, big enough to tap, and the plan page one back', !!link && link.text === 'Your plan' && link.h >= 44 && link.out >= 44 && link.sw <= PHONE && there && (await at(a.page)) === '/account', JSON.stringify(link));
    ok('on the account page the plan is the solid button and signing out the quiet one beside it', !!link && link.solid === 'rgb(0, 0, 0)' && link.quiet === 'rgb(255, 255, 255)' && link.row, JSON.stringify(link));
    await a.ctx.close();

    const k = await open(browser, 'plan', { w: WIDE, h: 900, desktop: true, stripe: true, answers: (c) => (action(c) === 'status' ? bill(plan({})) : { status: 200, json: { url: CHECKOUT } }) });
    const tab = engine.name() === 'webkit' ? 'Alt+Tab' : 'Tab';   // Safari's plain Tab key stops at text boxes only
    const here = () => k.page.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim()) : ''; });
    const order = [];
    for (let i = 0; i < 4; i++) { await k.page.keyboard.press(tab); order.push(await here()); }
    ok('the Tab key goes: logo, the plan\'s button, the account link, then the footer; never into the picture', same(order, ['Inspyx, home', 'Start your plan', 'Account', 'support@inspyx.com']), order.join(' > '));
    await k.page.focus('[data-do="start"]'); await k.page.keyboard.press('Enter'); await k.page.waitForURL(CHECKOUT, { timeout: 5000 });
    ok('the button works from the keyboard', same(k.arrived, [CHECKOUT]));
    await k.ctx.close();
  });

  await group('motion', async () => {
    const on = await open(browser, 'plan', { w: WIDE, h: 900, desktop: true });
    const pose = (p) => p.evaluate(() => getComputedStyle(document.querySelector('.card3d')).transform);
    const box = await on.page.evaluate(() => { const b = document.querySelector('.hero').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    const rest = await pose(on.page);
    await on.page.mouse.move(box[0] + box[2] * 0.85, box[1] + box[3] * 0.8); await on.page.waitForTimeout(700);
    const near = await pose(on.page), moving = await on.page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    ok('with motion on, the card floats and leans to the pointer', rest !== near && moving > 0 && on.errs.length === 0, moving + ' running ' + on.errs.join(' | '));
    await on.ctx.close();
    const off = await open(browser, 'plan', { w: WIDE, h: 900, desktop: true, still: true });
    const rest2 = await pose(off.page);
    await off.page.mouse.move(box[0] + box[2] * 0.85, box[1] + box[3] * 0.8); await off.page.waitForTimeout(700);
    const moving2 = await off.page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    ok('with motion turned off, nothing on the plan page moves or leans', (await pose(off.page)) === rest2 && moving2 === 0, moving2 + ' running');
    await off.ctx.close();
  });

  // ---- the files themselves
  {
    const root = path.join(__dirname, '..', 'coming-soon');
    const text = (f) => fs.readFileSync(path.join(root, f), 'utf8');
    const code = (f) => text(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const js = code('assets/plan.js');
    ok('the plan page\'s script never holds the sign-in: it reads no storage, is never handed the sign-in, sends no request of its own and names no key', !/localStorage|sessionStorage|\.access|\.renew|\.stored\b|\.current\b|Bearer|Authorization|apikey|fetch\s*\(|XMLHttpRequest|sendBeacon|sb_publishable|supabase/.test(js) && (js.match(/auth\.who\(\)/g) || []).length === 2);
    ok('it says no words: every sentence is in the page', !/[A-Z][a-z]+ [a-z]+ [a-z]+[.!?]['"`]/.test(js) && !/['"`][A-Z][a-z]+ [a-z]+ /.test(js));
    ok('it sends nobody anywhere but Stripe\'s two pages, the sign-in page, and where the server\'s checked address says', (js.match(/location\.(assign|replace)\(/g) || []).length === 2 && /location\.replace\('\/signin'\)/.test(js) && /location\.assign\(to\.href\)/.test(js) && !/location\.href\s*=|window\.open|\.innerHTML|document\.write|eval\(/.test(js));
    ok('the sign-in script asks only Inspyx\'s own server, and a function\'s name can be nothing but plain letters', /var SERVER = 'https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co';/.test(text('assets/auth.js')) && (text('assets/auth.js').match(/https?:\/\//g) || []).length === 1 && /\^\[a-z\]\[a-z-\]\*\$/.test(text('assets/auth.js')));
    const rule = (JSON.parse(text('vercel.json')).headers || []).filter((r) => ['/signin', '/account', '/plan'].every((p) => new RegExp('^' + r.source + '$').test(p)));
    const says = (k) => (rule.length === 1 ? (rule[0].headers.find((x) => x.key === k) || {}).value : undefined);
    ok('one server rule covers the three signed-in pages, and it is the one the plan page was served with', rule.length === 1 && rule[0].source === '/(signin|account|plan)' && !!planRule && says('Content-Security-Policy') === planRule && says('Cache-Control') === 'no-store', 'rules that cover all three: ' + rule.length);
    const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html') && f !== 'plan.html');
    const linked = pages.filter((f) => /href="\/plan["?#]/.test(text(f)));
    ok('only the account page links to the plan page, and the list of pages for search engines leaves it out', same(linked, ['account.html']) && !/plan/.test(text('sitemap.xml')), linked.join(','));
    ok('the page holds no script or style of its own, and loads the site\'s files only', !/<script(?![^>]*\ssrc=)|<style|\sstyle=|\son[a-z]+=/.test(text('plan.html')) && (text('plan.html').match(/(?:src|href)="(?!\/|mailto:|tel:)[^"]*"/g) || []).length === 0);
  }

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
