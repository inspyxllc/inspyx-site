// Self-checks for "Bring your business to Inspyx" (/bring-business, 2026-11-27, the web half of the app's screen).
// NOTHING REAL IS ASKED OR CHANGED HERE: spectora-import and sync are stand-ins run here; the reader is the real one
// the page loads (assets/import/inspyx_import.js, the app's own Dart). What these check is the page:
//   - the one box reads a paste with the app's rules, in the app's words; ISN waits for the app; an autofilled box is
//     refused and nothing is sent; the key goes only to spectora-import, and the box is emptied after;
//   - ONE preview of everything found (people, past inspections, prices said to come later), and NOTHING is kept before
//     Bring in;
//   - Bring in keeps it all, nobody twice (the people the past inspections name are planned against the clients and
//     agents just planned), and Undo puts People and the past inspections back exactly as they were;
//   - a file (said to hold clients, agents or past inspections) goes the same way.
// usage: node tools/serve.js <port> &   then   URL=http://localhost:<port>/ SHOTS=<dir> node tools/check_bring_business.js
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const KEY = 'spk_test_9f8e7d6c5b4a39281706aa';
const ISN = 'https://inspectionsupport.com/acme/access-keys\nAKIAEXAMPLEKEY1234\ns3cretSECRETs3cretSECRET';
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const until = async (fn, ms) => { const end = Date.now() + (ms || 8000); for (;;) { try { if (await fn()) return true; } catch (e) { /* not yet */ } if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 60)); } };
/* Spectora's services (made up): two kept, one hidden in Spectora (left off, as the app does), one with no price. */
const svc = (id, a) => ({ id, type: 'service', attributes: a });
const SERVICES = [svc('s1', { name: 'Home Inspection', amount: 350, duration: 2.5, hidden: false }), svc('s2', { name: 'Radon', amount: '150.0', hidden: false }),
  svc('s3', { name: 'Old Mold', amount: 99, hidden: true }), svc('s4', { name: 'Free consult' })];
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'spectora_records.json'), 'utf8'));
const READER = (() => { const g = {}; new Function('self', 'window', 'globalThis', fs.readFileSync(path.join(__dirname, '../coming-soon/assets/import/inspyx_import.js'), 'utf8'))(g, g, g); return g.inspyxImport; })();
const J = (t) => (typeof t === 'string' ? JSON.parse(t) : t);

function person(id, name, role, extra) {
  const d = Object.assign({ id, ownerAccountId: ME, role: role || 'client', name, phone: null, email: null, company: null, note: null, lastUsedAt: 1000, createdAt: 1000, updatedAt: 1000, deletedAt: null }, extra || {});
  return { kind: 'inspector_contacts', id, updated_at: 1000, deleted_at: null, data: d };
}
const seed = () => [person('seed-0', 'Ana Reyes', 'client', { phone: '305-555-0101' })];

function syncServer(rows0) {
  const held = new Map(); let seq = 0; const pushes = [];
  for (const r of rows0) held.set(r.kind + '/' + r.id, { row: r, seq: ++seq });
  const answer = (b) => {
    const applied = [];
    if ((b.push || []).length) pushes.push(b.push.length);
    for (const r of b.push || []) { const k = r.kind + '/' + r.id, h = held.get(k); if ((h && h.row.updated_at >= r.updated_at) || (srv.refuse && srv.refuse(r))) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; } held.set(k, { row: r, seq: ++seq }); applied.push({ kind: r.kind, id: r.id, applied: true }); }
    const after = typeof b.after === 'number' ? b.after : 0;
    return { rows: [...held.values()].filter((h) => h.seq > after).sort((x, y) => x.seq - y.seq).map((h) => h.row), next: seq, more: false, skipped: [], applied };
  };
  const all = () => [...held.values()].map((h) => h.row);
  const alive = (r) => r.deleted_at == null && r.data.deletedAt == null;
  // put: another device's change, newer than anything held. loseNext: the next push is kept but its answer is lost.
  // delay: each push answered that much later.
  const put = (r) => held.set(r.kind + '/' + r.id, { row: r, seq: ++seq });
  const srv = { answer, pushes, put, loseNext: false, delay: 0, people: () => all().filter((r) => r.kind === 'inspector_contacts'), past: () => all().filter((r) => r.kind === 'past_inspections' && alive(r)),
    prices: () => all().filter((r) => r.kind === 'price_services' && alive(r)), alive, refuse: null };
  return srv;
}
/* The stand-in spectora-import: one page of each list, from the fixture. */
function spxServer(over) {
  const calls = [];
  return { calls, next: (body) => {
    calls.push(body);
    if (over) { const a = over(body); if (a) return a; }
    const list = body.what === 'clients' ? FIXTURE.clients : body.what === 'agents' ? FIXTURE.agents : body.what === 'inspections' ? FIXTURE.records : body.what === 'services' ? SERVICES : [];
    return { status: 200, body: Object.assign({ records: list, has_next: false, cut: false }, body.what === 'inspections' ? { before: '2026-11-27T00:00:00Z' } : {}) };
  } };
}

/* The stand-in isn-import (the ISN fixture of the app's bring_business_test): the keys' own user, then each list. It
   takes the pair only one way round (access key first) unless told otherwise; [refuse] answers "me" with a refusal. */
