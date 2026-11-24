// Self-checks for "Your inspections", live: /inspections (2026-11-14, Inspyx 4).
// NOTHING REAL IS ASKED OR CHANGED HERE. The inspection-sync function is a stand-in this test runs itself, with the
// live server's rules (one register per field; the newest change wins; deletion is final; pull by seq): the same as
// backend/supabase/functions/inspection-sync/schema.sql in the app's repo. The Realtime socket is a stand-in too.
// The sign-in in the browser is a made-up one that exists nowhere; any other request that tries to leave the site is
// stopped and counted as a failure.
// usage: node tools/serve.js &   then   node tools/check_inspections.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_inspections.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const SYNC = '/functions/v1/inspection-sync';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const kept = (endsInMs) => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + endsInMs, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

const INSP = '6f1c2a3b-0000-4000-8000-000000000001', SEC = '6f1c2a3b-0000-4000-8000-0000000000b1';
const ITEM = '6f1c2a3b-0000-4000-8000-0000000000a1', FIND = '6f1c2a3b-0000-4000-8000-0000000000a2';
const OTHER = '6f1c2a3b-0000-4000-8000-000000000002';

/* The server, with schema.sql's rules. */
function server() {
  const held = new Map(); let seq = 0;
  const k = (e, id, f) => e + '/' + id + '.' + f;
  const later = (a, b) => a.at > b.at || (a.at === b.at && a.device > b.device);
  const push = (device, w) => {
    const del = (e, id) => held.has(k(e, id, '_del'));
    if (w.field !== '_del' && (del(w.entity, w.id) || del('inspection', w.inspection))) return 'deleted';
    const h = held.get(k(w.entity, w.id, w.field));
    const next = { at: w.at, device };
    if (h && (w.field === '_del' || !later(next, h))) return h.at === w.at && h.device === device ? 'repeat' : 'stale';
    seq++;
    held.set(k(w.entity, w.id, w.field), Object.assign({}, w, { device, seq }));
    return 'kept';
  };
  const phone = (entity, id, field, value, inspection) => push('phone-aaaaaaaaaaaaaaaaaa', { inspection: inspection || INSP, entity, id, field, value, at: Date.now() });
  return { held, push, phone, get seq() { return seq; }, value: (e, id, f) => (held.get(k(e, id, f)) || {}).value };
}

function seed(s) {
  s.phone('inspection', INSP, 'title', '12 Oak St'); s.phone('inspection', INSP, 'address', '12 Oak St, Miami');
  s.phone('inspection', INSP, 'created_at', 1794600000000);
  s.phone('inspection', OTHER, 'title', '9 Elm Ave', OTHER); s.phone('inspection', OTHER, 'address', '9 Elm Ave', OTHER); s.phone('inspection', OTHER, 'scheduled_at', 1794700000000, OTHER);
  s.phone('section', SEC, 'name', 'Roof'); s.phone('section', SEC, 'position', 0);
  s.phone('item', ITEM, 'section_id', SEC); s.phone('item', ITEM, 'label', 'Gutters'); s.phone('item', ITEM, 'position', 0);
  s.phone('item', ITEM, 'status', 'inspected_deficiency'); s.phone('item', ITEM, 'note', 'Loose at the corner');
  s.phone('item', FIND, 'section_id', SEC); s.phone('item', FIND, 'parent_item_id', ITEM); s.phone('item', FIND, 'label', 'Gutter pulling away');
  s.phone('item', FIND, 'position', 0); s.phone('item', FIND, 'finding_title', 'Gutter pulling away'); s.phone('item', FIND, 'severity', 'MD');
  s.phone('photo', '6f1c2a3b-0000-4000-8000-0000000000c1', 'item_id', FIND);
}

