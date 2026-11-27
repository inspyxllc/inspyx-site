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
    for (const r of b.push || []) { const k = r.kind + '/' + r.id, h = held.get(k); if (h && h.row.updated_at >= r.updated_at) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; } held.set(k, { row: r, seq: ++seq }); applied.push({ kind: r.kind, id: r.id, applied: true }); }
    const after = typeof b.after === 'number' ? b.after : 0;
    return { rows: [...held.values()].filter((h) => h.seq > after).sort((x, y) => x.seq - y.seq).map((h) => h.row), next: seq, more: false, skipped: [], applied };
  };
  const all = () => [...held.values()].map((h) => h.row);
  const alive = (r) => r.deleted_at == null && r.data.deletedAt == null;
  return { answer, pushes, people: () => all().filter((r) => r.kind === 'inspector_contacts'), past: () => all().filter((r) => r.kind === 'past_inspections' && alive(r)), alive };
}
/* The stand-in spectora-import: one page of each list, from the fixture. */
function spxServer(over) {
  const calls = [];
  return { calls, next: (body) => {
    calls.push(body);
    if (over) { const a = over(body); if (a) return a; }
    const list = body.what === 'clients' ? FIXTURE.clients : body.what === 'agents' ? FIXTURE.agents : body.what === 'inspections' ? FIXTURE.records : [];
    return { status: 200, body: Object.assign({ records: list, has_next: false, cut: false }, body.what === 'inspections' ? { before: '2026-11-27T00:00:00Z' } : {}) };
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
    if (u.startsWith(SERVER + '/functions/v1/sync')) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o.sync.answer(JSON.parse(req.postData() || '{}'))) });
    if (u.startsWith(SERVER + '/functions/v1/spectora-import')) {
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
      await page.locator('.br-where summary').click();
      await page.locator('[data-tab="isn"]').click();
      ok(label + ': “Where do I find my key?” shows Spectora’s steps, and ISN’s on its tab', await page.locator('[data-tab-pane="isn"]').first().isVisible() &&
        (await page.locator('ol[data-tab-pane="isn"] li').first().textContent()) === 'In ISN, open Settings, then My Access Keys, and make a key.');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'br-start-' + label + '.png'), fullPage: true });
      await paste(page, 'abc');
      ok(label + ': a paste that isn’t a key: the app’s words, and Check waits', (await page.locator('[data-sees]').textContent()) === words.unclear && await page.locator('[data-check]').isDisabled());
      await paste(page, 'AKIAEXAMPLEKEY1234 s3cretSECRETs3cretSECRET');
      ok(label + ': ISN keys without the address: what is missing, in the app’s words', (await page.locator('[data-sees]').textContent()) === words.needsAddress);
      await paste(page, ISN);
      ok(label + ': ISN keys and address: seen, and the page says to use the app for now (nothing is read here yet)',
        (await page.locator('[data-sees]').textContent()) === 'ISN keys for acme ISN: use the Inspyx app for now. Reading ISN here comes soon.' && await page.locator('[data-check]').isDisabled());
      await paste(page, 'Bearer ' + KEY);
      ok(label + ': a Spectora key: “A Spectora key”, and Check and read', (await page.locator('[data-sees]').textContent()) === 'A Spectora key' && await page.locator('[data-check]').isEnabled() &&
        (await page.locator('[data-check]').textContent()) === 'Check and read');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'br-key-' + label + '.png'), fullPage: true });
      await page.locator('[data-check]').click();
      await until(async () => await page.locator('[data-preview]').isVisible());
      ok(label + ': it reads clients, agents and past inspections from Spectora, with the key in the body only',
        JSON.stringify(spx.calls.map((c) => c.what)) === '["clients","agents","inspections"]' && spx.calls.every((c) => c.key === KEY));
      ok(label + ': the box is emptied once read (the key is forgotten)', (await page.locator('[data-key]').inputValue()) === '');
      ok(label + ': ONE preview: found in Spectora, people and past inspections counted, prices said to come later',
        (await page.locator('[data-found]').textContent()) === 'Found in your Spectora account' && /\d+ clients? · \d+ agents?/.test(await page.locator('[data-count-people]').textContent()) &&
        /\d+ inspections?/.test(await page.locator('[data-count-past]').textContent()) && (await page.locator('[data-card="prices"] .br-count').textContent()) === 'This page can’t keep these yet.');
      ok(label + ': “Nothing is saved until you tap Bring in.”, and NOTHING was kept yet', (await page.locator('.br-nothing').textContent()) === 'Nothing is saved until you tap Bring in.' && sync.pushes.length === 0);
      const n = +(await page.locator('[data-go]').getAttribute('data-n'));
      ok(label + ': the button says how many: “Bring in N”', (await page.locator('[data-go]').textContent()) === 'Bring in ' + n && n > 0, String(n));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'br-preview-' + label + '.png'), fullPage: true });
      await page.locator('[data-go]').click();
      await until(async () => await page.locator('[data-done]').isVisible(), 10000);
      const after = names(sync.people());
      ok(label + ': brought in: nobody twice in People (clients, agents and the people the inspections name, planned as one)', after.length === new Set(after).size, JSON.stringify(after));
      const pastN = sync.past().length, peopleKept = sync.people().length - seed().length;
      ok(label + ': what was kept is what the button said', pastN + peopleKept + (/* Ana's fill */ 0) >= n - 1 && pastN > 0, JSON.stringify({ n, pastN, peopleKept }));
      ok(label + ': “Your business is in Inspyx”, with Undo', (await page.locator('[data-done] h2').textContent()) === 'Your business is in Inspyx' && await page.locator('[data-undo]').isVisible());
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'br-done-' + label + '.png'), fullPage: true });
      await page.locator('[data-undo]').click();
      await until(async () => (await said(page)) === 'Taken out again. Nothing from it is left.', 10000);
      ok(label + ': Undo: People and the past inspections are as they were', JSON.stringify(names(sync.people())) === JSON.stringify(names(seed())) && sync.past().length === 0,
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
    ok('a file: it asks what the file holds, and reads nothing before', sync.pushes.length === 0 && await o.page.locator('[data-preview]').isHidden());
    await o.page.locator('[data-fk="clients"]').click();
    await until(async () => await o.page.locator('[data-preview]').isVisible());
    ok('a clients file: found in the file, counted, nothing kept yet', (await o.page.locator('[data-found]').textContent()) === 'Found in clients.csv' &&
      (await o.page.locator('[data-count-people]').textContent()) === '3 clients · 0 agents' && sync.pushes.length === 0, await o.page.locator('[data-count-people]').textContent());
    await o.page.locator('[data-go]').click();
    await until(async () => await o.page.locator('[data-done]').isVisible(), 10000);
    ok('brought in: Daniel and Zoe new, Ana filled (once)', JSON.stringify(names(sync.people())) === JSON.stringify(['ana reyes', 'daniel ortiz', 'zoe park']), JSON.stringify(names(sync.people())));
    await o.ctx.close();
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
