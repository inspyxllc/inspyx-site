// Self-checks for Your company (/profile, 2026-11-16, Inspyx 4; business setup phase 2b).
// NOTHING REAL IS ASKED OR CHANGED HERE. The sync function is a stand-in this test runs itself: rows newest-wins by
// updated_at, and a profile row the server's rules would refuse (profile_rules.ts) is kept out as "profile:" and
// the code. The sign-in in the browser is a made-up one that exists nowhere; any other request that tries to leave
// the site is stopped and counted as a failure. The browser runs in New York time.
// usage: node tools/serve.js &   then   node tools/check_profile.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_profile.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const SYNC = '/functions/v1/sync';
const ME = '11111111-1111-4111-8111-111111111111';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const kept = () => JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

const T = new Date('2026-11-16T12:00:00-05:00').getTime();
const SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]);
const trimmed = (s) => s.length > 0 && !SPACE.has(s.charCodeAt(0)) && !SPACE.has(s.charCodeAt(s.length - 1));
/* The server's rules for the profile row (profile_rules.ts), as far as this page can break them. */
function profileProblem(r) {
  const d = r.data;
  if (d.id !== 'profile' || d.deletedAt != null) return 'profile';
  for (const [f, code, cap] of [['inspectorName', 'inspector_name', 200], ['licenseNumber', 'license_number', 200], ['companyName', 'company_name', 200], ['companyPhone', 'company_phone', 200], ['companyEmail', 'company_email', 254], ['secondInspectorName', 'second_inspector_name', 200]]) {
    const v = d[f];
    if (v == null) continue;
    if (typeof v !== 'string' || !trimmed(v) || Array.from(v).length > cap) return code;
    if (f === 'companyEmail' && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v)) return code;
  }
  if (d.associationNumbers != null && !(Array.isArray(d.associationNumbers) && d.associationNumbers.length <= 20)) return 'association_numbers';
  return null;
}
function server() {
  const held = new Map(); let tick = 0;
  const changedAt = () => new Date(Date.UTC(2026, 10, 16, 12) + (++tick)).toISOString();
  const put = (r) => held.set(r.kind + '/' + r.id, Object.assign({}, r, { changed_at: changedAt() }));
  const o = { held, put, refuse: null };
  o.push = (rows) => {
    const skipped = [], applied = [];
    for (const r of rows) {
      const why = (o.refuse && o.refuse(r)) || profileProblem(r);
      if (why) { skipped.push({ kind: r.kind, id: r.id, reason: 'profile:' + why }); continue; }
      const h = held.get(r.kind + '/' + r.id);
      if (h && !(r.updated_at > h.updated_at)) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
      put(r); applied.push({ kind: r.kind, id: r.id, applied: true });
    }
    return { skipped, applied };
  };
  o.profile = (at, extra) => {
    const data = Object.assign({ id: 'profile', ownerAccountId: ME, inspectorName: 'Pat Rivera', licenseNumber: 'HI18352', companyName: 'Rivera Home Inspections',
      companyPhone: '(555) 010-0199', companyEmail: 'pat@example.com', associationNumbers: ['ASHI 12345'], secondInspectorName: 'Sam Lee', updatedAt: at, deletedAt: null }, extra || {});
    put({ kind: 'inspector_profile', id: 'profile', updated_at: data.updatedAt, deleted_at: null, data });
  };
  o.value = () => (held.get('inspector_profile/profile') || {}).data;
  return o;
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  const store = o.store === undefined ? kept() : o.store;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem('inspyx.signin'); else localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, store);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const s = o.server, errs = [], away = [], calls = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (!u.startsWith(SERVER + SYNC)) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    calls.push({ headers: req.headers(), body });
    if (o.down && o.down()) return route.abort('failed');
    const { skipped, applied } = s.push(body.push || []);
    const after = body.after ? body.after.at : '';
    const rows = [...s.held.values()].filter((r) => r.changed_at > after).sort((a, b) => (a.changed_at < b.changed_at ? -1 : 1));
    const page_ = rows.slice(0, body.limit || 200);
    const last = page_[page_.length - 1];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      applied, skipped, rows: page_, next: last ? { at: last.changed_at, kind: last.kind, id: last.id } : body.after || null, more: rows.length > page_.length }) });
  });
  const res = await page.goto(url + 'profile', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, res };
}

