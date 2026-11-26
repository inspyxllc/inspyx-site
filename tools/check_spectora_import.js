// Self-checks for "From Spectora" on /people-import and /history-import (2026-11-26, the web importers, piece 3).
// The page reads the inspector's Spectora account page by page through I2's spectora-import function, waits or stops
// by the app's own rule (inspyxImport.spectoraStep), and plans with the engine's Spectora planner; the preview, Keep
// and Undo are the file path's own. NOTHING REAL IS ASKED OR CHANGED HERE: spectora-import and sync are stand-ins run
// here; the reader is the real one the page loads, and the same reader run in Node gives the expected plan and words.
// Fixture: I2's (inspyx-mobile test/fixtures/web_import/spectora_records.json, made-up people), copied to tools/fixtures.
// usage: node tools/serve.js <port> &   then   URL=http://localhost:<port>/ node tools/check_spectora_import.js
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000;
const KEY = 'spx-test-key-9f3b2c71';
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); for (;;) { try { if (await fn()) return true; } catch (e) { /* not yet */ } if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 60)); } };
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'spectora_records.json'), 'utf8'));

const READER = (() => { const g = {}; new Function('self', 'window', 'globalThis', fs.readFileSync(path.join(__dirname, '../coming-soon/assets/import/inspyx_import.js'), 'utf8'))(g, g, g); return g.inspyxImport; })();
const J = (t) => (typeof t === 'string' ? JSON.parse(t) : t);
const PS = require('../coming-soon/assets/past-store.js');

function person(id, name, role, extra) {
  const d = Object.assign({ id, ownerAccountId: ME, role: role || 'client', name, phone: null, email: null, company: null, note: null, lastUsedAt: 1000, createdAt: 1000, updatedAt: 1000, deletedAt: null }, extra || {});
  return { kind: 'inspector_contacts', id, updated_at: 1000, deleted_at: null, data: d };
}
/* People before: Ana Reyes kept with her phone (Spectora fills her email); nobody else. */
const seed = () => [person('seed-0', 'Ana Reyes', 'client', { phone: '305-555-0101' })];
const existingOf = (rows) => rows.map((r) => ({ id: r.id, name: r.data.name, role: r.data.role, phone: r.data.phone, email: r.data.email, company: r.data.company, note: r.data.note, deleted_at: r.data.deletedAt }));

function syncServer(rows0) {
  const held = new Map(); let seq = 0;
  for (const r of rows0) held.set(r.kind + '/' + r.id, { row: r, seq: ++seq });
  const answer = (b) => {
    const applied = [];
    for (const r of b.push || []) { const k = r.kind + '/' + r.id, h = held.get(k); if (h && h.row.updated_at >= r.updated_at) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; } held.set(k, { row: r, seq: ++seq }); applied.push({ kind: r.kind, id: r.id, applied: true }); }
    const after = typeof b.after === 'number' ? b.after : 0;
    return { rows: [...held.values()].filter((h) => h.seq > after).sort((x, y) => x.seq - y.seq).map((h) => h.row), next: seq, more: false, skipped: [], applied };
  };
  const all = () => [...held.values()].map((h) => h.row);
  return { answer, people: () => all().filter((r) => r.kind === 'inspector_contacts'), past: () => all().filter((r) => r.kind === 'past_inspections') };
}
/* The stand-in spectora-import: [script] answers each call in turn ({ status, body } or 'drop' for a lost connection);
   every call's body and time is kept. */
