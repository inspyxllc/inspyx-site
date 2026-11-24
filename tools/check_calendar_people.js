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
  const s = o.server, errs = [], away = [], calls = [], sockets = [], bookingCalls = [];
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
    // The calendar reads bookings from the sync function (read only): answered from o.bookings, every push empty.
    if (u === SERVER + '/functions/v1/sync') {
      const b = JSON.parse(req.postData() || '{}');
      bookingCalls.push(b);
      // The People book (job 7): a pushed person is kept newest-wins; o.lose() drops the answer of one that landed.
      const book = o.book || (o.book = new Map());
      // o.bookDown(): the sync function fails; o.notApplied(): a pushed person is answered "not applied" (the server
      // holds a newer copy) and not kept; o.slowPush: ms before a push is answered (Codex on #87).
      if (o.bookDown && o.bookDown()) return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"database"}' });
      if ((b.push || []).length && o.slowPush) await new Promise((r) => setTimeout(r, o.slowPush));
      const refused = (b.push || []).length && o.notApplied && o.notApplied();
      // Newest wins, as the server: an older push than the held copy is answered "not applied".
      const applied = (b.push || []).map((r) => {
        if (refused || r.kind !== 'inspector_contacts') return { kind: r.kind, id: r.id, applied: !refused };
        const h = book.get(r.id), newer = !h || r.updated_at > h.updated_at;
        if (newer) book.set(r.id, Object.assign({}, r, { changed_at: 'b' }));
        return { kind: r.kind, id: r.id, applied: newer };
      });
      if ((b.push || []).length && o.lose && o.lose()) return route.abort('failed');
      // Rows changed after the page's point (a row marked changed_at 'zz' is newer than any point the page holds).
      const list = [...(o.bookings || []), ...book.values()].filter((r) => !b.after || String(r.changed_at || '') > String(b.after.at || ''));
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ applied, skipped: [], rows: list, next: list.length ? { at: 'z', kind: 'bookings', id: 'z' } : b.after || null, more: false }) });
    }
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
  return { ctx, page, errs, away, calls, sockets, res, ping, bookingCalls };
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

  // ---- a week and a day (2026-11-23, job 4) --------------------------------------------------------------------
  const SHOTS = process.env.SHOTS || '';
  const blocks = (page, d) => page.evaluate((x) => [...document.querySelectorAll('.cal-gcol[data-date="' + x + '"] .cal-block')].map((b) => ({
    t: b.querySelector('time').textContent.replace(/\s+/g, ' '), title: b.querySelector('strong').textContent, top: Math.round(b.getBoundingClientRect().top - b.parentElement.getBoundingClientRect().top),
    lane: b.style.getPropertyValue('--lane'), lanes: b.style.getPropertyValue('--lanes') })), d);
  await group('the calendar, a week and a day', async () => {
    const s = server(); seed(s);
    // Two that meet on the 18th: side by side.
    s.insp(id('c1'), '5 Overlap Ct', '5 Overlap Ct', { created_at: ny('2026-11-07T10:00:00'), scheduled_at: ny('2026-11-18T09:30:00') });
    // 12 Oak St was booked for three hours; a booking on the 19th the phone hasn't made an inspection of yet.
    const brow = (bid, data) => ({ kind: 'bookings', id: bid, updated_at: 1, deleted_at: null, data: Object.assign({ id: bid, status: 'confirmed' }, data) });
    const bookings = [
      brow('bk-1', { inspectionId: A, startsAt: ny('2026-11-18T09:00:00'), endsAt: ny('2026-11-18T12:00:00') }),
      brow('bk-2', { status: 'booked', inspectionId: null, startsAt: ny('2026-11-19T13:00:00'), endsAt: ny('2026-11-19T15:30:00'),
        property: { street: '88 New Booking Blvd', unit: 'Apt 103', city: 'Miami', state: 'FL' } }),
      brow('bk-3', { status: 'cancelled', inspectionId: null, startsAt: ny('2026-11-19T08:00:00'), endsAt: ny('2026-11-19T09:00:00'), property: { street: '1 Cancelled Ct' } }),
    ];
    const { page, ctx, errs, bookingCalls } = await open(browser, { server: s, path: 'calendar', hash: '#week-2026-11-18', bookings });
    await page.waitForTimeout(300);
    ok('week: opens on the week holding that day, Sunday first', (await vis(page, '[data-month]')).join() === 'Nov 15 – Nov 21, 2026' &&
      same(await page.evaluate(() => [...document.querySelectorAll('.cal-gcol')].map((c) => c.dataset.date)), ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']));
    ok('week: Week is on; Day and Month show the same time (today, the 16th, is in it)', await page.getAttribute('[data-view="week"]', 'aria-current') === 'page' &&
      await page.getAttribute('[data-view="day"]', 'href') === '/calendar#day-2026-11-16' && await page.getAttribute('[data-view="month"]', 'href') === '/calendar#2026-11');
    const b18 = await blocks(page, '2026-11-18');
    ok('week: each inspection at its start, a booked one with its end; only those that meet side by side', same(b18.map((b) => b.t + ' ' + b.title + ' ' + b.lane + '/' + b.lanes),
      ['9:00 AM – 12:00 PM 12 Oak St 0/2', '9:30 AM 5 Overlap Ct 1/2', '3:00 PM 2 Palm Dr 0/1']), JSON.stringify(b18));
    ok('week: 9 AM sits two hours below 7 AM, the first hour shown; a three-hour booking is three hours tall', b18[0].top === 132 &&
      await page.evaluate(() => Math.round(document.querySelector('.cal-gcol[data-date="2026-11-18"] .cal-block').getBoundingClientRect().height)) === 196, String(b18[0].top));
    const b19 = await page.evaluate(() => [...document.querySelectorAll('.cal-gcol[data-date="2026-11-19"] .cal-block')].map((b) => [...b.querySelectorAll('time, strong, em')].map((e) => e.textContent).join(' ').replace(/\s+/g, ' ').trim()));
    ok('week: a booking not on the phone yet shows, marked; a cancelled one doesn\'t', same(b19, ['1:00 – 3:30 PM 88 New Booking Blvd, Apt 103 Booked: on your phone at its next sync']), JSON.stringify(b19));
    ok('bookings are only read: every push empty', bookingCalls.length > 0 && bookingCalls.every((b) => Array.isArray(b.push) && b.push.length === 0));
    ok('week: a started one at its start, on the day it started', same((await blocks(page, '2026-11-20')).map((b) => b.t + ' ' + b.title), ['10:15 AM 9 Elm Ave']));
    ok('week: today\'s column is marked', await page.getAttribute('.cal-gcol[aria-current="date"]', 'data-date') === '2026-11-16');
    ok('week: each one opens that inspection', await page.getAttribute('.cal-gcol[data-date="2026-11-18"] .cal-block a', 'href') === '/inspections#' + A);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/20-calendar-week.png' });
    await page.click('[data-go="1"]');
    ok('week: next goes a week on', await until(() => page.evaluate(() => location.hash === '#week-2026-11-22')));
    await page.click('[data-go="-1"]'); await page.click('[data-go="-1"]');
    ok('week: back goes a week back', await until(() => page.evaluate(() => location.hash === '#week-2026-11-08')));
    await page.click('[data-go="0"]');
    ok('week: This week comes back to this week', await until(() => page.evaluate(() => location.hash === '#week-2026-11-15')));
    await page.click('.cal-gday a >> text=18');
    ok('week: a day\'s name opens that day', await until(async () => (await vis(page, '[data-month]')).join() === 'Wednesday, November 18'));
    ok('day: its inspections in one column', same((await blocks(page, '2026-11-18')).map((b) => b.t), ['9:00 AM – 12:00 PM', '9:30 AM', '3:00 PM']) && await page.evaluate(() => document.querySelectorAll('.cal-gcol').length === 1));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/21-calendar-day.png' });
    await page.evaluate(() => { location.hash = '#day-2026-11-05'; });
    ok('day: one with no set time sits in the row above the hours', await until(async () => (await vis(page, '.cal-guntimed strong')).join() === '3 Pine Ct'));
    await page.evaluate(() => { location.hash = '#day-2026-11-10'; });
    ok('day: an empty day says so', await until(async () => (await vis(page, '[data-state]')).join() === 'Nothing on your calendar this day.'));
    await page.evaluate(() => { location.hash = '#day-2026-02-30'; });
    ok('a day that doesn\'t exist shows this month', await until(async () => (await vis(page, '[data-month]')).join() === 'November 2026'));
    ok('nothing runs off the side', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });
  await group('the calendar, a week on a phone', async () => {
    const s = server(); seed(s);
    const { page, ctx, errs } = await open(browser, { server: s, path: 'calendar', hash: '#week-2026-11-18', w: PHONE });
    ok('phone: a week is the list of its days', !(await page.isVisible('[data-grid]')) && same(await day(page, '2026-11-18'), ['9:00 AM 12 Oak St', '3:00 PM 2 Palm Dr']) &&
      (await page.evaluate(() => document.querySelectorAll('.cal-days .cal-day').length)) === 7);
    await page.evaluate(() => { location.hash = '#day-2026-11-18'; });
    ok('phone: a day is its hours, and fits', await until(() => page.isVisible('.cal-gcol')) && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/22-calendar-day-phone.png' });
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

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
    // A first booking made on /new, before the phone has synced anything: it shows at once (Codex on #86).
    const only = [{ kind: 'bookings', id: 'bk-9', updated_at: 1, deleted_at: null, data: { id: 'bk-9', status: 'booked', inspectionId: null,
      startsAt: ny('2026-11-19T13:00:00'), endsAt: ny('2026-11-19T15:30:00'), property: { street: '88 New Booking Blvd', city: 'Miami', state: 'FL' } } }];
    r = await open(browser, { server: server(), path: 'calendar', hash: '#week-2026-11-18', bookings: only });
    await r.page.waitForTimeout(300);
    ok('calendar: with no inspections but a booking, the week shows the booking, not "no inspections yet"',
      (await blocks(r.page, '2026-11-19')).map((b) => b.title).join() === '88 New Booking Blvd' && (await vis(r.page, '[data-state]')).length === 0, JSON.stringify(await vis(r.page, '[data-state]')));
    await r.page.evaluate(() => { location.hash = '#2026-11'; });
    ok('calendar: and the month shows it too', await until(async () => (await day(r.page, '2026-11-19')).join().includes('88 New Booking Blvd')), JSON.stringify(await day(r.page, '2026-11-19')));
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

  await group('people: the People book (job 7, W19)', async () => {
    const s = server(); seed(s);
    const row = (idv, role, name, more) => ({ kind: 'inspector_contacts', id: idv, updated_at: 1795000000000, deleted_at: null, changed_at: 'a',
      data: Object.assign({ id: idv, ownerAccountId: ME, role, name, phone: null, email: null, company: null, note: null, lastUsedAt: 1795000000000, createdAt: 1795000000000, updatedAt: 1795000000000, deletedAt: null }, more) });
    const book = new Map([
      ['k1', row('k1', 'buyer_agent', 'Rita Gomez', { email: 'rita@example.com', company: 'Coastal Realty' })],
      ['k2', row('k2', 'client', 'Dana Reyes', { email: 'dana@example.com', company: 'Reyes Family Trust' })],   // on inspections too
      ['k3', row('k3', 'client', 'Old Friend', { deletedAt: 1795000000001 })],
    ]);
    book.get('k3').deleted_at = 1795000000001;
    let lose = false;
    const o = { server: s, path: 'people', book, lose: () => lose };
    const { page, ctx, errs } = await open(browser, o);
    await until(async () => (await vis(page, '.ppl-one h3')).includes('Rita Gomez'));
    const names = async () => vis(page, '.ppl-one h3');
    ok('someone kept in People shows, with the company the book keeps', (await names()).includes('Rita Gomez') && (await vis(page, '.ppl-company')).includes('Coastal Realty'));
    ok('a person both kept and on inspections shows once, with their inspections and the book\'s company', (await names()).filter((n) => /^Dana Reyes/.test(n)).length === 1 && (await vis(page, '.ppl-company')).includes('Reyes Family Trust'));
    ok('a deleted one doesn\'t show', !(await names()).includes('Old Friend'));
    await page.click('[data-add-person]');
    await page.click('[data-form] button[type="submit"]');
    ok('Add with no name: says so, sends nothing', (await vis(page, '[data-problem]')).join() === 'Write their name.' && ![...book.keys()].some((k) => !['k1', 'k2', 'k3'].includes(k)));
    await page.fill('[data-form] [name="name"]', 'n'.repeat(201));
    await page.click('[data-form] button[type="submit"]');
    ok('a name of 201 letters: too long, as the rules say', (await vis(page, '[data-problem]')).join() === 'A name can be at most 200 characters.');
    await page.selectOption('[data-form] [name="role"]', 'listing_agent');
    await page.fill('[data-form] [name="name"]', '  Mia Chen\u0085 ');
    await page.fill('[data-form] [name="phone"]', '(786) 555-0144');
    await page.fill('[data-form] [name="company"]', 'Bayside Homes');
    lose = true;
    await page.click('[data-form] button[type="submit"]');
    ok('the answer lost: it says so, and the dialog stays', await until(async () => (await vis(page, '[data-problem]')).join() === 'That couldn’t be saved. Check your connection and try again.') && await page.isVisible('[data-dialog]'));
    lose = false;
    await page.click('[data-form] button[type="submit"]');
    ok('saved: the dialog closes and it says so', await until(async () => (await vis(page, '[data-say]')).join() === 'Saved. It’s in People on your phone too, at its next sync.') && !(await page.isVisible('[data-dialog]')));
    const added = [...book.values()].filter((r) => !['k1', 'k2', 'k3'].includes(r.id));
    const d = added[0] && added[0].data;
    ok('one person, the same row both tries (one id), trimmed as Dart trims, as the phone keeps it', added.length === 1 && !!d && d.name === 'Mia Chen' && d.role === 'listing_agent' && d.phone === '(786) 555-0144' && d.company === 'Bayside Homes' && d.email === null && d.note === null && d.ownerAccountId === ME && d.deletedAt === null && d.updatedAt === added[0].updated_at && d.lastUsedAt === d.updatedAt && Number.isSafeInteger(d.createdAt) && /^[0-9a-f-]{36}$/.test(added[0].id), JSON.stringify(d));
    ok('and it shows at once, under listing agents', await until(async () => (await names()).includes('Mia Chen')));
    ok('no errors', errs.length === 0, errs.join(' | '));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/56-people.png', fullPage: true });
    await page.click('[data-add-person]');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/57-people-add.png' });
    await ctx.close();
  });

  await group('people: the book\'s answers (Codex on #87)', async () => {
    const s = server(); seed(s);
    let refuse = true, down = false;
    const o = { server: s, path: 'people', book: new Map(), notApplied: () => refuse, bookDown: () => down, slowPush: 0 };
    const { page, ctx } = await open(browser, o);
    await until(async () => (await vis(page, '.ppl-one h3')).length > 0);
    // Not applied: the server holds a newer copy. Never "saved".
    await page.click('[data-add-person]');
    await page.fill('[data-form] [name="name"]', 'Kai Lane');
    await page.click('[data-form] button[type="submit"]');
    ok('a person the server didn\'t apply: not saved, it says so, the dialog stays, and the person isn\'t shown',
      await until(async () => (await vis(page, '[data-problem]')).join() === 'Inspyx couldn’t keep that. Check it and try again.') &&
      await page.isVisible('[data-dialog]') && !(await vis(page, '.ppl-one h3')).includes('Kai Lane') && (await vis(page, '[data-say]')).length === 0);
    // A slow Add: the dialog can't be closed or reopened for another person until it is answered.
    refuse = false; o.slowPush = 1200;
    await page.fill('[data-form] [name="name"]', 'Kai Lane');
    await page.click('[data-form] button[type="submit"]');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    ok('while an Add waits: Escape and Cancel don\'t close it', await page.isVisible('[data-dialog]') && await page.isDisabled('[data-form] [data-close]'));
    ok('and it lands on its own draft: saved, closed, shown', await until(async () => !(await page.isVisible('[data-dialog]')) && (await vis(page, '.ppl-one h3')).includes('Kai Lane'), 4000));
    // An Add that landed with its answer lost, then the phone (its clock a day ahead) changed that person: the retry
    // is refused and brings the newer copy; the next try is newer still and saves (Codex on #87, r2).
    let lost = true;
    o.slowPush = 0; o.lose = () => { const was = lost; lost = false; return was; };
    await page.click('[data-add-person]');
    await page.fill('[data-form] [name="name"]', 'Ana Ruiz');
    await page.click('[data-form] button[type="submit"]');
    await until(async () => (await vis(page, '[data-problem]')).join() === 'That couldn’t be saved. Check your connection and try again.');
    const landed = [...o.book.values()].find((r) => r.data.name === 'Ana Ruiz');
    o.book.set(landed.id, Object.assign({}, landed, { changed_at: 'zz', updated_at: landed.updated_at + 86400000, data: Object.assign({}, landed.data, { updatedAt: landed.updated_at + 86400000, note: 'From the phone' }) }));
    await page.click('[data-form] button[type="submit"]');
    ok('the retry after a newer copy from the phone: refused, and says so', await until(async () => (await vis(page, '[data-problem]')).join() === 'Inspyx couldn’t keep that. Check it and try again.'));
    await page.click('[data-form] button[type="submit"]');
    ok('and the next try is newer than that copy, and saves', await until(async () => !(await page.isVisible('[data-dialog]'))) && o.book.get(landed.id).updated_at > landed.updated_at + 86400000, String(o.book.get(landed.id).updated_at - landed.updated_at));
    await ctx.close();
    // The book can't be read: never "no one here yet".
    down = true;
    const r = await open(browser, { server: server(), path: 'people', bookDown: () => down });
    await r.page.waitForTimeout(600);
    ok('the People book can\'t be read: it says it couldn\'t load, never "no one here yet"', (await vis(r.page, '[data-state]')).join() === 'Couldn\'t load your inspections. Check your connection; this page keeps trying.' && (await vis(r.page, '[data-live]')).join() === 'Can\'t reach Inspyx right now. Trying again.', JSON.stringify([await vis(r.page, '[data-state]'), await vis(r.page, '[data-live]')]));
    await r.ctx.close();
  });

  await group('people: no one yet', async () => {
    const s = server(); s.insp(A, '12 Oak St', '12 Oak St', { created_at: ny('2026-11-01T10:00:00') });
    const { page, ctx } = await open(browser, { server: s, path: 'people' });
    ok('people: with no one on any inspection, it says so', (await vis(page, '[data-state]')).join() === 'No one here yet. Add a person, or they show up here from your inspections once your phone has synced.' && (await vis(page, '.ppl-group')).length === 0);
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
