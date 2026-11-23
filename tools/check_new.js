// Self-checks for New inspection (/new, 2026-11-23, job 4, Inspyx 4).
// NOTHING REAL IS ASKED OR CHANGED HERE: the sync function and the booking function are stand-ins this test runs
// itself; the sign-in is a made-up one; any other request that tries to leave the site is stopped and counted.
// usage: node tools/serve.js &   then   node tools/check_new.js   (BROWSER=webkit for Safari's engine; SHOTS=<dir>)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;
const url = (process.env.URL || 'http://localhost:4173/').replace(/\/?$/, '/');
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const SHOTS = process.env.SHOTS || '';
const ME = '11111111-1111-4111-8111-111111111111';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };
const NOW = Date.parse('2026-12-04T12:00:00-05:00');
const kept = JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: NOW + 3600e3, id: ME, email: 'pat@example.com' });

const T = 1795000000000;
const base = { ownerAccountId: ME, createdAt: T, updatedAt: T, deletedAt: null };
const row = (kind, data) => ({ kind, id: data.id, updated_at: T, deleted_at: null, changed_at: 'a', data: Object.assign({}, base, data) });
function rows(o) {
  const out = [
    row('price_services', { id: 'home', parentId: null, name: 'Home inspection', feeCents: 40000, minutes: 180, position: 0 }),
    row('price_services', { id: 'condo', parentId: null, name: 'Condo inspection', feeCents: 30000, minutes: 120, position: 1 }),
    row('price_services', { id: 'radon', parentId: 'home', name: 'Radon test', feeCents: 15000, minutes: 30, position: 0 }),
    row('price_services', { id: 'attic', parentId: 'home', name: 'No attic access', feeCents: -2500, minutes: 0, position: 1 }),
    row('price_modifiers', { id: 'm1', serviceId: 'home', basis: 'square_feet', mode: 'ranges', tiersJson: '{"tiers":[]}', position: 0 }),
    row('price_modifiers', { id: 'm2', serviceId: 'radon', basis: 'yes_no_question', questionId: 'q-pool', mode: 'ranges', tiersJson: '{"tiers":[]}', position: 0 }),
    row('price_questions', { id: 'q-pool', name: 'Is there a pool?', kind: 'yes_no', position: 0 }),
    row('booking_settings', { id: 'booking', on: true, slug: 'pat', timeZone: 'America/New_York', week: [1, 2, 3, 4, 5].map((day) => ({ day, from: '08:00', to: '17:00' })), maxPerDay: 3, minNoticeHours: 24, daysAhead: 30, gapMinutes: 30 }),
    row('inspection_templates', { id: 'inspector.my-home', name: 'My home template' }),
    row('legal_default', { id: 'signs', documentId: 'doc-1' }),
  ];
  if (o.email !== undefined) out.push(row('automation_settings', { id: 'automation', messages: { booking_confirmed: { on: o.email, when: 'now', to: ['client', 'buyer_agent'] } } }));
  return out;
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || 1280, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  await ctx.addInitScript((v) => { try { localStorage.setItem('inspyx.signin', v); } catch (e) { /* none */ } }, kept);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], asks = [], syncs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME), async (route) => {
    const req = route.request(), u = req.url();
    const reply = (status, json) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(json) });
    if (u === SERVER + '/functions/v1/sync') {
      const b = JSON.parse(req.postData() || '{}'); syncs.push(b);
      return reply(200, { applied: [], skipped: [], rows: b.after ? [] : rows(o), next: { at: 'z', kind: 'x', id: 'x' }, more: false });
    }
    if (u === SERVER + '/functions/v1/booking') {
      const b = JSON.parse(req.postData() || '{}'); asks.push(b);
      // The stand-in prices as the server would for these rows: the main service, its add-ons, a 7% tax on the service.
      const fee = { home: 40000, condo: 30000, radon: 15000, attic: -2500 };
      const names = { home: 'Home inspection', condo: 'Condo inspection', radon: 'Radon test', attic: 'No attic access' };
      const lines = (b.serviceIds || []).map((id, i) => ({ kind: i === 0 ? 'service' : 'add_on', id, name: names[id], cents: fee[id] }));
      if (lines.length) lines.push({ kind: 'tax', id: 'tax:sales tax\u0000700', name: 'Sales tax (7%)', cents: Math.round(fee[b.serviceIds[0]] * 0.07) });
      const total = lines.reduce((n, l) => n + l.cents, 0);
      const warnings = [];
      if (typeof b.startsAt === 'number') {
        const h = new Date(b.startsAt).getUTCHours() - 5;   // New York in December
        if (h < 8 || h >= 14) warnings.push('hours');
        if (b.startsAt === Date.UTC(2026, 11, 7, 15, 0)) warnings.push('busy');
      }
      const quote = { lines, totalCents: total, minutes: 210 };
      if (b.check) return reply(200, { state: 'check', quote, length: 210, warnings });
      if (warnings.length && !b.force) return reply(409, { error: 'warn', warnings });
      return reply(200, { state: 'booked', id: 'bk-1', startsAt: b.startsAt, endsAt: b.startsAt + 210 * 60000, totalCents: total });
    }
    away.push(u); return route.abort();
  });
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(url + 'new', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  return { ctx, page, errs, away, asks, syncs };
}
const vis = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
const until = async (fn, ms) => { const end = Date.now() + (ms || 4000); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };
async function fillBasics(page) {
  await page.fill('[name="street"]', '12 Palm Way');
  await page.fill('[name="unit"]', 'Apt 103');
  await page.fill('[name="city"]', 'Miami'); await page.fill('[name="state"]', 'FL'); await page.fill('[name="zip"]', '33101');
  await page.fill('[name="clientName"]', 'Dana Reyes'); await page.fill('[name="clientEmail"]', 'dana@example.com');
  await page.fill('[name="listingName"]', 'Lee Park');
}

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  await group('the form', async () => {
    const { page, ctx, errs, away, syncs } = await open(browser, { email: true });
    ok('opens with no errors, asks only Inspyx, and the sync pull sends nothing', errs.length === 0 && away.length === 0 && syncs.length > 0 && syncs.every((s) => Array.isArray(s.push) && s.push.length === 0), errs.concat(away).join(' | '));
    ok('the nav marks Inspections', await page.getAttribute('nav.dash .dash-items a[aria-current="page"]', 'href') === '/inspections');
    ok('the main services to pick, the first picked', (await vis(page, '.new-choice')).join(' | ') === 'Home inspection $400 | Condo inspection $300' && await page.isChecked('[name="service"][value="home"]'));
    ok('its add-ons, a credit shown below zero', (await vis(page, '.new-addon')).join(' | ') === 'Radon test +$150 | No attic access −$25');
    ok('what its price changes read is asked: square feet', (await vis(page, '[data-ask-list] label')).join() === 'Square feet');
    await page.check('[name="addon"][value="radon"]');
    ok('an add-on\'s own question is asked once it\'s picked', await until(async () => (await vis(page, '[data-ask-list] label')).join(' | ') === 'Square feet | Is there a pool?'));
    ok('templates: pick on the phone, Walkthrough, and his own', (await page.evaluate(() => [...document.querySelector('[name="template"]').options].map((o) => o.value))).join() === ',inspyx.walkthrough,inspector.my-home');
    ok('his agreement can be sent; the client email ticked, as his switch is on, and it says so', await page.isVisible('[data-agreement-row]') && await page.isChecked('[name="emailClient"]') && (await vis(page, '[data-email-why]')).join() === '(your confirmation email is on)');
    await page.fill('[name="day"]', '2026-12-07');
    await page.dispatchEvent('[name="day"]', 'change');
    ok('his booking hours that day, to tap', await until(async () => (await vis(page, '.new-slot')).length === 18) && (await vis(page, '.new-slot'))[0] === '8:00 AM');
    await page.click('.new-slot >> text="9:00 AM"');
    ok('a tapped time is the time', await page.inputValue('[name="time"]') === '09:00');
    ok('the live price: each line, the tax, the total and the length', await until(async () => (await vis(page, '.new-line')).join(' | ') === 'Home inspection $400 | Radon test $150 | Sales tax (7%) $28' && (await vis(page, '[data-total]')).join() === '$578'), JSON.stringify(await vis(page, '.new-line')));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/40-new-form.png', fullPage: true });
    ok('nothing runs off the side', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('the how-to', async () => {
    const { page, ctx, errs } = await open(browser, { email: true });
    ok('a how-to over the form, three steps', (await vis(page, '.new-how-step')).join(' | ') === 'Write the house, the client and the service | Tap a time in your booking hours, then Book it | It’s on your calendar now, and on your phone next sync');
    ok('it moves', await page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest('.new-how')).length >= 8));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    ok('with motion turned down, it stands still on the result', await page.evaluate(() => getComputedStyle(document.querySelector('.new-how-c')).opacity === '1' && getComputedStyle(document.querySelector('.new-how-finger')).display === 'none'));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('booking, warned, then anyway', async () => {
    const { page, ctx, errs, asks } = await open(browser, { email: false });
    ok('his switch is off: the email is unticked, and it says so', !(await page.isChecked('[name="emailClient"]')) && (await vis(page, '[data-email-why]')).join() === '(your confirmation email is off; tick to send it this once)');
    await fillBasics(page);
    await page.fill('[name="day"]', '2026-12-07'); await page.dispatchEvent('[name="day"]', 'change');
    await page.fill('[name="time"]', '10:00'); await page.dispatchEvent('[name="time"]', 'input');
    ok('meeting another inspection: it warns, and the button says Book anyway', await until(async () => (await vis(page, '[data-warn]')).join() === 'You have an inspection then.' && (await vis(page, '[data-book]')).join() === 'Book anyway'));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/41-new-warn.png' });
    await page.click('[data-book]');
    ok('Book anyway books it: one create with force', await until(() => page.isVisible('[data-done]')) && asks.filter((a) => !a.check).length === 1 && asks.filter((a) => !a.check)[0].force === true);
    const sent = asks.filter((a) => !a.check)[0];
    ok('it sends what the form says: the unit in its own box, the listing agent, the template, the tick',
      sent.details.property.unit === 'Apt 103' && sent.details.property.street === '12 Palm Way' && sent.details.listingAgent.name === 'Lee Park' &&
      sent.emailClient === false && sent.templateId === null && sent.serviceIds.join() === 'home' && sent.startsAt === Date.UTC(2026, 11, 7, 15, 0), JSON.stringify(sent));
    ok('booked: it says so, and links to that day on the calendar', await page.getAttribute('[data-done-day]', 'href') === '/calendar#day-2026-12-07');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/42-new-booked.png' });
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('refused before sending', async () => {
    const { page, ctx, asks } = await open(browser, { email: true });
    await page.fill('[name="time"]', '09:00'); await page.dispatchEvent('[name="time"]', 'input');
    await page.waitForTimeout(500);
    const n = asks.length;
    await page.click('[data-book]');
    ok('no client or street: says so, sends nothing', (await vis(page, '[data-problem]')).join() === 'Write the client’s name and the street.' && asks.length === n);
    await fillBasics(page);
    await page.fill('[name="clientEmail"]', '');
    await page.click('[data-book]');
    ok('email the client with no email: says so, sends nothing', (await vis(page, '[data-problem]')).join() === 'To email the client, write their email.' && asks.filter((a) => !a.check).length === 0);
    await ctx.close();
  });

  await group('on a phone', async () => {
    const { page, ctx, errs } = await open(browser, { email: true, w: 390 });
    ok('one column, nothing off the side', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/43-new-phone.png', fullPage: false });
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await browser.close();
  console.log(failed === 0 ? 'all checks passed' : failed + ' CHECK(S) FAILED');
  process.exit(failed === 0 ? 0 : 1);
})();
