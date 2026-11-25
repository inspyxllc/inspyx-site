// Self-checks for the booking page settings (/booking, 2026-11-23). The sync and booking functions are stood in for:
// nothing reaches a server. They check what the page sends against the server's twin rules (inspyx-mobile
// booking_row_rules.dart), and what it shows.
//
// usage: node tools/serve.js &   then   node tools/check_booking.js
//        (served somewhere else: URL=http://localhost:4174/ node tools/check_booking.js)
const playwright = require('playwright');
const base = (process.env.URL || 'http://localhost:4173/').replace(/\/+$/, '');
const ME = '11111111-1111-4111-8111-111111111111';
let failed = 0;
const ok = (name, pass, detail) => { if (!pass) failed++; console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (pass || detail === undefined ? '' : '  [' + detail + ']')); };

const profile = { kind: 'inspector_profile', id: 'profile', updated_at: 1, deleted_at: null, data: { id: 'profile', ownerAccountId: ME, companyName: 'Morales Home Inspections', updatedAt: 1, deletedAt: null } };
const service = { kind: 'price_services', id: 's1', updated_at: 1, deleted_at: null, data: { id: 's1', ownerAccountId: ME, name: 'Home inspection', parentId: null, updatedAt: 1, deletedAt: null } };
const SLUG = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;

