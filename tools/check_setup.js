// Self-checks for "Set up your business" on /today, as a checklist (2026-11-22, Inspyx 4; dashboard plan step 1).
// NOTHING REAL IS ASKED OR CHANGED HERE. The sync function and the sign-in server's /user are stand-ins this test runs
// itself, answering as the live ones do; the sign-in in the browser is a made-up one that exists nowhere; any other
// request that tries to leave the site is stopped and counted as a failure.
// What a mistake here would look like: a step called done that isn't (an add-on counted as a service, a removed
// agreement still counted, another account's row counted, a profile with no license), a step called missing on a
// guess (a failed pull), the checklist still showing when every step is done or when he said never again, the choice
// kept only in this browser, "never again" with no way back, or the pages left with no way in once it hides.
// usage: node tools/serve.js &   then   node tools/check_setup.js
//        (in Safari's engine instead of Chrome's: BROWSER=webkit node tools/check_setup.js)
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const TIMEOUT = /localhost/.test(url) ? 8000 : 20000;
const HOME = new URL(url).origin;
const SERVER = 'https://btxlrfvqifnrnxffohsz.supabase.co';
const NEEDS = SERVER + '/functions/v1/needs';
const SYNC = SERVER + '/functions/v1/sync';
const PAYMENTS = SERVER + '/functions/v1/payments';
const USER = SERVER + '/auth/v1/user';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const HOUR = 3600000, PHONE = 390, WIDE = 1280;
const kept = JSON.stringify({ access: 'test-access-1', renew: 'test-renew-1', ends: Date.now() + HOUR, id: ME, email: 'pat@example.com' });
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

/* Rows as the sync function keeps them. */
let n = 0;
const row = (kind, id, data, o) => {
  const at = 1700000000000 + (++n);
  const deleted = (o && o.deleted) ? at : null;
  return { kind, id, updated_at: at, deleted_at: deleted, data: { id, ownerAccountId: (o && o.owner) || ME, updatedAt: at, deletedAt: deleted, ...data } };
};
const profile = (d) => row('inspector_profile', 'profile', { inspectorName: 'Pat Inspector', companyName: 'Pat Home Inspections', licenseNumber: 'HI-1', companyPhone: null, companyEmail: null, associationNumbers: null, secondInspectorName: null, ...d });
const signature = (o) => row('inspector_media', 'signature', { format: 'png', sha256: 'a'.repeat(64), byteLength: 100 }, o);
const service = (d, o) => row('price_services', 'svc-' + (++n), { name: 'Home inspection', parentId: null, position: 0, createdAt: 1, ...d }, o);
const agreement = (o) => row('legal_documents', 'agr-' + (++n), { kind: 'agreement', title: 'Agreement', body: 'Words.', createdAt: 1 }, o);
const booking = (d) => row('booking_settings', 'booking', { on: true, slug: 'pat', timeZone: 'America/New_York', week: [{ day: 1, from: '08:00', to: '17:00' }], maxPerDay: 2, minNoticeHours: 24, daysAhead: 60, gapMinutes: 30, ...d });
const automation = (d) => row('automation_settings', 'automation', { design: 'bold_1', brandColor: null, googleReviewUrl: 'https://g.page/r/pat/review', messages: {}, ...d });
const everything = () => [profile(), signature(), service(), agreement(), booking(), automation()];
const READY = { status: 200, json: { state: 'ready', payouts: true } };
const NO_PLAN = { status: 409, json: { error: 'no_account' } };

/* The stand-in server: sync pages, and the account's details with the choices kept in them. */
function server(o) {
  const s = { syncCalls: [], userGets: 0, puts: [], payAsks: 0, cards: o.cards || (o.rows && o.rows.length >= 6 ? READY : NO_PLAN), meta: { ...(o.meta || {}) }, rows: o.rows || [], pages: o.pages || null,
    syncFail: o.syncFail || 0, getFail: o.getFail || 0, putFail: o.putFail || 0 };
  return s;
}

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w || WIDE, height: 1000 }, locale: 'en-US' });
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('inspyx.signin', v); } } catch (e) { /* none */ } }, kept);
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);
  const s = o.server, errs = [], away = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT' };
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u === NEEDS) return json(200, { needs: [], as_of: new Date().toISOString() });
    if (u === PAYMENTS) {
      const body = JSON.parse(req.postData() || '{}');
      s.payAsks++;
      if (body.action !== 'status') { away.push(u + ' ' + body.action); return route.abort(); }
      if (s.cards === 'down') return route.abort('failed');
      return json(s.cards.status, s.cards.json);
    }
    if (u === SYNC) {
      const body = JSON.parse(req.postData() || '{}');
      s.syncCalls.push({ auth: req.headers().authorization, body });
      if (s.syncFail) return json(s.syncFail, { error: 'database' });
      if (s.pages) {
        const i = body.after ? Number(body.after.id) : 0;
        return json(200, { rows: s.pages[i], next: { at: 't', kind: 'k', id: String(i + 1) }, more: i + 1 < s.pages.length });
      }
      return json(200, { rows: s.rows, next: null, more: false });
    }
    if (u === USER && req.method() === 'GET') {
      s.userGets++;
      if (s.getFail) return json(s.getFail, { msg: 'no' });
      return json(200, { id: ME, email: 'pat@example.com', user_metadata: s.meta });
    }
    if (u === USER && req.method() === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      s.puts.push({ auth: req.headers().authorization, body });
      if (s.putFail) return json(s.putFail, { msg: 'no' });
      Object.assign(s.meta, body.data || {});   // the sign-in server merges top-level keys
      return json(200, { id: ME, email: 'pat@example.com', user_metadata: s.meta });
    }
    away.push(u); return route.abort();
  });
  const res = await page.goto(url + 'today', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  return { ctx, page, errs, away, res };
}

