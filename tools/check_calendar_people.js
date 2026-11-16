// Self-checks for the calendar (/calendar) and People (/people) pages (2026-11-16, Inspyx 4).
// NOTHING REAL IS ASKED OR CHANGED HERE. The inspection-sync function is a stand-in this test runs itself, with the
// live server's rules (one register per field; the newest change wins; deletion is final; pull by seq), as in
// check_inspections.js. The Realtime socket is a stand-in too. The sign-in in the browser is a made-up one that exists
// nowhere; any other request that tries to leave the site is stopped and counted as a failure.
// The browser's clock is held at Monday 2026-11-16 09:00 in New York, so "this month" and "today" are known.
// usage: node tools/serve.js &   then   node tools/check_calendar_people.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_calendar_people.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const SYNC = '/functions/v1/inspection-sync';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280, ZONE = 'America/New_York';
const NOW = new Date('2026-11-16T09:00:00-05:00');
const ny = (s) => new Date(s + '-05:00').getTime();   // a New York wall-clock time in November/December (EST)
const kept = (endsInMs) => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: NOW.getTime() + endsInMs, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

const id = (n) => '6f1c2a3b-0000-4000-8000-0000000000' + n;
const A = id('a1'), B = id('a2'), C = id('a3'), D = id('a4'), E = id('a5'), F = id('a6'), G = id('a7');

/* The server, with schema.sql's rules. */
function server() {
  const held = new Map(); let seq = 0;
  const k = (e, i, f) => e + '/' + i + '.' + f;
  const later = (a, b) => a.at > b.at || (a.at === b.at && a.device > b.device);
  const push = (device, w) => {
    const del = (e, i) => held.has(k(e, i, '_del'));
    if (w.field !== '_del' && (del(w.entity, w.id) || del('inspection', w.inspection))) return 'deleted';
    const h = held.get(k(w.entity, w.id, w.field));
    const next = { at: w.at, device };
    if (h && (w.field === '_del' || !later(next, h))) return 'stale';
    seq++;
    held.set(k(w.entity, w.id, w.field), Object.assign({}, w, { device, seq }));
    return 'kept';
  };
  let tick = 0;
  const phone = (inspection, entity, i, field, value) => push('phone-aaaaaaaaaaaaaaaaaa', { inspection, entity, id: i, field, value, at: NOW.getTime() + (++tick) });
  const insp = (i, title, address, dates) => {
    phone(i, 'inspection', i, 'title', title); phone(i, 'inspection', i, 'address', address);
    Object.keys(dates).forEach((f) => phone(i, 'inspection', i, f, dates[f]));
  };
  const person = (insp, p, role, name, more) => {
    phone(insp, 'person', p, 'role', role); phone(insp, 'person', p, 'name', name); phone(insp, 'person', p, 'inspection_id', insp);
    Object.keys(more || {}).forEach((f) => phone(insp, 'person', p, f, more[f]));
  };
  return { held, push, phone, insp, person, get seq() { return seq; } };
}