async function open(browser, o) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US' }, o.zone ? { timezoneId: o.zone } : {}));
  const store = o.store === undefined ? kept(HOUR) : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const s = o.server, errs = [], away = [], calls = [], sockets = [], bizCalls = [], bookCalls = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    sockets.push({ ws, url: ws.url(), joins: [] });
    const me = sockets[sockets.length - 1];
    ws.onMessage((data) => {
      const m = JSON.parse(String(data));
      if (m.event === 'phx_join') {
        me.joins.push(m);
        ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: o.refuseJoin ? 'error' : 'ok', response: o.refuseJoin === 'auth' ? { reason: 'Unauthorized: token has expired' } : {} } }));
      }
    });
  });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (o.onAuth && u.startsWith(SERVER + '/auth/v1/token')) { const a = o.onAuth(); return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json) }); }
    // The business sync, read only (Agreements outdated): the rows o.biz() holds now; and the booking function.
    if (u.startsWith(SERVER + '/functions/v1/sync')) {
      const b = JSON.parse(req.postData() || '{}'); bizCalls.push({ headers: req.headers(), body: b });
      // A stand-in that takes pushes too (flags): it answers as the sync function does.
      if (o.bizServer) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o.bizServer(b)) });
      const rows = o.biz ? o.biz() : [];
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ rows, next: rows.length, more: false }) });
    }
    // The reports-sent function (which inspections have a published report): o.published lists them.
    if (u.startsWith(SERVER + '/functions/v1/reports-sent')) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ reports: (o.published || []).map((id) => ({ inspection_id: id, published_at: 1, locked: false, links: [], emails: [] })), as_of: new Date().toISOString() }) });
    }
    if (u.startsWith(SERVER + '/functions/v1/booking') && o.booking) {
      const b = JSON.parse(req.postData() || '{}'); bookCalls.push({ headers: req.headers(), body: b });
      const a = o.booking(b);
      return route.fulfill({ status: a.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a.json) });
    }
    if (!u.startsWith(SERVER + SYNC)) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ headers: req.headers(), body });
    if (o.down) return route.abort('failed');
    const results = (body.push || []).map((w, i) => ({ i, outcome: s.push(body.device, w) }));
    const rows = [...s.held.values()].filter((h) => h.seq > (body.after || 0)).sort((a, b) => a.seq - b.seq).slice(0, body.limit || 500);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      results, skipped: [], fields: rows.map((h) => ({ inspection: h.inspection, entity: h.entity, id: h.id, field: h.field, value: h.value, at: h.at, device: h.device, seq: h.seq })),
      next: rows.length ? rows[rows.length - 1].seq : body.after, more: rows.length >= (body.limit || 500), now: Date.now() }) });
  });
  const res = await page.goto(url + 'inspections' + (o.hash || ''), { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const ping = () => sockets[sockets.length - 1].ws.send(JSON.stringify({ topic: 'realtime:insp:' + ME, event: 'broadcast', ref: null, payload: { type: 'broadcast', event: 'changed', payload: { seq: s.seq } } }));
  return { ctx, page, errs, away, calls, sockets, res, ping, bizCalls, bookCalls };
}

const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel);
const boxValue = (page, entity, id, field) => page.evaluate((k) => { const e = document.querySelector('[data-key="' + k + '"]'); return e ? e.value : null; }, entity + '/' + id + '.' + field);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  await group('signed out', async () => {
    const s = server(); seed(s);
    const { page, ctx, calls } = await open(browser, { server: s, store: null });
    ok('signed out: the page sends the visitor to sign in, and asks nothing of the server', await until(async () => new URL(page.url()).pathname === '/signin') && calls.length === 0, page.url());
    await ctx.close();
  });

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('the list and one inspection, ' + label, async () => {
      const s = server(); seed(s);
      const { page, ctx, errs, away, calls, sockets, res } = await open(browser, { server: s, w, hash: '#' + INSP });
      const c = calls[0] || { headers: {}, body: {} };
      ok(label + ': opens with no errors, asks only the sync function, as the signed-in inspector, from the start', errs.length === 0 && away.length === 0 && c.headers.authorization === 'Bearer test-access-1' && /^web-[0-9a-f]{18}$/.test(c.body.device) && c.body.after === null, errs.concat(away).join(' | '));
      const csp = res.headers()['content-security-policy'] || '';
      ok(label + ': served with the signed-in pages\' rule, plus the live socket to Inspyx\'s server and nothing else', /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co wss:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && /script-src 'self'(;|$)/.test(csp) && res.headers()['cache-control'] === 'no-store', csp.slice(0, 120));
      const list = await vis(page, '[data-list="items"] li');
      ok(label + ': lists both inspections, the newest first, with their addresses', list.length === 2 && /^9 Elm Ave/.test(list[0]) && /^12 Oak St.*Miami/.test(list[1]), JSON.stringify(list));
      ok(label + ': shows the inspection\'s title and address in their boxes', await boxValue(page, 'inspection', INSP, 'title') === '12 Oak St' && await boxValue(page, 'inspection', INSP, 'address') === '12 Oak St, Miami');
      ok(label + ': shows the stop, the item and its note, status and finding as the phone has them',
        await boxValue(page, 'section', SEC, 'name') === 'Roof' && await boxValue(page, 'item', ITEM, 'label') === 'Gutters' &&
        await boxValue(page, 'item', ITEM, 'note') === 'Loose at the corner' && await boxValue(page, 'item', ITEM, 'status') === 'inspected_deficiency' &&
        await boxValue(page, 'item', FIND, 'finding_title') === 'Gutter pulling away' && await boxValue(page, 'item', FIND, 'severity') === 'MD');
      ok(label + ': counts the finding\'s photos on the phone', (await vis(page, '[data-photos]')).join() === '1 photos on your phone');
      ok(label + ': joins its own private topic with the sign-in, and says it is live',
        sockets.length === 1 && sockets[0].joins[0] && sockets[0].joins[0].topic === 'realtime:insp:' + ME && sockets[0].joins[0].payload.access_token === 'test-access-1' && sockets[0].joins[0].payload.config.private === true &&
        (await vis(page, '[data-live]')).join().startsWith('Live'), JSON.stringify(sockets.map((x) => x.joins.map((j) => j.topic))));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      ok(label + ': nothing runs off the side of the screen', wide);
      await ctx.close();
    });
  }

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('agreement out of date, ' + label, async () => {
      const s = server(); seed(s);
      const P = '6f1c2a3b-0000-4000-8000-0000000000d1', S1 = '5e000000-0000-4000-8000-000000000001', S2 = '5e000000-0000-4000-8000-000000000002';
      const BK = 'b0000000-0000-4000-8000-000000000001';
      s.phone('person', P, 'role', 'client'); s.phone('person', P, 'name', 'Ana Diaz'); s.phone('person', P, 'email', 'ana@example.com'); s.phone('person', P, 'position', 0);
      const row = (kind, data, at) => ({ kind, id: data.id, updated_at: at, deleted_at: null, data });
      const fee = row('inspection_fees', { id: 'fee1', inspectionId: INSP, selectionJson: '{"services":["svc"]}', totalCents: 47500, updatedAt: 5, deletedAt: null,
        linesJson: JSON.stringify([{ kind: 'service', id: 'svc', name: 'Home inspection', cents: 45000, minutes: 180 }, { kind: 'tax', id: 't', name: 'Sales tax', cents: 2500, minutes: 0 }]) }, 5);
      const signed = row('signings', { id: S1, inspectionId: INSP, bookingId: BK, status: 'signed', sentAt: 1, signerName: 'Ana Diaz', deletedAt: null }, 3);
      let sent = false;
      const details = () => row('signing_details', { id: S1, signingId: S1, bookingId: BK, inspectionId: INSP, supersededBy: sent ? S2 : null,
        filled: { clientName: 'Ana Diaz', propertyAddress: '12 Oak St, Miami', fee: '$425.00', services: 'Home inspection' } }, sent ? 9 : 4);
      const biz = () => [fee, signed, details()].concat(sent ? [row('signings', { id: S2, inspectionId: INSP, bookingId: BK, status: 'sent', sentAt: 8, deletedAt: null }, 9)] : []);
      const { page, ctx, errs, away, bizCalls, bookCalls } = await open(browser, { server: s, w, hash: '#' + INSP, biz,
        booking: (b) => { sent = true; return { status: 200, json: { state: 'sent', signing_id: S2, email: 'queued' } }; } });
      ok(label + ': the business sync is read only, as the signed-in inspector', bizCalls.length >= 1 && bizCalls.every((c) => c.headers.authorization === 'Bearer test-access-1' && Array.isArray(c.body.push) && c.body.push.length === 0) && away.length === 0 && errs.length === 0, errs.concat(away).join(' | '));
      ok(label + ': the banner names only what changed: the price, old and new (the tax isn\'t a service, the address holds)',
        await until(async () => same(await vis(page, '[data-agr-changes] li'), ['Price: $425.00 → $475.00'])), JSON.stringify(await vis(page, '[data-agr-changes] li')));
      const shot = async (name) => { if (process.env.SHOTS) { await page.waitForTimeout(400); await page.locator('[data-agr]').screenshot({ path: require('path').join(process.env.SHOTS, label + '-' + name + '.png') }); } };
      await page.locator('[data-agr]').scrollIntoViewIfNeeded();
      await shot('1-banner');
      ok(label + ': the old value is struck out', await page.evaluate(() => { const x = document.querySelector('[data-agr-changes] s'); return !!x && x.textContent === '$425.00'; }));
      await page.click('[data-agr-send]');
      await shot('2-ask');
      ok(label + ': Send asks first, and nothing is sent yet', (await vis(page, '[data-agr-ask]')).length === 1 && bookCalls.length === 0 && (await vis(page, '[data-agr-send]')).length === 0);
      await page.click('[data-agr-no]');
      ok(label + ': Not now sends nothing', bookCalls.length === 0 && (await vis(page, '[data-agr-send]')).length === 1);
      await page.click('[data-agr-send]'); await page.click('[data-agr-go]');
      await until(async () => bookCalls.length === 1);
      const b = (bookCalls[0] || {}).body || {};
      ok(label + ': Send asks the booking function once, for the signed one, with today\'s client, house and price',
        bookCalls.length === 1 && bookCalls[0].headers.authorization === 'Bearer test-access-1' && same(b, {
          action: 'agreement_update', signing_id: S1,
          details: { client: { name: 'Ana Diaz', email: 'ana@example.com', phone: null }, property: { street: '12 Oak St, Miami', unit: null, city: null, state: null, zip: null } },
          lines: [{ kind: 'service', name: 'Home inspection', cents: 45000 }, { kind: 'tax', name: 'Sales tax', cents: 2500 }], totalCents: 47500 }), JSON.stringify(b));
      ok(label + ': says it went, then the banner gives way to the update waiting', await until(async () =>
        (await vis(page, '[data-agr-said]')).join() === 'Sent. Your client will get an email to sign it.' &&
        (await vis(page, '[data-agr-state="updateSent"]')).join() === 'Updated agreement sent. Waiting for the client to sign it.' &&
        (await vis(page, '[data-agr-changes] li')).length === 0), JSON.stringify([await vis(page, '[data-agr-said]'), await vis(page, '[data-agr-state]')]));
      await shot('3-sent');
      ok(label + ': nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await ctx.close();
    });
  }

  await group('agreement out of date: an email never queued promises no retry (the app\'s words, Codex on app #725)', async () => {
    const s = server(); seed(s);
    const P = '6f1c2a3b-0000-4000-8000-0000000000d1', S1 = '5e000000-0000-4000-8000-000000000001';
    s.phone('person', P, 'role', 'client'); s.phone('person', P, 'name', 'Ana Diaz'); s.phone('person', P, 'position', 0);
    const rows = [
      { kind: 'inspection_fees', id: 'fee1', updated_at: 5, deleted_at: null, data: { id: 'fee1', inspectionId: INSP, selectionJson: '{"services":["svc"]}', totalCents: 47500, updatedAt: 5, deletedAt: null, linesJson: JSON.stringify([{ kind: 'service', id: 'svc', name: 'Home inspection', cents: 47500, minutes: 180 }]) } },
      { kind: 'signings', id: S1, updated_at: 3, deleted_at: null, data: { id: S1, inspectionId: INSP, bookingId: 'b', status: 'signed', sentAt: 1, deletedAt: null } },
      { kind: 'signing_details', id: S1, updated_at: 4, deleted_at: null, data: { id: S1, signingId: S1, inspectionId: INSP, bookingId: 'b', supersededBy: null, filled: { fee: '$425.00' } } }];
    const { page, ctx } = await open(browser, { server: s, hash: '#' + INSP, biz: () => rows, booking: () => ({ status: 200, json: { state: 'sent', signing_id: 'x', email: 'failed' } }) });
    await until(async () => (await vis(page, '[data-agr-send]')).length === 1);
    await page.click('[data-agr-send]'); await page.click('[data-agr-go]');
    ok('email failed: it says so and the way on, never a retry that nothing does', await until(async () => (await vis(page, '[data-agr-said]')).join() === 'Made, but its email didn’t go. Cancel the request and send it again.'), JSON.stringify(await vis(page, '[data-agr-said]')));
    await ctx.close();
  });

  await group('agreement out of date: an open tab hears a change made elsewhere (Codex on #89)', async () => {
    const s = server(); seed(s);
    const S1 = '5e000000-0000-4000-8000-000000000001';
    let cents = 47500;
    const biz = () => [
      { kind: 'inspection_fees', id: 'fee1', updated_at: cents === 47500 ? 5 : 6, deleted_at: null, data: { id: 'fee1', inspectionId: INSP, selectionJson: '{"services":["svc"]}', totalCents: cents, updatedAt: cents === 47500 ? 5 : 6, deletedAt: null, linesJson: JSON.stringify([{ kind: 'service', id: 'svc', name: 'Home inspection', cents, minutes: 180 }]) } },
      { kind: 'signings', id: S1, updated_at: 3, deleted_at: null, data: { id: S1, inspectionId: INSP, bookingId: 'b', status: 'signed', sentAt: 1, deletedAt: null } },
      { kind: 'signing_details', id: S1, updated_at: 4, deleted_at: null, data: { id: S1, signingId: S1, inspectionId: INSP, bookingId: 'b', supersededBy: null, filled: { fee: '$425.00' } } }];
    const { page, ctx, ping } = await open(browser, { server: s, hash: '#' + INSP, biz });
    ok('a change elsewhere: the banner shows the price as it stands', await until(async () => same(await vis(page, '[data-agr-changes] li'), ['Price: $425.00 → $475.00'])));
    cents = 42500;   // the inspector set the price back on the phone
    ping();
    ok('a change elsewhere: heard without a reload or a tab switch; the banner goes', await until(async () => (await vis(page, '[data-agr]')).length === 0), JSON.stringify(await vis(page, '[data-agr-changes] li')));
    await ctx.close();
  });

  await group('agreement out of date: no price on record, no Send (an update would carry zero; Codex on #89)', async () => {
    const s = server(); seed(s);
    const P = '6f1c2a3b-0000-4000-8000-0000000000d1', S1 = '5e000000-0000-4000-8000-000000000001';
    s.phone('person', P, 'role', 'client'); s.phone('person', P, 'name', 'Bo Lee'); s.phone('person', P, 'position', 0);
    const rows = [
      { kind: 'signings', id: S1, updated_at: 3, deleted_at: null, data: { id: S1, inspectionId: INSP, bookingId: 'b', status: 'signed', sentAt: 1, deletedAt: null } },
      { kind: 'signing_details', id: S1, updated_at: 4, deleted_at: null, data: { id: S1, signingId: S1, inspectionId: INSP, bookingId: 'b', supersededBy: null, filled: { clientName: 'Ana Diaz' } } }];
    const { page, ctx, bookCalls } = await open(browser, { server: s, hash: '#' + INSP, biz: () => rows, booking: () => ({ status: 200, json: { state: 'sent' } }) });
    ok('no price: the change is named, Send isn\'t offered, it says to set the price', await until(async () => same(await vis(page, '[data-agr-changes] li'), ['Client: Ana Diaz → Bo Lee'])) &&
      (await vis(page, '[data-agr-send]')).length === 0 && (await vis(page, '[data-agr-needsfee]')).length === 1 && bookCalls.length === 0);
    await ctx.close();
  });

  await group('agreement out of date: nothing to say when it holds, or with no snapshot', async () => {
    const s = server(); seed(s);
    const S1 = '5e000000-0000-4000-8000-000000000001';
    const rows = [{ kind: 'signings', id: S1, updated_at: 3, deleted_at: null, data: { id: S1, inspectionId: INSP, bookingId: 'b', status: 'signed', sentAt: 1, deletedAt: null } }];
    const { page, ctx, bizCalls } = await open(browser, { server: s, hash: '#' + INSP, biz: () => rows });
    await until(async () => bizCalls.length >= 1);
    await page.waitForTimeout(300);
    ok('holds: no banner for a signing with no snapshot', (await vis(page, '[data-agr]')).length === 0);
    await ctx.close();
  });

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('the report\'s structure, ' + label, async () => {
      const s = server(); seed(s);
      s.phone('section', SEC, 'report_section_id', 'C1');
      const { page, ctx, errs, away } = await open(browser, { server: s, w, hash: '#' + INSP, published: label === 'phone' ? [INSP] : [] });
      const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      const partBy = (field, value) => { for (const h of s.held.values()) if (h.field === field && h.value === value) return h.id; return null; };
      const fieldsOf = (id) => { const o = {}; for (const h of s.held.values()) if (h.id === id) o[h.field] = { value: h.value, at: h.at }; return o; };
      await page.waitForSelector('[data-additem]');

      // An item, a finding and a stop, each made whole in one change, as the phone makes one.
      await page.locator('[data-additem] input').first().fill('Downspouts');
      await page.locator('[data-additem] button').first().click();
      await until(async () => partBy('label', 'Downspouts') !== null);
      const item = partBy('label', 'Downspouts'), fi = fieldsOf(item);
      ok(label + ': add item: a version-4 id, its stop, no parent, after the last, all at one time', V4.test(item) &&
        fi.section_id.value === SEC && fi.parent_item_id.value === null && fi.position.value === 1 &&
        new Set(Object.values(fi).map((x) => x.at)).size === 1, JSON.stringify(fi));
      await page.locator('[data-addfinding] input').first().fill('Loose bracket');
      await page.locator('[data-addfinding] button').first().click();
      await until(async () => partBy('finding_title', 'Loose bracket') !== null);
      const f = fieldsOf(partBy('finding_title', 'Loose bracket'));
      ok(label + ': add finding: under its item, in its stop, after the finding there', f.parent_item_id.value === ITEM && f.section_id.value === SEC &&
        f.position.value === 1 && f.label.value === 'Loose bracket', JSON.stringify(f));
      await page.locator('[data-addstop] input[name="name"]').fill('Garage');
      await page.locator('[data-addstop-chapter]').selectOption(SEC);
      await page.locator('[data-addstop] button').click();
      await until(async () => partBy('name', 'Garage') !== null);
      const st = fieldsOf(partBy('name', 'Garage'));
      ok(label + ': add stop: in the chosen stop\'s chapter; its template null; both sent', st.report_section_id.value === 'C1' && 'template_section_ref' in st &&
        st.template_section_ref.value === null && st.position.value === 1, JSON.stringify(st));
      ok(label + ': a new item shows "Not started", as the phone starts one', (await page.locator('[data-key="item/' + item + '.status"]').inputValue()) === 'untouched');
      ok(label + ': the new parts show on the page', (await page.locator('.insp-stop').count()) === 2 &&
        await until(async () => (await page.locator('.insp-label').evaluateAll((els) => els.map((e) => e.value))).includes('Downspouts')));

      // Moves: the two swap places; the ends are off.
      const gutters = page.locator('.insp-item').first().locator('.insp-item-head');
      ok(label + ': the first item can\'t go up', await gutters.locator('[data-move="up"]').isDisabled());
      await gutters.locator('[data-move="down"]').click();
      await until(async () => s.value('item', ITEM, 'position') === 1 && s.value('item', item, 'position') === 0);
      ok(label + ': down: the two items swap places', s.value('item', ITEM, 'position') === 1 && s.value('item', item, 'position') === 0);

      // Delete: asks first, says what goes; "Keep it" keeps it; Delete takes it and everything under it.
      await page.locator('.insp-stop').first().locator('.insp-stop-head [data-delete]').click();
      const asked = await page.locator('[data-confirm-text]').textContent();
      ok(label + ': delete asks first, naming what goes', asked === 'Delete the stop “Roof”, with 2 items, 2 findings and 1 photo?', asked);
      if (label === 'phone') ok(label + ': a published report: the question says the client’s copy stays until the next publish',
        await until(async () => await page.locator('[data-confirm-published]').isVisible()));
      ok(label + ': the question sits in the middle of the screen', await page.evaluate(() => { const r = document.querySelector('[data-confirm]').getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) < 4; }));
      if (process.env.SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: require('path').join(process.env.SHOTS, 'structure-confirm-' + label + '.png') }); }
      await page.locator('[data-confirm-no]').click();
      ok(label + ': Keep it: nothing is deleted', s.value('section', SEC, '_del') === undefined && !(await page.locator('[data-confirm]').isVisible()));
      // Return on the question keeps everything: Keep it has the focus, never Delete.
      await page.locator('.insp-stop').first().locator('.insp-stop-head [data-delete]').click();
      ok(label + ': the question opens on Keep it', await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-confirm-no')));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      ok(label + ': Return keeps it', s.value('section', SEC, '_del') === undefined && !(await page.locator('[data-confirm]').isVisible()));
      if (label === 'wide') ok(label + ': no report out: no word of one', !(await page.locator('[data-confirm-published]').isVisible()));
      await page.locator('.insp-stop').first().locator('.insp-stop-head [data-delete]').click();
      await page.locator('[data-confirm-go]').click();
      await until(async () => s.value('section', SEC, '_del') === true);
      ok(label + ': Delete: the stop, its items and their findings go, together', s.value('section', SEC, '_del') === true && s.value('item', ITEM, '_del') === true &&
        s.value('item', FIND, '_del') === true && s.value('item', item, '_del') === true && s.value('item', partBy('finding_title', 'Loose bracket'), '_del') === true);
      ok(label + ': and it is gone from the page', await until(async () => (await page.locator('.insp-stop').count()) === 1));
      ok(label + ': its how-to, in three steps', await page.locator('.st-how:not(.fl-how)').isVisible() && (await page.locator('.st-how:not(.fl-how) .st-how-step').count()) === 3);
      if (process.env.SHOTS) await page.locator('.insp-one').screenshot({ path: require('path').join(process.env.SHOTS, 'structure-' + label + '.png') });
      ok(label + ': no errors, nothing else leaves the site, nothing off the side', errs.length === 0 && away.length === 0 &&
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), errs.concat(away).join(' | '));
      await ctx.close();
    });
  }

  await group('the report\'s structure: a move among items that share a place keeps the others where they are (Codex on #92)', async () => {
    const s = server(); seed(s);
    // Three items at the same position (made at once on two devices), shown in id order.
    const B = '6f1c2a3b-0000-4000-8000-0000000000a5', C = '6f1c2a3b-0000-4000-8000-0000000000a6';
    for (const [id, label] of [[B, 'Bbb'], [C, 'Ccc']]) {
      s.phone('item', id, 'section_id', SEC); s.phone('item', id, 'label', label); s.phone('item', id, 'position', 0);
    }
    const { page, ctx } = await open(browser, { server: s, hash: '#' + INSP });
    const labels = async () => page.locator('.insp-label').evaluateAll((els) => els.map((e) => e.value));
    await until(async () => (await labels()).length === 3);
    const before = await labels();
    await page.locator('.insp-item').first().locator('.insp-item-head [data-move="down"]').click();
    await until(async () => JSON.stringify(await labels()) !== JSON.stringify(before));
    const after = await labels();
    ok('tied places: Down swaps the first two and leaves the third', JSON.stringify(after) === JSON.stringify([before[1], before[0], before[2]]), JSON.stringify([before, after]));
    await ctx.close();
  });

  /* The business sync for flags, with the server's rules (flag_rules.ts in the app's repo): exactly six fields, an
     item's version-4 id, newest wins; o.refuse makes it skip every flag (a refusal), as a rule would. */
  function flagServer() {
    const held = new Map(), pushed = [];
    let refuse = false, seq = 0;
    const FIELDS = ['id', 'ownerAccountId', 'inspectionId', 'flaggedAt', 'updatedAt', 'deletedAt'];
    const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const problem = (d) => Object.keys(d).length !== 6 || FIELDS.some((f) => !(f in d)) || !V4.test(d.id) || d.ownerAccountId !== ME ? 'shape' : null;
    const answer = (b) => {
      const skipped = [], applied = [];
      for (const r of b.push || []) {
        pushed.push(r);
        if (refuse || r.kind !== 'item_flags' || problem(r.data)) { skipped.push({ kind: r.kind, id: r.id, reason: 'flag:shape' }); continue; }
        const h = held.get(r.id);
        if (h && h.row.updated_at >= r.updated_at) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
        held.set(r.id, { row: r, seq: ++seq }); applied.push({ kind: r.kind, id: r.id, applied: true });
      }
      const after = typeof b.after === 'number' ? b.after : 0;
      const rows = [...held.values()].filter((h) => h.seq > after).sort((x, y) => x.seq - y.seq).map((h) => h.row);
      return { rows, next: seq, more: false, skipped, applied };
    };
    // A flag set or cleared elsewhere (the phone).
    const elsewhere = (id, on, at) => held.set(id, { seq: ++seq, row: { kind: 'item_flags', id, updated_at: at, deleted_at: on ? null : at,
      data: { id, ownerAccountId: ME, inspectionId: INSP, flaggedAt: at, updatedAt: at, deletedAt: on ? null : at } } });
    return { answer, pushed, held, elsewhere, set refuse(v) { refuse = v; } };
  }

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('flag for later, ' + label, async () => {
      const s = server(); seed(s);
      // A second item in Roof, and a second stop with one item: what the filter hides.
      const DOWN = '6f1c2a3b-0000-4000-8000-0000000000a3', SEC2 = '6f1c2a3b-0000-4000-8000-0000000000b2', WIN = '6f1c2a3b-0000-4000-8000-0000000000a4';
      s.phone('item', DOWN, 'section_id', SEC); s.phone('item', DOWN, 'label', 'Downspouts'); s.phone('item', DOWN, 'position', 1);
      s.phone('section', SEC2, 'name', 'Kitchen'); s.phone('section', SEC2, 'position', 1);
      s.phone('item', WIN, 'section_id', SEC2); s.phone('item', WIN, 'label', 'Windows'); s.phone('item', WIN, 'position', 0);
      const f = flagServer();
      const { page, ctx, errs, away } = await open(browser, { server: s, w, hash: '#' + INSP, bizServer: f.answer });
      await page.waitForSelector('.insp-flag');
      const flagOf = (id) => page.locator('[data-flag="' + id + '"]');
      const pressed = async (id) => (await flagOf(id).getAttribute('aria-pressed')) === 'true';
      const filter = page.locator('[data-flagfilter]');

      ok(label + ': each item and finding has its flag, named for what it flags', (await page.locator('[data-flag]').count()) === 4 &&
        (await flagOf(ITEM).getAttribute('aria-label')) === 'Flag “Gutters” for later' &&
        (await flagOf(FIND).getAttribute('aria-label')) === 'Flag “Gutter pulling away” for later', await flagOf(FIND).getAttribute('aria-label'));
      ok(label + ': nothing flagged: Flagged (0), not pressable', (await filter.textContent()).trim() === 'Flagged (0)' && await filter.isDisabled());
      ok(label + ': the page says flags never show in the report', await page.locator('.insp-flagnote').isVisible() &&
        /never show in the report/.test(await page.locator('.insp-flagnote').textContent()));

      // Flag the finding: one row up, the six fields only, this inspector's, this inspection's.
      await flagOf(FIND).click();
      await until(async () => f.pushed.length === 1);
      const up = f.pushed[0];
      ok(label + ': flag: one row goes up, as the rules want it: the finding, this inspection, standing', up.kind === 'item_flags' && up.id === FIND &&
        JSON.stringify(Object.keys(up.data).sort()) === JSON.stringify(['deletedAt', 'flaggedAt', 'id', 'inspectionId', 'ownerAccountId', 'updatedAt']) &&
        up.data.inspectionId === INSP && up.data.ownerAccountId === ME && up.data.deletedAt === null && up.deleted_at === null &&
        up.updated_at === up.data.updatedAt && up.data.flaggedAt === up.data.updatedAt, JSON.stringify(up));
      ok(label + ': the flag shows pressed, and says it clears now', await pressed(FIND) && (await flagOf(FIND).getAttribute('aria-label')) === 'Clear the flag on “Gutter pulling away”');
      ok(label + ': the inspection field sync is never asked for a flag', ![...s.held.values()].some((h) => /flag/.test(h.field)));
      await flagOf(WIN).click();
      await until(async () => f.pushed.length === 2);
      ok(label + ': Flagged counts both', await until(async () => (await filter.textContent()).trim() === 'Flagged (2)'));

      // The filter: only what is flagged, with the item a flagged finding sits under; a stop with none goes.
      await filter.click();
      const shown = async () => page.locator('.insp-item:visible .insp-label').evaluateAll((els) => els.map((e) => e.value));
      ok(label + ': Flagged shows only the flagged, with the item a flagged finding is under', await until(async () => JSON.stringify(await shown()) === JSON.stringify(['Gutters', 'Windows'])), JSON.stringify(await shown()));
      ok(label + ': the filter is pressed', (await filter.getAttribute('aria-pressed')) === 'true');
      if (process.env.SHOTS) await page.locator('.insp-one').screenshot({ path: require('path').join(process.env.SHOTS, 'flag-filter-' + label + '.png') });

      // Clear: a newer row, deleted; the count drops; with none left the filter lets go.
      const setAt = f.held.get(WIN).row.updated_at;
      await flagOf(WIN).click();
      await until(async () => f.pushed.length === 3);
      const clr = f.pushed[2];
      ok(label + ': clear: the same row, deleted, newer than the flag', clr.id === WIN && clr.deleted_at !== null && clr.data.deletedAt === clr.updated_at && clr.updated_at > setAt, JSON.stringify(clr));
      ok(label + ': Flagged (1), and the cleared item goes from the filtered list', await until(async () => (await filter.textContent()).trim() === 'Flagged (1)' &&
        JSON.stringify(await shown()) === JSON.stringify(['Gutters'])));
      await flagOf(FIND).click();
      await until(async () => f.pushed.length === 4);
      ok(label + ': nothing flagged: the filter lets go and every item shows', await until(async () => (await filter.getAttribute('aria-pressed')) === 'false' && (await shown()).length === 3));

      // Its how-to.
      ok(label + ': its how-to, in three steps', await page.locator('.fl-how').isVisible() && (await page.locator('.fl-how .st-how-step').count()) === 3);
      if (process.env.SHOTS) { await flagOf(ITEM).click(); await until(async () => f.pushed.length === 5); await page.waitForTimeout(200);
        await page.locator('.insp-one').screenshot({ path: require('path').join(process.env.SHOTS, 'flag-' + label + '.png') }); }
      ok(label + ': no errors, nothing else leaves the site, nothing off the side', errs.length === 0 && away.length === 0 &&
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), errs.concat(away).join(' | '));
      await ctx.close();
    });
  }

  await group('flag for later: refused, from the phone, and on a deleted item', async () => {
    const s = server(); seed(s);
    const f = flagServer();
    const { page, ctx, ping } = await open(browser, { server: s, hash: '#' + INSP, bizServer: f.answer });
    await page.waitForSelector('.insp-flag');
    const flagOf = (id) => page.locator('[data-flag="' + id + '"]');
    f.refuse = true;
    await flagOf(ITEM).click();
    await until(async () => f.pushed.length === 1);
    ok('refused: the flag goes back off, and the page says it didn\u2019t save', await until(async () => (await flagOf(ITEM).getAttribute('aria-pressed')) === 'false' &&
      await page.locator('[data-flagtrouble]').isVisible()));
    ok('refused: nothing is counted', (await page.locator('[data-flagfilter]').textContent()).trim() === 'Flagged (0)');
    f.refuse = false;
    await flagOf(ITEM).click();
    ok('the next try saves, and the line goes', await until(async () => (await flagOf(ITEM).getAttribute('aria-pressed')) === 'true' && !(await page.locator('[data-flagtrouble]').isVisible())));

    // Set on the phone: heard at the next ping, without a reload.
    f.elsewhere(FIND, true, Date.now() + 1000);
    ping();
    ok('a flag set on the phone shows here, without a reload', await until(async () => (await flagOf(FIND).getAttribute('aria-pressed')) === 'true' &&
      (await page.locator('[data-flagfilter]').textContent()).trim() === 'Flagged (2)'));
    // Cleared on the phone: goes.
    f.elsewhere(FIND, false, Date.now() + 2000);
    ping();
    ok('a flag cleared on the phone goes here', await until(async () => (await flagOf(FIND).getAttribute('aria-pressed')) === 'false'));

    // A flag held for an item deleted on the phone is never counted (the server deletes it too).
    f.elsewhere(FIND, true, Date.now() + 3000);
    s.phone('item', FIND, '_del', true);
    ping();
    ok('a deleted finding\u2019s flag is not counted', await until(async () => (await page.locator('[data-flag="' + FIND + '"]').count()) === 0 &&
      (await page.locator('[data-flagfilter]').textContent()).trim() === 'Flagged (1)'));
    await ctx.close();
  });

  await group('editing on the web', async () => {
    const s = server(); seed(s);
    const { page, ctx, calls } = await open(browser, { server: s, hash: '#' + INSP });
    const before = Date.now();
    await page.fill('[data-key="item/' + ITEM + '.note"]', 'Loose at the NE corner');
    ok('a typed note reaches the server within seconds, as this browser\'s change, timed now', await until(() => s.value('item', ITEM, 'note') === 'Loose at the NE corner'));
    const w = calls.flatMap((c) => c.body.push || []).find((x) => x.field === 'note');
    ok('the write names the inspection, the item and the field, with a time from now', !!w && w.inspection === INSP && w.entity === 'item' && w.id === ITEM && w.at >= before - 1000 && w.at <= Date.now() + 1000, JSON.stringify(w));
    await page.selectOption('[data-key="item/' + FIND + '.severity"]', 'SH');
    ok('a chosen severity is sent at once', await until(() => s.value('item', FIND, 'severity') === 'SH'));
    await page.selectOption('[data-key="item/' + FIND + '.severity"]', '');
    ok('"None" clears the severity', await until(() => s.value('item', FIND, 'severity') === null));
    await page.fill('[data-key="inspection/' + INSP + '.title"]', '');
    await page.locator('[data-key="inspection/' + INSP + '.title"]').blur();
    await page.waitForTimeout(1200);
    ok('an emptied title is never sent (the phone\'s inspection always has one)', s.value('inspection', INSP, 'title') === '12 Oak St');
    await ctx.close();
  });

  // Desk finishing (2026-11-16): the cover's city, state, ZIP and booked time; a finding's location and who should
  // fix it; why an item wasn't inspected. The browser is in New York; times travel as UTC milliseconds.
  await group('desk finishing', async () => {
    const ny = (x) => new Date(x + '-05:00').getTime();
    const s = server(); seed(s);
    s.phone('inspection', INSP, 'scheduled_at', ny('2026-11-18T09:00:30'));   // seconds the box can't show
    s.phone('inspection', INSP, 'city', 'Miami'); s.phone('inspection', INSP, 'state', 'FL'); s.phone('inspection', INSP, 'zip_code', '33101');
    s.phone('item', FIND, 'location', 'NE corner'); s.phone('item', FIND, 'finding_recommended_trade', 'Gutter contractor');
    const { page, ctx, calls, ping } = await open(browser, { server: s, hash: '#' + INSP, zone: 'America/New_York' });
    const pushed = (field) => calls.flatMap((c) => c.body.push || []).filter((x) => x.field === field);
    // On screen, whatever its attribute says (a label's own display could override [hidden]).
    const onScreen = (sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => e.getClientRects().length > 0).length, sel);
    ok('desk: the cover shows the city, state, ZIP and booked time (in this browser\'s time, to the minute)',
      await boxValue(page, 'inspection', INSP, 'city') === 'Miami' && await boxValue(page, 'inspection', INSP, 'state') === 'FL' && await boxValue(page, 'inspection', INSP, 'zip_code') === '33101' &&
      await boxValue(page, 'inspection', INSP, 'scheduled_at') === '2026-11-18T09:00', await boxValue(page, 'inspection', INSP, 'scheduled_at'));
    ok('desk: the finding shows its location and who should fix it', await boxValue(page, 'item', FIND, 'location') === 'NE corner' && await boxValue(page, 'item', FIND, 'finding_recommended_trade') === 'Gutter contractor');
    ok('desk: no start line before it starts, and no "why not inspected" box on an inspected item', (await onScreen('[data-started]')) === 0 && (await onScreen('[data-ni]')) === 0);
    const booked = page.locator('[data-key="inspection/' + INSP + '.scheduled_at"]');
    await booked.focus(); await booked.blur(); await page.waitForTimeout(1200);
    ok('desk: opening and leaving the booked time changes nothing (its seconds are kept)', pushed('scheduled_at').length === 0 && s.value('inspection', INSP, 'scheduled_at') === ny('2026-11-18T09:00:30'));
    await page.fill('[data-key="inspection/' + INSP + '.scheduled_at"]', '2026-11-19T14:30'); await booked.blur();
    ok('desk: a new booked time reaches the server as UTC milliseconds (a reschedule)', await until(() => s.value('inspection', INSP, 'scheduled_at') === ny('2026-11-19T14:30:00')) && pushed('scheduled_at').every((w) => typeof w.value === 'number'), JSON.stringify(pushed('scheduled_at')));
    await page.fill('[data-key="inspection/' + INSP + '.scheduled_at"]', ''); await booked.blur();
    ok('desk: clearing the booked time clears it', await until(() => s.value('inspection', INSP, 'scheduled_at') === null));
    await page.fill('[data-key="inspection/' + INSP + '.zip_code"]', '33130'); await page.locator('[data-key="inspection/' + INSP + '.zip_code"]').blur();
    await page.fill('[data-key="inspection/' + INSP + '.city"]', ''); await page.locator('[data-key="inspection/' + INSP + '.city"]').blur();
    ok('desk: a ZIP is sent as typed, and an emptied city is cleared', await until(() => s.value('inspection', INSP, 'zip_code') === '33130' && s.value('inspection', INSP, 'city') === null));
    await page.fill('[data-key="item/' + FIND + '.location"]', 'Downspout, east side'); await page.locator('[data-key="item/' + FIND + '.location"]').blur();
    await page.fill('[data-key="item/' + FIND + '.finding_recommended_trade"]', 'Licensed roofer'); await page.locator('[data-key="item/' + FIND + '.finding_recommended_trade"]').blur();
    ok('desk: a finding\'s location and who should fix it reach the server', await until(() => s.value('item', FIND, 'location') === 'Downspout, east side' && s.value('item', FIND, 'finding_recommended_trade') === 'Licensed roofer'));
    await page.selectOption('[data-key="item/' + ITEM + '.status"]', 'not_inspected');
    ok('desk: marking an item Not inspected opens "Why it wasn\'t inspected"', await until(async () => (await onScreen('[data-ni]')) === 1));
    await page.fill('[data-key="item/' + ITEM + '.ni_note"]', 'Ladder too short for the second story'); await page.locator('[data-key="item/' + ITEM + '.ni_note"]').blur();
    ok('desk: and its words reach the server', await until(() => s.value('item', ITEM, 'ni_note') === 'Ladder too short for the second story'));
    s.phone('inspection', INSP, 'inspection_at', ny('2026-11-19T14:42:10'));
    s.phone('inspection', INSP, 'scheduled_at', ny('2026-11-19T15:00:00'));
    ping();
    ok('desk: a start on the phone shows as a line, never a box', await until(async () => (await vis(page, '[data-started]')).join() === 'Started Thu, Nov 19, 2026, 2:42 PM. Your phone sets when an inspection starts.') && !(await page.$('[data-field="inspection_at"]')), JSON.stringify(await vis(page, '[data-started]')));
    ok('desk: a booked time changed on the phone shows here', await until(async () => await boxValue(page, 'inspection', INSP, 'scheduled_at') === '2026-11-19T15:00'));
    ok('desk: nothing this page sends is a start', pushed('inspection_at').length === 0);
    await ctx.close();
  });

  // Renames and Find (2026-11-16): a stop's and an item's names are boxes; a name is never sent empty; the list is in
  // the phone's day order with each inspection's day, and Find keeps the matching ones.
  await group('renames and find', async () => {
    const s = server(); seed(s);
    const { page, ctx, ping } = await open(browser, { server: s, hash: '#' + INSP, zone: 'America/New_York' });
    const nameKey = '[data-key="section/' + SEC + '.name"]', labelKey = '[data-key="item/' + ITEM + '.label"]';
    await page.fill(nameKey, 'Roof and gutters'); await page.locator(nameKey).blur();
    ok('rename: a new stop name reaches the server', await until(() => s.value('section', SEC, 'name') === 'Roof and gutters'));
    await page.fill(labelKey, 'Gutters and downspouts'); await page.locator(labelKey).blur();
    ok('rename: a new item name reaches the server', await until(() => s.value('item', ITEM, 'label') === 'Gutters and downspouts'));
    await page.fill(nameKey, ''); await page.locator(nameKey).blur();
    await page.fill(labelKey, ''); await page.locator(labelKey).blur(); await page.waitForTimeout(1200);
    ok('rename: an emptied stop or item name is never sent, and each box shows its name again',
      s.value('section', SEC, 'name') === 'Roof and gutters' && await boxValue(page, 'section', SEC, 'name') === 'Roof and gutters' &&
      s.value('item', ITEM, 'label') === 'Gutters and downspouts' && await boxValue(page, 'item', ITEM, 'label') === 'Gutters and downspouts');
    const box = page.locator(labelKey);
    // Mark the very box being typed in: a page rebuilt under it would hand over a new box (the text can even
    // survive that, since a removed box is "left", but the caret jumps and keystrokes in between are lost).
    await page.evaluate((k) => { document.querySelector(k).dataset.mark = 'same'; }, labelKey);
    // The caret at the end, said outright: End doesn't move it on a Mac, and a click lands mid-word in a narrower box.
    await box.click(); await page.evaluate((k) => { const e = document.querySelector(k); e.setSelectionRange(e.value.length, e.value.length); }, labelKey);
    await box.pressSequentially(' (front)', { delay: 10 });
    await page.waitForTimeout(1500);   // past the pause: the name is sent while the box still has the caret
    ok('rename: a name being typed survives its own save: the same box, still with the caret (the page is not rebuilt under it)',
      (await box.inputValue()) === 'Gutters and downspouts (front)' && await page.evaluate((k) => document.querySelector(k).dataset.mark === 'same' && document.activeElement === document.querySelector(k), labelKey) &&
      await until(() => s.value('item', ITEM, 'label') === 'Gutters and downspouts (front)'), await box.inputValue());
    await box.blur();
    s.phone('section', SEC, 'name', 'Roof, seen from the ladder'); ping();
    ok('rename: a stop renamed on the phone shows here', await until(async () => await boxValue(page, 'section', SEC, 'name') === 'Roof, seen from the ladder'));
    ok('list: each inspection shows its day (with the time when it is booked or started), newest first',
      same(await vis(page, '[data-list="items"] time'), ['Sat, Nov 14, 2026, 6:46 PM', 'Fri, Nov 13, 2026']), JSON.stringify(await vis(page, '[data-list="items"] time')));
    const find = async (q) => { await page.fill('[data-find]', q); await page.waitForTimeout(400); };
    await find('ELM');
    ok('find: by title, whatever the capitals', same(await vis(page, '[data-list="items"] strong'), ['9 Elm Ave']));
    await find('miami');
    ok('find: by address', same(await vis(page, '[data-list="items"] strong'), ['12 Oak St']));
    await find('zzz');
    ok('find: no match says so, and shows no list', (await vis(page, '[data-list]')).join() === 'No inspection matches that.');
    await find('');
    ok('find: emptied, every inspection is back', (await vis(page, '[data-list="items"] li')).length === 2);
    // Started after the other was booked: by the phone's rule its start puts it first, with that time.
    s.phone('inspection', INSP, 'inspection_at', new Date('2026-11-15T08:30:00-05:00').getTime()); ping();
    ok('list: an inspection started on the phone moves to its start day, first', await until(async () => same(await vis(page, '[data-list="items"] strong'), ['12 Oak St', '9 Elm Ave']) && (await vis(page, '[data-list="items"] time'))[0] === 'Sun, Nov 15, 2026, 8:30 AM'), JSON.stringify(await vis(page, '[data-list="items"] time')));
    await ctx.close();
    const empty = await open(browser, { server: server() });
    ok('find: no Find box while there are no inspections', (await empty.page.evaluate(() => [...document.querySelectorAll('[data-findbox]')].filter((e) => e.getClientRects().length > 0).length)) === 0 && (await vis(empty.page, '[data-list]')).join().startsWith('No inspections here yet'));
    await empty.ctx.close();
  });

  await group('live from the phone', async () => {
    const s = server(); seed(s);
    const { page, ctx, ping, calls } = await open(browser, { server: s, hash: '#' + INSP });
    s.phone('item', ITEM, 'note', 'Edited on the phone');
    ping();
    ok('a change on the phone shows here within seconds of the ping, with no reload', await until(async () => await boxValue(page, 'item', ITEM, 'note') === 'Edited on the phone', 3000));
    ok('each ask starts after the last change already pulled', calls.length >= 2 && calls[0].body.after === null && calls[calls.length - 1].body.after >= 19, JSON.stringify(calls.map((c) => c.body.after)));
    // A new finding made on the phone appears in place.
    const NEWF = '6f1c2a3b-0000-4000-8000-0000000000a3';
    s.phone('item', NEWF, 'section_id', SEC); s.phone('item', NEWF, 'parent_item_id', ITEM); s.phone('item', NEWF, 'label', 'Downspout loose'); s.phone('item', NEWF, 'position', 1); s.phone('item', NEWF, 'finding_title', 'Downspout loose');
    ping();
    ok('a finding made on the phone appears under its item', await until(async () => await boxValue(page, 'item', NEWF, 'finding_title') === 'Downspout loose'));
    ok('a photo counts only on its own finding', same(await vis(page, '[data-photos]'), ['1 photos on your phone']), JSON.stringify(await vis(page, '[data-photos]')));
    s.phone('item', FIND, '_del', true);
    ping();
    ok('a finding deleted on the phone goes', await until(async () => await boxValue(page, 'item', FIND, 'finding_title') === null));
    await ctx.close();
  });

  await group('a box being typed in', async () => {
    const s = server(); seed(s);
    const { page, ctx, ping } = await open(browser, { server: s, hash: '#' + INSP });
    const box = page.locator('[data-key="item/' + ITEM + '.note"]');
    await box.click();
    await box.pressSequentially('Typing here', { delay: 10 });
    s.phone('item', ITEM, 'note', 'Phone words meanwhile');
    ping();
    await page.waitForTimeout(300);
    ok('is not overwritten by a change from the phone while it is being typed in', (await box.inputValue()).endsWith('Typing here'));
    await box.blur();
    ok('and its words, the newest, win on the server when it is left', await until(() => /Typing here$/.test(s.value('item', ITEM, 'note') || '')));
    await ctx.close();
  });

  await group('no connection', async () => {
    const s = server(); seed(s);
    const { page, ctx } = await open(browser, { server: s, down: true });
    ok('says it can\'t load the inspections, and that it can\'t reach Inspyx', (await vis(page, '[data-list]')).join().startsWith('Couldn\'t load your inspections') && (await vis(page, '[data-live]')).join().startsWith('Can\'t reach Inspyx'), JSON.stringify(await vis(page, '[data-list], [data-live]')));
    await ctx.close();
  });

  await group('a refused join', async () => {
    const s = server(); seed(s);
    const { page, ctx } = await open(browser, { server: s, hash: '#' + INSP, refuseJoin: true });
    ok('a join the server refuses never reads as live', !(await vis(page, '[data-live]')).join().startsWith('Live'), JSON.stringify(await vis(page, '[data-live]')));
    await ctx.close();
  });

  await group('a join refused for the sign-in', async () => {
    const s = server(); seed(s);
    let renewals = 0;
    const { page, ctx } = await open(browser, { server: s, hash: '#' + INSP, refuseJoin: 'auth', onAuth: () => { renewals++; return { status: 400, json: { error: 'invalid_grant' } }; } });
    ok('asks the sign-in server, and a rejected sign-in sends the visitor to sign in', await until(async () => new URL(page.url()).pathname === '/signin', 6000) && renewals >= 1, 'renewals ' + renewals + ' at ' + page.url());
    await ctx.close();
  });

  await group('another account\'s topic', async () => {
    const s = server(); seed(s);
    const { page, ctx, sockets } = await open(browser, { server: s, hash: '#' + INSP });
    s.phone('item', ITEM, 'note', 'Should not show from a stranger\'s ping');
    sockets[0].ws.send(JSON.stringify({ topic: 'realtime:insp:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', event: 'broadcast', ref: null, payload: { type: 'broadcast', event: 'changed', payload: {} } }));
    await page.waitForTimeout(800);
    ok('a ping on another topic is not heard', await boxValue(page, 'item', ITEM, 'note') === 'Loose at the corner');
    await ctx.close();
  });

  await browser.close();
  console.log(failed === 0 ? 'ALL PASS' : failed + ' FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