function isnServer(o) {
  o = o || {};
  const calls = [];
  const lists = {
    clients: [{ id: 'c-1', first: 'Casey', last: 'Client', email: 'casey@example.com' }],
    agents: [{ id: 'a-1', first: 'Avery', last: 'Agent', agency: 'ag-1' }],
    agencies: [{ id: 'ag-1', name: 'Sunshine Realty' }],
    users: [{ id: 'u-1', displayname: 'Jordan Inspector' }],
    orders: [{ id: 'o-1', datetime: '2026-10-02 09:00:00', address1: '12 Palm Way', client: 'c-1', buyersagent: 'a-1', inspector1: 'u-1' }],
  };
  return { calls, next: (body) => {
    calls.push(body);
    if (body.what === 'me') {
      if (o.refuse) return { status: 200, body: { refused: o.refuse } };
      const right = o.swapped ? body.access_key === 's3cretSECRETs3cretSECRET' : body.access_key === 'AKIAEXAMPLEKEY1234';
      return { status: 200, body: right ? { me: { id: 'u-1' } } : { refused: 'bad_keys' } };
    }
    return { status: 200, body: { records: lists[body.what] || [] } };
  } };
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, kept());
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const errs = [], away = [], bodies = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  page.on('request', (r) => bodies.push(r.url() + ' ' + (r.postData() || '')));
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url(), cors = { 'access-control-allow-origin': '*' };
    if (u.startsWith(SERVER + '/functions/v1/sync')) {
      const b = JSON.parse(req.postData() || '{}'), pushing = (b.push || []).length > 0;
      if (pushing && o.sync.delay) await new Promise((r) => setTimeout(r, o.sync.delay));
      const a = o.sync.answer(b);
      if (pushing && o.sync.loseNext) { o.sync.loseNext = false; return route.fulfill({ status: 503, contentType: 'application/json', headers: cors, body: '{}' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(a) });
    }
    if (u.startsWith(SERVER + '/functions/v1/isn-import') && o.isn) {
      const a = o.isn.next(JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.body) });
    }
    if (u.startsWith(SERVER + '/functions/v1/spectora-import')) {
      if (o.spx.delay) await new Promise((r) => setTimeout(r, o.spx.delay));
      const a = o.spx.next(JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.body) });
    }
    away.push(u); return route.abort();
  });
  await page.goto(url + 'bring-business', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-br]:not([hidden])');
  return { ctx, page, errs, away, bodies };
}
async function paste(page, text) {
  const box = page.locator('[data-key]');
  await box.click(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.insertText(text);
}
const said = async (page) => ((await page.locator('[data-say]').textContent()) || '').trim();
const names = (rows) => rows.filter((r) => r.deleted_at == null && r.data.deletedAt == null).map((r) => r.data.name.toLowerCase().trim()).sort();

(async () => {
  const browser = await engine.launch();
  const SHOTS = process.env.SHOTS;
  const words = { unclear: J(READER.pastedKey('abc')).message, needsAddress: J(READER.pastedKey('AKIAEXAMPLEKEY1234 s3cretSECRETs3cretSECRET')).message };

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('the key, one preview, bring in, undo: ' + label, async () => {
      const sync = syncServer(seed()), spx = spxServer();
      const o = await open(browser, { w, sync, spx });
      const { page } = o;
      ok(label + ': the title and purpose are the app’s, with the how-to in three steps', (await page.locator('h1').textContent()) === 'Bring your business to Inspyx' &&
        (await page.locator('.br-lede').textContent()).indexOf('Paste the key from Spectora or ISN.') === 0 && (await page.locator('.br-how-step').count()) === 3);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'br-start-' + label + '.png') });
      await page.locator('.br-where summary').click();
      ok(label + ': “Where do I find my key?” opens on Spectora (most switchers come from Spectora)', await page.locator('ol[data-tab-pane="spectora"]').isVisible() &&
        await page.locator('ol[data-tab-pane="isn"]').isHidden() && (await page.locator('[data-tab="spectora"]').getAttribute('aria-selected')) === 'true');
      await page.locator('[data-tab="isn"]').click();
      ok(label + ': “Where do I find my key?” shows Spectora’s steps, and ISN’s on its tab', await page.locator('[data-tab-pane="isn"]').first().isVisible() &&
        (await page.locator('ol[data-tab-pane="isn"] li').first().textContent()) === 'In ISN, open Settings, then My Access Keys, and make a key.');
      await paste(page, 'abc');
      ok(label + ': a paste that isn’t a key: the app’s words, and Check waits', (await page.locator('[data-sees]').textContent()) === words.unclear && await page.locator('[data-check]').isDisabled());
      await paste(page, 'AKIAEXAMPLEKEY1234 s3cretSECRETs3cretSECRET');
      ok(label + ': ISN keys without the address: what is missing, in the app’s words', (await page.locator('[data-sees]').textContent()) === words.needsAddress);
      await paste(page, ISN);
      ok(label + ': ISN keys and address: seen, and Check and read (ISN is read here since 2026-11-27)',
        (await page.locator('[data-sees]').textContent()) === 'ISN keys for acme' && await page.locator('[data-check]').isEnabled());
      await paste(page, 'Bearer ' + KEY);
      ok(label + ': a Spectora key: “A Spectora key”, and Check and read', (await page.locator('[data-sees]').textContent()) === 'A Spectora key' && await page.locator('[data-check]').isEnabled() &&
        (await page.locator('[data-check]').textContent()) === 'Check and read');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'br-key-' + label + '.png'), fullPage: true });
      await page.locator('[data-check]').click();
      await until(async () => await page.locator('[data-preview]').isVisible());
      ok(label + ': it reads clients, agents and past inspections from Spectora, with the key in the body only',
        JSON.stringify(spx.calls.map((c) => c.what)) === '["clients","agents","inspections","services"]' && spx.calls.every((c) => c.key === KEY));
      ok(label + ': the box is emptied once read (the key is forgotten)', (await page.locator('[data-key]').inputValue()) === '');
      ok(label + ': ONE preview: found in Spectora, people, past inspections and prices counted',
        (await page.locator('[data-found]').textContent()) === 'Found in your Spectora account' && /\d+ clients? · \d+ agents?/.test(await page.locator('[data-count-people]').textContent()) &&
        /\d+ inspections?/.test(await page.locator('[data-count-past]').textContent()) && (await page.locator('[data-count-prices]').textContent()) === '2 services');
      ok(label + ': “Nothing is saved until you tap Bring in.”, and NOTHING was kept yet', (await page.locator('.br-nothing').textContent()) === 'Nothing is saved until you tap Bring in.' && sync.pushes.length === 0);
      const n = +(await page.locator('[data-go]').getAttribute('data-n'));
      ok(label + ': the button says how many: “Bring in N”', (await page.locator('[data-go]').textContent()) === 'Bring in ' + n && n > 0, String(n));
      if (w === WIDE) {
        await page.locator('[data-found]').scrollIntoViewIfNeeded();
        const nav = await page.evaluate(() => { const r = document.querySelector('nav.dash').getBoundingClientRect(); return { top: r.top, h: r.height, win: window.innerHeight, y: window.scrollY }; });
        ok(label + ': scrolled down, the sidebar stays pinned at the top and runs the full height', nav.y > 0 && nav.top === 0 && Math.abs(nav.h - nav.win) <= 1, JSON.stringify(nav));
      }
      ok(label + ': past inspections’ days in the dashboard’s own style (“Nov 3, 2026”)', (await page.locator('[data-list-past] li').allTextContents()).some((t) => /^[A-Z][a-z]{2} \d{1,2}, 20\d\d · /.test(t)) &&
        !(await page.locator('[data-list-past] li').allTextContents()).some((t) => /^20\d\d-\d\d-\d\d/.test(t)));
      ok(label + ': services and prices: counted and listed with their price, as the app keeps them', /^\d+ services?$/.test(await page.locator('[data-count-prices]').textContent()) &&
        (await page.locator('[data-list-prices] li').allTextContents()).every((t) => / · \$\d/.test(t)), await page.locator('[data-count-prices]').textContent());
      if (SHOTS) { await page.evaluate(() => document.querySelector('[data-preview]').scrollIntoView({ block: 'start', behavior: 'instant' })); await page.waitForTimeout(500); await page.screenshot({ path: path.join(SHOTS, 'br-preview-' + label + '.png') }); }
      await page.locator('[data-go]').click();
      await until(async () => await page.locator('[data-done]').isVisible(), 10000);
      const after = names(sync.people());
      ok(label + ': brought in: nobody twice in People (clients, agents and the people the inspections name, planned as one)', after.length === new Set(after).size, JSON.stringify(after));
      const pastN = sync.past().length, peopleKept = sync.people().length - seed().length, prices = sync.prices().map((r) => [r.data.name, r.data.feeCents, r.data.minutes, r.data.parentId]);
      ok(label + ': what was kept is what the button said (people, Ana filled, past inspections, prices)', pastN + peopleKept + 1 + prices.length === n && pastN > 0, JSON.stringify({ n, pastN, peopleKept, prices: prices.length }));
      ok(label + ': prices kept as the app keeps them: the hidden one and the one with no price left off; services of their own', JSON.stringify(prices) === JSON.stringify([['Home Inspection', 35000, 150, null], ['Radon', 15000, 0, null]]), JSON.stringify(prices));
      ok(label + ': the done lines: people, past inspections, services in the price list', (await page.locator('[data-done-list] li').allTextContents()).some((t) => t === '2 services in your price list'));
      ok(label + ': “Your business is in Inspyx”, with Undo', (await page.locator('[data-done] h2').textContent()) === 'Your business is in Inspyx' && await page.locator('[data-undo]').isVisible());
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'br-done-' + label + '.png'), fullPage: true });
      await page.locator('[data-undo]').click();
      await until(async () => (await said(page)) === 'Taken out again. Nothing from it is left.', 10000);
      ok(label + ': Undo: People, the past inspections and the price list are as they were', JSON.stringify(names(sync.people())) === JSON.stringify(names(seed())) && sync.past().length === 0 && sync.prices().length === 0,
        JSON.stringify([names(sync.people()), sync.past().length]));
      ok(label + ': the key went nowhere but spectora-import', o.bodies.filter((b) => b.indexOf(KEY) >= 0).every((b) => b.indexOf('/functions/v1/spectora-import') >= 0));
      ok(label + ': no errors, nothing else leaves the site' + (w === PHONE ? ', nothing off the side' : ''), o.errs.length === 0 && o.away.length === 0 &&
        (w !== PHONE || await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), JSON.stringify([o.errs, o.away]));
      await o.ctx.close();
    });
  }

  await group('an autofilled box, a refused key, a file', async () => {
    let sync = syncServer(seed()), spx = spxServer(), o = await open(browser, { sync, spx });
    // A value put in by something other than his typing or pasting (a browser's autofill): refused, nothing sent.
    await o.page.evaluate((k) => { const b = document.querySelector('[data-key]'); b.value = k; b.dispatchEvent(new Event('input')); }, KEY);
    await o.page.locator('[data-check]').click({ force: true });
    ok('an autofilled box: said, emptied, and nothing is asked of Spectora', await until(async () => (await said(o.page)).indexOf('Your browser filled that box in') === 0) &&
      spx.calls.length === 0 && (await o.page.locator('[data-key]').inputValue()) === '');
    await o.ctx.close();

    sync = syncServer(seed()); spx = spxServer(() => ({ status: 200, body: { refused: 'bad_key' } })); o = await open(browser, { sync, spx });
    await paste(o.page, KEY); await o.page.locator('[data-check]').click();
    ok('a key Spectora refuses: the app’s words, with the ISN hint; no preview', await until(async () => (await said(o.page)).indexOf('Spectora didn’t accept this key.') === 0) &&
      (await said(o.page)).indexOf('If it is an ISN key') > 0 && await o.page.locator('[data-preview]').isHidden() && spx.calls.length === 1);
    await o.ctx.close();

    sync = syncServer(seed()); spx = spxServer(); o = await open(browser, { sync, spx });
    const CSV = 'Full Name,Mobile,E-mail\nDaniel Ortiz,305-555-0142,\nAna Reyes,,ana@x.com\nZoe Park,786,zoe@x.com\n';
    await o.page.setInputFiles('[data-pick]', { name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });
    await until(async () => await o.page.locator('[data-file-kind]').isVisible());
    // Switch PR 8: the app's guess is chosen at once (here clients, by its columns), as on the phone; the chips can change
    // it, and nothing is kept before Bring in.
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    ok('a file: the app\'s guess is chosen and previewed; the chips can change it; nothing is kept yet',
      sync.pushes.length === 0 && (await o.page.locator('[data-fk="clients"]').getAttribute('aria-checked')) === 'true');
    await o.page.locator('[data-fk="clients"]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    ok('a clients file: found in the file, counted, nothing kept yet', (await o.page.locator('[data-found]').textContent()) === 'Found in clients.csv' &&
      (await o.page.locator('[data-count-people]').textContent()) === '3 clients' && sync.pushes.length === 0, await o.page.locator('[data-count-people]').textContent());
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    ok('brought in: Daniel and Zoe new, Ana filled (once)', JSON.stringify(names(sync.people())) === JSON.stringify(['ana reyes', 'daniel ortiz', 'zoe park']), JSON.stringify(names(sync.people())));
    await o.ctx.close();
  });

  await group('Codex on #133: the same total but other changes; a file dropped while it saves; a lost answer', async () => {
    // (1) Ana without an email, Bob with one: the file fills Ana. Then, before Bring in, another device fills Ana's email
    // and clears Bob's: still one change, but Bob's. Nothing he didn't see is kept: the new plan is shown.
    let sync = syncServer([person('seed-0', 'Ana Reyes', 'client'), person('seed-1', 'Bob Lane', 'client', { email: 'bob@x.com' })]), spx = spxServer();
    let o = await open(browser, { sync, spx });
    await o.page.setInputFiles('[data-pick]', { name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Email\nAna Reyes,ana@x.com\nBob Lane,bob@x.com\n', 'utf8') });
    await until(async () => await o.page.locator('[data-file-kind]').isVisible());
    await o.page.locator('[data-fk="clients"]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    const firstList = await o.page.locator('[data-list-people] li').allTextContents();
    const later = Date.now() + 600000;
    sync.put(Object.assign(person('seed-0', 'Ana Reyes', 'client', { email: 'ana@x.com', updatedAt: later }), { updated_at: later }));
    sync.put(Object.assign(person('seed-1', 'Bob Lane', 'client', { email: null, updatedAt: later }), { updated_at: later }));
    await o.page.locator('[data-go]').click();
    ok('the same total, other changes: nothing kept, and the new plan is shown (Bob now, not Ana)', await until(async () => JSON.stringify(await o.page.locator('[data-list-people] li').allTextContents()) === '["Bob Lane"]') &&
      JSON.stringify(firstList) === '["Ana Reyes"]' && sync.pushes.length === 0 && await o.page.locator('[data-done]').isHidden(), JSON.stringify([firstList, sync.pushes]));
    await o.ctx.close();

    // (2) A file dropped while Bring in runs is not taken: the save finishes, with its Undo, and the page is usable.
    sync = syncServer(seed()); spx = spxServer(); o = await open(browser, { sync, spx });
    await paste(o.page, KEY); await o.page.locator('[data-check]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    sync.delay = 700;
    await o.page.locator('[data-go]').click();
    await o.page.waitForTimeout(200);
    await o.page.dispatchEvent('[data-drop]', 'drop', { dataTransfer: await o.page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['Name\nZed'], 'other.csv', { type: 'text/csv' })); return d; }) });
    ok('a file dropped during Bring in: ignored; the save finishes with Undo and the page unlocks', await until(async () => await o.page.locator('[data-done]').isVisible(), 15000) &&
      await o.page.locator('[data-undo]').isVisible() && await o.page.locator('[data-file-kind]').isHidden() && await o.page.locator('[data-undo]').isEnabled() && o.errs.length === 0, JSON.stringify(o.errs));
    await o.ctx.close();

    // (3) The past inspections are kept but their answer is lost: what landed is counted as kept, with its Undo.
    sync = syncServer(seed()); spx = spxServer(); o = await open(browser, { sync, spx });
    await paste(o.page, KEY); await o.page.locator('[data-check]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    sync.loseNext = true;
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    const keptPast = sync.past().length;
    ok('a lost answer: the past inspections that landed are said, with Undo (never "nothing changed")', keptPast > 0 &&
      (await o.page.locator('[data-done-list] li').allTextContents()).some((t) => t === keptPast + ' past inspections') && await o.page.locator('[data-undo]').isVisible(),
      JSON.stringify([keptPast, await o.page.locator('[data-done-list] li').allTextContents()]));
    await o.page.locator('[data-undo]').click();
    ok('and Undo takes them back', await until(async () => sync.past().length === 0, 10000));
    await o.ctx.close();
  });

  await group('Codex r2 on #133: a file past the reader\'s limit; rows the server turns down', async () => {
    // A past-inspections file of 20,002 lines: the reader reads 20,000 and says so; the page shows its words.
    const big = 'Date,Address,Client\n' + Array.from({ length: 20002 }, (_, i) => '2026-01-' + String(1 + (i % 28)).padStart(2, '0') + ',' + i + ' Oak St,Client ' + i).join('\n') + '\n';
    const want = J(READER.inspections('history.csv', new TextEncoder().encode(big), { existing: [], existing_past: [] }));
    let sync = syncServer(seed()), spx = spxServer(), o = await open(browser, { sync, spx });
    await o.page.setInputFiles('[data-pick]', { name: 'history.csv', mimeType: 'text/csv', buffer: Buffer.from(big, 'utf8') });
    await until(async () => await o.page.locator('[data-file-kind]').isVisible());
    await o.page.locator('[data-fk="past"]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible(), 30000);
    ok('a file past the reader\'s limit: its own words say it was cut, in plain view', want.cut === true && !!want.cut_message &&
      await o.page.locator('[data-cut]').isVisible() && (await o.page.locator('[data-cut]').textContent()) === want.cut_message, want.cut_message);
    await o.ctx.close();

    // A person the server turns down while the import is saved (the phone's change was newer): said on the done screen.
    sync = syncServer(seed()); spx = spxServer(); o = await open(browser, { sync, spx });
    sync.refuse = (r) => r.kind === 'inspector_contacts' && r.data && r.data.name === 'Bob Diaz';
    await paste(o.page, KEY); await o.page.locator('[data-check]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    const lines = await o.page.locator('[data-done-list] li').allTextContents();
    ok('a row the server turned down: "1 more didn\'t go through", never passed off as all done', lines.some((t) => t.indexOf('1 more didn’t go through') === 0) &&
      !names(sync.people()).includes('bob diaz'), JSON.stringify(lines));
    await o.ctx.close();
  });

  await group('Codex r3 on #133: a file chosen while Spectora is being read', async () => {
    const sync = syncServer(seed()), spx = spxServer(); spx.delay = 900;
    const o = await open(browser, { sync, spx });
    await paste(o.page, KEY); await o.page.locator('[data-check]').click();
    await until(async () => await o.page.locator('[data-key]').isDisabled());
    await o.page.setInputFiles('[data-pick]', { name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from('Full Name,Mobile,E-mail\nZoe Park,786,zoe@x.com\n', 'utf8') });
    ok('a file while Spectora is read: the key is emptied, the box is his again, Stop is gone', await until(async () => (await o.page.locator('[data-key]').inputValue()) === '' &&
      await o.page.locator('[data-key]').isEnabled() && await o.page.locator('[data-stop]').isHidden()));
    await o.page.locator('[data-fk="clients"]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    await o.page.waitForTimeout(3000);
    ok('and the read Spectora answers late never lands: the preview is the file\'s', (await o.page.locator('[data-found]').textContent()) === 'Found in clients.csv' &&
      (await o.page.locator('[data-count-people]').textContent()) === '1 client', await o.page.locator('[data-count-people]').textContent());
    await o.ctx.close();
  });

  await group('ISN: the keys checked, swapped once when unlabelled, every list read through isn-import, one preview', async () => {
    let sync = syncServer(seed()), spx = spxServer(), isn = isnServer();
    let o = await open(browser, { sync, spx, isn });
    // Unlabelled, the secret first (read in the order pasted): ISN refuses the pair, so it is tried the other way
    // round, once.
    await paste(o.page, 'https://inspectionsupport.com/acme/access-keys\ns3cretSECRETs3cretSECRET\nAKIAEXAMPLEKEY1234');
    await o.page.locator('[data-check]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible(), 10000);
    const whats = isn.calls.map((c) => c.what);
    ok('ISN: "me", then once more swapped, then clients, agents, agencies, users and the orders before now',
      JSON.stringify(whats) === JSON.stringify(['me', 'me', 'clients', 'agents', 'agencies', 'users', 'orders']) &&
      isn.calls.every((c) => c.host === 'inspectionsupport.com' && c.company_key === 'acme') &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(isn.calls[6].before || '') && isn.calls.slice(0, 6).every((c) => c.before === undefined), JSON.stringify(whats));
    ok('ISN: the one preview, by the app\'s reader: its client and agent, its past inspection',
      (await o.page.locator('[data-found]').textContent()) === 'Found in your ISN account' &&
      (await o.page.locator('[data-count-people]').textContent()) === '1 client · 1 agent' && (await o.page.locator('[data-count-past]').textContent()).startsWith('1 '),
      [await o.page.locator('[data-found]').textContent(), await o.page.locator('[data-count-people]').textContent(), await o.page.locator('[data-count-past]').textContent()].join(' | '));
    ok('ISN: the keys went nowhere but isn-import, and the box is emptied', o.bodies.filter((b) => b.indexOf('AKIAEXAMPLEKEY1234') >= 0).every((b) => b.indexOf('/functions/v1/isn-import') >= 0) &&
      (await o.page.locator('[data-key]').inputValue()) === '' && sync.pushes.length === 0);
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    ok('ISN: brought in: Casey and Avery in People, the past inspection kept', names(sync.people()).includes('casey client') && names(sync.people()).includes('avery agent') && sync.past().length === 1,
      JSON.stringify([names(sync.people()), sync.past().length]));
    ok('ISN: no errors', o.errs.length === 0 && o.away.length === 0, o.errs.concat(o.away).join(' | '));
    await o.ctx.close();

    // A refusal: the app's words; nothing more is asked, nothing kept, the box emptied.
    sync = syncServer(seed()); spx = spxServer(); isn = isnServer({ refuse: 'no_privilege' });
    o = await open(browser, { sync, spx, isn });
    await paste(o.page, ISN);
    await o.page.locator('[data-check]').click();
    await until(async () => (await said(o.page)).indexOf('owner or manager') >= 0, 10000);
    ok('ISN refused: the app\'s words; only "me" was asked; nothing kept',
      (await said(o.page)) === "These keys work, but ISN doesn't let their user read this. Make the keys on an owner or manager account." &&
      JSON.stringify(isn.calls.map((c) => c.what)) === '["me"]' && await o.page.locator('[data-preview]').isHidden() && sync.pushes.length === 0 &&
      (await o.page.locator('[data-key]').inputValue()) === '', await said(o.page));
    await o.ctx.close();

    // Labelled keys are never swapped: bad_keys is said at once.
    sync = syncServer(seed()); spx = spxServer(); isn = isnServer({ swapped: true });
    o = await open(browser, { sync, spx, isn });
    await paste(o.page, 'https://inspectionsupport.com/acme/access-keys\naccess key: AKIAEXAMPLEKEY1234\nsecret key: s3cretSECRETs3cretSECRET');
    await o.page.locator('[data-check]').click();
    await until(async () => (await said(o.page)).indexOf("didn't accept") >= 0, 10000);
    ok('ISN, labelled keys: never swapped; the app\'s words for keys ISN refuses', JSON.stringify(isn.calls.map((c) => c.what)) === '["me"]', JSON.stringify(isn.calls.map((c) => c.what)));
    await o.ctx.close();
  });

  // Switch PR 8 (2026-11-27). Horizon publishes none of its export layouts: the Horizon files below are GUESSES at
  // plausible headers (several, in the app's tests), never its real layout. Spectora's agents export is DOCUMENTED.
  await group('switch PR 8: another app\'s exports, known by name or by their columns; unread columns kept', async () => {
    let sync = syncServer(seed()), spx = spxServer(), o = await open(browser, { sync, spx });
    const pick = (name, text, type) => o.page.setInputFiles('[data-pick]', { name, mimeType: type || 'text/csv', buffer: Buffer.from(text, 'utf8') });
    const chosen = async () => o.page.locator('[data-fk][aria-checked="true"]').getAttribute('data-fk');
    // GUESS: Horizon's CRM Clients, with a column nothing reads.
    await pick('CRM Clients.csv', 'Client Name,Email,Property Address,Date Added\nDana Reyes,dana@example.com,12 Palm Way,2025-03-14\n');
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    ok('Horizon\'s CRM Clients: said for what it is, read as clients, its unread column named',
      (await o.page.locator('[data-file-what]').textContent()) === "Horizon's CRM Clients" && await chosen() === 'clients' &&
      await o.page.locator('[data-unread]').isVisible() &&
      (await o.page.locator('[data-unread]').textContent()) === "A column Inspyx doesn't read: Date Added. It goes in each one's notes, unless they already have notes.",
      await o.page.locator('[data-unread]').textContent());
    if (SHOTS) { await o.page.setViewportSize({ width: 1280, height: 1100 }); await o.page.locator('[data-file-kind]').scrollIntoViewIfNeeded(); await o.page.screenshot({ path: SHOTS + '/58-bring-horizon-clients.png' }); }
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    const dana = sync.people().find((r) => r.data.name === 'Dana Reyes');
    ok('brought in with the unread column in her note', !!dana && /Date Added: 2025-03-14/.test(dana.data.note || ''), dana && dana.data.note);
    await o.ctx.close();

    sync = syncServer(seed()); spx = spxServer(); o = await open(browser, { sync, spx });
    // DOCUMENTED: Spectora's agents export, with no "agent" in the file's name.
    await pick('export (1).csv', 'Name,Email Address,Phone Number,Number of Inspections,Agent Team\nSam Ortiz,sam@example.com,305-555-0177,14,Ortiz Team\n');
    await until(async () => await chosen() === 'agents');
    ok('Spectora\'s agents export: agents by its columns', await chosen() === 'agents' && (await o.page.locator('[data-file-what]').isHidden()));
    // GUESS: Horizon's Inspection Bookings.
    await pick('Inspection Bookings Data.csv', 'Inspection Date,Address,Client,Status\n2025-04-02,12 Palm Way,Dana Reyes,Completed\n');
    await until(async () => await chosen() === 'past');
    ok('Horizon\'s Inspection Bookings: past inspections', await chosen() === 'past');
    // Horizon's Company Templates: the converter's, said, never read, never an error.
    await pick('Company Templates.json', '{"sections":[]}', 'application/json');
    await until(async () => (await o.page.locator('[data-say]').textContent()).includes('Inspyx can turn it into your template'));
    if (SHOTS) { await o.page.locator('[data-say]').scrollIntoViewIfNeeded(); await o.page.screenshot({ path: SHOTS + '/59-bring-horizon-templates.png' }); }
    ok('Horizon\'s Company Templates: "Convert it now" offered; no kind to pick, no preview, nothing kept',
      (await o.page.locator('[data-say]').textContent()) === "This is Horizon's Company Templates: Inspyx can turn it into your template." &&
      await o.page.locator('[data-convert-now]').isVisible() &&
      await o.page.locator('[data-file-kind]').isHidden() && await o.page.locator('[data-preview]').isHidden() && sync.pushes.length === 0 && o.errs.length === 0,
      JSON.stringify(o.errs));
    // "Convert it now": THIS file goes to Templates through this browser's own storage. Templates is stood in for by a
    // bare page with the handoff alone, to read back what arrived (check_templates.js checks Templates taking it).
    await o.page.route((u) => new URL(u).pathname === '/templates', (r) => r.fulfill({ status: 200, contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><script src="/assets/handoff.js"></script>' }));
    await Promise.all([o.page.waitForURL((u) => new URL(u).pathname === '/templates', { timeout: 10000 }), o.page.locator('[data-convert-now]').click()]);
    const arrived = await o.page.evaluate(() => window.inspyxHandoff.take().then((h) => h && { name: h.name, text: new TextDecoder().decode(h.bytes) }));
    ok('Convert it now opens Templates with THIS file waiting for it', new URL(o.page.url()).search === '?file=drop' &&
      !!arrived && arrived.name === 'Company Templates.json' && arrived.text === '{"sections":[]}', JSON.stringify(arrived));

    await o.ctx.close();
  });

  // The old import pages' column table, in this page since 2026-11-27 (the lead's pick A).
  await group('what each column holds: for any file; open by itself when a file reads badly; a change re-reads it', async () => {
    let sync = syncServer(seed()), spx = spxServer(), o = await open(browser, { sync, spx });
    const pick = (name, text) => o.page.setInputFiles('[data-pick]', { name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
    await pick('clients.csv', 'Name,Email\nDana Reyes,dana@example.com\n');
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    ok('a file read well: "Check the columns" is there, closed, each column with its first value and what it holds',
      await o.page.locator('[data-cols-box]').isVisible() && !(await o.page.locator('[data-cols-box]').evaluate((d) => d.open)) &&
      JSON.stringify(await o.page.$$eval('[data-cols] tr', (trs) => trs.map((t) => [t.cells[0].textContent, t.cells[1].textContent, t.querySelector('select').value]))) ===
      JSON.stringify([['Name', 'Dana Reyes', 'fullName'], ['Email', 'dana@example.com', 'email']]));
    // Headers nothing knows, and values that don't say either (names in small letters, a code): nobody can come in yet.
    await pick('export.csv', 'Col A,Col B,Col C\ndana reyes,813-555-0101,k-1\nlee park,,k-2\n');
    await until(async () => await o.page.locator('[data-cols-box]').evaluate((d) => d.open));
    ok('a file read badly: the table opens by itself and says what to choose', (await o.page.locator('[data-cols-bad]').textContent()) === "Inspyx can't tell which column holds the names. Choose it below.");
    ok('nothing found: no empty cards, no zero counts, and Bring in can\'t be tapped (the lead, 2026-11-27)',
      await o.page.locator('[data-card="people"]').isHidden() && await o.page.locator('[data-card="past"]').isHidden() && await o.page.locator('[data-card="prices"]').isHidden() &&
      await o.page.locator('[data-go]').isDisabled());
    if (SHOTS) { await o.page.locator('[data-cols-box]').scrollIntoViewIfNeeded(); await o.page.screenshot({ path: SHOTS + '/60-bring-columns-bad.png' }); }
    // Two choices back to back, the second before the first is read again: both count (Codex on #106).
    await o.page.evaluate(() => {
      const pickIn = (i, v) => { const sel = document.querySelector('[data-col="' + i + '"]'); sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
      pickIn(0, 'fullName'); pickIn(1, 'phone');
    });
    await until(async () => (await o.page.locator('[data-count-people]').textContent()).startsWith('2 clients') && (await o.page.locator('[data-cols-bad]').isHidden()));
    await o.page.waitForTimeout(500);
    ok('his choice re-reads the file: two clients, the bad line gone, his choices kept', (await o.page.locator('[data-count-people]').textContent()).startsWith('2 clients') &&
      (await o.page.locator('[data-col="0"]').inputValue()) === 'fullName' && (await o.page.locator('[data-col="1"]').inputValue()) === 'phone');
    if (SHOTS) { await o.page.locator('[data-cols-box]').scrollIntoViewIfNeeded(); await o.page.screenshot({ path: SHOTS + '/61-bring-columns-fixed.png' }); }
    // A column he sets to "Not used" stays so when he changes another (the reader would guess it again; Codex on #106).
    await o.page.locator('[data-col="2"]').selectOption('');
    await until(async () => (await o.page.locator('[data-col="2"]').inputValue()) === '');
    await o.page.locator('[data-col="1"]').selectOption('mobile');
    await until(async () => (await o.page.locator('[data-col="1"]').inputValue()) === 'mobile');
    ok('a column he set to "Not used" stays so when he changes another', (await o.page.locator('[data-col="2"]').inputValue()) === '');
    await o.page.locator('[data-col="2"]').selectOption('notes');
    await until(async () => (await o.page.locator('[data-col="2"]').inputValue()) === 'notes');
    await o.page.locator('[data-col="1"]').selectOption('phone');
    await until(async () => (await o.page.locator('[data-col="1"]').inputValue()) === 'phone');
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    const lee = sync.people().find((r) => r.data.name === 'lee park'), dana = sync.people().find((r) => r.data.name === 'dana reyes');
    ok('brought in as he matched it: Dana with her phone and her code in her notes, Lee', !!lee && !!dana && dana.data.phone === '813-555-0101' && /k-1/.test(dana.data.note || ''), JSON.stringify(dana && dana.data));
    await o.ctx.close();
    // A past inspections file read badly: the table opens with the history's own words.
    sync = syncServer(seed()); spx = spxServer(); o = await open(browser, { sync, spx });
    await pick('jobs.csv', 'When,Where,Who\n2025-04-02,12 Palm Way,Dana Reyes\n');
    await until(async () => await o.page.locator('[data-file-kind]').isVisible());
    await o.page.locator('[data-fk="past"]').click();
    await until(async () => ((await o.page.locator('[data-cols-bad]').textContent()) || '').includes('the date'));
    ok('past inspections read badly: it says to choose the date, the address or the client', (await o.page.locator('[data-cols-bad]').textContent()) === "Inspyx can't tell which columns hold the date, the address or the client. Choose them below.");
    ok('no errors', o.errs.length === 0, o.errs.join(' | '));
    await o.ctx.close();
  });

  await group('the old import pages lead here (the lead, 2026-11-27)', async () => {
    for (const old of ['people-import', 'history-import', 'people-import.html']) {
      const r = await fetch(url + old, { redirect: 'manual' });
      ok('/' + old + ' redirects to /bring-business', r.status === 307 && r.headers.get('location') === '/bring-business', r.status + ' ' + r.headers.get('location'));
    }
  });

  await group('own pass: another account signed in from another tab', async () => {
    const sync = syncServer(seed()), spx = spxServer();
    const o = await open(browser, { sync, spx });
    await paste(o.page, KEY); await o.page.locator('[data-check]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    // Another tab signs in as someone else: this page's books still hold the first account's rows.
    const reloaded = o.page.waitForEvent('framenavigated', { timeout: 5000 }).then(() => true, () => false);
    await o.page.evaluate(() => { const real = window.InspyxAuth.who; window.InspyxAuth.who = function () { const w = real(); return w ? Object.assign({}, w, { id: '22222222-2222-4222-8222-222222222222' }) : w; }; });
    await o.page.locator('[data-go]').click();
    ok('Bring in under another account: nothing is kept, and the page starts again', await reloaded && sync.pushes.length === 0, JSON.stringify(sync.pushes));
    await o.ctx.close();
  });

  await group('Codex r5 on #133: another account signed in while Spectora is being read', async () => {
    const sync = syncServer(seed()), spx = spxServer(); spx.delay = 700;
    const o = await open(browser, { sync, spx });
    await paste(o.page, KEY);
    const first = o.page.waitForRequest((r) => r.url().indexOf('/functions/v1/spectora-import') >= 0);
    await o.page.locator('[data-check]').click();
    await first;
    // While the first request is out (its answer held back), another tab signs in as someone else.
    const reloaded = o.page.waitForEvent('framenavigated', { timeout: 8000 }).then(() => true, () => false);
    await o.page.evaluate(() => { const real = window.InspyxAuth.who; window.InspyxAuth.who = function () { const w = real(); return w ? Object.assign({}, w, { id: '22222222-2222-4222-8222-222222222222' }) : w; }; });
    ok('a sign-in switched mid-read: no further request carries the key, and the page starts again', await reloaded && spx.calls.length === 1, JSON.stringify(spx.calls.map((c) => c.what)));
    await o.ctx.close();
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