function seed(s) {
  s.insp(A, '12 Oak St', '12 Oak St, Miami', { created_at: ny('2026-11-01T10:00:00'), scheduled_at: ny('2026-11-18T09:00:00') });
  // Booked for the 18th but started on the 20th: the start wins, as on the phone.
  s.insp(B, '9 Elm Ave', '9 Elm Ave, Miami', { created_at: ny('2026-11-02T10:00:00'), scheduled_at: ny('2026-11-18T13:30:00'), inspection_at: ny('2026-11-20T10:15:00') });
  // Only made, never booked: on the day it was made, with no time.
  s.insp(C, '3 Pine Ct', '3 Pine Ct, Doral', { created_at: ny('2026-11-05T16:45:00') });
  s.insp(D, '7 Bay Rd', '7 Bay Rd, Hialeah', { created_at: ny('2026-11-03T10:00:00'), scheduled_at: ny('2026-12-02T08:00:00') });
  // Deleted: on no page (deleted below, after a person was put on it, as a phone does).
  s.insp(E, '1 Gone Ln', '1 Gone Ln', { created_at: ny('2026-11-04T10:00:00'), scheduled_at: ny('2026-11-18T11:00:00') });
  // A second one on the 18th, made first but later that day: a day lists its inspections in time order.
  s.insp(G, '2 Palm Dr', '2 Palm Dr, Miami', { created_at: ny('2026-10-30T10:00:00'), scheduled_at: ny('2026-11-18T15:00:00') });
  // 11:30 at night in New York is already the 1st of December in UTC: it belongs on the 30th here.
  s.insp(F, '44 Late Way', '44 Late Way', { created_at: ny('2026-11-06T10:00:00'), scheduled_at: ny('2026-11-30T23:30:00') });

  s.person(A, id('b1'), 'client', 'Dana Reyes', { email: 'dana@example.com', position: 0 });
  s.person(B, id('b2'), 'client', 'Dana Reyes-Lopez', { email: 'DANA@example.com', position: 0 });   // same email: one person; the newest name
  s.person(A, id('b3'), 'buyer_agent', 'Sam Ortiz', { phone: '(305) 555-0101', position: 1 });
  s.person(C, id('b4'), 'buyer_agent', 'Sam Ortiz', { phone: '305-555-0101', position: 0 });        // same phone: one person
  s.person(B, id('b5'), 'listing_agent', 'Lee Park', { position: 1 });
  s.person(D, id('b6'), 'listing_agent', 'lee  park', { position: 0 });                              // same name: one person
  s.person(E, id('b7'), 'client', 'Ghost Person', { email: 'ghost@example.com' });                    // on an inspection deleted next
  s.phone(E, 'inspection', E, '_del', true);
  s.person(A, id('bd'), 'buyer_agent', 'Sam Ortiz', { phone: '305 555 0101', position: 2 });         // listed twice on one inspection: it counts once
  s.person(A, id('b8'), 'buyer_agent', 'Gone Agent', { email: 'gone@example.com' });
  s.phone(A, 'person', id('b8'), '_del', true);                                                        // deleted
  s.person(C, id('b9'), 'client', 'Bad Mail', { email: 'x@y.com?subject=hi' });                        // not a plain address: no link
  s.person(D, id('ba'), 'inspector', 'Not A Role');                                                    // a role the phone doesn't have
  s.person(D, id('bb'), 'client', '<img src=x onerror="window.hit=1">');                              // a name is only ever text
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: ZONE });
  const store = o.store === undefined ? kept(HOUR) : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  page.setDefaultTimeout(8000);
  const s = o.server, errs = [], away = [], calls = [], sockets = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    sockets.push({ ws, url: ws.url(), joins: [] });
    const me = sockets[sockets.length - 1];
    ws.onMessage((data) => {
      const m = JSON.parse(String(data));
      if (m.event === 'phx_join') {
        me.joins.push(m);
        ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }));
      }
    });
  });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (!u.startsWith(SERVER + SYNC)) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ headers: req.headers(), body });
    if (o.down && o.down()) return route.abort('failed');
    const results = (body.push || []).map((w, i) => ({ i, outcome: s.push(body.device, w) }));
    const limit = body.limit || 500;
    const rows = [...s.held.values()].filter((h) => h.seq > (body.after || 0)).sort((a, b) => a.seq - b.seq).slice(0, limit);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      results, skipped: [], fields: rows.map((h) => ({ inspection: h.inspection, entity: h.entity, id: h.id, field: h.field, value: h.value, at: h.at, device: h.device, seq: h.seq })),
      next: rows.length ? rows[rows.length - 1].seq : body.after, more: rows.length >= limit, now: NOW.getTime() }) });
  });
  const res = await page.goto(url + o.path + (o.hash || ''), { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const ping = () => sockets[sockets.length - 1].ws.send(JSON.stringify({ topic: 'realtime:insp:' + ME, event: 'broadcast', ref: null, payload: { type: 'broadcast', event: 'changed', payload: { seq: s.seq } } }));
  return { ctx, page, errs, away, calls, sockets, res, ping };
}

const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel);
const day = (page, d) => page.evaluate((x) => { const c = document.querySelector('.cal-day[data-date="' + x + '"]'); return c ? [...c.querySelectorAll('.cal-jobs li')].map((e) => [...e.querySelectorAll('time, strong')].filter((t) => !t.hidden).map((t) => t.textContent).join(' ')) : null; }, d);
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const liveRule = (res) => { const csp = res.headers()['content-security-policy'] || ''; return /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co wss:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && /script-src 'self'(;|$)/.test(csp) && res.headers()['cache-control'] === 'no-store'; };
const sendsNothing = (calls) => calls.length > 0 && calls.every((c) => Array.isArray(c.body.push) && c.body.push.length === 0 && c.headers.authorization === 'Bearer test-access-1' && /^web-[0-9a-f]{18}$/.test(c.body.device));

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  for (const path of ['calendar', 'people']) {
    await group(path + ', signed out', async () => {
      const s = server(); seed(s);
      const { page, ctx, calls } = await open(browser, { server: s, store: null, path });
      ok(path + ': signed out, the page sends the visitor to sign in and asks nothing of the server', await until(async () => new URL(page.url()).pathname === '/signin') && calls.length === 0, page.url());
      await ctx.close();
    });
  }

  // ---- the calendar ------------------------------------------------------------------------------------------
  await group('the calendar, wide', async () => {
    const s = server(); seed(s);
    const { page, ctx, errs, away, calls, sockets, res, ping } = await open(browser, { server: s, path: 'calendar' });
    ok('calendar: opens with no errors, asks only the sync function, as the signed-in inspector, and sends nothing', errs.length === 0 && away.length === 0 && sendsNothing(calls) && calls[0].body.after === null, errs.concat(away).join(' | '));
    ok('calendar: served with the live pages\' rule (the signed-in rule plus the live socket)', liveRule(res));
    ok('calendar: opens on this month, November 2026', (await vis(page, '[data-month]')).join() === 'November 2026' && new URL(page.url()).hash === '');
    ok('calendar: the week starts on Sunday, and the 1st (a Sunday) needs no blank before it',
      same(await vis(page, '.cal-wd'), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) && (await page.locator('.cal-pad').count()) === 0 && (await page.locator('.cal-day').count()) === 30);
    ok('calendar: today (Monday the 16th) is marked', await page.getAttribute('[aria-current="date"]', 'data-date') === '2026-11-16');
    ok('calendar: a booked inspection sits on its day, with its time; a day\'s inspections in time order', same(await day(page, '2026-11-18'), ['9:00 AM 12 Oak St', '3:00 PM 2 Palm Dr']), JSON.stringify(await day(page, '2026-11-18')));
    ok('calendar: a started one sits on the day it started, not the day it was booked for (the phone\'s rule)', same(await day(page, '2026-11-20'), ['10:15 AM 9 Elm Ave']), JSON.stringify(await day(page, '2026-11-20')));
    ok('calendar: one never booked sits on the day it was made, with no time', same(await day(page, '2026-11-05'), ['3 Pine Ct']), JSON.stringify(await day(page, '2026-11-05')));
    ok('calendar: 11:30 at night sits on that night\'s day in this browser\'s time zone (already the 1st in UTC)', same(await day(page, '2026-11-30'), ['11:30 PM 44 Late Way']), JSON.stringify(await day(page, '2026-11-30')));
    ok('calendar: a deleted inspection is on no day, and next month\'s is not in this one', !(await vis(page, '.cal-jobs')).join(' ').match(/Gone Ln|Bay Rd/));
    ok('calendar: each one opens that inspection', await page.getAttribute('.cal-day[data-date="2026-11-18"] a', 'href') === '/inspections#' + A);
    ok('calendar: each day says its full date to a screen reader', await page.getAttribute('.cal-day[data-date="2026-11-18"] .cal-date', 'aria-label') === 'Wednesday, November 18');
    ok('calendar: joins its own private topic, and says it is live', sockets.length === 1 && sockets[0].joins[0] && sockets[0].joins[0].topic === 'realtime:insp:' + ME && (await vis(page, '[data-live]')).join().startsWith('Live'));

    await page.click('[data-go="1"]');
    ok('calendar: Next month goes to December, with its own address, its blanks (the 1st is a Tuesday) and its inspection',
      await until(async () => (await vis(page, '[data-month]')).join() === 'December 2026') && new URL(page.url()).hash === '#2026-12' &&
      (await page.locator('.cal-pad').count()) === 2 && same(await day(page, '2026-12-02'), ['8:00 AM 7 Bay Rd']) && !(await page.$('[aria-current="date"]')));
    await page.goBack();
    ok('calendar: Back returns to November', await until(async () => (await vis(page, '[data-month]')).join() === 'November 2026'));
    await page.click('[data-go="-1"]');
    ok('calendar: a month with nothing in it says so', await until(async () => (await vis(page, '[data-month]')).join() === 'October 2026') && (await vis(page, '[data-state]')).join() === 'Nothing on your calendar this month.');
    await page.click('[data-go="0"]');
    ok('calendar: This month comes back to November', await until(async () => (await vis(page, '[data-month]')).join() === 'November 2026') && new URL(page.url()).hash === '#2026-11');

    // The phone books the never-booked one for the 25th, and deletes the 18th's: both show within the ping.
    s.phone(C, 'inspection', C, 'scheduled_at', ny('2026-11-25T14:00:00'));
    s.phone(A, 'inspection', A, '_del', true);
    ping();
    ok('calendar: a change on the phone moves an inspection to its new day, with its time, on the ping', await until(async () => same(await day(page, '2026-11-25'), ['2:00 PM 3 Pine Ct'])) && same(await day(page, '2026-11-05'), []));
    ok('calendar: an inspection deleted on the phone leaves the calendar', same(await day(page, '2026-11-18'), ['3:00 PM 2 Palm Dr']), JSON.stringify(await day(page, '2026-11-18')));
    ok('calendar: every call still sends nothing', sendsNothing(calls));
    ok('calendar: nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  });

  await group('the calendar, phone', async () => {
    const s = server(); seed(s);
    const { page, ctx, errs } = await open(browser, { server: s, path: 'calendar', w: PHONE });
    const days = await page.evaluate(() => [...document.querySelectorAll('.cal-day')].filter((e) => e.getClientRects().length > 0).map((e) => e.querySelector('.cal-date').textContent.replace(/\s+/g, ' ').trim()));
    ok('calendar, phone: lists only the days that have inspections, each with its weekday', same(days, ['Thu 5', 'Wed 18', 'Fri 20', 'Mon 30']), JSON.stringify(days));
    ok('calendar, phone: no day names row and no blanks', (await vis(page, '.cal-wd, .cal-pad')).length === 0);
    ok('calendar, phone: each inspection shows its address too', same(await vis(page, '.cal-day[data-date="2026-11-18"] .cal-jobs span'), ['12 Oak St, Miami', '2 Palm Dr, Miami']), JSON.stringify(await vis(page, '.cal-day[data-date="2026-11-18"] .cal-jobs span')));
    ok('calendar, phone: no errors, and nothing runs off the side of the screen', errs.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  });

  await group('the calendar: other states', async () => {
    const empty = server();
    let r = await open(browser, { server: empty, path: 'calendar' });
    ok('calendar: with no inspections synced yet, it says so and shows no grid', (await vis(r.page, '[data-state]')).join() === 'No inspections here yet. They show up here once your phone has synced.' && (await vis(r.page, '[data-days]')).length === 0);
    await r.ctx.close();
    const s = server(); seed(s);
    r = await open(browser, { server: s, path: 'calendar', hash: '#2026-13' });
    ok('calendar: a month that doesn\'t exist in the address opens this month', (await vis(r.page, '[data-month]')).join() === 'November 2026');
    await r.ctx.close();
    let down = true;
    r = await open(browser, { server: s, path: 'calendar', down: () => down });
    ok('calendar: when Inspyx can\'t be reached, it says so and keeps trying', (await vis(r.page, '[data-state]')).join() === 'Couldn\'t load your inspections. Check your connection; this page keeps trying.' && (await vis(r.page, '[data-live]')).join() === 'Can\'t reach Inspyx right now. Trying again.');
    down = false;
    ok('calendar: and fills in once Inspyx answers again', await until(async () => same(await day(r.page, '2026-11-18'), ['9:00 AM 12 Oak St', '3:00 PM 2 Palm Dr']), 9000));
    await r.ctx.close();
  });

  // ---- people ------------------------------------------------------------------------------------------------
  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('people, ' + label, async () => {
      const s = server(); seed(s);
      const { page, ctx, errs, away, calls, res, ping } = await open(browser, { server: s, path: 'people', w });
      ok('people, ' + label + ': opens with no errors, asks only the sync function, and sends nothing', errs.length === 0 && away.length === 0 && sendsNothing(calls), errs.concat(away).join(' | '));
      ok('people, ' + label + ': served with the live pages\' rule', liveRule(res));
      ok('people, ' + label + ': three groups, each with its count', same(await vis(page, '.ppl-group h2'), ['Clients 3', 'Buyer\'s agents 1', 'Listing agents 1']), JSON.stringify(await vis(page, '.ppl-group h2')));
      const clients = await vis(page, '[data-role="client"] .ppl-one h3');
      ok('people, ' + label + ': clients in name order; one client across two inspections (same email) shows once, by the newest name', same(clients, ['<img src=x onerror="window.hit=1">', 'Bad Mail', 'Dana Reyes-Lopez']), JSON.stringify(clients));
      ok('people, ' + label + ': a name is only ever text', await page.evaluate(() => !document.querySelector('.ppl img') && !window.hit));
      const dana = page.locator('[data-role="client"] .ppl-one', { hasText: 'Dana Reyes-Lopez' });
      ok('people, ' + label + ': their inspections, newest first, each opening that inspection', same(await dana.locator('.ppl-jobs li').allTextContents(), ['9 Elm AveNov 20, 2026', '12 Oak StNov 18, 2026']) && await dana.locator('.ppl-jobs a').first().getAttribute('href') === '/inspections#' + B);
      ok('people, ' + label + ': the email to write to, from the newest inspection', await dana.locator('[data-v="email"]').getAttribute('href') === 'mailto:DANA@example.com');
      const sam = page.locator('[data-role="buyer_agent"] .ppl-one');
      ok('people, ' + label + ': one agent across two inspections (same phone number) shows once, with both (listed twice on one counts once), and a number to call',
        (await sam.count()) === 1 && (await sam.locator('.ppl-jobs li').count()) === 2 && await sam.locator('[data-v="phone"]').getAttribute('href') === 'tel:3055550101' && (await sam.locator('[data-v="phone"]').textContent()) === '(305) 555-0101' && !(await sam.locator('[data-v="email"]').isVisible()));
      ok('people, ' + label + ': one agent with neither email nor phone, on two inspections, matched by name', (await page.locator('[data-role="listing_agent"] .ppl-one .ppl-jobs li').count()) === 2);
      ok('people, ' + label + ': an address that is not a plain email gets no link', !(await page.locator('[data-role="client"] .ppl-one', { hasText: 'Bad Mail' }).locator('[data-v="email"]').isVisible()));
      ok('people, ' + label + ': no one from a deleted inspection, no deleted person, no role the phone doesn\'t have', !(await vis(page, '.ppl')).join(' ').match(/Ghost|Gone Agent|Not A Role/));

      const find = async (q) => { await page.fill('[data-find]', q); await page.waitForTimeout(400); };
      await find('sam');
      ok('people, ' + label + ': Find by name keeps only who matches, and their group', await until(async () => same(await vis(page, '.ppl-group h2'), ['Buyer\'s agents 1'])));
      await find('555-01');
      ok('people, ' + label + ': Find by phone digits, however they are written', await until(async () => same(await vis(page, '.ppl-one h3'), ['Sam Ortiz'])), JSON.stringify(await vis(page, '.ppl-one h3')));
      await find('DANA@EX');
      ok('people, ' + label + ': Find by email', await until(async () => same(await vis(page, '.ppl-one h3'), ['Dana Reyes-Lopez'])));
      await find('zzz');
      ok('people, ' + label + ': no match says so', await until(async () => (await vis(page, '[data-state]')).join() === 'No one matches that.' && (await vis(page, '.ppl-group')).length === 0));
      await find('');

      s.person(D, id('bc'), 'client', 'New Client', { email: 'new@example.com' });
      ping();
      ok('people, ' + label + ': someone added on the phone shows on the ping', await until(async () => (await vis(page, '[data-role="client"] .ppl-one h3')).includes('New Client')));
      ok('people, ' + label + ': nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await ctx.close();
    });
  }

  await group('people: no one yet', async () => {
    const s = server(); s.insp(A, '12 Oak St', '12 Oak St', { created_at: ny('2026-11-01T10:00:00') });
    const { page, ctx } = await open(browser, { server: s, path: 'people' });
    ok('people: with no one on any inspection, it says so', (await vis(page, '[data-state]')).join() === 'No one here yet. The people on your inspections show up here once your phone has synced.' && (await vis(page, '.ppl-group')).length === 0);
    await ctx.close();
  });

  await group('the pages say no words', async () => {
    const fs = require('fs'), pathm = require('path');
    const code = ['insp-read', 'calendar', 'people'].map((f) => fs.readFileSync(pathm.join(__dirname, '..', 'coming-soon', 'assets', f + '.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).join('\n');
    ok('the three scripts say no words: every sentence is in the pages', !/[A-Z][a-z]+ [a-z]+ [a-z]+[.!?]['"`]/.test(code));
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