function spxServer(script) {
  const calls = []; let i = 0;
  return { calls, next: (body) => { calls.push({ body, at: Date.now() }); return script[Math.min(i++, script.length - 1)]; } };
}
const page200 = (records, more) => ({ status: 200, body: Object.assign({ records, has_next: false, cut: false }, more || {}) });

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || 1280, height: 900 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, kept());
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const errs = [], away = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    const cors = { 'access-control-allow-origin': '*' };
    // Renewing the sign-in (auth.js asks it after a 401): refused, or a fresh one (o.renew).
    if (u.startsWith(SERVER + '/auth/v1/token')) {
      if (o.renew === 'ok') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ access_token: 'test-access-2', refresh_token: 'test-renew-2', expires_in: 3600, user: { id: ME, email: 'pat@example.com' } }) });
      return route.fulfill({ status: 400, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: 'invalid_grant' }) });
    }
    if (u.startsWith(SERVER + '/functions/v1/sync')) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o.sync.answer(JSON.parse(req.postData() || '{}'))) });
    if (u.startsWith(SERVER + '/functions/v1/spectora-import')) {
      const a = o.spx.next(JSON.parse(req.postData() || '{}'));
      if (a === 'drop') return route.abort();
      if (a.delay) await new Promise((r) => setTimeout(r, a.delay));
      return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.body) });
    }
    away.push(u); return route.abort();
  });
  await page.goto(url + (o.history ? 'history-import' : 'people-import'), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-pick]', { state: 'attached' });
  await until(async () => await page.locator('[data-pi]').isVisible());
  return { ctx, page, errs, away };
}
async function readSpectora(page, key) {
  await page.locator('[data-src="spectora"]').click();
  await page.locator('[data-spx-key]').fill(key === undefined ? KEY : key);
  await page.locator('[data-spx-go]').click();
}
/* Nowhere but a call's body: not in the box, the address, storage or a cookie. */
async function keyLeft(page) {
  return page.evaluate((k) => {
    const st = (s) => { const o = []; for (let i = 0; i < s.length; i++) o.push(s.key(i) + '=' + s.getItem(s.key(i))); return o.join('\n'); };
    const where = [];
    if (document.querySelector('[data-spx-key]').value.indexOf(k) >= 0) where.push('box');
    if (location.href.indexOf(k) >= 0) where.push('address');
    if (st(localStorage).indexOf(k) >= 0) where.push('localStorage');
    if (st(sessionStorage).indexOf(k) >= 0) where.push('sessionStorage');
    if (document.cookie.indexOf(k) >= 0) where.push('cookie');
    if (document.body.innerHTML.indexOf(k) >= 0) where.push('page');
    return where;
  }, KEY);
}
const shot = async (page, name, full) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: full !== false }); };
const sigOf = (rows) => JSON.stringify(rows.filter((r) => r.deleted_at == null && r.data.deletedAt == null).map((r) => [r.data.name, r.data.role, r.data.phone, r.data.email, r.data.company]).sort());