/* The server's rules for a booking_settings row (booking_row_rules.dart), for what the page sends. */
function rowProblem(d) {
  if (d.id !== 'booking' || d.ownerAccountId !== ME || typeof d.on !== 'boolean' || d.deletedAt !== null) return 'shape';
  if (!SLUG.test(d.slug)) return 'slug';
  if (!['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville', 'America/Boise', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico'].includes(d.timeZone)) return 'time_zone';
  if (!Array.isArray(d.week) || d.week.length > 28) return 'week';
  const mins = (s) => { const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(s); if (!m) return null; const v = +m[1] * 60 + +m[2]; return v % 5 === 0 ? v : null; };
  const byDay = {};
  for (const s of d.week) {
    const a = mins(s.from), b = mins(s.to);
    if (!(s.day >= 1 && s.day <= 7) || a === null || b === null || b <= a) return 'week';
    const list = byDay[s.day] || (byDay[s.day] = []);
    if (list.some(([x, y]) => a < y && x < b)) return 'week';
    list.push([a, b]);
  }
  const L = { maxPerDay: [1, 20], minNoticeHours: [0, 168], daysAhead: [1, 120], gapMinutes: [0, 240] };
  for (const k of Object.keys(L)) if (!Number.isInteger(d[k]) || d[k] < L[k][0] || d[k] > L[k][1]) return 'limits';
  if (!Number.isInteger(d.updatedAt)) return 'shape';
  return null;
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || 390, height: 844 } });
  await ctx.addInitScript((me) => localStorage.setItem('inspyx.signin', JSON.stringify({ access: 'test-access', renew: 'test-renew', ends: Date.now() + 3600e3, id: me, email: 'dave@example.com' })), ME);
  const page = await ctx.newPage();
  const errs = [], pushes = [], slugAsks = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/functions/v1/sync', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    (body.push || []).forEach((p) => pushes.push(p));
    if (o.slow && (body.push || []).length) await new Promise((d) => setTimeout(d, o.slow));
    const skipped = o.refuse ? (body.push || []).map((p) => ({ kind: p.kind, id: p.id, reason: o.refuse })) : [];
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ rows: o.rows, next: null, more: false, skipped }) });
  });
  await page.route('**/functions/v1/booking', async (route) => {
    slugAsks.push(JSON.parse(route.request().postData() || '{}'));
    route.fulfill({ status: o.slugStatus || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
  });
  await page.goto(base + '/booking');
  await page.waitForSelector('[data-form]:not([hidden])', { timeout: 8000 });
  return { ctx, page, errs, pushes, slugAsks };
}

(async () => {
  const browser = await playwright.chromium.launch();
  try {
    // A first visit: the app's defaults, an address from the company name, off.
    let o = await open(browser, { rows: [profile, service] });
    const first = await o.page.evaluate(() => ({
      slug: document.querySelector('[data-f="slug"]').value, on: document.querySelector('[data-f="on"]').checked,
      open: [...document.querySelectorAll('.bkg-day')].map((li) => li.querySelector('[data-open]').checked),
      warn: document.querySelector('[data-warn="no-services"]').hidden,
      limits: ['maxPerDay', 'minNoticeHours', 'daysAhead', 'gapMinutes'].map((k) => document.querySelector('[data-f="' + k + '"]').value),
    }));
    ok('a first visit: off, the address from the company name, Monday to Friday, the app\'s limits', first.slug === 'morales-home-inspections' && first.on === false &&
      JSON.stringify(first.open) === '[true,true,true,true,true,false,false]' && JSON.stringify(first.limits) === '["2","24","60","30"]' && first.warn === true, JSON.stringify(first));
    // Turn it on, open Saturday morning, save: the row sent is one the server's rules keep.
    await o.page.check('[data-f="on"]', { force: true });
    await o.page.locator('.bkg-day[data-day="6"] [data-open]').check();
    await o.page.locator('.bkg-day[data-day="6"] [data-to]').selectOption('12:00');
    await o.page.click('[data-save]');
    await o.page.waitForTimeout(500);
    const sent = o.pushes.find((p) => p.kind === 'booking_settings');
    ok('Save sends one booking_settings row the server\'s rules keep', !!sent && sent.id === 'booking' && rowProblem(sent.data) === null && sent.updated_at === sent.data.updatedAt, sent ? rowProblem(sent.data) : 'nothing sent');
    ok('…on, with Saturday 8 AM to 12 PM added to the week', !!sent && sent.data.on === true && sent.data.week.some((s) => s.day === 6 && s.from === '08:00' && s.to === '12:00') && sent.data.week.length === 6, sent && JSON.stringify(sent.data.week));
    ok('…and says Saved', await o.page.isVisible('[data-say="saved"]'));
    ok('no errors in the console', o.errs.length === 0, o.errs.join(' | '));
    await o.ctx.close();

    // A bad address is never sent; overlapping hours are never sent.
    o = await open(browser, { rows: [profile, service] });
    await o.page.fill('[data-f="slug"]', 'No');
    await o.page.click('[data-save]');
    ok('an address the rules refuse: said on the page, nothing sent', o.pushes.length === 0 && await o.page.isVisible('[data-problems]'));
    ok('…and the address line says how to write one', await o.page.isVisible('[data-slug="form"]'));
    await o.page.fill('[data-f="slug"]', 'morales');
    await o.page.locator('.bkg-day[data-day="1"] [data-add-span]').click();
    await o.page.locator('.bkg-day[data-day="1"] .bkg-span >> nth=1 >> [data-from]').selectOption('12:00');
    await o.page.click('[data-save]');
    ok('overlapping hours on one day: said, nothing sent', o.pushes.length === 0 && (await o.page.textContent('[data-problems]')).includes('overlap'));
    await o.ctx.close();

    // A taken address: checked as typed, and the server's refusal said.
    o = await open(browser, { rows: [profile, service], slugStatus: 409 });
    await o.page.fill('[data-f="slug"]', 'rivera-inspections');
    await o.page.waitForTimeout(900);
    ok('a taken address is said as it is typed', await o.page.isVisible('[data-slug="taken"]') && o.slugAsks.some((a) => a.action === 'slug' && a.slug === 'rivera-inspections'));
    await o.ctx.close();

    // No services yet: the page says where to add one.
    o = await open(browser, { rows: [profile] });
    ok('no services yet: the page says to add one on Prices', await o.page.isVisible('[data-warn="no-services"]'));
    await o.ctx.close();

    // An edit made while a save is on its way stays (Codex on #77): not called saved, not replaced by a pull.
    o = await open(browser, { rows: [profile, service], slow: 700 });
    await o.page.click('[data-save]');
    await o.page.waitForTimeout(150);
    await o.page.fill('[data-f="maxPerDay"]', '5');
    await o.page.waitForTimeout(900);
    await o.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await o.page.waitForTimeout(600);
    ok('an edit made while saving: kept on the form after the save lands and a pull, and not called saved', (await o.page.inputValue('[data-f="maxPerDay"]')) === '5' && !(await o.page.isVisible('[data-say="saved"]')), await o.page.inputValue('[data-f="maxPerDay"]'));
    await o.ctx.close();

    // A saved row shows as saved, with its link.
    const saved = { kind: 'booking_settings', id: 'booking', updated_at: 5, deleted_at: null, data: { id: 'booking', ownerAccountId: ME, on: true, slug: 'morales', timeZone: 'America/Chicago', week: [{ day: 2, from: '09:00', to: '15:30' }], maxPerDay: 3, minNoticeHours: 12, daysAhead: 30, gapMinutes: 15, updatedAt: 5, deletedAt: null } };
    o = await open(browser, { rows: [profile, service, saved] });
    const s = await o.page.evaluate(() => ({ slug: document.querySelector('[data-f="slug"]').value, tz: document.querySelector('[data-f="timeZone"]').value, link: document.querySelector('[data-link-a]').textContent, tue: document.querySelector('.bkg-day[data-day="2"] [data-from]').value + '-' + document.querySelector('.bkg-day[data-day="2"] [data-to]').value }));
    ok('a saved page shows as saved, with its link', s.slug === 'morales' && s.tz === 'America/Chicago' && s.link === 'inspyx.com/book/morales' && s.tue === '09:00-15:30', JSON.stringify(s));
    await o.ctx.close();
  } finally {
    await browser.close();
  }
  console.log(failed === 0 ? 'all checks passed' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
