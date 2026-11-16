// Self-checks for "What needs you": /today (2026-11-14, Inspyx 4, board item 32).
// NOTHING REAL IS ASKED OR CHANGED HERE. The needs function is a stand-in this test runs itself, answering as the
// live one does (backend/supabase/functions/needs/index.ts in the app's repo). The sign-in in the browser is a
// made-up one that exists nowhere; any other request that tries to leave the site is stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_today.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_today.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const TIMEOUT = /localhost/.test(url) ? 8000 : 20000;   // the live site over the internet takes longer to load
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const NEEDS = SERVER + '/functions/v1/needs';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, DAY = 24 * HOUR, PHONE = 390, WIDE = 1280;
const kept = (endsInMs) => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + endsInMs, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const iso = (t) => new Date(t).toISOString();
const PAY = SERVER + '/functions/v1/pay/Tok_Tok_Tok_Tok_Tok_12';

/* The four kinds, as the live function answers them: newest first. */
function jobs() {
  const now = Date.now();
  return [
    { kind: 'callback', ref: 'call_1', at: iso(now - 2 * HOUR), caller_name: 'Pat Buyer', callback_number: '+15555550142', reason: 'Wants a quote for a 4-point', property_address: '9 Bay Rd' },
    { kind: 'money', ref: 'link-1:35000', at: iso(now - 3 * DAY), inspection_id: 'i-1', title: 'Home inspection', client_email: 'jo@client.test', owed_cents: 35000, pay_url: PAY },
    { kind: 'not_opened', ref: 'email-1', at: iso(now - 3 * DAY), inspection_id: 'i-1', to_name: 'Jo Client', to_address: 'jo@client.test', place: '1428 Elm St' },
    { kind: 'bounced', ref: 'email-2', at: iso(now - 4 * DAY), inspection_id: 'i-2', to_name: 'Al Agent', to_address: 'al@wrong.test', place: '', why: 'bounced' }
  ];
}

/* The needs function: list, done, undo, with the ticks it keeps. [o.fail] answers every ask with that status. */
function server(o) {
  const ticked = new Set();
  const s = { calls: [], fail: o.fail || 0, failDone: o.failDone || 0, needs: o.needs || jobs() };
  s.answer = (body) => {
    if (s.fail) return { status: s.fail, json: { error: 'database' } };
    if (body.action === 'list') return { status: 200, json: { needs: s.needs.filter((n) => !ticked.has(n.kind + '/' + n.ref)), as_of: iso(Date.now()) } };
    if (body.action === 'done') {
      if (s.failDone) return { status: s.failDone, json: { error: s.failDone === 409 ? 'full' : 'database' } };
      ticked.add(body.kind + '/' + body.ref); return { status: 200, json: { done: true } };
    }
    if (body.action === 'undo') { ticked.delete(body.kind + '/' + body.ref); return { status: 200, json: { undone: true } }; }
    return { status: 400, json: { error: 'request' } };
  };
  return s;
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US' });
  if (engine === playwright.chromium) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: HOME });
  const store = o.store === undefined ? kept(HOUR) : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);
  const s = o.server, errs = [], away = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    const cors = { 'access-control-allow-origin': '*' };
    if (u.startsWith(SERVER + '/auth/v1/token')) { const a = o.onAuth ? o.onAuth() : { status: 400, json: {} }; return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.json) }); }
    if (u !== NEEDS) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    s.calls.push({ headers: req.headers(), body });
    const a = s.answer(body);
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.json) });
  });
  const res = await page.goto(url + 'today', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, res };
}

