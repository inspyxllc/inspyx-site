// Self-checks for "Bring in past inspections": /history-import (2026-11-26, the web importers, piece 2). The page is
// /people-import's own script in its history mode (one code: every fix to one is the other's). NOTHING REAL IS ASKED
// OR CHANGED HERE: the sync function is a stand-in run here; the reader is the real one the page loads (I2's build of
// the phone's own, assets/import/inspyx_import.js), and the same reader run in Node gives the expected People, read
// from its plan by this check's own code. Fixtures: I2's (inspyx-mobile test/fixtures/web_import), copied to
// tools/fixtures.
// usage: node tools/serve.js <port> &   then   URL=http://localhost:<port>/ node tools/check_history_import.js
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000;
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); for (;;) { try { if (await fn()) return true; } catch (e) { /* not yet */ } if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 60)); } };
const FIX = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n));

const READER = (() => { const g = {}; new Function('self', 'window', 'globalThis', fs.readFileSync(path.join(__dirname, '../coming-soon/assets/import/inspyx_import.js'), 'utf8'))(g, g, g); return g.inspyxImport; })();
/* People before: Ana Reyes kept with her phone (the history fills her blanks); nobody else. */
function seed() {
  const data = { id: 'seed-0', ownerAccountId: ME, role: 'client', name: 'Ana Reyes', phone: '305-555-0101', email: null, company: null, note: null, lastUsedAt: 1000, createdAt: 1000, updatedAt: 1000, deletedAt: null };
  return [{ kind: 'inspector_contacts', id: data.id, updated_at: 1000, deleted_at: null, data }];
}
const PS = require('../coming-soon/assets/past-store.js');
const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'past_inspection_rules.json'), 'utf8'));
const existingOf = (rows) => rows.map((r) => ({ id: r.id, name: r.data.name, role: r.data.role, phone: r.data.phone, email: r.data.email, company: r.data.company, note: r.data.note, deleted_at: r.data.deletedAt }));
async function expected(start, name, bytes, pastRows) {
  const t = await READER.inspections(name, new Uint8Array(bytes), { existing: existingOf(start), existing_past: PS.keptForReader(pastRows || [], ME) }), r = typeof t === 'string' ? JSON.parse(t) : t;
  const byId = new Map(start.map((x) => [x.id, JSON.parse(JSON.stringify(x))])); let k = 0;
  for (const e of r.people.plan) {
    if (e.action === 'new') { const id = 'want-' + (++k); byId.set(id, { id, deleted_at: null, data: Object.assign({ id, deletedAt: null }, e.row) }); }
    else if (e.action === 'fill') Object.assign(byId.get(e.id).data, e.fills);
    else if (e.action === 'bring_back') { const x = byId.get(e.id); Object.assign(x.data, e.row, { deletedAt: null }); x.deleted_at = null; }
  }
  return { rows: [...byId.values()], r };
}
const keptOf = (rows) => { const o = {}; rows.filter((r) => r.deleted_at == null && r.data.deletedAt == null).forEach((r) => { o[r.data.name] = [r.data.role, r.data.phone, r.data.email, r.data.company, r.data.note]; }); return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]])); };
function syncServer(rows0) {
  const held = new Map(), pushes = []; let seq = 0, failKind = null;
  for (const r of rows0) held.set(r.kind + '/' + r.id, { row: r, seq: ++seq });
  const answer = (b) => {
    if (failKind && (b.push || []).some((r) => r.kind === failKind)) return null;
    const applied = [];
    if ((b.push || []).length) pushes.push(b.push.length);
    for (const r of b.push || []) { const k = r.kind + '/' + r.id, h = held.get(k); if (h && h.row.updated_at >= r.updated_at) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; } held.set(k, { row: r, seq: ++seq }); applied.push({ kind: r.kind, id: r.id, applied: true }); }
    const after = typeof b.after === 'number' ? b.after : 0;
    return { rows: [...held.values()].filter((h) => h.seq > after).sort((x, y) => x.seq - y.seq).map((h) => h.row), next: seq, more: false, skipped: [], applied };
  };
  return { answer, pushes, set failKind(k) { failKind = k; }, rows: () => [...held.values()].map((h) => h.row).filter((r) => r.kind === 'inspector_contacts'), past: () => [...held.values()].map((h) => h.row).filter((r) => r.kind === 'past_inspections') };
}
async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || 1280, height: 900 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, kept());
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const errs = [], away = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  if (o.noEngine) await page.route('**/assets/import/inspyx_import.js', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (u.startsWith(SERVER + '/functions/v1/sync')) {
      const a = o.sync.answer(JSON.parse(req.postData() || '{}'));
      if (a === null) return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a) });
    }
    away.push(u); return route.abort();
  });
  await page.goto(url + 'history-import', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-pick]', { state: 'attached' });
  return { ctx, page, errs, away };
}
const pick = (page, name, buf) => page.setInputFiles('[data-pick]', { name, mimeType: 'text/csv', buffer: buf });
const said = async (page) => (await page.locator('[data-say]').textContent()).trim();

