// Self-checks for Agreements (/agreements, 2026-11-16, Inspyx 4; business setup phase 2, piece F).
// NOTHING REAL IS ASKED OR CHANGED HERE. The sync function is a stand-in this test runs itself: rows newest-wins by
// updated_at, and an agreement row the server's rules would refuse (legal_rules.ts: a name and words trimmed as Dart
// trims, never empty, a name of at most 120 characters, words of at most 100,000 bytes) is kept out as "legal:" and
// the code. The sign-in in the browser is a made-up one that exists nowhere; any other request that tries to leave
// the site is stopped and counted as a failure. The browser runs in New York time.
// usage: node tools/serve.js &   then   node tools/check_agreements.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_agreements.js)
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
/* The server's rules for one row (legal_rules.ts), as far as this page can break them. */
function legalProblem(r) {
  const d = r.data;
  if (r.kind === 'legal_default') return d.id === 'signs' && d.deletedAt == null && (d.agreementId === null || /^[A-Za-z0-9_.:-]{1,64}$/.test(d.agreementId)) ? null : 'default';
  if (d.deletedAt != null) return null;
  if (d.kind !== 'agreement') return 'kind';
  if (typeof d.title !== 'string' || !trimmed(d.title) || Array.from(d.title).length > 120) return 'title';
  if (typeof d.body !== 'string' || !trimmed(d.body) || new TextEncoder().encode(d.body).length > 100000) return 'body';
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
      const why = (o.refuse && o.refuse(r)) || legalProblem(r);
      if (why) { skipped.push({ kind: r.kind, id: r.id, reason: 'legal:' + why }); continue; }
      const h = held.get(r.kind + '/' + r.id);
      if (h && !(r.updated_at > h.updated_at)) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
      put(r); applied.push({ kind: r.kind, id: r.id, applied: true });
    }
    return { skipped, applied };
  };
  o.row = (kind, data) => ({ kind, id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt, data });
  o.value = (kind, id) => (held.get(kind + '/' + id) || {}).data;
  o.agreement = (id, title, body, at, extra) => put(o.row('legal_documents', Object.assign({ id, ownerAccountId: ME, kind: 'agreement', title, body, createdAt: at, updatedAt: at, deletedAt: null }, extra || {})));
  o.signs = (agreementId, at) => put(o.row('legal_default', { id: 'signs', ownerAccountId: ME, agreementId, updatedAt: at, deletedAt: null }));
  return o;
}

function seed(s) {
  s.agreement('agr-std', 'Standard agreement', 'The client hires the inspector.', T);
  s.agreement('agr-condo', 'Condo agreement', 'The client hires the inspector for a condo.', T + 1);
  s.agreement('agr-annual', 'annual check-up', 'Once a year.', T + 2);
  s.agreement('agr-gone', 'Old agreement', 'No more.', T, { deletedAt: T + 5, updatedAt: T + 5 });
  s.put(s.row('legal_documents', { id: 'agr-theirs', ownerAccountId: '99999999-9999-4999-8999-999999999999', kind: 'agreement', title: 'Someone else', body: 'Not yours.', createdAt: T, updatedAt: T, deletedAt: null }));
  s.signs('agr-std', T + 3);
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
  const res = await page.goto(url + 'agreements', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, res };
}