// What a person sees: innerText leaves out hidden parts (a dialog's other titles, a button's second press) and keeps
// the break between side-by-side parts (an add-on's name and its fee), which textContent would glue together.
const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
const pushed = (calls) => calls.flatMap((c) => c.body.push || []);

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());
  const F = '[data-form]';
  const val = (page, name) => page.inputValue(F + ' input[name="' + name + '"]');
  const saveAndWait = async (page, words) => { await page.click(F + ' button[type="submit"]'); return until(async () => (await vis(page, '[data-say]')).join() === words); };

  await group('signed out', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, calls } = await open(browser, { server: s, store: null });
    ok('signed out: the page sends the visitor to sign in and asks nothing of the server', await until(async () => new URL(page.url()).pathname === '/signin') && calls.length === 0);
    await ctx.close();
  });

  await group('the profile', async () => {
    const s = server(); s.profile(T);
    // Another account's row, as a broken server might answer it (kept apart from this account's).
    s.held.set('other/inspector_profile/profile', { kind: 'inspector_profile', id: 'profile', updated_at: T + 9, deleted_at: null, changed_at: '2026-11-16T12:00:00.500Z', data: { id: 'profile', ownerAccountId: '99999999-9999-4999-8999-999999999999', inspectorName: 'Someone else', updatedAt: T + 9, deletedAt: null } });
    const { page, ctx, errs, away, calls, res } = await open(browser, { server: s });
    ok('opens with no errors, asks only the sync function, as the signed-in inspector, sending nothing', errs.length === 0 && away.length === 0 && calls.length >= 1 && calls.every((c) => c.headers.authorization === 'Bearer test-access-1' && (c.body.push || []).length === 0), errs.concat(away).join(' | '));
    const csp = res.headers()['content-security-policy'] || '';
    ok('served with the signed-in pages\' rule (no live socket)', /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && !/wss:/.test(csp) && res.headers()['cache-control'] === 'no-store', csp.slice(0, 120));
    ok('the form holds the profile, never another account\'s', await val(page, 'inspectorName') === 'Pat Rivera' && await val(page, 'licenseNumber') === 'HI18352' && await val(page, 'companyName') === 'Rivera Home Inspections' && await val(page, 'companyPhone') === '(555) 010-0199' && await val(page, 'companyEmail') === 'pat@example.com');
    ok('with a name and a license, nothing is said to be needed', (await vis(page, '[data-need-line]')).length === 0);
    ok('the caps every place keeps: 200 characters, the email 254', await page.evaluate(() => ['inspectorName', 'licenseNumber', 'companyName', 'companyPhone'].every((n) => document.querySelector('input[name="' + n + '"]').maxLength === 200) && document.querySelector('input[name="companyEmail"]').maxLength === 254));
    ok('nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  });

  await group('nothing yet', async () => {
    const { page, ctx } = await open(browser, { server: server() });
    ok('an empty form that says what reports need', (await vis(page, '[data-need-line]')).join() === 'Your reports need your name and your license number.' && await val(page, 'inspectorName') === '');
    await page.fill(F + ' input[name="inspectorName"]', 'Pat');
    ok('as it is typed, the line follows', (await vis(page, '[data-need-line]')).join() === 'Your reports need your license number.');
    await ctx.close();
  });

  await group('saving', async () => {
    const s = server();
    const ahead = Date.now() + 3 * HOUR;
    s.profile(ahead);
    const { page, ctx, calls } = await open(browser, { server: s });
    await page.fill(F + ' input[name="inspectorName"]', '  Pat Rivera Jr.\u0085 ');
    await page.fill(F + ' input[name="companyName"]', '   ');
    await page.fill(F + ' input[name="companyPhone"]', '7543645501');
    await page.locator(F + ' input[name="companyPhone"]').blur();
    ok('the phone number is tidied as the phone tidies it', await val(page, 'companyPhone') === '(754) 364-5501');
    const before = calls.length;
    ok('saved: it says so', await saveAndWait(page, 'Saved.'));
    const sent = pushed(calls.slice(before));
    const d = sent.length === 1 ? sent[0].data : {};
    ok('the row as the phone writes it: trimmed as Dart trims (U+0085 too), an empty field as none, id "profile", not deleted', sent.length === 1 && sent[0].kind === 'inspector_profile' && sent[0].id === 'profile' && d.inspectorName === 'Pat Rivera Jr.' && d.companyName === null && d.companyPhone === '(754) 364-5501' && d.deletedAt === null && d.ownerAccountId === ME, JSON.stringify(d).slice(0, 220));
    ok('what this page doesn\'t show goes back as it was: association numbers and the second inspector', JSON.stringify(d.associationNumbers) === '["ASHI 12345"]' && d.secondInspectorName === 'Sam Lee');
    ok('a change time just past a phone clock running ahead', d.updatedAt === ahead + 1 && sent[0].updated_at === ahead + 1);
    ok('the server holds it', s.value().inspectorName === 'Pat Rivera Jr.');
    await ctx.close();
  });

  await group('the email', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, calls } = await open(browser, { server: s });
    await page.fill(F + ' input[name="companyEmail"]', 'pat@example');
    const before = calls.length;
    await page.click(F + ' button[type="submit"]');
    ok('one that doesn\'t look complete: the phone\'s words, and nothing sent', (await vis(page, F + ' [data-problem]')).join() === 'The company email doesn\'t look complete (like name@company.com).' && pushed(calls.slice(before)).length === 0);
    await page.fill(F + ' input[name="companyEmail"]', 'pat@example.com');
    const savedOk = await saveAndWait(page, 'Saved.');
    ok('fixed, it saves, and the problem is gone', savedOk && (await vis(page, F + ' [data-problem]')).length === 0, JSON.stringify([await vis(page, '[data-say]'), await vis(page, F + ' [data-problem]')]));
    await page.fill(F + ' input[name="companyEmail"]', '');
    ok('an empty email is fine: none', await saveAndWait(page, 'Saved.') && s.value().companyEmail === null);
    await ctx.close();
  });

  await group('changed elsewhere', async () => {
    const s = server(); s.profile(T);
    const { page, ctx, calls } = await open(browser, { server: s });
    s.profile(T + 500, { inspectorName: 'From the phone' });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('not being typed in, the form shows a phone change on coming back into view', await until(async () => await val(page, 'inspectorName') === 'From the phone'));
    await page.fill(F + ' input[name="companyName"]', 'Typed here');
    s.profile(T + 900, { inspectorName: 'From the phone again' });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(400);
    ok('being typed in, it is never refilled under the typing', await val(page, 'companyName') === 'Typed here' && await val(page, 'inspectorName') === 'From the phone');
    const before = calls.length;
    await page.click(F + ' button[type="submit"]');
    ok('a save over a change made elsewhere is refused once, and says so', await until(async () => (await vis(page, '[data-say]')).join() === 'These details were changed somewhere else since this page showed them, so nothing was saved. Save again to keep what you see here.') && pushed(calls.slice(before)).length === 0);
    ok('saving again keeps what is on screen, after the newer change', await saveAndWait(page, 'Saved.') && s.value().companyName === 'Typed here' && s.value().updatedAt > T + 900);
    await ctx.close();
  });

  await group('the server\'s word and no connection', async () => {
    const s = server(); s.profile(T);
    let down = false;
    const { page, ctx } = await open(browser, { server: s, down: () => down });
    s.refuse = () => 'inspector_name';
    await page.fill(F + ' input[name="inspectorName"]', 'Pat');
    ok('a change the server keeps out: says Inspyx couldn\'t keep it', await saveAndWait(page, 'Inspyx couldn’t keep that change. Check it and try again.'));
    s.refuse = null; down = true;
    ok('a save that can\'t go: says so', await saveAndWait(page, 'That couldn’t be saved. Check your connection and try again.'));
    await ctx.close();
    const first = await open(browser, { server: s, down: () => true });
    ok('nothing loaded: it says the details couldn\'t be read, and keeps trying', (await vis(first.page, '[data-state]')).join().startsWith('Your company details couldn’t be read.') && (await vis(first.page, '[data-live]')).join() === 'Can\'t reach Inspyx right now. Trying again.');
    await first.ctx.close();
  });

  await group('on a phone', async () => {
    const s = server(); s.profile(T);
    const { page, ctx } = await open(browser, { server: s, w: PHONE });
    ok('the form fits', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.fill(F + ' input[name="companyName"]', 'From a phone');
    ok('and saves', await saveAndWait(page, 'Saved.'));
    await ctx.close();
  });

  await group('the page says no words', async () => {
    const fs = require('fs'), pathm = require('path');
    const code = fs.readFileSync(pathm.join(__dirname, '..', 'coming-soon', 'assets', 'profile.js'), 'utf8');
    // Each string literal on its own (never two read as one); one holding three or more plain words is a sentence.
    const bare = code.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"])\/\/.*$/gm, '$1');
    const literals = bare.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
    const sentences = literals.map((l) => l.slice(1, -1)).filter((t) => /^[A-Za-z]/.test(t) && t.split(' ').filter((w) => /^[A-Za-z’']+[.,!?:;]?$/.test(w)).length >= 3);
    ok('the script says no words: every sentence is in the page', sentences.length === 0, sentences.slice(0, 3).join(' | '));
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