const visible = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && !e.closest('[hidden]') && e.getClientRects().length > 0; }, sel);
/* Each tile as read: its name, then Done or what is still to add (only what shows). */
const tiles = (page) => page.evaluate(() => [...document.querySelectorAll('[data-step]')].map((t) => {
  const shown = (e) => !e.closest('[hidden]') && e.getClientRects().length > 0;
  const st = [...t.querySelectorAll('.setup-done, .setup-left')].filter(shown).map((e) => e.textContent.trim()).join(' ');
  return t.querySelector('strong').textContent + (st ? ': ' + st : '');
}));
const progress = (page) => page.evaluate(() => { const p = document.querySelector('[data-progress]'); return p.closest('[hidden]') ? '' : p.textContent.replace(/\s+/g, ' ').trim(); });
const smallLinks = (page) => page.evaluate(() => { const p = document.querySelector('[data-setup-small]'); return p.closest('[hidden]') || p.hidden ? '' : [...p.querySelectorAll('a')].map((a) => a.getAttribute('href') + ' ' + a.textContent).join(' | '); });
const until = async (fn, ms) => { const end = Date.now() + (ms || TIMEOUT / 2); for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } };

(async () => {
  const browser = await engine.launch();
  console.log('browser: ' + engine.name() + ' ' + browser.version());

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('nothing set up, ' + label, async () => {
      const s = server({ rows: [] });
      const { page, ctx, errs, away } = await open(browser, { server: s, w });
      ok(label + ': opens with no errors, asks only the sync function, the account and card payments\' status, as the signed-in inspector, sending nothing',
        errs.length === 0 && away.length === 0 && s.payAsks === 1 && s.syncCalls.length === 1 && s.syncCalls[0].auth === 'Bearer test-access-1' &&
        JSON.stringify(s.syncCalls[0].body.push) === '[]' && s.userGets === 1, errs.concat(away).join(' | '));
      ok(label + ': every step says what it still needs, in words', JSON.stringify(await tiles(page)) === JSON.stringify([
        "Your company: Add your name, your company's name, your license and your signature",
        'Prices: Add your first service',
        'Agreements: Add the agreement clients sign',
        'Booking page: Turn on your booking page',
        'Emails: Add your Google review link',
        'Card payments: Set up your plan, then card payments']), JSON.stringify(await tiles(page)));
      ok(label + ': the ring says none of six is done', (await progress(page)) === '0 of 6 done', await progress(page));
      ok(label + ': "Don\'t show this again" is there, and the short line of links is not', await visible(page, '[data-never]') && (await smallLinks(page)) === '');
      const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      ok(label + ': nothing runs off the side of the screen', wide);
      const taps = await page.evaluate(() => [...document.querySelectorAll('.setup-tile, [data-never]')].every((e) => e.getBoundingClientRect().height >= 44));
      ok(label + ': every tile and the button are big enough for a finger', taps);
      await ctx.close();
    });
  }

  await group('part done', async () => {
    const s = server({ rows: [
      profile({ licenseNumber: '  ' }),                          // a license of spaces is no license
      signature({ owner: OTHER }),                              // another account's signature is not his
      service({ parentId: 'svc-x' }),                           // an add-on alone is not a service
      service({}, { deleted: true }),                           // a removed service doesn't count
      agreement()
    ] });
    const { page, ctx } = await open(browser, { server: s });
    ok('part done: only what is really there counts (a blank license, someone else\'s signature, an add-on, a removed service do not)',
      JSON.stringify((await tiles(page)).slice(0, 3)) === JSON.stringify(['Your company: Add your license and your signature', 'Prices: Add your first service', 'Agreements: Done']), JSON.stringify(await tiles(page)));
    ok('part done: one of six', (await progress(page)) === '1 of 6 done', await progress(page));
    const ring = await page.evaluate(() => document.querySelector('[data-ring]').style.strokeDasharray);
    ok('part done: the ring is a sixth full', ring.replace(/px/g, '').replace(/,/g, '') === '17 100', ring);
    const green = await page.evaluate(() => document.querySelector('[data-step="agreements"]').hasAttribute('data-done'));
    ok('part done: the done step is marked done', green);
    await ctx.close();
  });

  await group('one missing field', async () => {
    const s = server({ rows: [profile({ companyName: null }), signature(), service(), agreement(), booking(), automation()], cards: READY });
    const { page, ctx } = await open(browser, { server: s });
    ok('one missing field: named alone, with no list words', (await tiles(page))[0] === "Your company: Add your company's name", (await tiles(page))[0]);
    ok('one missing field: five of six', (await progress(page)) === '5 of 6 done', await progress(page));
    await ctx.close();
  });

  await group('two pages', async () => {
    const s = server({ pages: [[profile(), signature(), booking()], [service(), agreement(), automation()]], cards: READY });
    const { page, ctx } = await open(browser, { server: s });
    ok('two pages: the second page is asked for after the first, and every step is read from both',
      s.syncCalls.length === 2 && s.syncCalls[0].body.after === null && s.syncCalls[1].body.after && s.syncCalls[1].body.after.id === '1' &&
      !(await visible(page, '[data-setup]')), JSON.stringify(s.syncCalls.map((c) => c.body.after)));
    await ctx.close();
  });

  await group('honest done', async () => {
    const cases = [
      ['the booking page off', [profile(), signature(), service(), agreement(), booking({ on: false }), automation()], READY, 'Booking page: Turn on your booking page'],
      ['the booking page on with no hours', [profile(), signature(), service(), agreement(), booking({ week: [] }), automation()], READY, 'Booking page: Turn on the hours clients can book'],
      ['no Google review link', [profile(), signature(), service(), agreement(), booking(), automation({ googleReviewUrl: null })], READY, 'Emails: Add your Google review link'],
      ['card payments not ready', everything(), { status: 200, json: { state: 'needs_info', payouts: false } }, 'Card payments: Set up card payments'],
      ['card payments unknown (no answer): never done on a guess, and the checklist stays', everything(), 'down', 'Card payments'],
    ];
    for (const [what, rows, cards, tile] of cases) {
      const s = server({ rows, cards });
      const { page, ctx } = await open(browser, { server: s });
      const t = await tiles(page);
      ok('honest done: ' + what + ': five of six, and the checklist stays', (await progress(page)) === '5 of 6 done' && await visible(page, '[data-setup]') && t.includes(tile), JSON.stringify([await progress(page), t]));
      await ctx.close();
    }
    const off = server({ rows: [profile(), signature(), service(), agreement(), booking(), automation({ googleReviewUrl: null, messages: { review_request: { on: false, when: 'right_after', to: ['client'] } } })], cards: READY });
    const o = await open(browser, { server: off });
    ok('honest done: review requests turned off need no link: all six done', !(await visible(o.page, '[data-setup]')), await progress(o.page));
    await o.ctx.close();
  });

  for (const [label, w] of [['wide', WIDE], ['phone', PHONE]]) {
    await group('all done, ' + label, async () => {
      const s = server({ rows: everything() });
      const { page, ctx } = await open(browser, { server: s, w });
      ok(label + ': every step done: the checklist hides itself, and the pages stay a tap away', !(await visible(page, '[data-setup]')) &&
        (await smallLinks(page)) === '/profile Your company | /prices Prices | /agreements Agreements | /booking Booking page | /emails Emails | /payments Card payments', await smallLinks(page));
      const taps = await page.evaluate(() => [...document.querySelectorAll('[data-setup-small] a')].every((e) => e.getBoundingClientRect().height >= 44));
      ok(label + ': those links are big enough for a finger', taps);
      await ctx.close();
    });
  }

  await group('he said never again', async () => {
    const s = server({ rows: [], meta: { web_setup_hidden: true, full_name: 'Pat' } });
    const { page, ctx } = await open(browser, { server: s });
    ok('never again, kept with his account: hidden in a new browser, with the pages a tap away', !(await visible(page, '[data-setup]')) && (await smallLinks(page)) !== '');
    await ctx.close();
  });

  await group('never again, then back', async () => {
    const s = server({ rows: [], meta: { full_name: 'Pat' } });
    const { page, ctx, errs } = await open(browser, { server: s });
    await page.click('[data-never]');
    ok('never again: kept with his account (one choice, nothing else of his touched), as the signed-in inspector',
      await until(() => s.puts.length === 1) && JSON.stringify(s.puts[0].body) === '{"data":{"web_setup_hidden":true}}' && s.puts[0].auth === 'Bearer test-access-1' && s.meta.full_name === 'Pat');
    ok('never again: the checklist goes, says how to bring it back, and the pages stay a tap away', await until(async () => !(await visible(page, '[data-setup]')) && await visible(page, '[data-setup-back]')) &&
      (await page.textContent('[data-setup-undo] span')).trim() === "Set up your business won't show again." && (await smallLinks(page)) !== '');
    const focus = await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-setup-back'));
    ok('never again: the keyboard lands on Undo', focus);
    await page.click('[data-setup-back]');
    ok('Undo: kept as false, and the checklist is back with its steps', await until(() => s.puts.length === 2) && JSON.stringify(s.puts[1].body) === '{"data":{"web_setup_hidden":false}}' &&
      await until(async () => await visible(page, '[data-setup]') && !(await visible(page, '[data-setup-undo]'))) && (await progress(page)) === '0 of 6 done');
    ok('never again and back: no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('never again, not saved', async () => {
    const s = server({ rows: [], putFail: 500 });
    const { page, ctx } = await open(browser, { server: s });
    await page.click('[data-never]');
    ok('not saved: it says so, and the checklist stays (it would only come back in another browser)',
      await until(() => visible(page, '[data-say="setup-save"]')) && await visible(page, '[data-setup]') && !(await visible(page, '[data-setup-undo]')) &&
      (await page.textContent('[data-say="setup-save"]')).trim() === "Couldn't save that. Try again.");
    await ctx.close();
  });

  await group('the pull fails', async () => {
    const s = server({ syncFail: 500 });
    const { page, ctx } = await open(browser, { server: s });
    ok('the pull fails: the tiles stay plain links, nothing called done or missing, no ring',
      await visible(page, '[data-setup]') && JSON.stringify(await tiles(page)) === JSON.stringify(['Your company', 'Prices', 'Agreements', 'Booking page', 'Emails', 'Card payments']) && (await progress(page)) === '', JSON.stringify(await tiles(page)));
    await ctx.close();
  });

  await group('a later read fails', async () => {
    const s = server({ rows: everything() });
    const { page, ctx } = await open(browser, { server: s });
    const before = await visible(page, '[data-setup]');
    s.syncFail = 500;
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await until(() => s.syncCalls.length === 2);
    await page.waitForTimeout(400);
    ok('a later read that fails keeps the last whole one (Codex on #68): every step still done, the checklist still hidden',
      before === false && !(await visible(page, '[data-setup]')) && (await smallLinks(page)) !== '' && s.syncCalls.length === 2);
    await ctx.close();
  });

  await group('a later read fails part way', async () => {
    const s = server({ pages: [[profile(), signature(), service(), agreement(), booking(), automation()], [service()]], cards: READY });
    const { page, ctx } = await open(browser, { server: s });
    ok('part way: the first whole read hides the checklist', !(await visible(page, '[data-setup]')));
    s.pages = [[service()], null];   // the second page breaks
    s.syncFail = 0;
    const real = s.pages;
    await page.route(SYNC, async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      s.syncCalls.push({ body });
      const cors = { 'access-control-allow-origin': '*' };
      if (body.after) return route.fulfill({ status: 500, contentType: 'application/json', headers: cors, body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ rows: real[0], next: { at: 't', kind: 'k', id: '1' }, more: true }) });
    });
    const calls = s.syncCalls.length;
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await until(() => s.syncCalls.length >= calls + 2);
    await page.waitForTimeout(400);
    ok('part way: a read whose second page fails changes nothing (only a service came, so it would have said three steps are missing)',
      !(await visible(page, '[data-setup]')) && (await smallLinks(page)) !== '');
    await ctx.close();
  });

  await group('the account can\'t be read', async () => {
    const s = server({ rows: [], getFail: 500 });
    const { page, ctx } = await open(browser, { server: s });
    ok('the choice can\'t be read: the checklist shows (never hidden on a guess)', await visible(page, '[data-setup]') && (await progress(page)) === '0 of 6 done');
    await ctx.close();
  });

  await group('back into view', async () => {
    const s = server({ rows: [] });
    const { page, ctx } = await open(browser, { server: s });
    s.rows = [service()];
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    ok('back into view (from a setup page in another tab): read again, with what changed', await until(async () => (await tiles(page))[1] === 'Prices: Done') && s.syncCalls.length === 2 && s.syncCalls[1].body.after === null);
    await ctx.close();
  });

  await group('less motion', async () => {
    const s = server({ rows: [] });
    const { page, ctx } = await open(browser, { server: s });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const still = await page.evaluate(() => getComputedStyle(document.querySelector('[data-ring]')).transitionDuration === '0s' && getComputedStyle(document.querySelector('.setup-tile')).transitionDuration.split(',').every((d) => d.trim() === '0s'));
    ok('less motion: the ring and tiles don\'t move', still);
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
  process.exit(failed ? 1 : 0);
})();
