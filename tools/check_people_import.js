// Self-checks for "Bring in your people": /people-import (2026-11-26, the web importers, contacts first).
// NOTHING REAL IS ASKED OR CHANGED HERE. The sync function is a stand-in run here (the newest row wins). The file
// reader is the real one the page loads (assets/import/inspyx_import.js, I2's build of the phone's own reader and
// planContactImport). What these check is the page: what it shows, what it lets him change, that what it keeps in
// People is exactly the reader's plan (the same reader run here in Node gives the expected People), Undo, batches, and
// never keeping from a People it couldn't read. Any other request that tries to leave the site is stopped and counted
// as a failure.
// usage: node tools/serve.js <port> &   then   URL=http://localhost:<port>/ node tools/check_people_import.js
const path = require('path');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const CI = require('../coming-soon/assets/contacts-import.js');

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); for (;;) { try { if (await fn()) return true; } catch (e) { /* not yet */ } if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 60)); } };

/* The same reader the page loads, run here in Node: what it plans is what People must hold after. */
const ENGINE = (() => { const g = {}; const fn = new Function('self', 'window', 'globalThis', require('fs').readFileSync(path.join(__dirname, '../coming-soon/assets/import/inspyx_import.js'), 'utf8'));
  fn(g, g, g); return g.inspyxImport || global.inspyxImport; })();
const existingOf = (rows) => rows.map((r) => ({ id: r.id, name: r.data.name, role: r.data.role, phone: r.data.phone, email: r.data.email, company: r.data.company, note: r.data.note,
  deleted_at: r.deleted_at != null ? r.deleted_at : (r.data.deletedAt == null ? null : r.data.deletedAt) }));
async function expected(start, name, text, opts) {
  const t = await ENGINE.contacts(name, new TextEncoder().encode(text), Object.assign({ existing: existingOf(start) }, opts || {}));
  const r = typeof t === 'string' ? JSON.parse(t) : t;
  // The plan's meaning, read here on its own (not by the page's code): new = its row; fill = only the boxes it lists;
  // bring_back = its whole row, deleted no more; unchanged = nothing.
  const byId = new Map(start.map((x) => [x.id, JSON.parse(JSON.stringify(x))]));
  let k = 0;
  for (const e of r.plan) {
    if (e.action === 'new') { const id = 'want-' + (++k); byId.set(id, { id, deleted_at: null, data: Object.assign({ id, deletedAt: null }, e.row) }); }
    else if (e.action === 'fill') { const x = byId.get(e.id); Object.assign(x.data, e.fills); }
    else if (e.action === 'bring_back') { const x = byId.get(e.id); Object.assign(x.data, e.row, { deletedAt: null }); x.deleted_at = null; }
  }
  return [...byId.values()];
}

/* People before: Ana kept, Bob deleted twice (the later keeps his email), Kim kept. */
function seed() {
  const rows = []; let t = 1000;
  [['buyer_agent', 'Ana Reyes', { phone: '305-555-0101' }], ['client', 'Bob Lane', { phone: '111' }, true], ['client', 'Bob Lane', { email: 'bob@old.com' }, true], ['client', 'Kim Ho', { email: 'kim@x.com' }]]
    .forEach(([role, name, boxes, del], i) => {
      const data = Object.assign({ id: 'seed-' + i, ownerAccountId: ME, role, name, phone: null, email: null, company: null, note: null, lastUsedAt: t, createdAt: t, updatedAt: t, deletedAt: null }, boxes);
      t += 10; if (del) { data.deletedAt = t; data.updatedAt = t; t += 10; }
      rows.push({ kind: 'inspector_contacts', id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt, data });
    });
  return rows;
}
const CSV = 'Full Name,Mobile,E-mail,Company\nDaniel Ortiz,305-555-0142,,\nana reyes,999,ana@x.com,Sunline\n  ,1,,\nBob Lane,222,bob@new.com,Lane & Co\nKim Ho,,kim@x.com,\nZoë Park,786,zoe@x.com,\n';
const keptOf = (rows) => {
  const o = {};
  rows.filter((r) => r.deleted_at == null && r.data.deletedAt == null).forEach((r) => { o[r.data.name] = [r.data.role, r.data.phone, r.data.email, r.data.company, r.data.note]; });
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
};

