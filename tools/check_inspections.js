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
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US' });
  const store = o.store === undefined ? kept(HOUR) : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
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
        ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: o.refuseJoin ? 'error' : 'ok', response: {} } }));
      }
    });
  });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
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
  return { ctx, page, errs, away, calls, sockets, res, ping };
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
      ok(label + ': lists both inspections, the newest first, with their addresses', list.length === 2 && /^9 Elm Ave/.test(list[0]) && /^12 Oak St.*Miami$/.test(list[1]), JSON.stringify(list));
      ok(label + ': shows the inspection\'s title and address in their boxes', await boxValue(page, 'inspection', INSP, 'title') === '12 Oak St' && await boxValue(page, 'inspection', INSP, 'address') === '12 Oak St, Miami');
      ok(label + ': shows the stop, the item and its note, status and finding as the phone has them',
        (await vis(page, '.insp-stop h2')).join() === 'Roof' && (await vis(page, '.insp-label')).join() === 'Gutters' &&
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