(async () => {
  const browser = await engine.launch();
  const C = FIXTURE.clients, A = FIXTURE.agents, R = FIXTURE.records;

  await group('people from Spectora: every page of clients, then agents; the plan is the engine\'s; Keep and Undo', async () => {
    const sync = syncServer(seed());
    const spx = spxServer([page200(C.slice(0, 3), { has_next: true }), page200(C.slice(3)), page200(A)]);
    const o = await open(browser, { sync, spx }), { page } = o;
    ok('the file pane shows first; Spectora\'s is a tap away', await page.locator('[data-src-pane="file"]').isVisible() && await page.locator('[data-src-pane="spectora"]').isHidden());
    await readSpectora(page);
    await until(async () => await page.locator('[data-read]').isVisible());
    ok('the calls: clients page 1, clients page 2, agents page 1, the key in each body', JSON.stringify(spx.calls.map((c) => [c.body.what, c.body.page, c.body.key === KEY])) === JSON.stringify([['clients', 1, true], ['clients', 2, true], ['agents', 1, true]]), JSON.stringify(spx.calls.map((c) => c.body)));
    const want = J(READER.spectora('people', { clients: C, agents: A, clients_cut: false, agents_cut: false }, { existing: existingOf(seed()) }));
    const cnt = (a) => want.plan.filter((e) => e.action === a).length;
    const got = async (a) => { const l = page.locator('[data-sum-' + a + ']'); return (await l.count()) ? +(await l.getAttribute('data-sum-' + a)) : 0; };
    ok('the preview: the engine\'s own counts (new, fill, back, same)', await got('new') === cnt('new') && await got('fill') === cnt('fill') && await got('unchanged') === cnt('unchanged'), JSON.stringify([cnt('new'), cnt('fill'), cnt('unchanged')]));
    ok('no columns, no "this file holds", and the agents note', await page.locator('[data-cols-h]').isHidden() && await page.locator('[data-cols-wrap]').isHidden() && await page.locator('.pi-kind').isHidden() &&
      /one list of agents/.test(await page.locator('[data-spx-agents]').textContent()) && await page.locator('[data-spx-agents]').isVisible());
    await shot(page, 'spx-people-preview-wide');
    ok('the count says where they came from', /read from Spectora/.test(await page.locator('[data-count]').textContent()));
    const sk = await page.locator('[data-skipped-list] li').allTextContents();
    ok('a record without a name is left out, said by where it is in Spectora', want.skipped.length > 0 && sk.length === want.skipped.length && sk.every((t, i) => t.indexOf(want.skipped[i].where) === 0), JSON.stringify(sk));
    ok('the key is gone once read: not in the box, the address, storage or the page', (await keyLeft(page)).length === 0, JSON.stringify(await keyLeft(page)));
    await page.locator('[data-go]').click();
    await until(async () => await page.locator('[data-done]').isVisible(), 8000);
    // Expected People: the seed, then the plan's own rows (new ones added; fills on the kept one).
    const exp = seed().map((r) => JSON.parse(JSON.stringify(r)));
    want.plan.forEach((e) => {
      if (e.action === 'new') exp.push(person('x', e.row.name, e.row.role, { phone: e.row.phone || null, email: e.row.email || null, company: e.row.company || null }));
      if (e.action === 'fill') Object.assign(exp.find((r) => r.id === e.id).data, e.fills);
    });
    ok('People after Keep: the plan, person by person', sigOf(sync.people()) === sigOf(exp), sigOf(sync.people()).slice(0, 300));
    ok('agents come in as buyer\'s agents', sync.people().filter((r) => r.data.name === 'Dave Lima').every((r) => r.data.role === 'buyer_agent') && sync.people().some((r) => r.data.name === 'Dave Lima'));
    await page.locator('[data-undo]').click();
    await until(async () => /Undone/.test(await page.locator('[data-say]').textContent()), 8000);
    ok('Undo: People as it was', sigOf(sync.people()) === sigOf(seed()), sigOf(sync.people()).slice(0, 200));
    ok('no errors; nothing asked of anyone else', !o.errs.length && !o.away.length, o.errs.concat(o.away).join(' | ').slice(0, 200));
    await o.ctx.close();
  });

  await group('past inspections from Spectora: every page, the same "before" sent back; kept as Spectora\'s; Undo', async () => {
    const sync = syncServer(seed());
    const spx = spxServer([page200(R.slice(0, 4), { has_next: true, before: 'b-2026-11-26T16:40:00Z' }), page200(R.slice(4), { before: 'b-other' })]);
    const o = await open(browser, { sync, spx, history: true }), { page } = o;
    await readSpectora(page);
    await until(async () => await page.locator('[data-read]').isVisible());
    ok('the calls: inspections 1 then 2; page 2 sends back the first "before"', spx.calls.length === 2 && spx.calls[0].body.what === 'inspections' && spx.calls[0].body.before === undefined &&
      spx.calls[1].body.page === 2 && spx.calls[1].body.before === 'b-2026-11-26T16:40:00Z', JSON.stringify(spx.calls.map((c) => c.body)));
    const want = J(READER.spectora('inspections', { records: R, cut: false }, { existing: existingOf(seed()), existing_past: [] }));
    await shot(page, 'spx-hist-preview-wide');
    ok('the preview: the engine\'s new ones to keep', +(await page.locator('[data-keep]').getAttribute('data-keep')) === want.new_count && want.new_count > 0, String(want.new_count));
    await page.locator('[data-go]').click();
    await until(async () => await page.locator('[data-done]').isVisible(), 8000);
    const past = sync.past();
    ok('kept: one row per new inspection, each from Spectora, under one import', past.length === want.new_count && past.every((r) => r.data.source === 'Spectora') && new Set(past.map((r) => r.data.importId)).size === 1 &&
      past.every((r) => PS.problem(r.data) === null), JSON.stringify(past.map((r) => r.data.address)));
    ok('the people they name come into People', sync.people().length > 1);
    await page.locator('[data-undo]').click();
    await until(async () => /Undone/.test(await page.locator('[data-say]').textContent()), 8000);
    ok('Undo: every inspection of the import deleted, People as it was', sync.past().every((r) => r.data.deletedAt != null) && sigOf(sync.people()) === sigOf(seed()));
    // The same again: nothing new now the first ones are kept (a second read of the same account keeps none twice).
    await o.ctx.close();
  });

  await group('a second read of the same account keeps none twice', async () => {
    const sync = syncServer(seed());
    const spx = spxServer([page200(R)]);
    const o = await open(browser, { sync, spx, history: true }), { page } = o;
    await readSpectora(page);
    await until(async () => await page.locator('[data-read]').isVisible());
    await page.locator('[data-go]').click();
    await until(async () => await page.locator('[data-done]').isVisible(), 8000);
    const n = sync.past().length;
    await readSpectora(page);
    await until(async () => await page.locator('[data-read]').isVisible());
    ok('all on the list already: nothing to keep', (await page.locator('[data-keep]').count()) === 0 && +(await page.locator('[data-already]').getAttribute('data-already')) === n && sync.past().length === n);
    await o.ctx.close();
  });

  await group('Spectora says wait: the page waits as long as the app\'s rule says, then asks for the same page', async () => {
    const sync = syncServer(seed());
    const rate = { status: 200, body: { refused: 'rate', retry_after: 1 } };
    const spx = spxServer([page200(C.slice(0, 2), { has_next: true }), rate, page200(C.slice(2)), page200(A)]);
    const o = await open(browser, { sync, spx }), { page } = o;
    const step = J(READER.spectoraStep(rate.body, 0));
    await readSpectora(page);
    ok('it says it is waiting', await until(async () => /asked Inspyx to wait/.test(await page.locator('[data-spx-say]').textContent()), 4000));
    await until(async () => await page.locator('[data-read]').isVisible(), 15000);
    const c = spx.calls;
    ok('the rule says wait; the same page (2) asked again, no sooner than told', typeof step.wait_seconds === 'number' && c[1].body.page === 2 && c[2].body.page === 2 && c[2].at - c[1].at >= step.wait_seconds * 1000 - 50,
      JSON.stringify({ step, gap: c[2].at - c[1].at }));
    ok('then every person is read', +(await page.locator('[data-count]').textContent()).match(/\d+/)[0] === J(READER.spectora('people', { clients: C, agents: A }, { existing: [] })).people.length);
    await o.ctx.close();
  });

  await group('Spectora stops it at the start: the rule\'s words, nothing to keep, the key forgotten', async () => {
    for (const [label, ans] of [['a refused key', { status: 400, body: { error: 'key' } }], ['the hour is full', { status: 429, body: { error: 'hour_full' } }], ['Spectora says the key is bad', { status: 200, body: { refused: 'bad_key' } }], ['no connection', 'drop']]) {
      const sync = syncServer(seed()), spx = spxServer([ans]);
      const o = await open(browser, { sync, spx }), { page } = o;
      const want = J(READER.spectoraStep(ans === 'drop' ? { refused: 'no_signal' } : ans.body, 0)).message;
      await readSpectora(page);
      const said = await until(async () => (await page.locator('[data-spx-say]').textContent()) === want, 6000);
      ok(label + ': the app\'s own words, no preview, nothing sent, the key forgotten', said && await page.locator('[data-read]').isHidden() && sync.people().length === 1 && (await keyLeft(page)).length === 0 &&
        !(await page.locator('[data-spx-go]').isDisabled()), (await page.locator('[data-spx-say]').textContent()) + ' / ' + want);
      await o.ctx.close();
    }
  });

  await group('signed out of Inspyx while reading: renewed and asked once more; if the sign-in is over, to sign in', async () => {
    {
      const sync = syncServer(seed()), spx = spxServer([{ status: 401, body: { error: 'account' } }]);
      const o = await open(browser, { sync, spx, renew: 'ok' }), { page } = o;
      const want = J(READER.spectoraStep({ error: 'account' }, 0)).message;
      await readSpectora(page);
      ok('renewed, refused again: the app\'s "sign in again" words, the same page asked twice', await until(async () => (await page.locator('[data-spx-say]').textContent()) === want) && spx.calls.length === 2 &&
        spx.calls.every((c) => c.body.page === 1) && (await keyLeft(page)).length === 0, (await page.locator('[data-spx-say]').textContent()) + ' / ' + want);
      await o.ctx.close();
    }
    {
      const sync = syncServer(seed()), spx = spxServer([{ status: 401, body: { error: 'account' } }]);
      const o = await open(browser, { sync, spx }), { page } = o;
      await readSpectora(page);
      ok('the sign-in is over: to the sign-in page', await until(async () => /\/signin/.test(page.url()), 6000), page.url());
      await o.ctx.close();
    }
  });

  await group('Stop while Spectora makes it wait: nothing more asked, nothing offered, the key forgotten', async () => {
    const sync = syncServer(seed());
    const spx = spxServer([page200(C.slice(0, 2), { has_next: true }), { status: 200, body: { refused: 'rate', retry_after: 2 } }, page200(C.slice(2)), page200(A)]);
    const o = await open(browser, { sync, spx }), { page } = o;
    await readSpectora(page);
    await until(async () => /asked Inspyx to wait/.test(await page.locator('[data-spx-say]').textContent()), 4000);
    await shot(page, 'spx-waiting', false);
    ok('Stop shows while it reads; the form waits', await page.locator('[data-spx-stop]').isVisible() && await page.locator('[data-spx-go]').isDisabled());
    await page.locator('[data-spx-stop]').click();
    await new Promise((r) => setTimeout(r, 3000));
    ok('stopped: said, no more calls, no preview, the form free, the key forgotten', /Stopped/.test(await page.locator('[data-spx-say]').textContent()) && spx.calls.length === 2 && await page.locator('[data-read]').isHidden() &&
      !(await page.locator('[data-spx-go]').isDisabled()) && await page.locator('[data-spx-stop]').isHidden() && (await keyLeft(page)).length === 0, String(spx.calls.length));
    await o.ctx.close();
  });

  await group('Stop while an answer is on its way: that answer is dropped, nothing more asked', async () => {
    const sync = syncServer(seed());
    const spx = spxServer([Object.assign(page200(C.slice(0, 2), { has_next: true }), { delay: 1500 }), page200(C.slice(2)), page200(A)]);
    const o = await open(browser, { sync, spx }), { page } = o;
    await readSpectora(page);
    await until(async () => spx.calls.length === 1);
    await page.locator('[data-spx-stop]').click();
    await new Promise((r) => setTimeout(r, 2500));
    ok('one call only; no preview; stopped said', spx.calls.length === 1 && await page.locator('[data-read]').isHidden() && /Stopped/.test(await page.locator('[data-spx-say]').textContent()), String(spx.calls.length));
    await o.ctx.close();
  });

  await group('stopped part way: what was read is offered, the stop said, the rest listed as left out', async () => {
    const sync = syncServer(seed());
    const spx = spxServer([page200(C.slice(0, 3), { has_next: true }), { status: 200, body: { refused: 'bad_key' } }]);
    const o = await open(browser, { sync, spx }), { page } = o;
    await readSpectora(page);
    await until(async () => await page.locator('[data-read]').isVisible(), 8000);
    const t = await page.locator('[data-spx-say]').textContent();
    const want = J(READER.spectora('people', { clients: C.slice(0, 3), agents: [], clients_cut: true, agents_cut: false }, { existing: existingOf(seed()) }));
    const sk = await page.locator('[data-skipped-list] li').allTextContents();
    await shot(page, 'spx-partial');
    ok('the stop and "what was read is below" are said', t.indexOf(J(READER.spectoraStep({ refused: 'bad_key' }, 0)).message) === 0 && /What was read before that is below/.test(t), t);
    ok('agents never asked; clients listed as cut', spx.calls.length === 2 && sk.some((x) => /^Spectora clients/.test(x)) && sk.length === want.skipped.length, JSON.stringify(sk));
    await o.ctx.close();
  });

  await group('a Spectora inspection too long to keep: named by its address (it has no line), before and after Keep', async () => {
    const sync = syncServer(seed());
    const big = JSON.parse(JSON.stringify(R[0])); big.id = 'i-big'; big.attributes.full_address = '99 Long Ln, Miami, FL 33101'; big.attributes.notes = 'x'.repeat(210000);
    const spx = spxServer([page200([big, R[1]])]);
    const o = await open(browser, { sync, spx, history: true }), { page } = o;
    await readSpectora(page);
    await until(async () => await page.locator('[data-read]').isVisible());
    const sum = await page.locator('[data-insp-sum]').textContent();
    ok('the preview: one to keep; the long one named by its address, with what to do in Spectora', +(await page.locator('[data-keep]').getAttribute('data-keep')) === 1 &&
      /1 inspection can’t be kept: it holds too much to keep \(99 Long Ln[^)]*\)\. Shorten its longest boxes in Spectora/.test(sum), sum.slice(0, 220));
    await page.locator('[data-go]').click();
    await until(async () => await page.locator('[data-done]').isVisible(), 8000);
    const t = await page.locator('[data-done-t]').textContent();
    ok('after Keep: one kept, the long one named again', sync.past().length === 1 && /99 Long Ln/.test(t), t.slice(0, 220));
    await o.ctx.close();
  });

  await group('Spectora has more past page 100: cut, said as left out', async () => {
    const sync = syncServer(seed());
    const spx = spxServer([page200(R.slice(0, 2), { cut: true })]);
    const o = await open(browser, { sync, spx, history: true }), { page } = o;
    await readSpectora(page);
    await until(async () => await page.locator('[data-read]').isVisible(), 8000);
    const sk = await page.locator('[data-skipped-list] li').allTextContents();
    ok('one call, and "Spectora inspections" listed as left out', spx.calls.length === 1 && sk.some((x) => /^Spectora inspections/.test(x)), JSON.stringify(sk));
    await o.ctx.close();
  });

  await group('the key box behaves like a secret: hidden, never saved or spell-checked; the eye shows it', async () => {
    for (const history of [false, true]) {
      const sync = syncServer(seed()), spx = spxServer(history ? [page200(R)] : [page200(C), page200(A)]);
      const o = await open(browser, { sync, spx, history }), { page } = o;
      await page.locator('[data-src="spectora"]').click();
      const box = page.locator('[data-spx-key]'), eye = page.locator('[data-spx-eye]');
      const at = async () => box.evaluate((e) => ({ type: e.type, ac: e.getAttribute('autocomplete'), sp: e.getAttribute('spellcheck'), cor: e.getAttribute('autocorrect'), cap: e.getAttribute('autocapitalize'), form: e.form && e.form.getAttribute('autocomplete') }));
      const a = await at();
      ok((history ? 'history' : 'people') + ': a hidden box, autocomplete off, no spell check, no autocorrect or capitals', a.type === 'password' && a.ac === 'off' && a.sp === 'false' && a.cor === 'off' && a.cap === 'off' && a.form === 'off', JSON.stringify(a));
      await box.fill(KEY);
      await eye.click();
      ok((history ? 'history' : 'people') + ': the eye shows it, and says it hides it now', (await at()).type === 'text' && await eye.getAttribute('aria-pressed') === 'true' && await eye.getAttribute('aria-label') === 'Hide the key' && await box.inputValue() === KEY);
      await eye.click();
      ok((history ? 'history' : 'people') + ': and hides it again', (await at()).type === 'password' && await eye.getAttribute('aria-label') === 'Show the key');
      await eye.click();
      await page.locator('[data-spx-go]').click();
      await until(async () => await page.locator('[data-read]').isVisible(), 8000);
      ok((history ? 'history' : 'people') + ': read: the box empty and hidden again', (await at()).type === 'password' && await box.inputValue() === '' && await eye.getAttribute('aria-pressed') === 'false');
      await o.ctx.close();
    }
  });

  await group('no key: said, nothing asked', async () => {
    const sync = syncServer(seed()), spx = spxServer([page200([])]);
    const o = await open(browser, { sync, spx }), { page } = o;
    await readSpectora(page, '   ');
    ok('"paste your key first", no call', /Paste your Spectora API key first/.test(await page.locator('[data-spx-say]').textContent()) && spx.calls.length === 0);
    await o.ctx.close();
  });

  await group('a file after Spectora: the file\'s preview, never Spectora\'s', async () => {
    const sync = syncServer(seed()), spx = spxServer([page200(C), page200(A)]);
    const o = await open(browser, { sync, spx }), { page } = o;
    await readSpectora(page);
    await until(async () => await page.locator('[data-read]').isVisible());
    await page.locator('[data-src="file"]').click();
    await page.setInputFiles('[data-pick]', { name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Phone\nZed Zulu,305-555-0199\n') });
    await until(async () => /1 person in this file/.test(await page.locator('[data-count]').textContent()));
    ok('the file\'s count and its columns; Spectora\'s words gone', /1 person in this file/.test(await page.locator('[data-count]').textContent()) && await page.locator('[data-cols-wrap]').isVisible() && await page.locator('[data-spx-say]').isHidden());
    await page.locator('[data-go]').click();
    await until(async () => await page.locator('[data-done]').isVisible(), 8000);
    ok('Keep brings in the file\'s person only', sync.people().length === 2 && sync.people().some((r) => r.data.name === 'Zed Zulu'));
    await o.ctx.close();
  });

  await group('a new read while one is waiting: the old one never lands', async () => {
    const sync = syncServer(seed());
    const spx = spxServer([{ status: 200, body: { refused: 'rate', retry_after: 2 } }, page200(A.slice(0, 1)), page200([])]);
    const o = await open(browser, { sync, spx, history: false }), { page } = o;
    await readSpectora(page);
    await until(async () => /asked Inspyx to wait/.test(await page.locator('[data-spx-say]').textContent()), 4000);
    // While it waits, a file: the waiting read is over.
    await page.locator('[data-src="file"]').click();
    await page.setInputFiles('[data-pick]', { name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Phone\nZed Zulu,305-555-0199\n') });
    await new Promise((r) => setTimeout(r, 3500));
    ok('the file\'s preview stays; the waiting read asked nothing more; the form free', /1 person in this file/.test(await page.locator('[data-count]').textContent()) && spx.calls.length === 1 &&
      !(await page.locator('[data-spx-go]').isDisabled()) && (await keyLeft(page)).length === 0, String(spx.calls.length));
    await o.ctx.close();
  });

  await group('measured: the Spectora pane at 375, 393 and 430, and with large text', async () => {
    const sync = syncServer(seed()), spx = spxServer([page200(C), page200(A)]);
    for (const history of [false, true]) {
      const o = await open(browser, { sync, spx, history, w: 375 }), { page } = o;
      await page.locator('[data-src="spectora"]').click();
      for (const [w, big] of [[375, false], [393, false], [430, false], [375, true]]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.evaluate((b) => { document.body.style.zoom = b ? '1.3' : ''; }, big);
        const m = await page.evaluate(() => {
          const r = (s) => document.querySelector(s).getBoundingClientRect();
          return { page: document.documentElement.scrollWidth, vw: innerWidth, key: r('[data-spx-key]').right, go: r('[data-spx-go]').right, tabs: r('.pi-src').right };
        });
        ok((history ? 'history' : 'people') + ' at ' + w + (big ? ' large' : '') + ': no sideways scroll, nothing past the edge', m.page <= m.vw && Math.max(m.key, m.go, m.tabs) <= m.vw + 0.5, JSON.stringify(m));
        if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'spx-' + (history ? 'hist' : 'people') + '-' + w + (big ? '-large' : '') + '.png'), fullPage: true });
      }
      await o.ctx.close();
    }
  });

  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
