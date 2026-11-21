// Self-checks for the booking page (/book/<name>, 2026-11-21, Inspyx 4).
// NOTHING REAL IS ASKED OR BOOKED HERE. The booking function is a stand-in this test runs itself (page, times, quote,
// save, book, as inspyx-mobile's booking/index.ts answers them); any other request that tries to leave the site is
// stopped and counted as a failure. The browser runs in New York time.
// usage: node tools/serve.js &   then   node tools/check_book.js
const playwright = require('playwright');
const engine = process.env.BROWSER === 'webkit' ? playwright.webkit : playwright.chromium;

const url = process.env.URL || 'http://localhost:4173/';
const HOME = new URL(url).origin;
const FN = 'https://btxlrfvqifnrnxffohsz.supabase.co/functions/v1/booking';
// The words the server keeps for consent version v1 (inspyx-mobile, backend/supabase/functions/booking/core.ts,
// SMS_CONSENT_WORDS.v1). The page must show exactly these: a consent is kept against the server's words.
const CONSENT_V1 = 'OK to text me about this inspection. Inspyx sends these texts for my home inspector: appointment ' +
  'confirmations, reminders, and report and payment notices. About 5 to 8 texts per inspection. ' +
  'Msg & data rates may apply. Reply STOP to opt out, HELP for help.';
let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : '')); };
const group = async (label, fn) => { try { await fn(); } catch (e) { ok(label + ': these checks could not run', false, String((e && e.message) || e).split('\n')[0]); } };

const T0 = Date.UTC(2026, 11, 2, 14); // Wed Dec 2, 9:00 AM New York
const PAGE = {
  state: 'open', timeZone: 'America/New_York', inspector: { name: 'Marco Rivera', company: 'Rivera Home Inspections' },
  services: [
    { id: 'home', name: 'Full home inspection', description: 'Top to bottom.', feeCents: 45000, minutes: 180, parentId: null, asks: ['squareFeet'] },
    { id: 'radon', name: 'Radon test', description: '', feeCents: 15000, minutes: 30, parentId: 'home', asks: [] },
    // An add-on with its own price question (Codex on site PR 64): ticking it must show the question.
    { id: 'pool', name: 'Pool inspection', description: '', feeCents: 12500, minutes: 45, parentId: 'home', asks: ['q-heater', 'yearBuilt'] },
  ],
  questions: [{ id: 'q-heater', name: 'Does the pool have a heater?', kind: 'yes_no' }], length: 180,
  days: [{ date: '2026-12-02', times: [T0, T0 + 3 * 3600000] }, { date: '2026-12-03', times: [T0 + 86400000] }],
};

async function open(browser, path, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.w || 1280, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errs = [], away = [], calls = [];
  page.on('pageerror', (e) => { errs.push('pageerror: ' + e.message); if (process.env.DEBUG) console.log('PAGEERROR ' + e.message); });
  await page.route((u) => !u.href.startsWith(HOME) && !u.href.startsWith('data:'), async (route) => {
    const req = route.request(), u = req.url();
    if (u !== FN) { away.push(u); return route.abort(); }
    const body = JSON.parse(req.postData() || '{}');
    calls.push(body);
    if (process.env.DEBUG) console.log('CALL ' + body.action + ' ' + JSON.stringify(body.serviceIds || '') + ' ' + JSON.stringify(body.facts || ''));
    const reply = (status, b) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (o.gone) return reply(404, { state: 'gone' });
    if (body.action === 'page') return reply(200, PAGE);
    if (body.action === 'times') return reply(200, { state: 'open', length: 210, days: PAGE.days });
    if (body.action === 'quote') {
      o.quotes = (o.quotes || 0) + 1;
      if (o.failQuotesAfter !== undefined && o.quotes > o.failQuotesAfter) return route.abort('failed');
      if (o.failQuotes && o.failQuotes.includes(o.quotes)) return route.abort('failed');
      if (o.slowQuotesFrom && o.quotes >= o.slowQuotesFrom) await new Promise((r) => setTimeout(r, 1500));
      const lines = [{ kind: 'service', id: 'home', name: 'Full home inspection', cents: 45000 }];
      if (body.serviceIds.includes('radon')) lines.push({ kind: 'add_on', id: 'radon', name: 'Radon test', cents: 15000 });
      return reply(200, { state: 'open', quote: { lines, totalCents: lines.reduce((s, l) => s + l.cents, 0), minutes: 210 } });
    }
    if (body.action === 'save') return reply(200, { state: 'saved', draftKey: 'a'.repeat(32) });
    if (body.action === 'book') {
      if (o.taken) return reply(409, { error: 'taken', days: [{ date: '2026-12-02', times: [T0 + 3 * 3600000] }] });
      return reply(200, { state: 'booked', startsAt: body.startsAt, endsAt: body.startsAt + 210 * 60000, totalCents: 60000 });
    }
    return reply(404, { state: 'gone' });
  });
  await page.goto(HOME + path);
  return { ctx, page, errs, away, calls };
}