// What a person sees: innerText leaves out hidden parts (a dialog's other titles, a button's second press) and keeps
// the break between side-by-side parts (an add-on's name and its fee), which textContent would glue together.
const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
const pushed = (calls) => calls.flatMap((c) => c.body.push || []);
const card = (page, name) => page.locator('.agr-card', { has: page.locator('[data-v="name"]', { hasText: name }) }).first();

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());
  const names = (page) => vis(page, '[data-list] [data-v="name"]');
  const lines = (page) => vis(page, '[data-list] [data-v="line"]');
  const F = '[data-form]';

  await group('signed out', async () => {
    const s = server(); seed(s);
    const { page, ctx, calls } = await open(browser, { server: s, store: null });
    ok('signed out: the page sends the visitor to sign in and asks nothing of the server', await until(async () => new URL(page.url()).pathname === '/signin') && calls.length === 0);
    await ctx.close();
  });

  await group('the list', async () => {
    const s = server(); seed(s);
    const { page, ctx, errs, away, calls, res } = await open(browser, { server: s });
    ok('opens with no errors, asks only the sync function, as the signed-in inspector, sending nothing', errs.length === 0 && away.length === 0 && calls.length >= 1 && calls.every((c) => c.headers.authorization === 'Bearer test-access-1' && (c.body.push || []).length === 0), errs.concat(away).join(' | '));
    const csp = res.headers()['content-security-policy'] || '';
    ok('served with the signed-in pages\' rule (no live socket)', /connect-src https:\/\/btxlrfvqifnrnxffohsz\.supabase\.co;/.test(csp) && !/wss:/.test(csp) && res.headers()['cache-control'] === 'no-store', csp.slice(0, 120));
    ok('in the phone\'s order: the one clients sign first, then by name (capitals aside); deleted ones and another account\'s never', JSON.stringify(await names(page)) === JSON.stringify(['Standard agreement', 'annual check-up', 'Condo agreement']), JSON.stringify(await names(page)));
    ok('the first says clients sign it, and each when it was edited', JSON.stringify(await lines(page)) === JSON.stringify(['Clients sign this one · Edited Nov 16, 2026', 'Edited Nov 16, 2026', 'Edited Nov 16, 2026']), JSON.stringify(await lines(page)));
    ok('the live line says the page is in step with the phone', (await vis(page, '[data-live]')).join() === 'In step with your phone: a change on either shows on the other within a few minutes.');
    ok('nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  });

  await group('the one clients sign is gone', async () => {
    const s = server(); seed(s);
    s.agreement('agr-std', 'Standard agreement', 'The client hires the inspector.', T, { updatedAt: T + 9, deletedAt: T + 9 });
    const { page, ctx } = await open(browser, { server: s });
    ok('the first left by name takes its place, as on the phone', JSON.stringify(await names(page)) === JSON.stringify(['annual check-up', 'Condo agreement']) && (await lines(page))[0].startsWith('Clients sign this one'), JSON.stringify(await names(page)));
    await ctx.close();
  });

  await group('nothing yet', async () => {
    const { page, ctx } = await open(browser, { server: server() });
    ok('with no agreements, it says what to do, and offers to add one', (await vis(page, '[data-empty]')).join() === 'No agreements yet. Add the one your clients sign before an inspection.' && (await vis(page, '[data-add="agreement"]')).join() === 'Add an agreement');
    await ctx.close();
  });

  await group('a new agreement', async () => {
    const s = server(); seed(s);
    const { page, ctx, calls } = await open(browser, { server: s });
    await page.click('[data-add="agreement"]');
    ok('the form opens empty, as New agreement, with no delete and no choosing', (await vis(page, F + ' h2')).join() === 'New agreement' && !(await page.locator(F + ' [data-delete]').isVisible()) && !(await page.locator(F + ' [data-only="choose"]').isVisible()));
    ok('it says what clients read, the blanks the phone fills, and to have an attorney read it', (await vis(page, F + ' .agr-help')).length === 3 && (await vis(page, F + ' .agr-help'))[1].includes('[Client name] [Property address] [Inspection date] [Fee] [Your name] [Your company] [License number] [Today\'s date]'));
    const before = calls.length;
    const problem = async () => (await vis(page, F + ' [data-problem]')).join();
    await page.click(F + ' button[type="submit"]');
    ok('no name: it says so, and sends nothing', await problem() === 'It needs a name.' && pushed(calls.slice(before)).length === 0);
    await page.fill(F + ' input[name="name"]', 'N'.repeat(121));
    await page.click(F + ' button[type="submit"]');
    ok('a name of 121 letters: too long', await problem() === 'A name can be at most 120 characters.');
    await page.fill(F + ' input[name="name"]', '\u{1F3E0}'.repeat(121));
    await page.click(F + ' button[type="submit"]');
    ok('121 emoji are 121 characters, not 242: too long', await problem() === 'A name can be at most 120 characters.');
    await page.fill(F + ' input[name="name"]', '\u{1F3E0}'.repeat(120));
    await page.click(F + ' button[type="submit"]');
    ok('120 emoji fit; then no words: it says so', await problem() === 'It needs its words.');
    await page.fill(F + ' textarea[name="words"]', 'é'.repeat(50001));
    await page.click(F + ' button[type="submit"]');
    ok('50,001 two-byte letters are 100,002 bytes: too long, counted as the server counts', await problem() === 'This agreement is too long to save. An agreement can be up to about 15,000 words.');
    ok('nothing sent for any of those', pushed(calls.slice(before)).length === 0);
    await page.fill(F + ' input[name="name"]', '  Pool agreement\u0085 ');
    await page.fill(F + ' textarea[name="words"]', '\n  The client hires the inspector for the pool.\n\n');
    await page.click(F + ' button[type="submit"]');
    ok('saved: the dialog closes and it says so', await until(async () => (await vis(page, '[data-say]')).join() === 'Saved.') && !(await page.locator('[data-dialog]').isVisible()));
    const sent = pushed(calls.slice(before));
    const row = sent.find((r) => r.kind === 'legal_documents');
    ok('the row as the phone writes one: trimmed as Dart trims (U+0085 too), its own new id, made and changed now, not deleted', !!row && row.data.title === 'Pool agreement' && row.data.body === 'The client hires the inspector for the pool.' && row.data.kind === 'agreement' && row.data.ownerAccountId === ME && /^[0-9a-f-]{36}$/.test(row.id) && row.data.createdAt === row.data.updatedAt && row.updated_at === row.data.updatedAt && row.data.deletedAt === null && row.deleted_at === null, JSON.stringify(row && row.data).slice(0, 200));
    ok('with agreements already there, the one clients sign stays as it was', sent.length === 1);
    ok('it shows in its place by name', JSON.stringify(await names(page)) === JSON.stringify(['Standard agreement', 'annual check-up', 'Condo agreement', 'Pool agreement']), JSON.stringify(await names(page)));
    await ctx.close();
  });

  await group('the first agreement', async () => {
    const s = server();
    const { page, ctx, calls } = await open(browser, { server: s });
    await page.click('[data-add="agreement"]');
    await page.fill(F + ' input[name="name"]', 'My agreement');
    await page.fill(F + ' textarea[name="words"]', 'The words.');
    await page.click(F + ' button[type="submit"]');
    await until(async () => (await vis(page, '[data-say]')).join() === 'Saved.');
    const sent = pushed(calls);
    const doc = sent.find((r) => r.kind === 'legal_documents'), signs = sent.find((r) => r.kind === 'legal_default');
    ok('becomes the one clients sign, in the same request, as on the phone', !!doc && !!signs && signs.id === 'signs' && signs.data.agreementId === doc.id && signs.data.deletedAt === null && calls.filter((c) => (c.body.push || []).length > 0).length === 1);
    ok('and says so', (await lines(page))[0].startsWith('Clients sign this one'));
    await ctx.close();
  });

  await group('changing one', async () => {
    const s = server(); seed(s);
    const ahead = Date.now() + 3 * HOUR;
    s.agreement('agr-condo', 'Condo agreement', 'The client hires the inspector for a condo.', T + 1, { updatedAt: ahead });
    const { page, ctx, calls } = await open(browser, { server: s });
    await card(page, 'Condo agreement').locator('[data-edit]').click();
    ok('the form opens with its name and words, as Agreement, offering to make it the one clients sign', (await vis(page, F + ' h2')).join() === 'Agreement' && await page.inputValue(F + ' input[name="name"]') === 'Condo agreement' && await page.locator(F + ' [data-only="choose"]').isVisible() && !(await page.locator(F + ' [data-only="signs"]').isVisible()));
    await page.fill(F + ' textarea[name="words"]', 'New words for the condo.');
    const before = calls.length;
    await page.click(F + ' button[type="submit"]');
    await until(async () => (await vis(page, '[data-say]')).join() === 'Saved.');
    const sent = pushed(calls.slice(before));
    ok('sends the whole row: same id and when made, a change time just past a phone clock running ahead', sent.length === 1 && sent[0].id === 'agr-condo' && sent[0].data.createdAt === T + 1 && sent[0].data.updatedAt === ahead + 1 && s.value('legal_documents', 'agr-condo').body === 'New words for the condo.', JSON.stringify(sent.map((r) => r.data.updatedAt)));
    await card(page, 'Condo agreement').locator('[data-edit]').click();
    await page.check(F + ' input[name="signs"]');
    const mid = calls.length;
    await page.click(F + ' button[type="submit"]');
    await until(async () => (await vis(page, '[data-say]')).join() === 'Saved.' && !(await page.locator('[data-dialog]').isVisible()));
    const chose = pushed(calls.slice(mid)).find((r) => r.kind === 'legal_default');
    ok('ticked, it becomes the one clients sign: the default row names it, changed after the last', !!chose && chose.data.agreementId === 'agr-condo' && chose.data.updatedAt > T + 3 && s.value('legal_default', 'signs').agreementId === 'agr-condo');
    ok('and moves to the top, saying so', (await names(page))[0] === 'Condo agreement' && (await lines(page))[0].startsWith('Clients sign this one'));
    await card(page, 'Condo agreement').locator('[data-edit]').click();
    ok('the one clients sign says so in its form, with nothing to tick', (await vis(page, F + ' [data-only="signs"]')).join() === 'Clients sign this one.' && !(await page.locator(F + ' [data-only="choose"]').isVisible()));
    await ctx.close();
  });

  await group('deleting one', async () => {
    const s = server(); seed(s);
    const { page, ctx, calls } = await open(browser, { server: s });
    await card(page, 'Standard agreement').locator('[data-edit]').click();
    const before = calls.length;
    await page.click(F + ' [data-delete]');
    ok('the first press only asks again: Yes, delete', (await vis(page, F + ' [data-delete]')).join() === 'Yes, delete' && pushed(calls.slice(before)).length === 0);
    await page.click(F + ' [data-delete]');
    ok('the second deletes: it says so', await until(async () => (await vis(page, '[data-say]')).join() === 'Deleted.'));
    const sent = pushed(calls.slice(before));
    ok('sent as a mark, its words kept, changed when deleted', sent.length === 1 && sent[0].id === 'agr-std' && sent[0].data.deletedAt !== null && sent[0].deleted_at === sent[0].data.deletedAt && sent[0].data.updatedAt === sent[0].data.deletedAt && sent[0].data.body === 'The client hires the inspector.');
    ok('the one clients sign stays named as it was (the phone falls back, and Undo there brings it back)', !sent.some((r) => r.kind === 'legal_default') && s.value('legal_default', 'signs').agreementId === 'agr-std');
    ok('the first left takes its place on the page', JSON.stringify(await names(page)) === JSON.stringify(['annual check-up', 'Condo agreement']) && (await lines(page))[0].startsWith('Clients sign this one'));
    await ctx.close();
  });

  await group('the phone, other accounts and the server\'s word', async () => {
    const s = server(); seed(s);
    const { page, ctx } = await open(browser, { server: s });
    s.agreement('agr-phone', 'Made on the phone', 'Words from the phone.', T + 50);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('a phone change shows on coming back into view', await until(async () => (await names(page)).includes('Made on the phone')));
    s.refuse = (r) => (r.kind === 'legal_documents' ? 'title' : null);
    await card(page, 'Condo agreement').locator('[data-edit]').click();
    await page.fill(F + ' input[name="name"]', 'Condo agreement 2');
    await page.click(F + ' button[type="submit"]');
    ok('a change the server keeps out: the dialog stays, and says Inspyx couldn\'t keep it', await until(async () => (await vis(page, '[data-say]')).join() === 'Inspyx couldn’t keep that change. Check it and try again.') && await page.locator('[data-dialog]').isVisible());
    ok('and the list still shows what the server holds', (await names(page)).includes('Condo agreement') && !(await names(page)).includes('Condo agreement 2'));
    await ctx.close();
  });

  await group('can\'t be reached', async () => {
    const s = server(); seed(s);
    let down = false;
    const { page, ctx } = await open(browser, { server: s, down: () => down });
    down = true;
    await card(page, 'Condo agreement').locator('[data-edit]').click();
    await page.fill(F + ' input[name="name"]', '');
    await page.click(F + ' button[type="submit"]');
    await page.fill(F + ' input[name="name"]', 'Condo agreement B');
    await page.click(F + ' button[type="submit"]');
    ok('a save that can\'t go: the dialog stays, and says so', await until(async () => (await vis(page, '[data-say]')).join() === 'That couldn’t be saved. Check your connection and try again.') && await page.locator('[data-dialog]').isVisible());
    ok('and the earlier try\'s problem is gone: only what is true now shows', (await vis(page, F + ' [data-problem]')).length === 0, JSON.stringify(await vis(page, F + ' [data-problem]')));
    await ctx.close();
    const first = await open(browser, { server: s, down: () => true });
    ok('nothing loaded: it says the agreements couldn\'t be read, and keeps trying', (await vis(first.page, '[data-state]')).join().startsWith('Your agreements couldn’t be read.') && (await vis(first.page, '[data-live]')).join() === 'Can\'t reach Inspyx right now. Trying again.');
    await first.ctx.close();
  });

  await group('on a phone', async () => {
    const s = server(); seed(s);
    const { page, ctx } = await open(browser, { server: s, w: PHONE });
    ok('the list fits', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.click('[data-add="agreement"]');
    const box = await page.locator('[data-dialog]').boundingBox();
    ok('the dialog fits the screen, centred with a margin each side and above', !!box && box.x >= 8 && Math.abs(box.x - (PHONE - box.x - box.width)) <= 1 && box.y >= 8, JSON.stringify(box));
    ok('the words box leaves the buttons in reach: the dialog scrolls when it must', await page.evaluate(() => { const d = document.querySelector('[data-dialog]'); return getComputedStyle(d).overflowY === 'auto' && d.querySelector('textarea').getBoundingClientRect().height <= innerHeight * 0.4; }));
    await page.fill(F + ' input[name="name"]', 'From a phone');
    await page.fill(F + ' textarea[name="words"]', 'Words typed on a phone.');
    await page.click(F + ' button[type="submit"]');
    ok('and an agreement saves from a phone-sized screen', await until(async () => (await vis(page, '[data-say]')).join() === 'Saved.'));
    await ctx.close();
    const wide = await open(browser, { server: s });
    await wide.page.click('[data-add="agreement"]');
    const b = await wide.page.locator('[data-dialog]').boundingBox();
    ok('on a desk too: the dialog is centred, never in a corner', !!b && b.x > 100 && Math.abs(b.x - (WIDE - b.x - b.width)) <= 1 && b.y >= 8, JSON.stringify(b));
    await wide.ctx.close();
  });

  await group('the page says no words', async () => {
    const fs = require('fs'), pathm = require('path');
    const code = fs.readFileSync(pathm.join(__dirname, '..', 'coming-soon', 'assets', 'agreements.js'), 'utf8');
    // Each string literal on its own (never two read as one); one holding three or more plain words is a sentence.
    const bare = code.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"])\/\/.*$/gm, '$1');
    const literals = bare.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
    const sentences = literals.map((l) => l.slice(1, -1)).filter((t) => /^[A-Za-z]/.test(t) && t.split(' ').filter((w) => /^[A-Za-z’']+[.,!?:;]?$/.test(w)).length >= 3);
    ok('the script says no words: every sentence is in the page', sentences.length === 0, sentences.slice(0, 3).join(' | '));
    ok('and that check sees a sentence of any length, numbers and all', ["x('Nothing was saved here.')", "v('A name can be at most 120 characters.')", 'w(`It needs a name.`)'].every((t) => (t.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || []).some((l) => l.slice(1, -1).split(' ').filter((w) => /^[A-Za-z’']+[.,!?:;]?$/.test(w)).length >= 3)));
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