(async () => {
  const browser = await engine.launch();
  const SHOTS = process.env.SHOTS;
  // One inspection of the file is on his list already (kept by an earlier import): the reader's own row for it.
  const first = await expected(seed(), 'isn_inspections.csv', FIX('isn_inspections.csv'), []);
  const PAST0 = PS.newRows([first.r.inspections.find((x) => x.new)], ME, 1500, () => 'kept-before', 'import-before').push;
  ok('the rows this page writes follow the past-inspection rules the phone and the server share (I2’s fixture, every case)',
    RULES.rows.every((r) => PS.problem(r.row) === (r.want === undefined ? null : r.want)), RULES.rows.filter((r) => PS.problem(r.row) !== (r.want === undefined ? null : r.want)).map((r) => r.name).join('; '));
  for (const [label, w] of [['wide', 1280], ['phone', 390]]) {
    await group('read, check, keep, undo: ' + label, async () => {
      const sync = syncServer(seed().concat(PAST0)), o = await open(browser, { w, sync }), { page } = o;
      ok(label + ': the page says what it is for, with its how-to in three steps', await page.locator('.pi-lede').isVisible() && (await page.locator('.pi-how-step').count()) === 3 &&
        (await page.locator('[data-kind]').count()) === 0);
      await pick(page, 'isn_inspections.csv', FIX('isn_inspections.csv'));
      await until(async () => await page.locator('[data-read]').isVisible());
      const want = await expected(seed(), 'isn_inspections.csv', FIX('isn_inspections.csv'), PAST0);
      ok(label + ': it reads the history: how many inspections, each with its day, address, client and fee', (await page.locator('[data-count]').textContent()) === want.r.inspections.length + ' inspections in this file' &&
        (await page.locator('[data-people] tr').count()) === want.r.inspections.length && (await page.locator('[data-people] tr').first().locator('.pi-n').textContent()) === want.r.inspections[0].address &&
        (await page.locator('[data-people] tr').first().locator('.pi-f').textContent()) === '$425', await page.locator('[data-people] tr').first().textContent());
      ok(label + ': its columns are known: no “pick a column” note', await page.locator('[data-noname]').isHidden());
      ok(label + ': how many are new to keep, and how many are on his list already', (await page.locator('[data-keep]').getAttribute('data-keep')) === String(want.r.new_count) &&
        want.r.already_count === 1 && (await page.locator('[data-already]').textContent()) === '1 on your list already');
      ok(label + ': the lines left out say why (the same inspection twice, no date, address or client)', (await page.locator('[data-skipped-list] li').allTextContents()).some((t) => /The same inspection as line 2\./.test(t)));
      const n = want.r.people.plan.filter((e) => e.action !== 'unchanged').length;
      ok(label + ': the button says what comes in', (await page.locator('[data-go]').textContent()) === 'Keep ' + want.r.new_count + ' inspections and bring ' + n + ' people in', await page.locator('[data-go]').textContent());
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hi-read-' + label + '.png'), fullPage: true });
      await page.locator('[data-go]').click();
      await until(async () => await page.locator('[data-done]').isVisible(), 8000);
      const kept = sync.past().filter((r) => r.data.importId !== 'import-before');
      const wantNew = want.r.inspections.filter((x) => x.new);
      ok(label + ': the new inspections kept, each once: rows the rules take, all one import, with the reader’s own values', kept.length === want.r.new_count &&
        kept.every((r) => PS.problem(r.data) === null && r.data.ownerAccountId === ME && r.data.removedAt === null && r.data.deletedAt === null) &&
        new Set(kept.map((r) => r.data.importId)).size === 1 &&
        wantNew.every((x) => kept.some((r) => ['date', 'address', 'client', 'reference', 'feeCents'].every((k) => r.data[k] === x.row[k]))) &&
        sync.past().filter((r) => r.data.importId === 'import-before').length === 1, JSON.stringify(kept.map((r) => r.data.address)));
      ok(label + ': People then is exactly the reader’s plan for the people the history names (Ana’s blanks filled, never her phone)', keptOf(sync.rows()) === keptOf(want.rows), keptOf(sync.rows()));
      ok(label + ': it says what was kept', (await page.locator('[data-done-t]').textContent()).indexOf(want.r.new_count + ' inspections kept on your list.') === 0, await page.locator('[data-done-t]').textContent());
      await page.locator('[data-undo]').click();
      ok(label + ': Undo: this import’s inspections deleted (the earlier one kept), People as it was', await until(async () => (await said(page)) === 'Undone: People is as it was.', 8000) &&
        keptOf(sync.rows()) === keptOf(seed()) && sync.past().filter((r) => r.data.importId !== 'import-before').every((r) => r.data.deletedAt !== null && r.deleted_at !== null) &&
        sync.past().filter((r) => r.data.importId === 'import-before').every((r) => r.data.deletedAt === null), await said(page));
      ok(label + ': no errors, nothing else leaves the site' + (w < 700 ? ', nothing off the side' : ''), o.errs.length === 0 && o.away.length === 0 &&
        (w >= 700 || await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), JSON.stringify([o.errs, o.away]));
      await o.ctx.close();
    });
  }
  await group('a second file’s Undo never touches the first import; the people failing after the inspections are kept', async () => {
    let sync = syncServer(seed()), o = await open(browser, { sync });
    await pick(o.page, 'isn_inspections.csv', FIX('isn_inspections.csv'));
    await until(async () => await o.page.locator('[data-read]').isVisible());
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 8000);
    const firstImport = sync.past()[0].data.importId;
    // The same inspections with another buyer's agent: nothing new to keep, one new person.
    const again = FIX('isn_inspections.csv').toString('utf8').replace(/Bob Sells/g, 'Dana Newagent');
    await pick(o.page, 'again.csv', Buffer.from(again));
    await until(async () => await o.page.locator('[data-read]').isVisible());
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 8000);
    ok('a second file that keeps no inspection doesn’t say the first one’s were kept', (await o.page.locator('[data-done-t]').textContent()).indexOf('kept on your list') < 0, await o.page.locator('[data-done-t]').textContent());
    await o.page.locator('[data-undo]').click();
    await until(async () => (await said(o.page)) === 'Undone: People is as it was.', 8000);
    ok('its Undo leaves the first import’s inspections kept', sync.past().filter((r) => r.data.importId === firstImport).every((r) => r.data.deletedAt === null) && sync.past().length > 0);
    await o.ctx.close();

    sync = syncServer(seed()); o = await open(browser, { sync });
    await pick(o.page, 'isn_inspections.csv', FIX('isn_inspections.csv'));
    await until(async () => await o.page.locator('[data-read]').isVisible());
    sync.failKind = 'inspector_contacts';
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 8000);
    ok('the inspections kept, then the people fail: it says what was kept, with Undo', /inspections kept on your list\. Their people didn’t go through/.test(await o.page.locator('[data-done-t]').textContent()) &&
      await o.page.locator('[data-undo]').isVisible(), await o.page.locator('[data-done-t]').textContent());
    sync.failKind = null;
    await o.page.locator('[data-undo]').click();
    ok('and Undo takes those inspections back', await until(async () => (await said(o.page)) === 'Undone: People is as it was.', 8000) && sync.past().every((r) => r.data.deletedAt !== null));
    await o.ctx.close();
  });

  await group('a history with no column known yet; no reader; the links', async () => {
    let o = await open(browser, { sync: syncServer(seed()) });
    await pick(o.page, 'history_no_known_header.csv', FIX('history_no_known_header.csv'));
    await until(async () => await o.page.locator('[data-read]').isVisible());
    ok('no date, address or client column known: it asks for one', await o.page.locator('[data-noname]').isVisible());
    await o.ctx.close();
    o = await open(browser, { sync: syncServer(seed()), noEngine: true });
    await pick(o.page, 'isn_inspections.csv', FIX('isn_inspections.csv'));
    ok('no reader: it says to reload', await until(async () => (await said(o.page)) === 'This page couldn’t start its file reader. Reload the page.'));
    await o.page.goto(url + 'people', { waitUntil: 'domcontentloaded' });
    ok('People links here', (await o.page.locator('a[href="/history-import"]').count()) === 1);
    await o.page.goto(url + 'people-import', { waitUntil: 'domcontentloaded' });
    ok('Bring in your people links here', (await o.page.locator('a[href="/history-import"]').count()) === 1);
    await o.ctx.close();
  });
  for (const w of [375, 393, 430]) for (const big of [false, true]) {
    await group('measured at ' + w + (big ? ', large text' : ''), async () => {
      const o = await open(browser, { w, sync: syncServer(seed()) });
      if (big) await o.page.evaluate(() => { document.documentElement.style.zoom = '1.35'; });
      await pick(o.page, 'isn_inspections.csv', FIX('isn_inspections.csv'));
      await until(async () => await o.page.locator('[data-read]').isVisible());
      const fit = await o.page.evaluate(() => ({ side: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        cut: [].filter.call(document.querySelectorAll('.pi-lede, .pi-how-step, .pi-btn, .pi-pill, [data-count], [data-people-n]'), (e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => e.className) }));
      ok(w + (big ? ' large' : '') + ': nothing off the side, nothing cut off', fit.side && !fit.cut.length, JSON.stringify(fit));
      if (SHOTS && w === 393 && big) await o.page.screenshot({ path: path.join(SHOTS, 'hi-393-large.png'), fullPage: true });
      await o.ctx.close();
    });
  }
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
