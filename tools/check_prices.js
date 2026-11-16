// Self-checks for Prices (/prices, 2026-11-16, Inspyx 4).
// NOTHING REAL IS ASKED OR CHANGED HERE. The sync function is a stand-in this test runs itself: rows newest-wins by
// updated_at, and a standing discount whose code another standing one holds is kept out ("price:code_taken"), as
// sync_push does. The sign-in in the browser is a made-up one that exists nowhere; any other request that tries to
// leave the site is stopped and counted as a failure. The browser runs in New York time.
// usage: node tools/serve.js &   then   node tools/check_prices.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_prices.js)
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

const T = Date.now() - 10 * 60000;
function server() {
  const held = new Map(); let tick = 0;
  const changedAt = () => new Date(Date.UTC(2026, 10, 16, 12) + (++tick)).toISOString();
  const norm = (c) => String(c || '').trim().toUpperCase();
  const put = (r) => held.set(r.kind + '/' + r.id, Object.assign({}, r, { changed_at: changedAt() }));
  const push = (rows) => {
    const skipped = [], applied = [];
    for (const r of rows) {
      const h = held.get(r.kind + '/' + r.id);
      if (h && !(r.updated_at > h.updated_at)) { applied.push({ kind: r.kind, id: r.id, applied: false }); continue; }
      if (r.kind === 'price_services' && r.deleted_at === null && r.data.parentId != null) {
        const p = held.get('price_services/' + r.data.parentId);
        if (!p || p.deleted_at !== null) { skipped.push({ kind: r.kind, id: r.id, reason: 'price:parent' }); continue; }
      }
      if (r.kind === 'price_discounts' && r.deleted_at === null) {
        const clash = [...held.values()].some((x) => x.kind === 'price_discounts' && x.id !== r.id && x.deleted_at === null && norm(x.data.code) === norm(r.data.code));
        if (clash) { skipped.push({ kind: r.kind, id: r.id, reason: 'price:code_taken' }); continue; }
      }
      put(r); applied.push({ kind: r.kind, id: r.id, applied: true });
    }
    return { skipped, applied };
  };
  const row = (kind, data) => ({ kind, id: data.id, updated_at: data.updatedAt, deleted_at: data.deletedAt, data });
  return { held, push, put, row, value: (kind, id) => (held.get(kind + '/' + id) || {}).data };
}

function seed(s) {
  const base = { ownerAccountId: ME, createdAt: T, updatedAt: T, deletedAt: null };
  s.put(s.row('price_services', Object.assign({ id: 'svc-home', parentId: null, name: 'Home inspection', description: 'The whole house.', feeCents: 40000, minutes: 180, minimumFeeCents: 35000, position: 0 }, base)));
  s.put(s.row('price_services', Object.assign({ id: 'svc-condo', parentId: null, name: 'Condo inspection', description: null, feeCents: 30000, minutes: 120, minimumFeeCents: null, position: 1 }, base)));
  s.put(s.row('price_services', Object.assign({ id: 'add-radon', parentId: 'svc-home', name: 'Radon test', description: null, feeCents: 15000, minutes: 60, minimumFeeCents: null, position: 0 }, base)));
  s.put(s.row('price_services', Object.assign({ id: 'add-wdo', parentId: 'svc-home', name: 'Termite (WDO)', description: null, feeCents: 9500, minutes: 0, minimumFeeCents: null, position: 1 }, base)));
  s.put(s.row('price_modifiers', Object.assign({ id: 'mod-sqft', serviceId: 'svc-home', basis: 'square_feet', mode: 'ranges', position: 0,
    tiersJson: JSON.stringify({ tiers: [{ from: null, to: 2000, fee_cents: 0, minutes: 0 }, { from: 2000, to: null, fee_cents: 5000, minutes: 30 }] }) }, base)));
  s.put(s.row('price_discounts', Object.assign({ id: 'disc-save', code: 'SAVE10', kind: 'percent', value: 1000, appliesToJson: '[]', maxUses: 20,
    expiresAt: new Date('2026-12-31T23:59:59-05:00').getTime(), active: true }, base)));
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
  const res = await page.goto(url + 'prices', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, away, calls, res };
}

