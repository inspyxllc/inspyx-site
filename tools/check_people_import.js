// Self-checks for "Bring in your people": /people-import (2026-11-26, the web importers, contacts first).
// NOTHING REAL IS ASKED OR CHANGED HERE. The sync function is a stand-in run here (the newest row wins), and so is the
// file reader: until I2's engine (assets/import/inspyx_import.js, the phone's own reader and planContactImport) lands,
// a stand-in with its interface reads simple CSV and plans by contacts-import.js's plan (pinned to the phone's import
// by the app's web_contacts_import_test). What these check is the page: what it shows, what it lets him change, what it
// keeps in People (the same People the phone's rules give), Undo, batches, and never keeping from a People it couldn't
// read. Any other request that tries to leave the site is stopped and counted as a failure.
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

/* The stand-in reader, with the engine's interface. */
const STAND_IN = `(function () {
  var FIELDS = [{ field: 'name', label: 'Name' }, { field: 'phone', label: 'Phone' }, { field: 'email', label: 'Email' }, { field: 'company', label: 'Company' }, { field: 'note', label: 'Note' }];
  var GUESS = { name: /name/i, phone: /^phone|^tel/i, email: /mail/i, company: /company|office/i, note: /note/i };
  window.inspyxImport = { contacts: function (fileName, bytes, opts) {
    opts = opts || {};
    if (!/\\.(csv|txt)$/i.test(fileName)) return JSON.stringify({ status: 'unsupported', message: 'This kind of file can’t be read here. Export it as CSV.' });
    var lines = new TextDecoder().decode(bytes).split(/\\r?\\n/), head = lines[0].split(','), kind = opts.kind || (/agent/i.test(fileName) ? 'agents' : 'clients');
    var match = {};
    if (opts.match) match = opts.match; else FIELDS.forEach(function (f) { var i = head.findIndex(function (h) { return GUESS[f.field].test(h); }); match[f.field] = i < 0 ? null : i; });
    var columns = head.map(function (h, i) { var f = Object.keys(match).filter(function (k) { return match[k] === i; })[0] || null; return { index: i, header: h, field: f, sample: (lines[1] || '').split(',')[i] || '' }; });
    var people = [], skipped = [];
    lines.slice(1).forEach(function (l, n) {
      if (!l) return;
      var c = l.split(','), get = function (f) { return match[f] == null ? null : (c[match[f]] || null); };
      if (!get('name') || !get('name').trim()) { skipped.push({ line: n + 2, reason: 'No name on this line.' }); return; }
      people.push({ line: n + 2, role: kind === 'agents' ? 'buyer_agent' : 'client', name: get('name'), phone: get('phone'), email: get('email'), company: get('company'), note: get('note') });
    });
    var rows = (opts.existing || []).map(function (e) { return { id: e.id, updated_at: 1, deleted_at: e.deleted_at, data: { id: e.id, ownerAccountId: 'x', role: e.role, name: e.name, phone: e.phone, email: e.email, company: e.company, note: e.note, deletedAt: e.deleted_at } }; });
    var n = 0, p = window.InspyxContactsImport.plan(rows, people, 'x', 9, function () { return 'stand-in-' + (++n); }), plan = [];
    p.changes.forEach(function (ch, i) {
      var row = p.push[i].data, was = rows.filter(function (r) { return r.id === ch.id; })[0];
      var r = { role: row.role, name: row.name, phone: row.phone, email: row.email, company: row.company, note: row.note };
      plan.push(!ch.added ? { action: 'fill', id: ch.id, row: r, fills: ch.filled } : was ? { action: 'bring_back', id: ch.id, row: r, fills: ch.filled } : { action: 'new', id: null, row: r, fills: ch.filled });
    });
    for (var u = 0; u < p.unchanged; u++) plan.push({ action: 'unchanged', id: null, row: null, fills: {} });
    return JSON.stringify({ status: 'ok', header_row: 0, columns: columns, fields: FIELDS, has_name: match.name != null, people: people, skipped: skipped, kind: kind, plan: plan });
  } };
})();`;

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
  const held = new Map(), pushes = []; let seq = 0, down = false;
  for (const r of rows0) held.set(r.id, { row: r, seq: ++seq });
  const answer = (b) => {
    if (down) return null;
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
  return { answer, held, pushes, rows: () => [...held.values()].map((h) => h.row), set down(v) { down = v; } };
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, kept());
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  // ENGINE=<path to I2's built inspyx_import.js>: the real reader instead of the stand-in.
  const REAL = process.env.ENGINE ? require('fs').readFileSync(process.env.ENGINE, 'utf8') : null;
  await page.route('**/assets/import/inspyx_import.js', (route) => o.noEngine ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ status: 200, contentType: 'application/javascript', body: REAL || STAND_IN }));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url(), cors = { 'access-control-allow-origin': '*' };
    if (u.startsWith(SERVER + '/functions/v1/sync')) {
      const a = o.sync.answer(JSON.parse(req.postData() || '{}'));
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
      // What the phone's own rules give, worked out here.
      const people = [['Daniel Ortiz', '305-555-0142', null, null], ['ana reyes', '999', 'ana@x.com', 'Sunline'], ['Bob Lane', '222', 'bob@new.com', 'Lane & Co'], ['Kim Ho', null, 'kim@x.com', null], ['Zoë Park', '786', 'zoe@x.com', null]]
        .map(([name, phone, email, company]) => ({ role: 'client', name, phone, email, company, note: null }));
      let k = 0; const start = seed(), want = CI.plan(start, people, ME, 5000, () => 'want-' + (++k));
      const wantRows = [...new Map(start.concat(want.push).map((r) => [r.id, r])).values()];
      ok(label + ': People then is exactly what the phone’s own import gives (nobody twice; kept boxes kept; Bob back as his newest)',
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