function syncServer(rows0) {
  const held = new Map(), pushes = []; let seq = 0, down = false, failAfter = null, before = null, pullGate = null;
  for (const r of rows0) held.set(r.id, { row: r, seq: ++seq });
  const answer = async (b) => {
    if (down) return null;
    if ((b.push || []).length && failAfter !== null && pushes.length >= failAfter) return null;
    if (!(b.push || []).length && pullGate) await pullGate;
    if ((b.push || []).length && before) { const f = before; before = null; f(); }
    const applied = [];
    if ((b.push || []).length) pushes.push(b.push.length);
    for (const r of b.push || []) {
      const h = held.get(r.id);
      if (h && h.row.updated_at >= r.updated_at) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
      held.set(r.id, { row: r, seq: ++seq }); applied.push({ kind: r.kind, id: r.id, applied: true });
    }
    const after = typeof b.after === 'number' ? b.after : 0;
    const rows = [...held.values()].filter((h) => h.seq > after).sort((x, y) => x.seq - y.seq).map((h) => h.row);
    return { rows, next: seq, more: false, skipped: [], applied };
  };
  return { answer, held, pushes, rows: () => [...held.values()].map((h) => h.row), set down(v) { down = v; }, set failAfter(v) { failAfter = v; }, set before(f) { before = f; }, set pullGate(p) { pullGate = p; },
    bump(id) { const h = held.get(id); const r = JSON.parse(JSON.stringify(h.row)); r.updated_at = r.data.updatedAt = Date.now() + 600000; r.data.note = 'Changed on the phone'; held.set(id, { row: r, seq: ++seq }); } };
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, kept());
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  if (o.noEngine) await page.route('**/assets/import/inspyx_import.js', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url(), cors = { 'access-control-allow-origin': '*' };
    if (u.startsWith(SERVER + '/functions/v1/sync')) {
      const a = await o.sync.answer(JSON.parse(req.postData() || '{}'));
      if (a === null) return route.fulfill({ status: 503, contentType: 'application/json', headers: cors, body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(a) });
    }
    away.push(u); return route.abort();
  });
  await page.goto(url + 'people-import', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-pick]', { state: 'attached' });
  return { ctx, page, errs, away };
}
const pick = (page, name, text) => page.setInputFiles('[data-pick]', { name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
const said = async (page) => (await page.locator('[data-say]').textContent()).trim();

(async () => {
  const browser = await engine.launch();
  const SHOTS = process.env.SHOTS;

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('read, check, bring in, undo: ' + label, async () => {
      const sync = syncServer(seed());
      const o = await open(browser, { w, sync });
      const { page } = o;
      ok(label + ': the page says what it is for in one line, with its how-to in three steps, a tip by the finger at each',
        await page.locator('.pi-lede').isVisible() && (await page.locator('.pi-how-step').count()) === 3 && (await page.locator('.pi-how-tip').count()) === 3);
      await pick(page, 'clients.csv', CSV);
      await until(async () => await page.locator('[data-read]').isVisible());
      ok(label + ': it reads the file: how many people, each column with its first value and what it holds', (await page.locator('[data-count]').textContent()) === '5 people in this file' &&
        (await page.locator('[data-cols] tr').count()) === 4 && (await page.locator('[data-col="0"]').inputValue()) !== '');
      ok(label + ': the line with no name is left out, and says why', (await page.locator('[data-skipped-n]').textContent()) === '1 line left out' &&
        (await page.locator('[data-skipped-list] li').first().textContent()) === 'Line 4: No name on this line.');
      // Mobile isn't guessed: he says it holds the phone.
      // Mobile: he says it holds the phone (the reader may have guessed it already).
      if ((await page.locator('[data-col="1"]').inputValue()) === '') await page.locator('[data-col="1"]').selectOption({ label: 'Phone' });
      await until(async () => (await page.locator('[data-people] tr').first().locator('.pi-p').textContent()) === '305-555-0142');
      const pills = await page.locator('[data-sum] .pi-pill').allTextContents();
      ok(label + ': he says what a column holds, and it reads the file again: what each person will do', JSON.stringify(pills) ===
        JSON.stringify(['2 new', '1 you have, with boxes to fill', '1 you’d deleted, brought back', '1 you have already, nothing new']), JSON.stringify(pills));
      ok(label + ': the button says how many come in', (await page.locator('[data-go]').textContent()) === 'Bring in 4 people');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'pi-read-' + label + '.png'), fullPage: true });
      await page.locator('[data-go]').click();
      await until(async () => await page.locator('[data-done]').isVisible(), 8000);
      // What the reader plans for this file and these People (its guess of the columns: Mobile is the phone).
      const wantRows = await expected(seed(), 'clients.csv', CSV);
      ok(label + ': People then is exactly the reader’s plan (the phone’s own rules: nobody twice; kept boxes kept; Bob back as his newest)',
        keptOf(sync.rows()) === keptOf(wantRows), 'GOT ' + keptOf(sync.rows()) + ' WANT ' + keptOf(wantRows));
      ok(label + ': it says so, with Undo', (await page.locator('[data-done-t]').textContent()) === 'Done: 4 in People. They’ll be on your phone within a few minutes.' && await page.locator('[data-undo]').isVisible(), await page.locator('[data-done-t]').textContent());
      await page.locator('[data-undo]').click();
      await until(async () => (await said(page)) === 'Undone: People is as it was.', 8000);
      ok(label + ': Undo: People is as it was', keptOf(sync.rows()) === keptOf(seed()), keptOf(sync.rows()));
      ok(label + ': no errors, nothing else leaves the site' + (w === PHONE ? ', nothing off the side' : ''), o.errs.length === 0 && o.away.length === 0 &&
        (w !== PHONE || await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), JSON.stringify([o.errs, o.away]));
      await o.ctx.close();
    });
  }

  await group('agents; 200 at a time; People unreadable; too big; a file it can’t read; no reader', async () => {
    let sync = syncServer(seed()), o = await open(browser, { sync });
    const many = 'Name,Phone\n' + Array.from({ length: 450 }, (_, i) => 'Agent ' + i + ',555-' + i).join('\n') + '\n';
    await pick(o.page, 'agents.csv', many);
    await until(async () => await o.page.locator('[data-read]').isVisible());
    ok('an agents file is read as agents (its name says so); the switch says it, no role column', (await o.page.locator('[data-kind="agents"]').getAttribute('aria-checked')) === 'true' &&
      (await o.page.locator('.pi-people thead th').count()) === 4);
    ok('a long file: the first 50 shown, and it says so', (await o.page.locator('[data-people] tr').count()) === 50 && (await o.page.locator('[data-more]').textContent()) === 'Showing the first 50 of 450.');
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    ok('450 people go 200 at a time (the server’s limit), all kept', JSON.stringify(sync.pushes) === '[200,200,50]' &&
      sync.rows().filter((r) => /^Agent /.test(r.data.name)).length === 450, JSON.stringify(sync.pushes));
    await o.ctx.close();

    sync = syncServer(seed()); o = await open(browser, { sync });
    await pick(o.page, 'clients.csv', CSV);
    await until(async () => await o.page.locator('[data-read]').isVisible());
    sync.down = true;
    await o.page.locator('[data-go]').click();
    ok('People can’t be read at Bring in: it says so, and keeps nothing', await until(async () => (await said(o.page)).indexOf('People couldn’t be read') === 0) && sync.pushes.length === 0);
    sync.down = false;
    await pick(o.page, 'big.csv', 'Name\n' + 'x'.repeat(10 * 1024 * 1024 + 10));
    ok('a file over 10 MB: it says so, and reads nothing', await until(async () => (await said(o.page)).indexOf('This file is over 10 MB') === 0) && await o.page.locator('[data-read]').isHidden());
    await pick(o.page, 'people.pdf', '%PDF');
    ok('a file the reader can’t read: its own words, and nothing to bring in', await until(async () => (await o.page.locator('[data-say]').getAttribute('data-said')) === 'refused' &&
      (await said(o.page)).length > 10) && await o.page.locator('[data-read]').isHidden(), await said(o.page));
    await o.ctx.close();

    o = await open(browser, { sync: syncServer(seed()), noEngine: true });
    await pick(o.page, 'clients.csv', CSV);
    ok('no reader: it says to reload, and nothing happens', await until(async () => (await said(o.page)) === 'This page couldn’t start its file reader. Reload the page.'));
    await o.ctx.close();
  });

  const LONGCSV = 'Full Name,Phone,E-mail,Company\nMaria-Fernanda de los Ángeles Villalobos-Hernández,305-555-0101,maria.fernanda.villalobos.hernandez@verylongbrokeragename.example.com,Smith & Daughters Luxury Coastal Realty Group International\n';
  for (const w of [375, 393, 430]) for (const big of [false, true]) {
    await group('measured at ' + w + (big ? ', large text' : ''), async () => {
      const o = await open(browser, { w, sync: syncServer(seed()) });
      if (big) await o.page.evaluate(() => { document.documentElement.style.zoom = '1.35'; });
      await pick(o.page, 'clients.csv', LONGCSV);
      await until(async () => await o.page.locator('[data-read]').isVisible());
      const fit = await o.page.evaluate(() => ({ side: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        cut: [].filter.call(document.querySelectorAll('.pi-lede, .pi-how-step, .pi-btn, .pi-pill, .pi-drop-t, [data-count]'), (e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => e.className) }));
      ok(w + (big ? ' large' : '') + ': nothing off the side, nothing cut off', fit.side && !fit.cut.length, JSON.stringify(fit));
      const row = await o.page.evaluate(() => {
        const tr = document.querySelector('[data-people] tr'), e = tr.querySelector('.pi-e'), n = tr.querySelector('.pi-n'), cs = getComputedStyle(e);
        return { stacked: getComputedStyle(tr).display === 'grid', oneLine: cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis', tip: e.title,
          nameWraps: n.getBoundingClientRect().width <= tr.getBoundingClientRect().width, noRole: document.querySelectorAll('.pi-people thead th').length === 4,
          phoneWhole: tr.querySelector('.pi-p').scrollWidth <= tr.querySelector('.pi-p').clientWidth + 1, emailUsesRow: e.getBoundingClientRect().width >= tr.getBoundingClientRect().width * 0.8 };
      });
      ok(w + (big ? ' large' : '') + ': each person stacks, the email on one line ending in “…” (never broken mid-word; whole in its tip), no role column',
        row.stacked && row.oneLine && row.tip.indexOf('@verylongbrokeragename') > 0 && row.nameWraps && row.noRole && row.phoneWhole && row.emailUsesRow, JSON.stringify(row));
      const cols = await o.page.evaluate(() => [].map.call(document.querySelectorAll('[data-cols] tr'), (tr) => {
        const r = tr.getBoundingClientRect(), sel = tr.querySelector('select').getBoundingClientRect(), smp = tr.querySelector('.pi-s'), cs = getComputedStyle(smp);
        return sel.right <= r.right + 1 && (cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis') && tr.querySelector('.pi-h').getBoundingClientRect().height < 80;
      }));
      ok(w + (big ? ' large' : '') + ': each column a card: its picker inside it, its first value on one line (never letter by letter)', cols.length === 4 && cols.every(Boolean), JSON.stringify(cols));
      if (SHOTS && w === 393) await o.page.screenshot({ path: path.join(SHOTS, 'pi-393' + (big ? '-large' : '') + '.png'), fullPage: true });
      await o.ctx.close();
    });
  }

  await group('a column set to “Not used” stays so; a broken batch stays undoable; an Undo row kept out', async () => {
    let sync = syncServer(seed()), o = await open(browser, { sync });
    await pick(o.page, 'clients.csv', 'Name,Phone,Email\nPat Moore,555-0101,pat@x.com\n');
    await until(async () => await o.page.locator('[data-read]').isVisible());
    await o.page.locator('[data-col="1"]').selectOption('');
    await until(async () => (await o.page.locator('[data-people] tr').first().locator('.pi-p').textContent()) === '');
    await o.page.locator('[data-col="2"]').selectOption('');
    await until(async () => (await o.page.locator('[data-people] tr').first().locator('.pi-e').textContent()) === '');
    ok('Phone set to Not used, then Email: Phone stays unused (never guessed back)', (await o.page.locator('[data-col="1"]').inputValue()) === '' &&
      (await o.page.locator('[data-people] tr').first().locator('.pi-p').textContent()) === '');
    await o.ctx.close();

    // The same two changes made before the first is read again (People still being read): Phone still stays unused.
    sync = syncServer(seed()); o = await open(browser, { sync });
    await pick(o.page, 'clients.csv', 'Name,Phone,Email\nPat Moore,555-0101,pat@x.com\n');
    await until(async () => await o.page.locator('[data-read]').isVisible());
    let open3; sync.pullGate = new Promise((r) => { open3 = r; });
    await o.page.locator('[data-col="1"]').selectOption('');
    await o.page.locator('[data-col="2"]').selectOption('');
    sync.pullGate = null; open3();
    await until(async () => (await o.page.locator('[data-people] tr').first().locator('.pi-e').textContent()) === '');
    ok('two changes before the first is read again: both kept (Phone not guessed back)', (await o.page.locator('[data-people] tr').first().locator('.pi-p').textContent()) === '' &&
      (await o.page.locator('[data-col="1"]').inputValue()) === '');
    await o.ctx.close();

    // Another file picked while People is still being read for it: the last file's preview is gone, nothing to tap.
    sync = syncServer(seed()); o = await open(browser, { sync });
    await pick(o.page, 'one.csv', 'Name,Email\nPat Moore,pat@x.com\n');
    await until(async () => (await o.page.locator('[data-count]').textContent()) === '1 person in this file');
    let open2; sync.pullGate = new Promise((r) => { open2 = r; });
    await pick(o.page, 'others.csv', 'Name,Email\n' + Array.from({ length: 100 }, (_, i) => 'Other ' + i + ',o' + i + '@x.com').join('\n') + '\n');
    await o.page.waitForTimeout(300);
    ok('another file: the last one’s preview and its Bring in are gone until this one is read', await o.page.locator('[data-read]').isHidden() &&
      sync.pushes.length === 0);
    sync.pullGate = null; open2();
    await until(async () => (await o.page.locator('[data-count]').textContent()) === '100 people in this file');
    ok('then it shows this file, and only then offers to bring it in', await o.page.locator('[data-read]').isVisible() && (await o.page.locator('[data-go]').textContent()) === 'Bring in 100 people',
      JSON.stringify([await o.page.locator('[data-read]').isVisible(), await o.page.locator('[data-count]').textContent(), await o.page.locator('[data-go]').textContent(), await said(o.page)]));
    await o.ctx.close();

    sync = syncServer(seed()); o = await open(browser, { sync });
    const many = 'Name,Phone\n' + Array.from({ length: 450 }, (_, i) => 'Agent ' + i + ',555-' + i).join('\n') + '\n';
    await pick(o.page, 'agents.csv', many);
    await until(async () => await o.page.locator('[data-read]').isVisible());
    sync.failAfter = 1;
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    ok('the connection breaks after the first 200: it says so, and Undo stays for those 200', (await o.page.locator('[data-done-t]').textContent()).indexOf('200 of 450 are in People; then the connection broke.') === 0 &&
      await o.page.locator('[data-undo]').isVisible(), await o.page.locator('[data-done-t]').textContent());
    sync.failAfter = null;
    await o.page.locator('[data-undo]').click();
    ok('Undo takes those 200 back', await until(async () => (await said(o.page)) === 'Undone: People is as it was.', 10000) && keptOf(sync.rows()) === keptOf(seed()));
    await o.ctx.close();

    sync = syncServer(seed()); o = await open(browser, { sync });
    await pick(o.page, 'clients.csv', CSV);
    await until(async () => await o.page.locator('[data-read]').isVisible());
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 8000);
    // The phone changes a person the import added, just as Undo is on its way.
    const added = sync.rows().find((r) => r.data.name === 'Daniel Ortiz');
    sync.before = () => sync.bump(added.id);
    await o.page.locator('[data-undo]').click();
    ok('an Undo row the server keeps out: it says so, and Undo stays for it', await until(async () => (await said(o.page)) === '1 couldn’t be taken back yet (changed on your phone meanwhile). Tap Undo again.', 8000) &&
      await o.page.locator('[data-undo]').isVisible(), await said(o.page));
    await o.page.locator('[data-undo]').click();
    ok('Undo again: done', await until(async () => (await said(o.page)) === 'Undone: People is as it was.', 8000));
    await o.ctx.close();
  });

  await group('two files picked fast: the last one picked counts', async () => {
    const o = await open(browser, { sync: syncServer(seed()) });
    // The first file's reading finishes late (after the second's).
    await o.page.evaluate(() => {
      const orig = FileReader.prototype.readAsArrayBuffer; let n = 0;
      FileReader.prototype.readAsArrayBuffer = function (b) {
        const r = this, k = n++;
        if (k === 0) { const h = () => r.onload; const t = setInterval(() => {}, 1000); r.addEventListener('load', function stop(e) { if (!r.__late) { e.stopImmediatePropagation(); r.__late = true; const f = h(); setTimeout(() => { clearInterval(t); f && f.call(r); }, 700); } }, { capture: true, once: true }); const real = r.onload; Object.defineProperty(r, 'onload', { configurable: true, get: () => real2, set: (v) => { real2 = v; } }); let real2 = real; }
        return orig.call(this, b);
      };
    });
    await pick(o.page, 'first.csv', 'Name,Email\nFirst Person,first@x.com\n');
    await pick(o.page, 'second.csv', 'Name,Email\nSecond Person,second@x.com\nThird Person,third@x.com\n');
    await o.page.waitForTimeout(1500);
    ok('the first file, finishing late, doesn’t replace the second', (await o.page.locator('[data-count]').textContent()) === '2 people in this file' &&
      (await o.page.locator('[data-people] tr').first().locator('.pi-n').textContent()) === 'Second Person', await o.page.locator('[data-count]').textContent());
    await o.ctx.close();
  });

  await group('switching Clients / Agents keeps his column choices', async () => {
    const o = await open(browser, { sync: syncServer(seed()) });
    await pick(o.page, 'clients.csv', 'Name,Phone,Email\nPat Moore,555-0101,pat@x.com\n');
    await until(async () => await o.page.locator('[data-read]').isVisible());
    await o.page.locator('[data-col="1"]').selectOption('');
    await until(async () => (await o.page.locator('[data-people] tr').first().locator('.pi-p').textContent()) === '');
    await o.page.locator('[data-kind="agents"]').click();
    await until(async () => (await o.page.locator('[data-kind="agents"]').getAttribute('aria-checked')) === 'true');
    ok('Agents: Phone, which he set to Not used, stays so', (await o.page.locator('[data-col="1"]').inputValue()) === '' &&
      (await o.page.locator('[data-people] tr').first().locator('.pi-p').textContent()) === '');
    await o.ctx.close();
  });

  await group('a names-only file: it asks which column holds the names', async () => {
    const o = await open(browser, { sync: syncServer(seed()) });
    await pick(o.page, 'names.csv', 'Name\nPat Moore\nRay Diaz\n');
    await until(async () => await o.page.locator('[data-read]').isVisible());
    ok('no column read as names yet (the phone’s own rule): it asks for one, and offers nothing to bring in', await o.page.locator('[data-noname]').isVisible() &&
      (await o.page.locator('[data-go]').textContent()) === 'Nothing new to bring in' && await o.page.locator('[data-go]').isDisabled());
    await o.page.locator('[data-col="0"]').selectOption({ label: 'Name' });
    ok('he picks it: both people read', await until(async () => (await o.page.locator('[data-count]').textContent()) === '2 people in this file') && !(await o.page.locator('[data-noname]').isVisible()),
      await o.page.locator('[data-count]').textContent());
    await o.ctx.close();
  });

  await group('People links here', async () => {
    const o = await open(browser, { sync: syncServer(seed()) });
    await o.page.goto(url + 'people', { waitUntil: 'domcontentloaded' });
    ok('People has “Bring in your people from another app”', (await o.page.locator('a[href="/people-import"]').count()) === 1);
    await o.ctx.close();
  });

  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