const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.closest('[hidden]') && e.getClientRects().length > 0).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel);
const until = async (fn, ms) => { const end = Date.now() + (ms || TIMEOUT / 2); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
/* Each job as read: its first line, its visible parts with the dot the page draws between them, what to do, and its
   buttons. (The dot is drawn by CSS, so it is not in the text: dots() checks it is drawn.) */
const rows = (page) => page.evaluate(() => {
  const t = (e) => e.textContent.replace(/\s+/g, ' ').trim();
  const visible = (e) => !e.closest('[hidden]') && e.getClientRects().length > 0;
  return [...document.querySelectorAll('[data-items] > li')].map((li) => [
    t(li.querySelector('.need-head')),
    [...li.querySelectorAll('.bit')].filter(visible).map(t).join('·'),
    [...li.querySelectorAll('.need-why')].filter(visible).map(t).join(' '),
    [...li.querySelectorAll('.need-acts > *')].filter(visible).map(t).join(' ')
  ].filter(Boolean).join(' '));
});
const dots = (page) => page.evaluate(() => [...document.querySelectorAll('[data-items] .need-bits')].every((line) => {
  const bits = [...line.querySelectorAll('.bit')].filter((b) => !b.hidden);
  return bits.every((b, i) => getComputedStyle(b, '::before').content === (i === 0 ? 'none' : '"·"'));
}));
const shown = async (page, sel) => (await vis(page, sel)).join(' | ');

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  await group('signed out', async () => {
    const s = server({});
    const { page, ctx } = await open(browser, { server: s, store: null });
    ok('signed out: the page sends the visitor to sign in, and asks nothing of the server', await until(async () => new URL(page.url()).pathname === '/signin') && s.calls.length === 0, page.url());
    await ctx.close();
  });

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('the list, ' + label, async () => {
      const s = server({});
      const { page, ctx, errs, away, res } = await open(browser, { server: s, w });
      const c = s.calls[0] || { headers: {}, body: {} };
      ok(label + ': opens with no errors, asks only the needs function, as the signed-in inspector, for the list', errs.length === 0 && away.length === 0 && c.headers.authorization === 'Bearer test-access-1' && JSON.stringify(c.body) === '{"action":"list"}', errs.concat(away).join(' | '));
      const csp = res.headers()['content-security-policy'] || '';
      ok(label + ': served with the signed-in pages\' rule, and never kept by a cache', /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && /script-src 'self'(;|$)/.test(csp) && res.headers()['cache-control'] === 'no-store', csp.slice(0, 120));
      ok(label + ': the title, and who is signed in', (await shown(page, 'h1')) === 'What needs you' && (await shown(page, '.today-who')) === 'Signed in as pat@example.com' && (await shown(page, '.today-links a')) === 'Your numbers | Reports sent | Your inspections | Calendar | People | Account');
      const r = await rows(page);
      ok(label + ': four jobs, newest first', r.length === 4, JSON.stringify(r));
      ok(label + ': a Mia caller to call back, with what they wanted, the property, the day, and a button that dials them',
        /^Call back Pat Buyer Wants a quote for a 4-point·9 Bay Rd·Called [A-Z][a-z]{2} \d{1,2} Call \(555\) 555-0142 Done$/.test(r[0]) &&
        await page.getAttribute('[data-kind="callback"] [data-call]', 'href') === 'tel:+15555550142', r[0]);
      ok(label + ': money still owed, with the amount, the job, the client and when the pay link was made',
        /^\$350 still owed Home inspection·jo@client\.test·Pay link from [A-Z][a-z]{2} \d{1,2} Copy pay link Done$/.test(r[1]), r[1]);
      ok(label + ': a report not opened, with who, the property, their address and when it went',
        /^Report not opened Jo Client 1428 Elm St·jo@client\.test·Sent [A-Z][a-z]{2} \d{1,2} Done$/.test(r[2]), r[2]);
      ok(label + ': an email that bounced, with who, their address, the day and what to do (no empty property, no stray dot)',
        /^Report email didn't arrive Al Agent al@wrong\.test·On [A-Z][a-z]{2} \d{1,2} The address bounced it back\. Check the address and send it again from your phone\. Done$/.test(r[3]), r[3]);
      ok(label + ': no state line while jobs show', (await shown(page, '[data-state]')) === '');
      ok(label + ': a dot is drawn between the parts of a line, and none before the first', await dots(page));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      ok(label + ': nothing runs off the side of the screen', wide);
      const spaced = await page.evaluate(() => {
        const label = document.querySelector('[data-kind="callback"] [data-call] > span');
        const phone = label.querySelector('[data-v="phone"]');
        const word = document.createRange(); word.setStart(label.firstChild, 0); word.setEnd(label.firstChild, 4);
        return label.firstChild.textContent === 'Call ' && phone.getBoundingClientRect().left - word.getBoundingClientRect().right > 2;
      });
      ok(label + ': the call button reads "Call (555) 555-0142", with the space drawn', spaced);
      const top = await page.evaluate(() => document.querySelector('[data-items]').getBoundingClientRect().top - document.querySelector('h1').getBoundingClientRect().bottom);
      ok(label + ': the list sits just under the title, with no empty lines between', top > 0 && top < 48, String(Math.round(top)));
      const small = await page.evaluate(() => [...document.querySelectorAll('[data-items] button, [data-items] a')].filter((e) => !e.closest('[hidden]') && e.getClientRects().length > 0).filter((e) => e.getBoundingClientRect().height < 44).length);
      ok(label + ': every button is at least 44 points tall', small === 0, String(small));
      await ctx.close();
    });
  }

  await group('nothing waiting', async () => {
    const s = server({ needs: [] });
    const { page, ctx } = await open(browser, { server: s });
    ok('nothing waiting: says so, and lists nothing', (await shown(page, '[data-state]')) === 'Nothing needs you right now.' && (await rows(page)).length === 0);
    await ctx.close();
  });

  await group('the server down', async () => {
    const s = server({ fail: 503 });
    const { page, ctx } = await open(browser, { server: s });
    ok('the server down: says it couldn\'t check, with Try again, never "nothing needs you"', (await shown(page, '[data-state]')) === 'Couldn\'t check what needs you. Check your connection and try again.' && (await shown(page, '[data-again]')) === 'Try again');
    s.fail = 0;
    await page.click('[data-again]');
    ok('Try again: the list comes', await until(async () => (await rows(page)).length === 4) && (await shown(page, '[data-again]')) === '');
    await ctx.close();
  });

  await group('done and undo', async () => {
    const s = server({});
    const { page, ctx } = await open(browser, { server: s });
    await page.click('[data-kind="money"] [data-done]');
    ok('Done: asks to tick that one job off, by its kind and ref', await until(async () => s.calls.some((c) => JSON.stringify(c.body) === '{"action":"done","kind":"money","ref":"link-1:35000"}')));
    ok('Done: the job leaves the list, and Undo is offered', await until(async () => (await rows(page)).length === 3) && !(await rows(page)).some((t) => /still owed/.test(t)) && /^Marked done\. Undo$/.test(await shown(page, '[data-undo-bar]')));
    await page.click('[data-undo]');
    ok('Undo: puts it back, and the list shows it again', await until(async () => (await rows(page)).length === 4) && s.calls.some((c) => JSON.stringify(c.body) === '{"action":"undo","kind":"money","ref":"link-1:35000"}') && (await shown(page, '[data-undo-bar]')) === '');
    for (const k of ['callback', 'not_opened', 'bounced', 'money']) await page.click('[data-kind="' + k + '"] [data-done]');
    ok('all done: the list is empty, and says so', await until(async () => (await rows(page)).length === 0) && (await shown(page, '[data-state]')) === 'Nothing needs you right now.');
    await ctx.close();
  });

  await group('done refused', async () => {
    const s = server({ failDone: 503 });
    const { page, ctx } = await open(browser, { server: s });
    await page.click('[data-kind="callback"] [data-done]');
    ok('Done refused: the job stays, its buttons work again, and the page says so', await until(async () => /Couldn't mark it done/.test(await shown(page, '[data-say]'))) && (await rows(page)).length === 4 && !(await page.isDisabled('[data-kind="callback"] [data-done]')));
    s.failDone = 409;
    await page.click('[data-kind="callback"] [data-done]');
    ok('Done over the cap: says how to get it cleared', await until(async () => /Too many jobs are marked done/.test(await shown(page, '[data-say]'))));
    await ctx.close();
  });

  if (engine === playwright.chromium) {
    await group('copy the pay link', async () => {
      const s = server({});
      const { page, ctx } = await open(browser, { server: s });
      await page.click('[data-kind="money"] [data-copy]');
      ok('Copy pay link: the link is on the clipboard, and the page says Copied', await until(async () => (await shown(page, '[data-copied]')) === 'Copied') && await page.evaluate(() => navigator.clipboard.readText()) === PAY);
      await ctx.close();
    });
  }

  await group('what the server leaves out', async () => {
    const s = server({ needs: [
      { kind: 'callback', ref: 'call_2', at: iso(Date.now() - HOUR), caller_name: '', callback_number: 'not a number', reason: '', property_address: '' },
      { kind: 'agreement', ref: 'a-1', at: iso(Date.now()), title: 'A kind this page does not know' },
      { kind: 'money', ref: 'link-2:0', at: iso(Date.now()), owed_cents: 0, pay_url: 'javascript:alert(1)' }
    ] });
    const { page, ctx, errs } = await open(browser, { server: s });
    const r = await rows(page);
    ok('a kind this page doesn\'t know, or nothing owed, is not shown; no errors', r.length === 1 && errs.length === 0, JSON.stringify(r));
    ok('a caller with no name, no reason and no number: no empty parts, no Call button', /^Call back Called [A-Z][a-z]{2} \d{1,2} Done$/.test(r[0]), r[0]);
    await ctx.close();
  });

  await group('the sign-in ended', async () => {
    const s = server({ fail: 401 });
    const { page, ctx } = await open(browser, { server: s, onAuth: () => ({ status: 400, json: { error: 'invalid_grant' } }) });
    ok('the server says the sign-in ended and it can\'t be renewed: the page sends the visitor to sign in', await until(async () => new URL(page.url()).pathname === '/signin'), page.url());
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