// What a person sees: innerText leaves out hidden parts (a dialog's other titles, a button's second press) and keeps
// the break between side-by-side parts (an add-on's name and its fee), which textContent would glue together.
const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
const pushed = (calls) => calls.flatMap((c) => c.body.push || []);
const card = (page, name) => page.locator('.prc-card', { has: page.locator('[data-v="name"]', { hasText: name }) }).first();

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

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
    ok('services in their order, each with its summary in the phone\'s words',
      JSON.stringify(await vis(page, '[data-list="services"] > li > .prc-row [data-v="summary"]')) === JSON.stringify(['$400 · 3 h · at least $350 · 2 add-ons · 1 price change', '$300 · 2 h']), JSON.stringify(await vis(page, '[data-list="services"] > li > .prc-row [data-v="summary"]')));
    ok('a service\'s add-ons, with fee and time', JSON.stringify(await vis(page, '.prc-addon .prc-what')) === JSON.stringify(['Radon test $150 · 1 h', 'Termite (WDO) $95']), JSON.stringify(await vis(page, '.prc-addon .prc-what')));
    ok('a price change in one line, as the phone says it', (await vis(page, '.prc-changes li')).join() === 'Square feet: up to 2,000 +$0 · 2,000 and up +$50');
    ok('a service with no price changes shows no such part', (await card(page, 'Condo inspection').locator('[data-changes]').isVisible()) === false);
    ok('the discount code in one line', JSON.stringify(await vis(page, '[data-list="discounts"] [data-v="summary"]')) === JSON.stringify(['10% off · all services · until Dec 31, 2026 · up to 20 uses']), JSON.stringify(await vis(page, '[data-list="discounts"] [data-v="summary"]')));
    ok('nothing runs off the side of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  });

  await group('nothing yet', async () => {
    const { page, ctx } = await open(browser, { server: server() });
    ok('with no prices, it says what to do, and offers to add', (await vis(page, '[data-empty]')).length === 2 && (await vis(page, '[data-add="service"]')).join() === 'Add a service' && (await vis(page, '[data-add="discount"]')).join() === 'Add a discount code');
    await ctx.close();
  });

  await group('a new service', async () => {
    const s = server(); seed(s);
    const { page, ctx, calls } = await open(browser, { server: s });
    await page.click('[data-add="service"]');
    const f = '[data-form="service"]';
    ok('the form opens empty, as New service, with a minimum', (await vis(page, f + ' h2')).join() === 'New service' && await page.locator(f + ' input[name="minimum"]').isVisible());
    const before = calls.length;
    await page.click(f + ' button[type="submit"]');
    ok('no name: it says so, and sends nothing', (await vis(page, f + ' [data-problem]')).join() === 'It needs a name.' && pushed(calls.slice(before)).length === 0);
    await page.fill(f + ' input[name="name"]', '  Pool and spa  ');
    await page.fill(f + ' input[name="fee"]', '1,000,000.01');
    await page.click(f + ' button[type="submit"]');
    ok('a fee over $1,000,000: it says how to write the fee', (await vis(page, f + ' [data-problem]')).join() === 'Write the fee as dollars, like 450 or 450.50.');
    await page.fill(f + ' input[name="fee"]', 'abc');
    await page.click(f + ' button[type="submit"]');
    ok('a fee that isn\'t dollars: it says how to write it', (await vis(page, f + ' [data-problem]')).join() === 'Write the fee as dollars, like 450 or 450.50.');
    await page.fill(f + ' input[name="fee"]', '$1,250.5');
    await page.fill(f + ' input[name="hours"]', '25');
    await page.click(f + ' button[type="submit"]');
    ok('more than 24 hours: it says how to write the time', (await vis(page, f + ' [data-problem]')).join() === 'Write the time in hours, like 2 or 2.5.');
    await page.fill(f + ' input[name="hours"]', '1.5');
    await page.fill(f + ' input[name="minimum"]', 'x');
    await page.click(f + ' button[type="submit"]');
    ok('a minimum that isn\'t dollars: it says so', (await vis(page, f + ' [data-problem]')).join() === 'Write the minimum fee as dollars, or leave it empty.');
    await page.fill(f + ' input[name="minimum"]', '');
    await page.fill(f + ' textarea[name="description"]', '   ');
    await page.click(f + ' button[type="submit"]');
    ok('saved: the dialog closes and says so', await until(async () => !(await page.locator('[data-dialog="service"]').isVisible())) && (await vis(page, '[data-say]')).join() === 'Saved.');
    const w = pushed(calls).find((r) => r.kind === 'price_services' && r.data.name === 'Pool and spa');
    ok('the row as the phone writes it: trimmed name, no description, cents, minutes, no minimum, last place, the account\'s', !!w &&
      w.data.feeCents === 125050 && w.data.minutes === 90 && w.data.minimumFeeCents === null && w.data.description === null && w.data.parentId === null &&
      w.data.position === 2 && w.data.ownerAccountId === ME && w.data.createdAt === w.data.updatedAt && w.updated_at === w.data.updatedAt && w.deleted_at === null &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(w.id), JSON.stringify(w && w.data));
    ok('and it shows in the list', (await vis(page, '[data-list="services"] > li > .prc-row [data-v="name"]')).includes('Pool and spa'));
    await ctx.close();
  });

  await group('changing and deleting', async () => {
    const s = server(); seed(s);
    const { page, ctx, calls } = await open(browser, { server: s });
    await card(page, 'Home inspection').locator('.prc-row [data-edit]').click();
    const f = '[data-form="service"]';
    ok('a service opens with its own values', await page.inputValue(f + ' input[name="name"]') === 'Home inspection' && await page.inputValue(f + ' input[name="fee"]') === '400' && await page.inputValue(f + ' input[name="hours"]') === '3' && await page.inputValue(f + ' input[name="minimum"]') === '350');
    await page.fill(f + ' input[name="fee"]', '425');
    await page.click(f + ' button[type="submit"]');
    await until(async () => !(await page.locator('[data-dialog="service"]').isVisible()));
    const w = pushed(calls).find((r) => r.id === 'svc-home');
    ok('a change keeps its id, place and making time, with a later change time', !!w && w.data.feeCents === 42500 && w.data.position === 0 && w.data.createdAt === T && w.data.updatedAt > T && w.data.minimumFeeCents === 35000);
    await card(page, 'Home inspection').locator('.prc-addon', { hasText: 'Radon test' }).locator('[data-edit]').click();
    ok('an add-on opens as Add-on, with extra time and no minimum', (await vis(page, f + ' h2')).join() === 'Add-on' && (await vis(page, f + ' [data-time]')).join() === 'Extra time' && !(await page.locator(f + ' input[name="minimum"]').isVisible()));
    await page.click(f + ' [data-close]');
    await card(page, 'Condo inspection').locator('[data-add="addon"]').click();
    await page.fill(f + ' input[name="name"]', 'Pool');
    await page.fill(f + ' input[name="fee"]', '75');
    await page.click(f + ' button[type="submit"]');
    await until(async () => !(await page.locator('[data-dialog="service"]').isVisible()));
    const addOn = pushed(calls).find((r) => r.data && r.data.name === 'Pool');
    ok('a new add-on hangs from its service, first in its list, with no minimum', !!addOn && addOn.data.parentId === 'svc-condo' && addOn.data.position === 0 && addOn.data.minimumFeeCents === null);
    await card(page, 'Home inspection').locator('.prc-row [data-edit]').click();
    ok('deleting a service says it takes its add-ons and price changes', await page.locator(f + ' [data-only="delete-service"]').isVisible());
    await page.click(f + ' [data-delete]');
    ok('the first press only asks', (await vis(page, f + ' [data-delete]')).join() === 'Yes, delete' && !pushed(calls).some((r) => r.deleted_at !== null));
    await page.click(f + ' [data-delete]');
    await until(async () => !(await page.locator('[data-dialog="service"]').isVisible()));
    const gone = pushed(calls).filter((r) => r.deleted_at !== null);
    ok('the second deletes the service, its add-ons and its price change, all at one time', JSON.stringify(gone.map((r) => r.id).sort()) === JSON.stringify(['add-radon', 'add-wdo', 'mod-sqft', 'svc-home']) && new Set(gone.map((r) => r.data.deletedAt)).size === 1 && gone.every((r) => r.data.updatedAt >= r.data.deletedAt), JSON.stringify(gone.map((r) => r.id)));
    ok('and they leave the list', !(await vis(page, '[data-list="services"] [data-v="name"]')).some((n) => /Home inspection|Radon/.test(n)) && (await vis(page, '[data-say]')).join() === 'Deleted.');
    await ctx.close();
  });

  await group('discount codes', async () => {
    const s = server(); seed(s);
    const { page, ctx, calls } = await open(browser, { server: s });
    const f = '[data-form="discount"]';
    await page.click('[data-add="discount"]');
    await page.fill(f + ' input[name="code"]', ' save10 ');
    await page.fill(f + ' input[name="value"]', '5');
    const before = pushed(calls).length;
    await page.click(f + ' button[type="submit"]');
    ok('a code another standing discount holds, whatever its letters: it says so and sends nothing', (await vis(page, f + ' [data-problem]')).join() === 'You already have that code.' && pushed(calls).length === before);
    await page.fill(f + ' input[name="code"]', 'SPRING 26');
    await page.click(f + ' button[type="submit"]');
    ok('a code with a space: letters and numbers only', (await vis(page, f + ' [data-problem]')).join() === 'A code is letters and numbers only, with no spaces.');
    await page.fill(f + ' input[name="code"]', 'A'.repeat(31));
    await page.click(f + ' button[type="submit"]');
    ok('a code of 31: at most 30', (await vis(page, f + ' [data-problem]')).join() === 'A code can be at most 30 letters and numbers.');
    await page.fill(f + ' input[name="code"]', ' spring26 ');
    await page.fill(f + ' input[name="value"]', '0');
    await page.click(f + ' button[type="submit"]');
    ok('a percent of 0: it says how to write it', (await vis(page, f + ' [data-problem]')).join() === 'Write the percent (like 10) or the amount (like 25).');
    await page.fill(f + ' input[name="value"]', '101');
    await page.click(f + ' button[type="submit"]');
    ok('a percent over 100: the same', (await vis(page, f + ' [data-problem]')).join() === 'Write the percent (like 10) or the amount (like 25).');
    await page.fill(f + ' input[name="value"]', '12.5');
    await page.fill(f + ' input[name="uses"]', '0');
    await page.click(f + ' button[type="submit"]');
    ok('zero uses: at least 1', (await vis(page, f + ' [data-problem]')).join() === 'The uses must be at least 1.');
    await page.fill(f + ' input[name="uses"]', '3');
    await page.fill(f + ' input[name="ends"]', '2026-12-15');
    await page.locator(f + ' [data-applies] label', { hasText: 'Radon test' }).locator('input').check();
    ok('choosing a service unticks All services', !(await page.isChecked(f + ' input[name="all"]')));
    await page.click(f + ' button[type="submit"]');
    await until(async () => !(await page.locator('[data-dialog="discount"]').isVisible()));
    const w = pushed(calls).find((r) => r.kind === 'price_discounts' && r.data.code === 'spring26');
    ok('the row as the phone writes it: trimmed code, hundredths, uses, the end of that day here, the service it takes off from', !!w &&
      w.data.kind === 'percent' && w.data.value === 1250 && w.data.maxUses === 3 && w.data.expiresAt === new Date('2026-12-15T23:59:59-05:00').getTime() &&
      w.data.appliesToJson === '["add-radon"]' && w.data.active === true && w.data.ownerAccountId === ME, JSON.stringify(w && w.data));
    ok('and it shows, in one line', (await vis(page, '[data-list="discounts"] [data-v="summary"]')).includes('12.5% off · Radon test · until Dec 15, 2026 · up to 3 uses'), JSON.stringify(await vis(page, '[data-list="discounts"] [data-v="summary"]')));
    // A code another device took meanwhile: the server keeps it out.
    s.put(s.row('price_discounts', { id: 'disc-other', ownerAccountId: ME, code: 'FALL', kind: 'amount', value: 2500, appliesToJson: '[]', maxUses: null, expiresAt: null, active: true, createdAt: T, updatedAt: T, deletedAt: null }));
    await page.click('[data-add="discount"]');
    await page.fill(f + ' input[name="code"]', 'fall');
    await page.check(f + ' input[name="kind"][value="amount"]');
    await page.click(f + ' button[type="submit"]');
    ok('no amount yet: it says how to write it', (await vis(page, f + ' [data-problem]')).join() === 'Write the percent (like 10) or the amount (like 25).');
    await page.fill(f + ' input[name="value"]', '25');
    await page.click(f + ' button[type="submit"]');
    ok('a code the server keeps out: the dialog stays, and says why', await until(async () => (await vis(page, '[data-say]')).join() === 'Inspyx kept that code out: another of your discount codes already uses it.') && await page.locator('[data-dialog="discount"]').isVisible());
    ok('and the earlier try\'s problem is gone', (await vis(page, f + ' [data-problem]')).length === 0, JSON.stringify(await vis(page, f + ' [data-problem]')));
    await page.click(f + ' [data-close]');
    await page.locator('.prc-code', { hasText: 'SAVE10' }).locator('[data-edit]').click();
    await page.click(f + ' [data-delete]');
    await page.click(f + ' [data-delete]');
    await until(async () => !(await page.locator('[data-dialog="discount"]').isVisible()));
    ok('a code deleted is marked deleted and leaves the list', pushed(calls).some((r) => r.id === 'disc-save' && r.deleted_at !== null) && !(await vis(page, '[data-list="discounts"] [data-v="code"]')).includes('SAVE10'));
    await ctx.close();
  });

  await group('the phone, other accounts, and the server\'s word', async () => {
    const s = server(); seed(s);
    const ahead = Date.now() + HOUR, other = '22222222-2222-4222-8222-222222222222';
    const svc = (o) => Object.assign({ ownerAccountId: ME, parentId: null, description: null, minutes: 60, minimumFeeCents: null, createdAt: T, updatedAt: T, deletedAt: null }, o);
    s.put(s.row('price_services', svc({ id: 'svc-ahead', name: 'Mold test', feeCents: 20000, position: 2, createdAt: ahead, updatedAt: ahead })));
    s.put(s.row('price_services', svc({ id: 'svc-theirs', ownerAccountId: other, name: 'Not mine', feeCents: 1000, position: 3 })));
    const { page, ctx, calls } = await open(browser, { server: s });
    const names = () => vis(page, '[data-list="services"] > li > .prc-row [data-v="name"]');
    ok('a row of another account is never shown', JSON.stringify(await names()) === JSON.stringify(['Home inspection', 'Condo inspection', 'Mold test']), JSON.stringify(await names()));
    ok('once read, it says it is in step with the phone', (await vis(page, '[data-live]')).join() === 'In step with your phone: a change on either shows on the other within a few minutes.');
    const f = '[data-form="service"]';
    await card(page, 'Mold test').locator('.prc-row [data-edit]').click();
    await page.fill(f + ' input[name="fee"]', '225');
    await page.click(f + ' button[type="submit"]');
    await until(async () => !(await page.locator('[data-dialog="service"]').isVisible()));
    const w = pushed(calls).find((r) => r.id === 'svc-ahead');
    ok('a row last changed on a phone whose clock runs ahead: the change goes past its time, so it wins', !!w && w.updated_at > ahead && w.data.updatedAt === w.updated_at && s.value('price_services', 'svc-ahead').feeCents === 22500);
    await page.locator('.prc-code', { hasText: 'SAVE10' }).locator('[data-edit]').click();
    await page.fill('[data-form="discount"] input[name="uses"]', '25');
    await page.click('[data-form="discount"] button[type="submit"]');
    ok('a discount changed with its own code kept: saved, never "already have"', await until(async () => !(await page.locator('[data-dialog="discount"]').isVisible())) && s.value('price_discounts', 'disc-save').maxUses === 25 && s.value('price_discounts', 'disc-save').code === 'SAVE10');
    s.put(s.row('price_services', svc({ id: 'svc-phone', name: 'Sewer scope', feeCents: 17500, position: 4, createdAt: Date.now(), updatedAt: Date.now() })));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('a service added on the phone shows when the page comes back into view', await until(async () => (await names()).includes('Sewer scope')));
    await card(page, 'Condo inspection').locator('[data-add="addon"]').click();
    const now = Date.now();
    s.put(s.row('price_services', Object.assign({}, s.value('price_services', 'svc-condo'), { updatedAt: now, deletedAt: now })));
    await page.fill(f + ' input[name="name"]', 'Pool');
    await page.fill(f + ' input[name="fee"]', '75');
    await page.click(f + ' button[type="submit"]');
    ok('an add-on whose service the phone deleted meanwhile: the server keeps it out; the dialog stays and says so', await until(async () => (await vis(page, '[data-say]')).join() === 'Inspyx couldn’t keep that change. Check it and try again.') && await page.locator('[data-dialog="service"]').isVisible() && !s.held.has('price_services/' + (pushed(calls).find((r) => r.data && r.data.name === 'Pool') || {}).id));
    await page.click(f + ' [data-close]');
    ok('and the deleted service leaves the list', !(await names()).includes('Condo inspection'));
    await ctx.close();
  });

  await group('when Inspyx can\'t be reached', async () => {
    const s = server(); seed(s);
    let down = false;
    const { page, ctx } = await open(browser, { server: s, down: () => down });
    down = true;
    await card(page, 'Condo inspection').locator('.prc-row [data-edit]').click();
    await page.fill('[data-form="service"] input[name="fee"]', '');
    await page.click('[data-form="service"] button[type="submit"]');
    await page.fill('[data-form="service"] input[name="fee"]', '310');
    await page.click('[data-form="service"] button[type="submit"]');
    ok('a save that can\'t go: the dialog stays, and says so', await until(async () => (await vis(page, '[data-say]')).join() === 'That couldn’t be saved. Check your connection and try again.') && await page.locator('[data-dialog="service"]').isVisible());
    ok('and the earlier try\'s problem is gone: only what is true now shows', (await vis(page, '[data-form="service"] [data-problem]')).length === 0, JSON.stringify(await vis(page, '[data-form="service"] [data-problem]')));
    await ctx.close();
    const first = await open(browser, { server: s, down: () => true });
    ok('nothing loaded: it says the prices couldn\'t be read, and keeps trying', (await vis(first.page, '[data-state]')).join().startsWith('The prices couldn’t be read.'));
    await first.ctx.close();
  });

  await group('on a phone', async () => {
    const s = server(); seed(s);
    const { page, ctx } = await open(browser, { server: s, w: PHONE });
    ok('the list fits', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.click('[data-add="discount"]');
    const box = await page.locator('[data-dialog="discount"]').boundingBox();
    ok('the dialog fits the screen, centred with a margin each side and above', !!box && box.x >= 8 && Math.abs(box.x - (PHONE - box.x - box.width)) <= 1 && box.y >= 8, JSON.stringify(box));
    await ctx.close();
    const wide = await open(browser, { server: s });
    await wide.page.click('[data-add="service"]');
    const b = await wide.page.locator('[data-dialog="service"]').boundingBox();
    ok('on a desk too: the dialog is centred, never in a corner', !!b && b.x > 100 && Math.abs(b.x - (WIDE - b.x - b.width)) <= 1 && b.y >= 8, JSON.stringify(b));
    await wide.ctx.close();
  });

  await group('the page says no words', async () => {
    const fs = require('fs'), pathm = require('path');
    const code = fs.readFileSync(pathm.join(__dirname, '..', 'coming-soon', 'assets', 'prices.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    ok('the script says no words: every sentence is in the page', !/[A-Z][a-z]+ [a-z]+ [a-z]+[.!?]['"`]/.test(code));
  });

  await browser.close();
  console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