async function fill(page, o = {}) {
  const step = (n) => { if (process.env.DEBUG) console.log('STEP ' + n); };
  step('time'); await page.click('.bk-time >> nth=0');
  step('home'); await page.check('input[name="bk-main"][value="home"]');
  step('radon'); await page.check('.bk-addons input[value="radon"]');
  step('details');
  await page.fill('#bk-name', 'Jordan Lee');
  await page.fill('#bk-email', 'jordan@example.com');
  if (o.phone !== false) await page.fill('#bk-phone', '(512) 555-0142');
  await page.fill('#bk-street', '1842 Willow Creek Dr');
  await page.fill('#bk-city', 'Austin');
  await page.fill('#bk-state', 'TX');
  await page.fill('#bk-zip', '78704');
}
const lastBook = (calls) => calls.filter((c) => c.action === 'book').pop();

(async () => {
  const browser = await engine.launch();

  await group('the page', async () => {
    const { ctx, page, errs, away, calls } = await open(browser, '/book/rivera');
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    ok('asks the booking function for this page by its name', calls[0] && calls[0].action === 'page' && calls[0].slug === 'rivera');
    ok('the heading names the company', (await page.textContent('[data-state="open"] h1')).includes('Rivera Home Inspections'));
    ok('times first, in the inspector\'s zone', (await page.locator('.bk-time').count()) === 3 && (await page.textContent('[data-v="zone"]')).includes('Eastern'));
    ok('the text box starts UNTICKED', !(await page.isChecked('#bk-sms')));
    const shown = (await page.textContent('[data-w-consent]')).replace(/\s+/g, ' ').trim();
    ok('the consent words are exactly the server\'s v1', shown === CONSENT_V1, shown);
    ok('links to the texting terms and privacy', (await page.locator('a[href="/terms#sms"]').count()) === 1 && (await page.locator('a[href="/privacy"]').count()) >= 1);
    ok('no errors, nothing else asked', errs.length === 0 && away.length === 0, errs.concat(away).join(' | '));
    await ctx.close();
  });

  await group('booking without texts', async () => {
    const { ctx, page, errs, calls } = await open(browser, '/book/rivera');
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    await fill(page);
    await page.waitForSelector('[data-quote]:not([hidden])');
    ok('the price shows', (await page.textContent('[data-v="total"]')) === '$600');
    await page.click('[data-book]');
    await page.waitForSelector('[data-state="booked"]:not([hidden])');
    const b = lastBook(calls);
    ok('booked the picked time and services', b && b.startsAt === T0 && JSON.stringify(b.serviceIds) === '["home","radon"]');
    ok('no yes to texts: smsOk false, no consent version', b && b.details.client.smsOk === false && b.smsConsentVersion === undefined);
    ok('the done page says when', (await page.textContent('[data-v="when"]')).includes('Wednesday, December 2'));
    ok('no errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await group('booking with texts', async () => {
    const { ctx, page, calls } = await open(browser, '/book/rivera');
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    await fill(page);
    await page.check('#bk-sms');
    await page.click('[data-book]');
    await page.waitForSelector('[data-state="booked"]:not([hidden])');
    const b = lastBook(calls);
    ok('a tick sends smsOk true with consent version v1 and the phone', b && b.details.client.smsOk === true && b.smsConsentVersion === 'v1' && b.details.client.phone === '(512) 555-0142');
    await ctx.close();
  });

  await group('a yes to texts with no phone', async () => {
    const { ctx, page, calls } = await open(browser, '/book/rivera');
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    await fill(page, { phone: false });
    await page.check('#bk-sms');
    await page.click('[data-book]');
    await page.waitForSelector('[data-say="phone"]:not([hidden])');
    ok('asks for the phone, books nothing', !lastBook(calls));
    await ctx.close();
  });

  await group('a time just taken', async () => {
    const { ctx, page } = await open(browser, '/book/rivera', { taken: true });
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    await fill(page);
    await page.click('[data-book]');
    await page.waitForSelector('[data-say="taken"]:not([hidden])');
    ok('says so, and no time stays picked', (await page.locator('.bk-time[aria-pressed="true"]').count()) === 0);
    await ctx.close();
  });

  await group('an add-on\'s own price questions (Codex on site PR 64)', async () => {
    const { ctx, page } = await open(browser, '/book/rivera');
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    await page.check('input[name="bk-main"][value="home"]');
    ok('not shown before the add-on is picked', (await page.locator('[data-q="q-heater"]').count()) === 0 && await page.isHidden('[data-ask="yearBuilt"]'));
    await page.check('.bk-addons input[value="pool"]');
    ok('ticking it shows its question and its fact', (await page.locator('[data-q="q-heater"]').count()) === 1 && !(await page.isHidden('[data-ask="yearBuilt"]')));
    await page.uncheck('.bk-addons input[value="pool"]');
    ok('unticking it takes them away again', (await page.locator('[data-q="q-heater"]').count()) === 0 && await page.isHidden('[data-ask="yearBuilt"]'));
    await ctx.close();
  });

  await group('never booking against an old price (Codex on site PR 64)', async () => {
    const o = { failQuotesAfter: 1 };
    const { ctx, page, calls } = await open(browser, '/book/rivera', o);
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    await page.click('.bk-time >> nth=0');
    await page.check('input[name="bk-main"][value="home"]');
    await page.waitForSelector('[data-quote]:not([hidden])');
    // A change whose price can't be had: the old total goes at once, and Book waits.
    await page.check('.bk-addons input[value="radon"]');
    ok('the old total is marked as updating at once (not this price)', (await page.getAttribute('[data-quote]', 'aria-busy')) === 'true');
    for (const [id, v] of [['#bk-name', 'Jordan Lee'], ['#bk-email', 'jordan@example.com'], ['#bk-street', '1 Main St'], ['#bk-city', 'Austin'], ['#bk-state', 'TX'], ['#bk-zip', '78704']]) await page.fill(id, v);
    await page.click('[data-book]');
    await page.waitForSelector('[data-say="price"]:not([hidden])');
    ok('Book says the price is updating, and books nothing', !lastBook(calls));
    await ctx.close();
  });

  await group('a price that failed is asked for again on the next try (Codex on site PR 64)', async () => {
    const o = { failQuotes: [2, 3] };
    const { ctx, page, calls } = await open(browser, '/book/rivera', o);
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    await fill(page);
    await page.click('[data-book]');
    await page.waitForSelector('[data-say="price"]:not([hidden])');
    ok('the first try, with no price to be had, books nothing', !lastBook(calls));
    await page.click('[data-book]');
    await page.waitForSelector('[data-state="booked"]:not([hidden])');
    ok('the next try asks again, gets the price, and books', !!lastBook(calls) && o.quotes >= 4);
    await ctx.close();
  });

  await group('the form as it is when the booking goes, not when Book was pressed (Codex on site PR 64)', async () => {
    const o = { slowQuotesFrom: 3 };
    const { ctx, page, calls } = await open(browser, '/book/rivera', o);
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    await fill(page);
    await page.check('#bk-sms');
    await page.click('[data-book]');
    // While the (slow) price is on its way, the client changes their mind about texts.
    await page.uncheck('#bk-sms');
    await page.waitForSelector('[data-state="booked"]:not([hidden])');
    const b = lastBook(calls);
    ok('the unticked box is what goes: no yes to texts, no consent version', b && b.details.client.smsOk === false && b.smsConsentVersion === undefined);
    await ctx.close();
  });

  await group('a page that isn\'t open', async () => {
    const { ctx, page } = await open(browser, '/book/nobody', { gone: true });
    await page.waitForSelector('[data-state="gone"]:not([hidden])');
    ok('shows "isn\'t open"', (await page.textContent('[data-state="gone"] h1')).includes('isn’t open'));
    await ctx.close();
  });

  for (const path of ['/book/sms-consent', '/book?preview=sms-consent']) await group('the consent step\'s own page ' + path, async () => {
    const { ctx, page, calls, away, errs } = await open(browser, path, { w: 390 });
    await page.waitForSelector('[data-state="open"]:not([hidden])');
    ok('the whole form shows, with sample details', (await page.inputValue('#bk-name')) === 'Jordan Lee' && !(await page.isHidden('[data-quote]')));
    ok('marked as a preview, and Book is off', !(await page.isHidden('[data-preview]')) && (await page.isDisabled('[data-book]')));
    ok('the text box is still unticked', !(await page.isChecked('#bk-sms')));
    ok('asks the server nothing', calls.length === 0 && away.length === 0 && errs.length === 0, errs.join(' | '));
    await ctx.close();
  });

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall booking page checks passed');
  process.exit(failed ? 1 : 0);
})();
